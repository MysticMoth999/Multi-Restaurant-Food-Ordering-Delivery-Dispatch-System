import test from "node:test";
import assert from "node:assert/strict";
import { fixture, requestBody, createOrder, readyOrder, online } from "./helpers.js";
import { haversineKm } from "../src/domain/constants.js";
const fails = async (fn, code) => await assert.rejects(fn, error => error.code === code);
test("Billing: correct VND, options, quantities and snapshots", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  const quote = await s.billing.quote(1, [{
    menuItemId: 1,
    quantity: 2,
    selectedOptionIds: [1]
  }]);
  assert.equal(quote.subtotal, 110000);
  assert.equal(quote.total, 125000);
  const order = await createOrder(s);
  await s.catalog.saveItem(await s.user(11), 1, {
    price: 60000,
    name: "Tên mới",
    available: false
  });
  const saved = await s.orders.get(await s.user(1), order.id);
  assert.equal(saved.lines[0].name, "Nigiri cá hồi");
  assert.equal(saved.total, 125000);
  assert.equal(saved.lines[0].options[0].surcharge, 5000);
  for (const items of [[], [{
    menuItemId: 3,
    quantity: 1
  }], [{
    menuItemId: 1,
    quantity: 0
  }], [{
    menuItemId: 2,
    quantity: 100
  }], [{
    menuItemId: 2,
    quantity: 1.5
  }], [{
    menuItemId: 2,
    quantity: 1,
    selectedOptionIds: [1]
  }], [{
    menuItemId: 2,
    quantity: 1,
    selectedOptionIds: [2, 2]
  }]]) {
    await fails(async () => await s.billing.quote(1, items), "VALIDATION");
  }
  await s.catalog.saveOption(await s.user(11), 2, 2, {
    available: false
  });
  await fails(async () => await s.billing.quote(1, [{
    menuItemId: 2,
    quantity: 1,
    selectedOptionIds: [2]
  }]), "VALIDATION");
  await s.admin.restaurantStatus(await s.user(31), 1, "INACTIVE");
  await fails(async () => await s.billing.quote(1, [{
    menuItemId: 2,
    quantity: 1
  }]), "VALIDATION");
});
test("Billing: canonical options merge equal lines and reject inconsistent aliases", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  const quote = await s.billing.quote(1, [{
    menuItemId: 1,
    quantity: 1,
    optionIds: [1]
  }, {
    menuItemId: 1,
    quantity: 2,
    selectedOptionIds: [1]
  }, {
    menuItemId: 1,
    quantity: 1
  }]);
  assert.equal(quote.lines.length, 2);
  assert.equal(quote.total, 230000);
  await fails(async () => await s.billing.quote(1, [{
    menuItemId: 1,
    quantity: 1,
    optionIds: [],
    selectedOptionIds: [1]
  }]), "VALIDATION");
  await fails(async () => await s.billing.quote(1, [{
    menuItemId: 1,
    quantity: 99
  }, {
    menuItemId: 1,
    quantity: 1
  }]), "VALIDATION");
});
test("CreateOrder: replay, key conflict, changed price and missing phone", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  const body = await requestBody(s);
  const first = await s.orders.create(await s.user(1), body);
  const again = await s.orders.create(await s.user(1), body);
  assert.deepEqual(again.order, first.order);
  assert.equal(again.replayed, true);
  assert.equal((await s.store.rows("orders")).length, 1);
  await fails(async () => await s.orders.create(await s.user(1), {
    ...body,
    deliveryAddress: "Khác"
  }), "CONFLICT");
  await fails(async () => await s.orders.create(await s.user(3), await requestBody(s)), "VALIDATION");
  await fails(async () => await s.orders.create(await s.user(11), body), "FORBIDDEN");
  const oldQuote = await requestBody(s);
  await s.catalog.saveItem(await s.user(11), 1, {
    price: 51000
  });
  await fails(async () => await s.orders.create(await s.user(1), oldQuote), "PRICE_CHANGED");
  // A retry succeeds even after catalog changes because the same committed result is returned.
  assert.deepEqual((await s.orders.create(await s.user(1), body)).order, first.order);
});
test("20 injected CreateOrder failures rollback all business rows", async t => {
  let target;
  const s = await fixture({
    fault: point => {
      if (point === target) {
        throw new Error("injected");
      }
    }
  });
  t.after(async () => await s.store.close());
  let tested = 0;
  for (const method of ["COD", "MOCK_CARD", "MOCK_WALLET", "COD"]) {
    for (const point of ["afterOrder", "afterItem", "afterHistory", "afterPayment", "beforeCommit"]) {
      target = point;
      await assert.rejects(async () => await createOrder(s, {
        paymentMethod: method
      }), /injected/);
      for (const table of ["orders", "order_items", "payments", "order_history", "activity", "notifications", "voucher_redemptions"]) {
        assert.equal((await s.store.rows(table)).length, 0, `${point}: ${table}`);
      }
      tested += 1;
    }
  }
  assert.equal(tested, 20);
});
test("Mock FAILED rolls back; COD still works; refunds and voids", async t => {
  const s = await fixture({
    mockResult: "FAILED"
  });
  t.after(async () => await s.store.close());
  await fails(async () => await createOrder(s, {
    paymentMethod: "MOCK_WALLET"
  }), "PAYMENT_FAILED");
  assert.equal((await s.store.rows("orders")).length, 0);
  let order = await createOrder(s);
  order = await s.orders.cancel(await s.user(1), order.id, {
    expectedVersion: order.version
  });
  assert.equal(order.paymentStatus, "VOIDED");
  s.payment.result = "SUCCESS";
  order = await createOrder(s, {
    paymentMethod: "MOCK_CARD"
  });
  assert.match(order.transactionId, /^mock-/);
  order = await s.orders.cancel(await s.user(11), order.id, {
    expectedVersion: order.version,
    reason: "Hết món"
  });
  assert.equal(order.paymentStatus, "REFUNDED");
});
test("Order transitions enforce version, role, ownership and cancellation policy", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  let order = await createOrder(s);
  await fails(async () => await s.orders.get(await s.user(2), order.id), "FORBIDDEN");
  await fails(async () => await s.orders.get(await s.user(12), order.id), "FORBIDDEN");
  await fails(async () => await s.orders.get(await s.user(21), order.id), "FORBIDDEN");
  await fails(async () => await s.orders.get(await s.user(1), 999), "NOT_FOUND");
  await fails(async () => await s.orders.transition(await s.user(1), order.id, {
    targetStatus: "CONFIRMED",
    expectedVersion: 1
  }), "FORBIDDEN");
  await fails(async () => await s.orders.transition(await s.user(11), order.id, {
    targetStatus: "PREPARING",
    expectedVersion: 1
  }), "VALIDATION");
  await fails(async () => await s.orders.cancel(await s.user(11), order.id, {
    expectedVersion: 1
  }), "VALIDATION");
  order = await s.orders.transition(await s.user(11), order.id, {
    targetStatus: "CONFIRMED",
    expectedVersion: 1
  });
  await fails(async () => await s.orders.transition(await s.user(11), order.id, {
    targetStatus: "PREPARING",
    expectedVersion: 1
  }), "CONFLICT");
  await fails(async () => await s.orders.cancel(await s.user(1), order.id, {
    expectedVersion: 2
  }), "VALIDATION");
  await fails(async () => await s.orders.cancel(await s.user(31), order.id, {
    expectedVersion: 2
  }), "FORBIDDEN");
  order = await s.orders.cancel(await s.user(11), order.id, {
    expectedVersion: 2,
    reason: "Bếp gặp sự cố"
  });
  assert.equal(order.history.length, 3);
  await fails(async () => await s.orders.transition(await s.user(11), order.id, {
    targetStatus: "CONFIRMED",
    expectedVersion: 3
  }), "VALIDATION");
  assert.equal((await s.orders.mine(await s.user(2), 1)).total, 0);
});
test("Dispatch: Haversine, tie-break, decline, expiration, retry and stale location", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  assert.ok(Math.abs(haversineKm({
    lat: 0,
    lng: 0
  }, {
    lat: 0,
    lng: 1
  }) - 111.195) < 0.01);
  assert.equal(haversineKm({
    lat: 0,
    lng: 0
  }, {
    lat: 0,
    lng: 0
  }), 0);
  await online(s, 2);
  const point = {
    lat: 10.7705,
    lng: 106.6932
  };
  await s.dispatch.updateLocation(await s.user(21), point);
  await s.dispatch.updateLocation(await s.user(22), point);
  const order = await readyOrder(s);
  await s.dispatch.tick();
  let offer = await s.store.find("driver_offers", {
    order_id: order.id,
    status: "PENDING"
  });
  assert.equal(offer.driver_id, 1); // distance/time tied -> smaller id
  await fails(async () => await s.dispatch.respond(await s.user(22), offer.id, true), "FORBIDDEN");
  await s.dispatch.respond(await s.user(21), offer.id, false);
  await s.dispatch.tick();
  offer = await s.store.find("driver_offers", {
    order_id: order.id,
    status: "PENDING"
  });
  assert.equal(offer.driver_id, 2);
  s.advance(60000);
  await fails(async () => await s.dispatch.respond(await s.user(22), offer.id, true), "CONFLICT");
  await s.dispatch.tick();
  assert.equal((await s.store.offer(offer.id)).status, "EXPIRED");
  assert.equal((await s.store.rows("driver_offers", {
    status: "PENDING"
  })).length, 0);
  s.advance(30000);
  await s.dispatch.tick();
  assert.equal((await s.store.find("driver_offers", {
    order_id: order.id,
    status: "PENDING"
  })).driver_id, 1);
  assert.equal((await s.store.rows("order_history", {
    order_id: order.id
  })).length, 4); // offers don't change order state
  s.advance(121000);
  await s.dispatch.tick();
  s.advance(30000);
  await s.dispatch.tick();
  assert.equal((await s.store.rows("driver_offers", {
    status: "PENDING"
  })).length, 0);
  await s.dispatch.updateLocation(await s.user(21), point);
  s.advance(30000);
  await s.dispatch.tick();
  assert.equal((await s.store.rows("driver_offers", {
    status: "PENDING"
  })).length, 1);
});
test("Dispatch: older updated_at wins ties; offline revokes; invalid coordinates rejected", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  const point = {
    lat: 10.7705,
    lng: 106.6932
  };
  await s.dispatch.setStatus(await s.user(22), {
    status: "AVAILABLE",
    location: point
  });
  s.advance(1);
  await s.dispatch.setStatus(await s.user(21), {
    status: "AVAILABLE",
    location: point
  });
  await readyOrder(s);
  await s.dispatch.tick();
  assert.equal((await s.store.find("driver_offers", {
    status: "PENDING"
  })).driver_id, 2);
  await s.dispatch.setStatus(await s.user(22), {
    status: "OFFLINE"
  });
  await s.dispatch.tick();
  assert.equal((await s.store.find("driver_offers", {
    status: "PENDING"
  })).driver_id, 1);
  await fails(async () => await s.dispatch.updateLocation(await s.user(22), point), "CONFLICT");
  await fails(async () => await s.dispatch.setStatus(await s.user(22), {
    status: "AVAILABLE",
    location: {
      lat: 91,
      lng: 0
    }
  }), "VALIDATION");
  await fails(async () => await s.dispatch.setStatus(await s.user(22), {
    status: "BUSY"
  }), "VALIDATION");
  await fails(async () => await s.dispatch.board(await s.user(1)), "FORBIDDEN");
});
test("Delivery: COD confirmation, driver release and replay are atomic", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  await online(s);
  let order = await readyOrder(s);
  await s.dispatch.tick();
  const offer = (await s.dispatch.board(await s.user(21))).offer;
  order = (await s.dispatch.respond(await s.user(21), offer.offerId, true)).order;
  assert.equal((await s.dispatch.board(await s.user(21))).active.id, order.id);
  await fails(async () => await s.dispatch.respond(await s.user(21), offer.offerId, true), "CONFLICT");
  await fails(async () => await s.dispatch.setStatus(await s.user(21), {
    status: "OFFLINE"
  }), "CONFLICT");
  await fails(async () => await s.admin.lockDriver(await s.user(31), 1, true), "CONFLICT");
  for (const targetStatus of ["PICKED_UP", "DELIVERING"]) {
    order = await s.orders.transition(await s.user(21), order.id, {
      targetStatus,
      expectedVersion: order.version
    });
  }
  await fails(async () => await s.orders.transition(await s.user(21), order.id, {
    targetStatus: "DELIVERED",
    expectedVersion: order.version
  }), "VALIDATION");
  const body = {
    targetStatus: "DELIVERED",
    expectedVersion: order.version,
    codCollected: true
  };
  order = await s.orders.transition(await s.user(21), order.id, body);
  assert.equal(order.paymentStatus, "SUCCESS");
  assert.equal(order.history.length, 8);
  assert.equal((await s.store.driver(21)).status, "AVAILABLE");
  assert.deepEqual(await s.orders.transition(await s.user(21), order.id, body), order);
  assert.equal((await s.dispatch.board(await s.user(21))).summary.deliveredToday, 1);
  assert.equal((await s.dispatch.board(await s.user(21))).summary.earningsToday, 15000);
});
test("Atomic rollback on assignment, cancellation and completion failures", async t => {
  let target;
  const s = await fixture({
    fault: point => {
      if (target === point) {
        throw new Error("injected");
      }
    }
  });
  t.after(async () => await s.store.close());
  let cancellable = await createOrder(s);
  for (const point of ["afterCancellationPayment", "afterCancellationHistory"]) {
    target = point;
    await assert.rejects(async () => await s.orders.cancel(await s.user(1), cancellable.id, {
      expectedVersion: 1
    }), /injected/);
    assert.deepEqual(await s.orders.get(await s.user(1), cancellable.id), cancellable);
  }
  target = null;
  await online(s);
  let order = await readyOrder(s);
  await s.dispatch.tick();
  const offer = (await s.dispatch.board(await s.user(21))).offer;
  for (const point of ["afterDriverBusy", "afterAssignmentHistory"]) {
    target = point;
    await assert.rejects(async () => await s.dispatch.respond(await s.user(21), offer.offerId, true), /injected/);
    assert.equal((await s.store.driver(21)).status, "AVAILABLE");
    assert.equal((await s.store.offer(offer.offerId)).status, "PENDING");
    assert.equal((await s.store.order(order.id)).driver_id, null);
  }
  target = null;
  order = (await s.dispatch.respond(await s.user(21), offer.offerId, true)).order;
  for (const targetStatus of ["PICKED_UP", "DELIVERING"]) {
    order = await s.orders.transition(await s.user(21), order.id, {
      targetStatus,
      expectedVersion: order.version
    });
  }
  for (const point of ["afterCompletionPayment", "afterTransitionHistory"]) {
    target = point;
    await assert.rejects(async () => await s.orders.transition(await s.user(21), order.id, {
      targetStatus: "DELIVERED",
      expectedVersion: order.version,
      codCollected: true
    }), /injected/);
    assert.deepEqual(await s.orders.get(await s.user(1), order.id), order);
    assert.equal((await s.store.driver(21)).status, "BUSY");
  }
});
