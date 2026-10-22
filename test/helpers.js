import { createSystem, createApp } from "../src/app.js";
import { seedData } from "../scripts/demo-fixtures.js";

export function fixture(options = {}) {
    let now = 1_800_000_000_000;
    const logs = [];
    const system = createSystem({
        clock: () => now,
        logger: (event) => logs.push(event),
        ...options,
    });
    seedData(system.store, "demo12345", system.clock);
    return {
        ...system,
        logs,
        advance: (ms) => {
            now += ms;
        },
        user: (id) => system.store.user(id),
    };
}
export function requestBody(system, overrides = {}) {
    const items = [{ menuItemId: 1, quantity: 2, selectedOptionIds: [1] }];
    return {
        restaurantId: 1,
        items,
        deliveryAddress: "18 Lê Văn Sỹ, Quận 3",
        paymentMethod: "COD",
        requestKey: `request-${Math.random()}`,
        quoteFingerprint: system.billing.quote(1, items).quoteFingerprint,
        ...overrides,
    };
}
export function createOrder(system, overrides = {}, customerId = 1) {
    return system.orders.create(system.user(customerId), requestBody(system, overrides)).order;
}
export function readyOrder(system, order = createOrder(system)) {
    for (const targetStatus of ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP"]) {
        order = system.orders.transition(system.user(11), order.id, {
            targetStatus,
            expectedVersion: order.version,
        });
    }
    return order;
}
export function online(system, count = 1) {
    for (let i = 1; i <= count; i += 1) {
        system.dispatch.setStatus(system.user(20 + i), {
            status: "AVAILABLE",
            location: { lat: 10.7705 + i / 10000, lng: 106.6932 },
        });
    }
}
export async function serve(system) {
    const server = createApp(system, { corsOrigin: "http://localhost:5500" }).listen(
        0,
        "127.0.0.1"
    );
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (method, path, body, token) => {
        const response = await fetch(base + path, {
            method,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, json: await response.json() };
    };
    const close = async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    };
    return { base, call, close };
}
