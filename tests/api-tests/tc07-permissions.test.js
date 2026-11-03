
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSystem, createApp } from "../../backend/src/app.js";
import { seedData } from "../../backend/scripts/demo-fixtures.js";

const ACCOUNTS = {
    customer: "khach@gomeal.vn", customer2: "khach2@gomeal.vn",
    manager: "nhahang@gomeal.vn", manager2: "nhahang2@gomeal.vn", // quản lý nhà hàng 1 và 2
    driver: "taixe@gomeal.vn", admin: "admin@gomeal.vn",
};
const ROLE_OF = { customer: "CUSTOMER", manager: "MANAGER", driver: "DRIVER", admin: "ADMIN" };
const ALL = ["CUSTOMER", "MANAGER", "DRIVER", "ADMIN"];
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const RESTAURANT = { lat: 10.7705, lng: 106.6932 };

let now = 1_800_000_000_000;
let system, server, base;
const T = {}; // token theo tên tài khoản
const ctx = {}; // dữ liệu dựng sẵn (đơn của khách 1)
const rows = []; // kết quả để ghi bảng

async function call(method, path, body, token, contentType) {
    const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    let payload;
    if (Buffer.isBuffer(body)) { headers["Content-Type"] = contentType ?? "image/png"; payload = body; }
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(base + path, { method, headers, body: payload });
    return { status: res.status, json: await res.json().catch(() => ({})) };
}
const login = async name => {
    const { json } = await call("POST", "/auth/login", { email: ACCOUNTS[name], password: "demo12345" });
    return json.data.token;
};


const ENDPOINTS = [
    { m: "GET", p: () => "/me", roles: ALL, probe: "customer" },
    { m: "PATCH", p: () => "/me", body: () => ({ phone: "0912345678" }), roles: ALL },
    { m: "POST", p: () => "/auth/logout", body: () => ({}), roles: ALL },
    { m: "GET", p: () => "/notifications?after=0", roles: ALL, probe: "customer" },
    { m: "POST", p: () => "/notifications/read", body: () => ({ all: true }), roles: ALL },
    { m: "GET", p: () => "/vouchers/mine", roles: ["CUSTOMER"], probe: "customer" },
    { m: "GET", p: () => "/cart", roles: ["CUSTOMER"], probe: "customer" },
    { m: "POST", p: () => "/cart/items", body: () => ({ restaurantId: 1, item: { menuItemId: 1, quantity: 1, selectedOptionIds: [] } }), roles: ["CUSTOMER"] },
    { m: "PATCH", p: () => "/cart/items", body: () => ({ line: { menuItemId: 1, selectedOptionIds: [] }, item: { menuItemId: 1, quantity: 2, selectedOptionIds: [] } }), roles: ["CUSTOMER"] },
    { m: "POST", p: () => "/cart/items/remove", body: () => ({ line: { menuItemId: 1, selectedOptionIds: [] } }), roles: ["CUSTOMER"] },
    { m: "DELETE", p: () => "/cart", roles: ["CUSTOMER"] },
    { m: "POST", p: () => "/orders", body: () => ({ restaurantId: 1, items: [{ menuItemId: 1, quantity: 1, selectedOptionIds: [] }] }), roles: ["CUSTOMER"] },
    { m: "GET", p: () => "/orders/mine?page=1", roles: ["CUSTOMER"], probe: "customer" },
    { m: "GET", p: c => `/orders/${c.orderId}`, roles: ALL, owner: ["customer2", "manager2", "driver"], probe: "customer" },
    { m: "POST", p: c => `/orders/${c.orderId}/cancel`, body: () => ({ expectedVersion: 1 }), roles: ["CUSTOMER"], owner: ["customer2"] },
    { m: "POST", p: c => `/manager/orders/${c.orderId}/cancel`, body: () => ({ expectedVersion: 1, reason: "test" }), roles: ["MANAGER"], owner: ["manager2"] },
    { m: "POST", p: c => `/orders/${c.orderId}/transitions`, body: () => ({ targetStatus: "CONFIRMED", expectedVersion: 1 }), roles: ["MANAGER", "DRIVER"], owner: ["manager2"] },
    { m: "GET", p: () => "/manager/dashboard?restaurantId=1", roles: ["MANAGER"], owner: ["manager2"], probe: "manager" },
    { m: "POST", p: () => "/manager/menu", body: () => ({ restaurantId: 1, name: "Món thử quyền", price: 10000 }), roles: ["MANAGER"], owner: ["manager2"] },
    { m: "POST", p: () => "/manager/menu/1/image", body: () => PNG, roles: ["MANAGER"], owner: ["manager2"] },
    { m: "PATCH", p: () => "/manager/menu/1", body: () => ({ price: 51000 }), roles: ["MANAGER"], owner: ["manager2"] },
    { m: "POST", p: () => "/manager/menu/1/options", body: () => ({ name: "Thử quyền", surcharge: 1000 }), roles: ["MANAGER"], owner: ["manager2"] },
    { m: "PATCH", p: () => "/manager/menu/1/options/1", body: () => ({ surcharge: 6000 }), roles: ["MANAGER"], owner: ["manager2"] },
    { m: "PUT", p: () => "/driver/status", body: () => ({ status: "AVAILABLE", location: RESTAURANT }), roles: ["DRIVER"] },
    { m: "PUT", p: () => "/driver/location", body: () => RESTAURANT, roles: ["DRIVER"] },
    { m: "GET", p: () => "/driver/board", roles: ["DRIVER"], probe: "driver" },
    { m: "POST", p: () => "/driver/offers/1/accept", body: () => ({}), roles: ["DRIVER"] },
    { m: "POST", p: () => "/driver/offers/1/decline", body: () => ({}), roles: ["DRIVER"] },
    { m: "GET", p: () => "/admin/dashboard", roles: ["ADMIN"], probe: "admin" },
    { m: "PATCH", p: () => "/admin/restaurants/1", body: () => ({ status: "ACTIVE" }), roles: ["ADMIN"] },
    { m: "PATCH", p: () => "/admin/drivers/1", body: () => ({ locked: false }), roles: ["ADMIN"] },
    { m: "PATCH", p: () => "/admin/settings", body: () => ({ fuelPrice: 23000 }), roles: ["ADMIN"] },
    { m: "GET", p: () => "/admin/vouchers", roles: ["ADMIN"], probe: "admin" },
    { m: "POST", p: () => "/admin/vouchers", body: () => ({ code: "QUYENTEST", kind: "ORDER", amount: 1000 }), roles: ["ADMIN"] },
    { m: "PATCH", p: () => "/admin/vouchers/1", body: () => ({ active: true }), roles: ["ADMIN"] },
];

async function check(ep, cases) {
    const failures = [];
    for (const c of cases) {
        const res = await call(ep.m, ep.p(ctx), ep.body?.(), c.token);
        const ok = res.status === c.expect && !("data" in res.json && c.expect >= 400);
        rows.push({ endpoint: `${ep.m} ${ep.p(ctx).split("?")[0]}`, case: c.name, expect: c.expect, actual: res.status, ok });
        if (!ok) failures.push(`${c.name}: mong đợi ${c.expect}, thực tế ${res.status}${"data" in res.json ? " (có trả data)" : ""}`);
    }
    assert.deepEqual(failures, []);
}

before(async () => {
    system = createSystem({ clock: () => now, logger: () => {} });
    await seedData(system.store, "demo12345", system.clock);
    server = createApp(system, {}).listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}/api`;
    for (const name of Object.keys(ACCOUNTS)) T[name] = await login(name);
    
    const items = [{ menuItemId: 1, quantity: 1, selectedOptionIds: [] }];
    const deliveryLocation = { lat: +(RESTAURANT.lat + 1.3 / 111.195).toFixed(6), lng: RESTAURANT.lng };
    const quote = (await call("POST", "/cart/quote", { restaurantId: 1, items, deliveryLocation })).json.data;
    const placed = await call("POST", "/orders", {
        restaurantId: 1, items, deliveryLocation, deliveryAddress: "18 Lê Văn Sỹ, Quận 3", paymentMethod: "COD",
        requestKey: "m4-matrix-order", quoteFingerprint: quote.quoteFingerprint,
    }, T.customer);
    assert.equal(placed.status, 200, "không dựng được đơn mẫu");
    ctx.orderId = placed.json.data.order.id;
});

after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await system.store.close();
    const passed = rows.filter(r => r.ok).length;
    const lines = [
        "# Ma trận quyền TC-07 (NFR-03)", "",
        `Kết quả: **${passed}/${rows.length}** ca đạt${passed === rows.length ? " (100%)" : ""}.`, "",
        "| Endpoint | Trường hợp | Mong đợi | Thực tế | Kết quả |", "|---|---|---:|---:|---|",
        ...rows.map(r => `| ${r.endpoint} | ${r.case} | ${r.expect} | ${r.actual} | ${r.ok ? "PASS" : "**FAIL**"} |`), "",
    ];
    const dir = fileURLToPath(new URL("../results/", import.meta.url));
    mkdirSync(dir, { recursive: true });
    writeFileSync(dir + "permission-matrix.md", lines.join("\n"));
});

describe("TC-07 endpoint công khai không cần token", () => {
    for (const path of ["/restaurants", "/restaurants/1/menu", "/pricing", "/config"]) {
        test(`GET ${path} → 200`, async () => assert.equal((await call("GET", path)).status, 200));
    }
});

describe("TC-07 chưa đăng nhập, token sai, sai vai trò, sai chủ sở hữu", () => {
    for (const ep of ENDPOINTS) {
        test(`${ep.m} ${ep.p({ orderId: 0 }).split("?")[0]}`, async () => {
            const cases = [
                { name: "không token", token: undefined, expect: 401 },
                { name: "token giả", token: "khong-phai-token-that", expect: 401 },
            ];
            for (const [name, role] of Object.entries(ROLE_OF)) {
                if (!ep.roles.includes(role)) cases.push({ name: `vai trò ${role} (sai vai trò)`, token: T[name], expect: 403 });
            }
            for (const who of ep.owner ?? []) cases.push({ name: `${who} (đúng vai trò, sai chủ sở hữu)`, token: T[who], expect: 403 });
            await check(ep, cases);
        });
    }
});

describe("TC-07 endpoint có thật (tài khoản đúng chủ gọi GET → 200)", () => {
    for (const ep of ENDPOINTS.filter(e => e.probe)) {
        test(`${ep.m} ${ep.p({ orderId: 0 }).split("?")[0]}`, async () => {
            const res = await call(ep.m, ep.p(ctx), undefined, T[ep.probe]);
            assert.equal(res.status, 200);
        });
    }
});

describe("TC-07 sai chủ sở hữu không sửa được dữ liệu", () => {
    test("quản lý nhà hàng 2 sửa món của nhà hàng 1: bị 403 và giá không đổi", async () => {
        const truoc = (await call("GET", "/restaurants/1/menu")).json.data.items.find(i => i.id === 1);
        const res = await call("PATCH", "/manager/menu/1", { price: 1000, name: "Hacker" }, T.manager2);
        assert.equal(res.status, 403);
        const sau = (await call("GET", "/restaurants/1/menu")).json.data.items.find(i => i.id === 1);
        assert.equal(sau.price, truoc.price);
        assert.equal(sau.name, truoc.name);
    });
    test("khách 2 hủy đơn của khách 1: bị 403 và đơn vẫn PENDING", async () => {
        const res = await call("POST", `/orders/${ctx.orderId}/cancel`, { expectedVersion: 1 }, T.customer2);
        assert.equal(res.status, 403);
        const order = (await call("GET", `/orders/${ctx.orderId}`, undefined, T.customer)).json.data.order;
        assert.equal(order.status, "PENDING");
    });
});

describe("TC-07 token hết hạn sau 60 phút", () => {
    test("mọi endpoint có xác thực trả 401", async () => {
        now += 61 * 60_000;
        const failures = [];
        for (const ep of ENDPOINTS) {
            const name = Object.entries(ROLE_OF).find(([, role]) => ep.roles.includes(role))[0];
            const res = await call(ep.m, ep.p(ctx), ep.body?.(), T[name]);
            const ok = res.status === 401;
            rows.push({ endpoint: `${ep.m} ${ep.p(ctx).split("?")[0]}`, case: "token hết hạn (61 phút)", expect: 401, actual: res.status, ok });
            if (!ok) failures.push(`${ep.m} ${ep.p(ctx)}: thực tế ${res.status}`);
        }
        assert.deepEqual(failures, []);
    });
});