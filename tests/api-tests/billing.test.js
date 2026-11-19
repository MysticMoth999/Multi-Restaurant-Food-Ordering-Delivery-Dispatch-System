
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createSystem, createApp } from "../../backend/src/app.js";
import { seedData } from "../../backend/scripts/demo-fixtures.js";

const RESTAURANT = { lat: 10.7705, lng: 106.6932 }; 
const pointAt = km => ({ lat: +(RESTAURANT.lat + km / 111.195).toFixed(6), lng: RESTAURANT.lng });
const sashimi = quantity => [{ menuItemId: 4, quantity, selectedOptionIds: [] }]; 
let system, server, base;

async function call(method, path, body, token) {
    const res = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
}
const login = async email => (await call("POST", "/auth/login", { email, password: "demo12345" })).json.data.token;
const quote = (body, token) => call("POST", "/cart/quote", { restaurantId: 1, ...body }, token);

before(async () => {
    system = createSystem({ logger: () => {} });
    await seedData(system.store, "demo12345", system.clock);
    server = createApp(system, {}).listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await system.store.close();
});

describe("TC-10 phí giao theo bậc km", () => {
    for (const [km, fee] of [[1.3, 15000], [4.4, 22000]]) {
        test(`${km} km → ${fee}đ`, async () => {
            const { status, json } = await quote({ items: sashimi(1), deliveryLocation: pointAt(km) });
            assert.equal(status, 200);
            assert.equal(json.data.distanceKm, km);
            assert.equal(json.data.deliveryFee, fee);
        });
    }
    test("quá 10 km bị từ chối kèm lý do", async () => {
        const { status, json } = await quote({ items: sashimi(1), deliveryLocation: pointAt(10.5) });
        assert.equal(status, 400);
        assert.ok(json.error);
    });
});

describe("TC-10 giảm phí giao theo tiền món", () => {
    const effectiveFee = d => d.total - d.subtotal; // phí khách thực trả khi chưa có voucher
    test("tiền món 360.000đ (≥ 250.000đ) giảm 50% phí: 22.000 → 11.000", async () => {
        const { json } = await quote({ items: sashimi(3), deliveryLocation: pointAt(4.4) });
        assert.equal(json.data.subtotal, 360000);
        assert.equal(effectiveFee(json.data), 11000);
    });
    test("tiền món 600.000đ (≥ 500.000đ) miễn phí giao", async () => {
        const { json } = await quote({ items: sashimi(5), deliveryLocation: pointAt(4.4) });
        assert.equal(json.data.subtotal, 600000);
        assert.equal(effectiveFee(json.data), 0);
    });
});

describe("TC-10 voucher", () => {
    test("GIAM20 giảm 20% tiền món (240.000đ → −48.000đ)", async () => {
        const token = await login("khach@gomeal.vn");
        const { status, json } = await quote({ items: sashimi(2), deliveryLocation: pointAt(1.3), voucherCode: "GIAM20" }, token);
        assert.equal(status, 200);
        assert.equal(json.data.total, 240000 + 15000 - 48000);
    });
    test("chưa đủ giá trị tối thiểu (GIAM20, 120.000đ < 150.000đ) bị từ chối kèm lý do", async () => {
        const token = await login("khach@gomeal.vn");
        const { status, json } = await quote({ items: sashimi(1), deliveryLocation: pointAt(1.3), voucherCode: "GIAM20" }, token);
        assert.equal(status, 400);
        assert.ok(json.error);
    });
    test("voucher riêng của khách 1 (KHACHMOI) khách 2 không dùng được", async () => {
        const token = await login("khach2@gomeal.vn");
        const { status, json } = await quote({ items: sashimi(1), deliveryLocation: pointAt(1.3), voucherCode: "KHACHMOI" }, token);
        assert.equal(status, 400);
        assert.ok(json.error);
    });
    test("mã không tồn tại bị từ chối", async () => {
        const token = await login("khach@gomeal.vn");
        const { status } = await quote({ items: sashimi(1), deliveryLocation: pointAt(1.3), voucherCode: "KHONGCO" }, token);
        assert.equal(status, 400);
    });
});