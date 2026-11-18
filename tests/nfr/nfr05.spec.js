
// M4-06 (NFR-05): độ trễ từ lúc API đổi trạng thái đơn đến lúc nhãn trạng thái trên trang "Đơn của tôi" đổi. Yêu cầu: p95 ≤ 5 giây.

import { test, expect } from "@playwright/test";
import os from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RUNS = Number(process.env.NFR05_RUNS ?? 100);
const LIMIT_SECONDS = 5;
const REFRESH_MS = 4000; 
const WAIT_MS = 15_000; 
const DELIVERY = { lat: 10.7822, lng: 106.6932 }; 
const percentile = (sorted, p) => sorted[Math.ceil(sorted.length * p) - 1];
const round = value => Math.round(value * 1000) / 1000;

async function loginUi(page, email) {
    await page.goto("/login.html");
    await page.fill("#email", email);
    await page.fill("#password", "demo12345");
    await page.click("#submit-button");
    await expect(page).not.toHaveURL(/login\.html/);
}

test(`NFR-05: p95 độ trễ hiển thị trạng thái ≤ ${LIMIT_SECONDS} giây (${RUNS} lần đo)`, async ({ browser, request }) => {
    test.setTimeout(30 * 60_000);


    const login = await request.post("/api/auth/login", { data: { email: "khach@gomeal.vn", password: "demo12345" } });
    const headers = { Authorization: `Bearer ${(await login.json()).data.token}` };
    const items = [{ menuItemId: 1, quantity: 1, selectedOptionIds: [] }];
    const quote = (await (await request.post("/api/cart/quote", { data: { restaurantId: 1, items, deliveryLocation: DELIVERY }, headers })).json()).data;


    const customerContext = await browser.newContext();
    const managerContext = await browser.newContext();
    const customer = await customerContext.newPage();
    const manager = await managerContext.newPage();
    await loginUi(customer, "khach@gomeal.vn");
    await customer.goto("/orders.html");
    await loginUi(manager, "nhahang@gomeal.vn");

    const latencies = []; 
    let failed = 0;
    for (let run = 1; run <= RUNS; run++) {
        const placed = await request.post("/api/orders", {
            headers,
            data: { restaurantId: 1, items, deliveryLocation: DELIVERY, deliveryAddress: "18 Lê Văn Sỹ, Q3", paymentMethod: "COD", requestKey: `nfr05-${Date.now()}-${run}`, quoteFingerprint: quote.quoteFingerprint },
        });
        expect(placed.ok(), `đặt đơn lần ${run}`).toBeTruthy();
        const id = (await placed.json()).data.order.id;

        await customer.locator(`.order-item[data-id="${id}"]`).waitFor({ timeout: WAIT_MS });
        const next = manager.locator(`[data-next="${id}"]`);
        await next.waitFor({ timeout: WAIT_MS });

        await customer.waitForTimeout(Math.random() * REFRESH_MS);

        const response = manager.waitForResponse(r => r.url().includes("/transitions") && r.request().method() === "POST" && r.ok());
        await next.click();
        await response;
        const start = Date.now();

        try {
            await customer.waitForFunction(
    ([orderId, text]) =>
        globalThis.document
            .querySelector(`.order-item[data-id="${orderId}"]`)
            ?.textContent.includes(text),
    [id, "Đã xác nhận"],
    { polling: 50, timeout: WAIT_MS },
);
            latencies.push((Date.now() - start) / 1000);
        } catch {
            failed += 1;
            latencies.push(WAIT_MS / 1000);
        }
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const p95 = percentile(sorted, 0.95);
    const store = process.env.E2E_STORE ?? "memory";
    const underLoad = process.env.NFR05_UNDER_LOAD === "1";
    const report = {
        metric: "NFR-05",
        requirement: `p95 ≤ ${LIMIT_SECONDS} giây`,
        method: "Từ lúc POST /transitions trả về đến lúc nhãn 'Đã xác nhận' hiện ở trang Đơn của tôi (trang tự tải lại 4 giây/lần), polling 50 ms; thời điểm bấm được làm ngẫu nhiên trong chu kỳ tải lại.",
        runs: RUNS,
        failed,
        seconds: { min: round(sorted[0]), mean: round(latencies.reduce((a, b) => a + b, 0) / latencies.length), median: round(percentile(sorted, 0.5)), p95: round(p95), max: round(sorted.at(-1)) },
        passed: failed === 0 && p95 <= LIMIT_SECONDS,
        environment: {
            timestamp: new Date().toISOString(),
            machine: os.hostname(), os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
            ramGiB: round(os.totalmem() / 1024 ** 3), node: process.version, browser: `Chromium ${browser.version()}`,
            store, underLoad,
        },
        rawSeconds: latencies.map(round),
    };

    const dir = fileURLToPath(new URL("../results/", import.meta.url));
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}nfr05-${store}-${underLoad ? "co-tai" : "khong-tai"}.json`, JSON.stringify(report, null, 4));

    await Promise.all([customerContext.close(), managerContext.close()]);
    expect(failed, "số lần nhãn không đổi trong 15 giây").toBe(0);
    expect(p95).toBeLessThanOrEqual(LIMIT_SECONDS);
});