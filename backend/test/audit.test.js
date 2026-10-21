import test from "node:test";
import assert from "node:assert/strict";
import { fixture, serve, readyOrder, online, DELIVERY_POINT } from "./helpers.js";
test("Cart HTTP: ownership, CRUD, options, single restaurant and checkout", async t => {
  const s = await fixture();
  const http = await serve(s);
  t.after(() => http.close());
  const token = async id => (await s.auth.login({
    email: (await s.user(id)).email,
    password: "demo12345"
  })).token;
  const customer = await token(1),
    other = await token(2),
    manager = await token(11);
  const item = {
    menuItemId: 1,
    quantity: 2,
    selectedOptionIds: [1]
  };
  for (const [method, path, body] of [["GET", "/cart"], ["POST", "/cart/items", {}], ["PATCH", "/cart/items", {}], ["POST", "/cart/items/remove", {}], ["DELETE", "/cart"]]) {
    assert.equal((await http.call(method, path, body)).status, 401);
    assert.equal((await http.call(method, path, body, manager)).status, 403);
  }
  let result = await http.call("POST", "/cart/items", {
    restaurantId: 1,
    item,
    customerId: 2
  }, customer);
  assert.equal(result.status, 200);
  assert.equal(result.json.data.quote.total, 125000);
  assert.deepEqual((await http.call("GET", "/cart", undefined, other)).json.data.items, []);
  await http.call("POST", "/cart/items", {
    restaurantId: 1,
    item: {
      ...item,
      selectedOptionIds: []
    }
  }, customer);
  assert.equal((await s.cart.get(await s.user(1))).items.length, 2);
  result = await http.call("POST", "/cart/items", {
    restaurantId: 2,
    item: {
      menuItemId: 3,
      quantity: 1
    }
  }, customer);
  assert.equal(result.status, 409);
  for (const invalid of [{
    ...item,
    quantity: 100
  }, {
    ...item,
    selectedOptionIds: [2]
  }]) {
    assert.equal((await http.call("PATCH", "/cart/items", {
      line: item,
      item: invalid
    }, customer)).status, 400);
  }
  result = await http.call("PATCH", "/cart/items", {
    line: item,
    item: {
      ...item,
      quantity: 1,
      selectedOptionIds: []
    }
  }, customer);
  assert.equal(result.json.data.items.length, 1);
  assert.equal(result.json.data.items[0].quantity, 3);
  const cart = result.json.data;
  // Khi đặt, khách báo giá lại kèm điểm giao để có phí theo quãng đường.
  const quoted = await http.call("POST", "/cart/quote", {
    restaurantId: cart.restaurantId,
    items: cart.items,
    deliveryLocation: DELIVERY_POINT
  });
  result = await http.call("POST", "/orders", {
    restaurantId: cart.restaurantId,
    items: cart.items,
    quoteFingerprint: quoted.json.data.quoteFingerprint,
    requestKey: "cart-checkout",
    deliveryAddress: "18 Le Van Sy",
    deliveryLocation: DELIVERY_POINT,
    paymentMethod: "COD"
  }, customer);
  assert.equal(result.status, 200);
  assert.equal(result.json.data.order.total, 165000);
  result = await http.call("POST", "/cart/items/remove", {
    line: cart.items[0]
  }, customer);
  assert.deepEqual(result.json.data, {
    restaurantId: null,
    items: []
  });
  assert.equal((await http.call("POST", "/cart/items/remove", {
    line: item
  }, customer)).status, 404);
  await http.call("POST", "/cart/items", {
    restaurantId: 2,
    item: {
      menuItemId: 3,
      quantity: 1
    }
  }, customer);
  assert.equal((await http.call("DELETE", "/cart", undefined, customer)).json.data.items.length, 0);
});
test("Dispatch rejects failed conditional reservation and rolls back", async () => {
  for (const target of ["drivers", "driver_offers"]) {
    const s = await fixture();
    await readyOrder(s);
    await online(s);
    await s.dispatch.tick();
    const offer = await s.store.find("driver_offers", {
      status: "PENDING"
    });
    const update = await s.store.update.bind(s.store);
    s.store.update = (name, where, values) => name === target ? 0 : update(name, where, values);
    await assert.rejects(async () => await s.dispatch.respond(await s.user(21), offer.id, true), error => error.code === "CONFLICT");
    assert.equal((await s.store.driver(21)).status, "AVAILABLE");
    assert.equal((await s.store.offer(offer.id)).status, "PENDING");
    assert.equal((await s.store.order(offer.order_id)).driver_id, null);
  }
});

// Audit 21/10/2026
test("Dispatch: driver going online after the retry was scheduled is invited at once", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  const order = await readyOrder(s);
  await s.dispatch.tick(); // no driver online yet -> retry scheduled
  assert.ok((await s.store.order(order.id)).retry_at > s.clock());
  await online(s);
  await s.dispatch.tick(); // the app ticks right after PUT /driver/status
  assert.equal((await s.store.find("driver_offers", {
    order_id: order.id,
    status: "PENDING"
  })).driver_id, 1);
  await s.dispatch.respond(await s.user(21), (await s.store.find("driver_offers", {
    status: "PENDING"
  })).id, false);
  await s.dispatch.tick(); // skipped driver is not re-invited before the retry time
  assert.equal((await s.store.rows("driver_offers", {
    status: "PENDING"
  })).length, 0);
  s.advance(30_000);
  await s.dispatch.updateLocation(await s.user(21), {
    lat: 10.7706,
    lng: 106.6932
  });
  await s.dispatch.tick(); // retry time reached -> skip list cleared
  assert.equal((await s.store.find("driver_offers", {
    status: "PENDING"
  })).driver_id, 1);
});
test("Dispatch: restaurant without valid coordinates is not dispatched", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  await online(s, 2);
  const order = await readyOrder(s);
  if (s.store.config) {
    await assert.rejects(() => s.store.update("restaurants", { id: 1 }, { lat: null, lng: null }),
      (error) => error.code === "VALIDATION");
    await s.dispatch.tick();
    assert.equal((await s.store.rows("driver_offers", { status: "PENDING" })).length, 1);
    return;
  }
  await s.store.update("restaurants", {
    id: 1
  }, {
    lat: null,
    lng: null
  });
  await s.dispatch.tick();
  await s.dispatch.tick();
  assert.equal((await s.store.rows("driver_offers")).length, 0);
  assert.equal((await s.store.rows("activity")).filter(row => row.text.includes(`GM-${order.id}`) && row.text.includes("tọa độ")).length, 1);
  await s.store.update("restaurants", {
    id: 1
  }, {
    lat: 10.7705,
    lng: 106.6932
  });
  s.advance(30_000);
  await online(s, 2); // keep locations fresh
  await s.dispatch.tick();
  assert.equal((await s.store.rows("driver_offers", {
    status: "PENDING"
  })).length, 1);
});
test("Auth: expired sessions are purged and rejected", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  const old = (await s.auth.login({
    email: "khach@gomeal.vn",
    password: "demo12345"
  })).token;
  await s.auth.login({
    email: "khach@gomeal.vn",
    password: "demo12345"
  });
  s.advance(60 * 60_000);
  await assert.rejects(async () => await s.auth.authenticate(old), error => error.code === "UNAUTHENTICATED");
  await s.auth.login({
    email: "khach@gomeal.vn",
    password: "demo12345"
  });
  assert.equal((await s.store.rows("sessions")).length, 1);
});
