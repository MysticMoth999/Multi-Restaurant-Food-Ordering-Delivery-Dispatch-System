import test from "node:test";
import assert from "node:assert/strict";
import { fixture, requestBody, createOrder, readyOrder, online } from "./helpers.js";
import { haversineKm } from "../src/domain/constants.js";

const fails = (fn, code) => assert.throws(fn, (error) => error.code === code);

test("Billing: correct VND, options, quantities and snapshots", (t) => {
    const s = fixture();
    t.after(() => s.store.close());
    const quote = s.billing.quote(1, [{ menuItemId: 1, quantity: 2, selectedOptionIds: [1] }]);
    assert.equal(quote.subtotal, 110000);
    assert.equal(quote.total, 125000);
    const order = createOrder(s);
    s.catalog.saveItem(s.user(11), 1, { price: 60000, name: "Tên mới", available: false });
    const saved = s.orders.get(s.user(1), order.id);
    assert.equal(saved.lines[0].name, "Nigiri cá hồi");
    assert.equal(saved.total, 125000);
    assert.equal(saved.lines[0].options[0].surcharge, 5000);
    for (const items of [
        [],
        [{ menuItemId: 3, quantity: 1 }],
        [{ menuItemId: 1, quantity: 0 }],
        [{ menuItemId: 2, quantity: 100 }],
        [{ menuItemId: 2, quantity: 1.5 }],
        [{ menuItemId: 2, quantity: 1, selectedOptionIds: [1] }],
        [{ menuItemId: 2, quantity: 1, selectedOptionIds: [2, 2] }],
    ]) {
        fails(() => s.billing.quote(1, items), "VALIDATION");
    }
    s.catalog.saveOption(s.user(11), 2, 2, { available: false });
    fails(
        () => s.billing.quote(1, [{ menuItemId: 2, quantity: 1, selectedOptionIds: [2] }]),
        "VALIDATION"
    );
    s.admin.restaurantStatus(s.user(31), 1, "INACTIVE");
    fails(() => s.billing.quote(1, [{ menuItemId: 2, quantity: 1 }]), "VALIDATION");
});

test("Billing: canonical options merge equal lines and reject inconsistent aliases", (t) => {
    const s = fixture();
    t.after(() => s.store.close());
    const quote = s.billing.quote(1, [
        { menuItemId: 1, quantity: 1, optionIds: [1] },
        { menuItemId: 1, quantity: 2, selectedOptionIds: [1] },
        { menuItemId: 1, quantity: 1 },
    ]);
    assert.equal(quote.lines.length, 2);
    assert.equal(quote.total, 230000);
    fails(
        () =>
            s.billing.quote(1, [
                { menuItemId: 1, quantity: 1, optionIds: [], selectedOptionIds: [1] },
            ]),
        "VALIDATION"
    );
    fails(
        () =>
            s.billing.quote(1, [
                { menuItemId: 1, quantity: 99 },
                { menuItemId: 1, quantity: 1 },
            ]),
        "VALIDATION"
    );
});

test("CreateOrder: replay, key conflict, changed price and missing phone", (t) => {
    const s = fixture();
    t.after(() => s.store.close());
    const body = requestBody(s);
    const first = s.orders.create(s.user(1), body);
    const again = s.orders.create(s.user(1), body);
    assert.deepEqual(again.order, first.order);
    assert.equal(again.replayed, true);
    assert.equal(s.store.rows("orders").length, 1);
    fails(() => s.orders.create(s.user(1), { ...body, deliveryAddress: "Khác" }), "CONFLICT");
    fails(() => s.orders.create(s.user(3), requestBody(s)), "VALIDATION");
    fails(() => s.orders.create(s.user(11), body), "FORBIDDEN");
    const oldQuote = requestBody(s);
    s.catalog.saveItem(s.user(11), 1, { price: 51000 });
    fails(() => s.orders.create(s.user(1), oldQuote), "PRICE_CHANGED");
    // A retry succeeds even after catalog changes because the same committed result is returned.
    assert.deepEqual(s.orders.create(s.user(1), body).order, first.order);
});

test("20 injected CreateOrder failures rollback all business rows", (t) => {
    let target;
    const s = fixture({
        fault: (point) => {
            if (point === target) {
                throw new Error("injected");
            }
        },
    });
    t.after(() => s.store.close());
    let tested = 0;
    for (const method of ["COD", "MOCK_CARD", "MOCK_WALLET", "COD"]) {
        for (const point of [
            "afterOrder",
            "afterItem",
            "afterHistory",
            "afterPayment",
            "beforeCommit",
        ]) {
            target = point;
            assert.throws(() => createOrder(s, { paymentMethod: method }), /injected/);
            for (const table of [
                "orders",
                "order_items",
                "payments",
                "order_history",
                "activity",
            ]) {
                assert.equal(s.store.rows(table).length, 0, `${point}: ${table}`);
            }
            tested += 1;
        }
    }
    assert.equal(tested, 20);
});

test("Mock FAILED rolls back; COD still works; refunds and voids", (t) => {
    const s = fixture({ mockResult: "FAILED" });
    t.after(() => s.store.close());
    fails(() => createOrder(s, { paymentMethod: "MOCK_WALLET" }), "PAYMENT_FAILED");
    assert.equal(s.store.rows("orders").length, 0);
    let order = createOrder(s);
    order = s.orders.cancel(s.user(1), order.id, { expectedVersion: order.version });
    assert.equal(order.paymentStatus, "VOIDED");
    s.payment.result = "SUCCESS";
    order = createOrder(s, { paymentMethod: "MOCK_CARD" });
    assert.match(order.transactionId, /^mock-/);
    order = s.orders.cancel(s.user(11), order.id, {
        expectedVersion: order.version,
        reason: "Hết món",
    });
    assert.equal(order.paymentStatus, "REFUNDED");
});

test("Order transitions enforce version, role, ownership and cancellation policy", (t) => {
    const s = fixture();
    t.after(() => s.store.close());
    let order = createOrder(s);
    fails(() => s.orders.get(s.user(2), order.id), "FORBIDDEN");
    fails(() => s.orders.get(s.user(12), order.id), "FORBIDDEN");
    fails(() => s.orders.get(s.user(21), order.id), "FORBIDDEN");
    fails(() => s.orders.get(s.user(1), 999), "NOT_FOUND");
    fails(
        () =>
            s.orders.transition(s.user(1), order.id, {
                targetStatus: "CONFIRMED",
                expectedVersion: 1,
            }),
        "FORBIDDEN"
    );
    fails(
        () =>
            s.orders.transition(s.user(11), order.id, {
                targetStatus: "PREPARING",
                expectedVersion: 1,
            }),
        "VALIDATION"
    );
    fails(() => s.orders.cancel(s.user(11), order.id, { expectedVersion: 1 }), "VALIDATION");
    order = s.orders.transition(s.user(11), order.id, {
        targetStatus: "CONFIRMED",
        expectedVersion: 1,
    });
    fails(
        () =>
            s.orders.transition(s.user(11), order.id, {
                targetStatus: "PREPARING",
                expectedVersion: 1,
            }),
        "CONFLICT"
    );
    fails(() => s.orders.cancel(s.user(1), order.id, { expectedVersion: 2 }), "VALIDATION");
    fails(() => s.orders.cancel(s.user(31), order.id, { expectedVersion: 2 }), "FORBIDDEN");
    order = s.orders.cancel(s.user(11), order.id, { expectedVersion: 2, reason: "Bếp gặp sự cố" });
    assert.equal(order.history.length, 3);
    fails(
        () =>
            s.orders.transition(s.user(11), order.id, {
                targetStatus: "CONFIRMED",
                expectedVersion: 3,
            }),
        "VALIDATION"
    );
    assert.equal(s.orders.mine(s.user(2), 1).total, 0);
});

test("Dispatch: Haversine, tie-break, decline, expiration, retry and stale location", (t) => {
    const s = fixture();
    t.after(() => s.store.close());
    assert.ok(Math.abs(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111.195) < 0.01);
    assert.equal(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
    online(s, 2);
    const point = { lat: 10.7705, lng: 106.6932 };
    s.dispatch.updateLocation(s.user(21), point);
    s.dispatch.updateLocation(s.user(22), point);
    const order = readyOrder(s);
    s.dispatch.tick();
    let offer = s.store.find("driver_offers", { order_id: order.id, status: "PENDING" });
    assert.equal(offer.driver_id, 1); // distance/time tied -> smaller id
    fails(() => s.dispatch.respond(s.user(22), offer.id, true), "FORBIDDEN");
    s.dispatch.respond(s.user(21), offer.id, false);
    s.dispatch.tick();
    offer = s.store.find("driver_offers", { order_id: order.id, status: "PENDING" });
    assert.equal(offer.driver_id, 2);
    s.advance(60000);
    fails(() => s.dispatch.respond(s.user(22), offer.id, true), "CONFLICT");
    s.dispatch.tick();
    assert.equal(s.store.offer(offer.id).status, "EXPIRED");
    assert.equal(s.store.rows("driver_offers", { status: "PENDING" }).length, 0);
    s.advance(30000);
    s.dispatch.tick();
    assert.equal(
        s.store.find("driver_offers", { order_id: order.id, status: "PENDING" }).driver_id,
        1
    );
    assert.equal(s.store.rows("order_history", { order_id: order.id }).length, 4); // offers don't change order state
    s.advance(121000);
    s.dispatch.tick();
    s.advance(30000);
    s.dispatch.tick();
    assert.equal(s.store.rows("driver_offers", { status: "PENDING" }).length, 0);
    s.dispatch.updateLocation(s.user(21), point);
    s.advance(30000);
    s.dispatch.tick();
    assert.equal(s.store.rows("driver_offers", { status: "PENDING" }).length, 1);
});

test("Dispatch: older updated_at wins ties; offline revokes; invalid coordinates rejected", (t) => {
    const s = fixture();
    t.after(() => s.store.close());
    const point = { lat: 10.7705, lng: 106.6932 };
    s.dispatch.setStatus(s.user(22), { status: "AVAILABLE", location: point });
    s.advance(1);
    s.dispatch.setStatus(s.user(21), { status: "AVAILABLE", location: point });
    readyOrder(s);
    s.dispatch.tick();
    assert.equal(s.store.find("driver_offers", { status: "PENDING" }).driver_id, 2);
    s.dispatch.setStatus(s.user(22), { status: "OFFLINE" });
    s.dispatch.tick();
    assert.equal(s.store.find("driver_offers", { status: "PENDING" }).driver_id, 1);
    fails(() => s.dispatch.updateLocation(s.user(22), point), "CONFLICT");
    fails(
        () =>
            s.dispatch.setStatus(s.user(22), {
                status: "AVAILABLE",
                location: { lat: 91, lng: 0 },
            }),
        "VALIDATION"
    );
    fails(() => s.dispatch.setStatus(s.user(22), { status: "BUSY" }), "VALIDATION");
    fails(() => s.dispatch.board(s.user(1)), "FORBIDDEN");
});

test("Delivery: COD confirmation, driver release and replay are atomic", (t) => {
    const s = fixture();
    t.after(() => s.store.close());
    online(s);
    let order = readyOrder(s);
    s.dispatch.tick();
    const offer = s.dispatch.board(s.user(21)).offer;
    order = s.dispatch.respond(s.user(21), offer.offerId, true).order;
    assert.equal(s.dispatch.board(s.user(21)).active.id, order.id);
    fails(() => s.dispatch.respond(s.user(21), offer.offerId, true), "CONFLICT");
    fails(() => s.dispatch.setStatus(s.user(21), { status: "OFFLINE" }), "CONFLICT");
    fails(() => s.admin.lockDriver(s.user(31), 1, true), "CONFLICT");
    for (const targetStatus of ["PICKED_UP", "DELIVERING"]) {
        order = s.orders.transition(s.user(21), order.id, {
            targetStatus,
            expectedVersion: order.version,
        });
    }
    fails(
        () =>
            s.orders.transition(s.user(21), order.id, {
                targetStatus: "DELIVERED",
                expectedVersion: order.version,
            }),
        "VALIDATION"
    );
    const body = { targetStatus: "DELIVERED", expectedVersion: order.version, codCollected: true };
    order = s.orders.transition(s.user(21), order.id, body);
    assert.equal(order.paymentStatus, "SUCCESS");
    assert.equal(order.history.length, 8);
    assert.equal(s.store.driver(21).status, "AVAILABLE");
    assert.deepEqual(s.orders.transition(s.user(21), order.id, body), order);
    assert.equal(s.dispatch.board(s.user(21)).summary.deliveredToday, 1);
    assert.equal(s.dispatch.board(s.user(21)).summary.earningsToday, 15000);
});

test("Atomic rollback on assignment, cancellation and completion failures", (t) => {
    let target;
    const s = fixture({
        fault: (point) => {
            if (target === point) {
                throw new Error("injected");
            }
        },
    });
    t.after(() => s.store.close());
    let cancellable = createOrder(s);
    for (const point of ["afterCancellationPayment", "afterCancellationHistory"]) {
        target = point;
        assert.throws(
            () => s.orders.cancel(s.user(1), cancellable.id, { expectedVersion: 1 }),
            /injected/
        );
        assert.deepEqual(s.orders.get(s.user(1), cancellable.id), cancellable);
    }
    target = null;
    online(s);
    let order = readyOrder(s);
    s.dispatch.tick();
    const offer = s.dispatch.board(s.user(21)).offer;
    for (const point of ["afterDriverBusy", "afterAssignmentHistory"]) {
        target = point;
        assert.throws(() => s.dispatch.respond(s.user(21), offer.offerId, true), /injected/);
        assert.equal(s.store.driver(21).status, "AVAILABLE");
        assert.equal(s.store.offer(offer.offerId).status, "PENDING");
        assert.equal(s.store.order(order.id).driver_id, null);
    }
    target = null;
    order = s.dispatch.respond(s.user(21), offer.offerId, true).order;
    for (const targetStatus of ["PICKED_UP", "DELIVERING"]) {
        order = s.orders.transition(s.user(21), order.id, {
            targetStatus,
            expectedVersion: order.version,
        });
    }
    for (const point of ["afterCompletionPayment", "afterTransitionHistory"]) {
        target = point;
        assert.throws(
            () =>
                s.orders.transition(s.user(21), order.id, {
                    targetStatus: "DELIVERED",
                    expectedVersion: order.version,
                    codCollected: true,
                }),
            /injected/
        );
        assert.deepEqual(s.orders.get(s.user(1), order.id), order);
        assert.equal(s.store.driver(21).status, "BUSY");
    }
});
