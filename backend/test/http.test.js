import test from "node:test";
import assert from "node:assert/strict";
import { fixture, serve, requestBody, createOrder, readyOrder, online } from "./helpers.js";
test("HTTP full lifecycle uses authenticated identity and optimistic version", async t => {
  const s = await fixture();
  const http = await serve(s);
  t.after(async () => {
    await http.close();
    await s.store.close();
  });
  const login = async email => {
    const response = await http.call("POST", "/auth/login", {
      email,
      password: "demo12345"
    });
    assert.equal(response.status, 200);
    return response.json.data.token;
  };
  const customer = await login("khach@gomeal.vn");
  const manager = await login("nhahang@gomeal.vn");
  const driver = await login("taixe@gomeal.vn");
  const quote = await http.call("POST", "/cart/quote", {
    restaurantId: 1,
    items: [{
      menuItemId: 1,
      quantity: 2,
      selectedOptionIds: [1]
    }]
  });
  assert.equal(quote.json.data.total, 125000);
  const body = await requestBody(s, {
    requestKey: "http-demo",
    actorRole: "ADMIN",
    customerId: 2
  });
  const [first, second] = await Promise.all([http.call("POST", "/orders", body, customer), http.call("POST", "/orders", body, customer)]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  let order = first.json.data.order;
  assert.equal(order.customerId, 1);
  assert.equal(order.id, second.json.data.order.id);
  assert.equal((await s.store.rows("orders")).length, 1);
  for (const targetStatus of ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP"]) {
    const result = await http.call("POST", `/orders/${order.id}/transitions`, {
      targetStatus,
      expectedVersion: order.version
    }, manager);
    assert.equal(result.status, 200);
    order = result.json.data.order;
  }
  // READY triggered a scan with no available driver, so retry occurs at the configured boundary.
  await http.call("PUT", "/driver/status", {
    status: "AVAILABLE",
    location: {
      lat: 10.7705,
      lng: 106.6932
    }
  }, driver);
  s.advance(30000);
  await s.tick();
  const board = await http.call("GET", "/driver/board", undefined, driver);
  assert.ok(board.json.data.offer.offerId);
  const accepted = await http.call("POST", `/driver/offers/${board.json.data.offer.offerId}/accept`, {}, driver);
  assert.equal(accepted.status, 200);
  order = accepted.json.data.order;
  for (const targetStatus of ["PICKED_UP", "DELIVERING", "DELIVERED"]) {
    const result = await http.call("POST", `/orders/${order.id}/transitions`, {
      targetStatus,
      expectedVersion: order.version,
      codCollected: true
    }, driver);
    assert.equal(result.status, 200);
    order = result.json.data.order;
  }
  assert.equal(order.paymentStatus, "SUCCESS");
  assert.equal(order.history.length, 8);
  const mine = await http.call("GET", "/orders/mine?page=1", undefined, customer);
  assert.equal(mine.json.data.total, 1);
  assert.equal((await http.call("GET", `/orders/${order.id}`, undefined, customer)).json.data.order.status, "DELIVERED");
});
test("Sensitive API role matrix rejects anonymous and wrong-role calls", async t => {
  const s = await fixture();
  const http = await serve(s);
  t.after(async () => {
    await http.close();
    await s.store.close();
  });
  const tokens = {};
  for (const [role, email] of [["CUSTOMER", "khach@gomeal.vn"], ["MANAGER", "nhahang@gomeal.vn"], ["DRIVER", "taixe@gomeal.vn"], ["ADMIN", "admin@gomeal.vn"]]) {
    tokens[role] = (await s.auth.login({
      email,
      password: "demo12345"
    })).token;
  }
  const routes = [["POST", "/orders", "CUSTOMER"], ["GET", "/orders/mine", "CUSTOMER"], ["POST", "/orders/1/cancel", "CUSTOMER"], ["GET", "/manager/dashboard", "MANAGER"], ["POST", "/manager/menu", "MANAGER"], ["PATCH", "/manager/menu/1", "MANAGER"], ["POST", "/manager/menu/1/options", "MANAGER"], ["PATCH", "/manager/menu/1/options/1", "MANAGER"], ["POST", "/manager/orders/1/cancel", "MANAGER"], ["GET", "/driver/board", "DRIVER"], ["PUT", "/driver/status", "DRIVER"], ["PUT", "/driver/location", "DRIVER"], ["POST", "/driver/offers/1/accept", "DRIVER"], ["POST", "/driver/offers/1/decline", "DRIVER"], ["GET", "/admin/dashboard", "ADMIN"], ["PATCH", "/admin/restaurants/1", "ADMIN"], ["PATCH", "/admin/drivers/1", "ADMIN"]];
  let checks = 0;
  for (const [method, path, allowed] of routes) {
    const body = method === "GET" ? undefined : {};
    assert.equal((await http.call(method, path, body)).status, 401, path);
    checks += 1;
    for (const role of Object.keys(tokens).filter(role => role !== allowed)) {
      assert.equal((await http.call(method, path, body, tokens[role])).status, 403, `${path} ${role}`);
      checks += 1;
    }
  }
  assert.equal(checks, 68);
  for (const path of ["/me", "/orders/1"]) {
    assert.equal((await http.call("GET", path)).status, 401);
  }
  assert.equal((await http.call("PATCH", "/me", {
    phone: "0912345678"
  })).status, 401);
  assert.equal((await http.call("POST", "/auth/logout", {})).status, 401);
  assert.equal((await http.call("POST", "/orders/1/transitions", {})).status, 401);
  assert.equal((await s.store.rows("orders")).length, 0);
});
test("Ownership, token expiry, lock revocation, register and safe error envelopes", async t => {
  const s = await fixture();
  const http = await serve(s);
  t.after(async () => {
    await http.close();
    await s.store.close();
  });
  const token = async id => (await s.auth.login({
    email: (await s.user(id)).email,
    password: "demo12345"
  })).token;
  const customer = await token(1);
  const other = await token(2);
  const manager2 = await token(12);
  const driver = await token(21);
  const order = await createOrder(s);
  assert.equal((await http.call("GET", `/orders/${order.id}`, undefined, other)).status, 403);
  assert.equal((await http.call("POST", `/orders/${order.id}/cancel`, {
    expectedVersion: 1
  }, other)).status, 403);
  assert.equal((await http.call("POST", `/orders/${order.id}/transitions`, {
    expectedVersion: 1,
    targetStatus: "CONFIRMED"
  }, manager2)).status, 403);
  assert.equal((await http.call("PATCH", "/manager/menu/1", {
    price: 1
  }, manager2)).status, 403);
  const created = await http.call("POST", "/auth/register", {
    email: "new@example.com",
    name: "New",
    password: "secret123",
    role: "ADMIN"
  });
  assert.equal(created.json.data.user.role, "CUSTOMER");
  assert.equal(created.json.data.user.password_hash, undefined);
  assert.equal((await http.call("POST", "/auth/register", {
    email: "NEW@example.com",
    name: "New",
    password: "secret123"
  })).status, 409);
  assert.equal((await http.call("POST", "/auth/login", {
    email: "new@example.com",
    password: "wrong"
  })).status, 401);
  assert.equal((await http.call("PATCH", "/me", {
    phone: "123"
  }, customer)).status, 400);
  assert.equal((await http.call("PATCH", "/me", {
    phone: "0912345699"
  }, customer)).status, 200);
  await s.admin.lockDriver(await s.user(31), 1, true);
  assert.equal((await http.call("GET", "/driver/board", undefined, driver)).status, 401);
  assert.equal((await http.call("POST", "/auth/login", {
    email: "taixe@gomeal.vn",
    password: "demo12345"
  })).status, 403);
  s.advance(3600000);
  assert.equal((await http.call("GET", "/me", undefined, customer)).status, 401);
  const fresh = await token(1);
  assert.equal((await http.call("POST", "/auth/logout", {}, fresh)).status, 200);
  assert.equal((await http.call("GET", "/me", undefined, fresh)).status, 401);
  const malformed = await fetch(http.base + "/cart/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{"
  });
  assert.equal(malformed.status, 400);
  const invalid = await http.call("POST", "/cart/quote", []);
  assert.equal(invalid.status, 400);
  assert.ok(invalid.json.requestId);
  assert.equal(invalid.json.stack, undefined);
  assert.equal((await http.call("GET", "/unknown")).status, 404);
  assert.ok(!JSON.stringify(s.logs).includes("demo12345"));
  assert.ok(!JSON.stringify(s.logs).includes(customer));
  for (const user of await s.store.rows("users")) {
    assert.match(user.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  }
  assert.notEqual((await s.store.user(1)).password_hash, (await s.store.user(2)).password_hash);
});
test("Catalog/menu/options/admin API support review scenarios", async t => {
  const s = await fixture();
  const http = await serve(s);
  t.after(async () => {
    await http.close();
    await s.store.close();
  });
  const manager = (await s.auth.login({
    email: "nhahang@gomeal.vn",
    password: "demo12345"
  })).token;
  const admin = (await s.auth.login({
    email: "admin@gomeal.vn",
    password: "demo12345"
  })).token;
  assert.equal((await http.call("GET", "/restaurants?q=Hokkaido")).json.data.total, 1);
  assert.equal((await http.call("GET", "/restaurants?lat=0&lng=0")).json.data.total, 0);
  assert.equal((await http.call("GET", "/restaurants?lat=10.7705&lng=106.6932")).json.data.items[0].id, 1);
  assert.equal((await http.call("GET", "/restaurants?lat=91&lng=0")).status, 400);
  assert.equal((await http.call("GET", "/restaurants?page=0")).status, 400);
  const added = await http.call("POST", "/manager/menu", {
    name: "Món mới",
    price: 1000
  }, manager);
  assert.equal(added.status, 200);
  const id = added.json.data.item.id;
  assert.equal((await http.call("POST", `/manager/menu/${id}/options`, {
    name: "Option",
    surcharge: 1000
  }, manager)).status, 200);
  const option = await s.store.find("menu_options", {
    menu_item_id: id
  });
  assert.equal((await http.call("PATCH", `/manager/menu/${id}/options/${option.id}`, {
    surcharge: -1
  }, manager)).status, 400);
  assert.equal((await http.call("PATCH", `/manager/menu/${id}/options/${option.id}`, {
    available: false
  }, manager)).status, 200);
  assert.equal((await http.call("PATCH", `/manager/menu/${id}`, {
    available: false
  }, manager)).status, 200);
  assert.equal((await http.call("GET", "/manager/dashboard", undefined, manager)).status, 200);
  assert.equal((await http.call("PATCH", "/admin/restaurants/1", {
    status: "INACTIVE"
  }, admin)).status, 200);
  assert.equal((await http.call("GET", "/restaurants/1/menu")).status, 404);
  assert.equal((await http.call("GET", "/restaurants")).json.data.total, 1);
  assert.equal((await http.call("PATCH", "/admin/restaurants/1", {
    status: "ACTIVE"
  }, admin)).status, 200);
  await online(s);
  await readyOrder(s);
  await s.dispatch.tick();
  assert.equal((await s.store.rows("driver_offers", {
    status: "PENDING"
  })).length, 1);
  assert.equal((await http.call("PATCH", "/admin/drivers/1", {
    locked: true
  }, admin)).status, 200);
  assert.equal((await s.store.rows("driver_offers", {
    status: "PENDING"
  })).length, 0);
  assert.equal((await http.call("PATCH", "/admin/drivers/1", {
    locked: false
  }, admin)).status, 200);
  const dashboard = await http.call("GET", "/admin/dashboard", undefined, admin);
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.json.data.activity.length >= 4);
});
test("100 HTTP dispatch rounds: 20 orders, 5 drivers, double accepts and late accepts", async t => {
  const s = await fixture();
  const http = await serve(s);
  t.after(async () => {
    await http.close();
    await s.store.close();
  });
  const tokens = await Promise.all(Array.from({
    length: 5
  }, async (_, i) => (await s.auth.login({
    email: (await s.user(i + 21)).email,
    password: "demo12345"
  })).token));
  for (let round = 0; round < 100; round += 1) {
    if (round > 0 && round % 20 === 0) {
      for (let i = 0; i < 5; i += 1) {
        tokens[i] = (await s.auth.login({ email: (await s.user(i + 21)).email, password: "demo12345" })).token;
      }
    }
    await s.store.transaction(async () => {
      for (const table of ["notifications", "voucher_redemptions", "dispatch_skips", "driver_offers", "order_history", "order_items", "payments", "orders", "activity"]) {
        for (const row of await s.store.rows(table)) await s.store.remove(table, {
          id: row.id
        });
      }
      for (const driver of await s.store.rows("drivers")) {
        await s.store.update("drivers", {
          id: driver.id
        }, {
          status: "OFFLINE"
        });
      }
    });
    await online(s, 5);
    for (let i = 0; i < 20; i += 1) {
      await readyOrder(s);
    }
    await s.dispatch.tick();
    const offers = await s.store.rows("driver_offers", {
      status: "PENDING"
    });
    assert.equal(offers.length, 5);
    const responses = await Promise.all(offers.flatMap(offer => [0, 1].map(() => http.call("POST", `/driver/offers/${offer.id}/accept`, {}, tokens[offer.driver_id - 1]))));
    assert.equal(responses.filter(response => response.status === 200).length, 5);
    assert.equal(responses.filter(response => response.status === 409).length, 5);
    assert.equal((await s.store.rows("orders", {
      status: "READY_FOR_PICKUP"
    })).length, 15);
    assert.equal(new Set((await s.store.rows("orders", {
      status: "DRIVER_ASSIGNED"
    })).map(order => order.driver_id)).size, 5);
    let order = await s.store.orderView(offers[0].order_id);
    const user = await s.user(20 + offers[0].driver_id);
    for (const targetStatus of ["PICKED_UP", "DELIVERING", "DELIVERED"]) {
      order = await s.orders.transition(user, order.id, {
        targetStatus,
        expectedVersion: order.version,
        codCollected: true
      });
    }
    s.advance(30000);
    await s.dispatch.tick();
    const next = await s.store.find("driver_offers", {
      status: "PENDING"
    });
    assert.ok(next); // worker can assign another waiting order after one driver finishes
    // Advance the controlled clock to expiry; keep expires_at > created_at valid.
    s.advance(60000);
    assert.equal((await http.call("POST", `/driver/offers/${next.id}/accept`, {}, tokens[next.driver_id - 1])).status, 409);
  }
});
