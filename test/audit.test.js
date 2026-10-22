import test from "node:test";
import assert from "node:assert/strict";
import { fixture, serve, readyOrder, online } from "./helpers.js";

test("Cart HTTP: ownership, CRUD, options, single restaurant and checkout", async (t) => {
    const s = fixture();
    const http = await serve(s);
    t.after(() => http.close());
    const token = (id) => s.auth.login({ email: s.user(id).email, password: "demo12345" }).token;
    const customer = token(1),
        other = token(2),
        manager = token(11);
    const item = { menuItemId: 1, quantity: 2, selectedOptionIds: [1] };
    for (const [method, path, body] of [
        ["GET", "/cart"],
        ["POST", "/cart/items", {}],
        ["PATCH", "/cart/items", {}],
        ["POST", "/cart/items/remove", {}],
        ["DELETE", "/cart"],
    ]) {
        assert.equal((await http.call(method, path, body)).status, 401);
        assert.equal((await http.call(method, path, body, manager)).status, 403);
    }
    let result = await http.call(
        "POST",
        "/cart/items",
        { restaurantId: 1, item, customerId: 2 },
        customer
    );
    assert.equal(result.status, 200);
    assert.equal(result.json.data.quote.total, 125000);
    assert.deepEqual((await http.call("GET", "/cart", undefined, other)).json.data.items, []);
    await http.call(
        "POST",
        "/cart/items",
        { restaurantId: 1, item: { ...item, selectedOptionIds: [] } },
        customer
    );
    assert.equal(s.cart.get(s.user(1)).items.length, 2);
    result = await http.call(
        "POST",
        "/cart/items",
        { restaurantId: 2, item: { menuItemId: 3, quantity: 1 } },
        customer
    );
    assert.equal(result.status, 409);
    for (const invalid of [
        { ...item, quantity: 100 },
        { ...item, selectedOptionIds: [2] },
    ]) {
        assert.equal(
            (await http.call("PATCH", "/cart/items", { line: item, item: invalid }, customer))
                .status,
            400
        );
    }
    result = await http.call(
        "PATCH",
        "/cart/items",
        { line: item, item: { ...item, quantity: 1, selectedOptionIds: [] } },
        customer
    );
    assert.equal(result.json.data.items.length, 1);
    assert.equal(result.json.data.items[0].quantity, 3);
    const cart = result.json.data;
    result = await http.call(
        "POST",
        "/orders",
        {
            restaurantId: cart.restaurantId,
            items: cart.items,
            quoteFingerprint: cart.quote.quoteFingerprint,
            requestKey: "cart-checkout",
            deliveryAddress: "18 Le Van Sy",
            paymentMethod: "COD",
        },
        customer
    );
    assert.equal(result.status, 200);
    assert.equal(result.json.data.order.total, 165000);
    result = await http.call("POST", "/cart/items/remove", { line: cart.items[0] }, customer);
    assert.deepEqual(result.json.data, { restaurantId: null, items: [] });
    assert.equal(
        (await http.call("POST", "/cart/items/remove", { line: item }, customer)).status,
        404
    );
    await http.call(
        "POST",
        "/cart/items",
        { restaurantId: 2, item: { menuItemId: 3, quantity: 1 } },
        customer
    );
    assert.equal(
        (await http.call("DELETE", "/cart", undefined, customer)).json.data.items.length,
        0
    );
});

test("Dispatch rejects failed conditional reservation and rolls back", () => {
    for (const target of ["drivers", "driver_offers"]) {
        const s = fixture();
        readyOrder(s);
        online(s);
        s.dispatch.tick();
        const offer = s.store.find("driver_offers", { status: "PENDING" });
        const update = s.store.update.bind(s.store);
        s.store.update = (name, where, values) =>
            name === target ? 0 : update(name, where, values);
        assert.throws(
            () => s.dispatch.respond(s.user(21), offer.id, true),
            (error) => error.code === "CONFLICT"
        );
        assert.equal(s.store.driver(21).status, "AVAILABLE");
        assert.equal(s.store.offer(offer.id).status, "PENDING");
        assert.equal(s.store.order(offer.order_id).driver_id, null);
    }
});
