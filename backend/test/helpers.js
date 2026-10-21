import { createSystem, createApp } from "../src/app.js";
import { seedData } from "../scripts/demo-fixtures.js";
import { afterEach } from "node:test";
const databaseStores = new Set();
afterEach(async () => {
  await Promise.all([...databaseStores].map((store) => store.close()));
  databaseStores.clear();
});
export async function fixture(options = {}) {
  if (process.env.M2_TEST_STORE === "mysql" && !options.store) {
    const { MysqlStore } = await import("@gomeal/database/src/mysql-store.js");
    const { reset } = await import("@gomeal/database/test/support.js");
    options.store = await MysqlStore.open({ database: process.env.TEST_DB_NAME ?? "gomeal_m2_test" });
    databaseStores.add(options.store);
    await reset(options.store);
  }
  let now = 1_800_000_000_000;
  const logs = [];
  const system = createSystem({
    clock: () => now,
    logger: event => logs.push(event),
    ...options
  });
  await seedData(system.store, "demo12345", system.clock);
  return {
    ...system,
    logs,
    advance: ms => {
      now += ms;
    },
    user: async id => await system.store.user(id)
  };
}
// Điểm giao cách nhà hàng 1 khoảng 1,3 km → bậc phí thấp nhất (15.000đ).
export const DELIVERY_POINT = {
  lat: 10.78,
  lng: 106.7
};
export async function requestBody(system, overrides = {}) {
  const items = [{
    menuItemId: 1,
    quantity: 2,
    selectedOptionIds: [1]
  }];
  return {
    restaurantId: 1,
    items,
    deliveryAddress: "18 Lê Văn Sỹ, Quận 3",
    deliveryLocation: DELIVERY_POINT,
    paymentMethod: "COD",
    requestKey: `request-${Math.random()}`,
    quoteFingerprint: (await system.billing.quote(1, items, {
      deliveryLocation: DELIVERY_POINT
    })).quoteFingerprint,
    ...overrides
  };
}
export async function createOrder(system, overrides = {}, customerId = 1) {
  return (await system.orders.create(await system.user(customerId), await requestBody(system, overrides))).order;
}
export async function readyOrder(system, order) {
  order ??= await createOrder(system);
  for (const targetStatus of ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP"]) {
    order = await system.orders.transition(await system.user(11), order.id, {
      targetStatus,
      expectedVersion: order.version
    });
  }
  return order;
}
export async function online(system, count = 1) {
  for (let i = 1; i <= count; i += 1) {
    await system.dispatch.setStatus(await system.user(20 + i), {
      status: "AVAILABLE",
      location: {
        lat: 10.7705 + i / 10000,
        lng: 106.6932
      }
    });
  }
}
export async function serve(system) {
  const server = createApp(system, {
    corsOrigin: "http://localhost:5500"
  }).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body, token) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? {
          Authorization: `Bearer ${token}`
        } : {})
      },
      ...(body === undefined ? {} : {
        body: JSON.stringify(body)
      })
    });
    return {
      status: response.status,
      json: await response.json()
    };
  };
  const close = async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  };
  return {
    base,
    call,
    close
  };
}
