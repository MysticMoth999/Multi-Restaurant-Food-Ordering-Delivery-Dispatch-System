import { test, expect } from "@playwright/test";

async function placeOrderViaApi(request) {
    const login = await request.post("/api/auth/login", { data: { email: "khach@gomeal.vn", password: "demo12345" } });
    const headers = { Authorization: `Bearer ${(await login.json()).data.token}` };
    const items = [{ menuItemId: 1, quantity: 1, selectedOptionIds: [] }];
    const deliveryLocation = { lat: 10.7822, lng: 106.6932 }; 
    const quote = (await (await request.post("/api/cart/quote", { data: { restaurantId: 1, items, deliveryLocation }, headers })).json()).data;
    const res = await request.post("/api/orders", {
        headers,
        data: { restaurantId: 1, items, deliveryLocation, deliveryAddress: "18 Lê Văn Sỹ, Quận 3", paymentMethod: "COD", requestKey: `e2e-cancel-${Date.now()}`, quoteFingerprint: quote.quoteFingerprint },
    });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).data.order;
}

test("đơn chờ xác nhận: khách thấy trạng thái và tự hủy được", async ({ page, request }) => {
    const order = await placeOrderViaApi(request);

    await page.goto("/login.html");
    await page.fill("#email", "khach@gomeal.vn");
    await page.fill("#password", "demo12345");
    await page.click("#submit-button");
    
    await page.waitForURL(url => !url.href.includes("login.html")); 
        
    await page.goto("/orders.html");
    await page.waitForLoadState("networkidle"); 

    const item = page.locator(`.order-item[data-id="${order.id}"]`);
    await expect(item).toBeVisible();
    await expect(item).toContainText("Chờ xác nhận");
    await expect(page.locator(".track-map")).toBeVisible();

    await page.click("[data-cancel]");
    await page.fill("#cancel-reason", "Đặt nhầm món");
    await page.click('#cancel-form button[type="submit"]');
    await expect(item).toContainText("Đã hủy");
    await expect(page.locator("[data-cancel]")).toHaveCount(0); 
});
