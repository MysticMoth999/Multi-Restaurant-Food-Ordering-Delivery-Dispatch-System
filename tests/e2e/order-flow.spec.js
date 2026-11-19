// M4-05, kịch bản 1-6: khách đặt đơn COD → nhà hàng xử lý → tài xế nhận và giao → khách theo dõi, chuông thông báo.
// Mỗi vai trò một browser context riêng (token lưu theo context nên không đè nhau).
import { test, expect } from "@playwright/test";

const NEAR_RESTAURANT = { latitude: 10.7705, longitude: 106.6932 }; // Hokkaido Sachi

async function login(browser, email, options = {}) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.goto("/login.html");
    await page.fill("#email", email);
    await page.fill("#password", "demo12345");
    await page.click("#submit-button");
    await expect(page).not.toHaveURL(/login\.html/);
    return { context, page };
}
// Bấm nút rồi chờ API đổi trạng thái trả về thành công (không dùng sleep cố định).
const clickAndWaitTransition = (page, button) => Promise.all([
    page.waitForResponse(r => r.url().includes("/transitions") && r.request().method() === "POST" && r.ok()),
    button.click(),
]);

test("khách đặt COD → nhà hàng → tài xế giao → khách thấy Hoàn thành và chuông thông báo", async ({ browser }) => {
    const customer = await login(browser, "khach@gomeal.vn");
    const manager = await login(browser, "nhahang@gomeal.vn");
    const driver = await login(browser, "taixe@gomeal.vn", { permissions: ["geolocation"], geolocation: NEAR_RESTAURANT });

    // Khách: mở thực đơn nhà hàng 1, thêm Sashimi (món 4) hai lần = 240.000đ để đủ điều kiện GIAM20 (≥ 150.000đ).
    const c = customer.page;
    await c.goto("/hokkaidosachi.html?r=1");
    for (let i = 0; i < 2; i++) {
        await c.click('[data-a="4"]');
        await c.locator('#optF input[name="opt"]').first().check();
        await c.locator("#optF button.full").click(); // "Thêm vào giỏ"
    }
    await expect(c.locator("#checkout")).toBeEnabled();
    await c.click("#checkout");
    await c.fill("#addr", "18 Lê Văn Sỹ, Quận 3, TP. HCM");

// Kiểm tra ghim vị trí và tuyến đường trên bản đồ
await expect(c.locator("#pickMap .map-pin").first()).toBeVisible();
await expect(c.locator("#pickRoute")).toContainText(
    "Đường đi từ nhà hàng",
    { timeout: 15_000 }
);

await c.fill("#voucherCode", "GIAM20");
    await c.click("#voucherApply");
    await expect(c.locator("#voucherMsg")).toContainText("GIAM20");
    await expect(c.locator("#coSubmit")).toBeEnabled(); // báo giá lại xong mới đặt được
    await c.click("#coSubmit"); // phương thức mặc định là COD
    await expect(c.locator("#doneD")).toBeVisible();

    // Lấy mã đơn ở trang "Đơn của tôi".
    await c.goto("/orders.html");
    const orderId = await c.locator(".order-item").first().getAttribute("data-id");
    expect(orderId).toBeTruthy();

    // Tài xế trực tuyến trước khi đơn sẵn sàng để được mời ngay.
    const d = driver.page;
    await d.click("[data-availability]");

    // Nhà hàng: xác nhận → chuẩn bị → sẵn sàng. data-next mang chính mã đơn.
    const m = manager.page;
    const next = m.locator(`[data-next="${orderId}"]`);
    for (let step = 0; step < 3; step++) {
        await clickAndWaitTransition(m, next);
    }

    // Tài xế: chờ lời mời (worker 30 giây/lần, timeout 40 giây), nhận, lấy món, giao, xác nhận thu tiền mặt.
    await expect(d.locator("[data-accept]")).toBeVisible({ timeout: 40_000 });
    await d.locator("[data-accept]").click();
    const driverNext = d.locator("[data-next]");
    await clickAndWaitTransition(d, driverNext); // PICKED_UP
    await clickAndWaitTransition(d, driverNext); // DELIVERING
    await d.locator("#cod-collected").check();   // ô này chỉ hiện khi đang DELIVERING; phải tick trước khi hoàn tất
    await clickAndWaitTransition(d, driverNext); // DELIVERED

    // Khách: thấy "Hoàn thành" (trang tự tải lại 4 giây/lần), chuông có số, mở danh sách thì về 0.
    await c.goto(`/orders.html?id=${orderId}`);
    await expect(c.locator(`.order-item[data-id="${orderId}"]`)).toContainText("Hoàn thành", { timeout: 15_000 });
    await expect(c.locator(".notify-badge")).toBeVisible();
    await c.click(".notify-bell");
    await expect(c.locator(".notify-item").first()).toBeVisible();
    await expect(c.locator(".notify-badge")).toBeHidden(); // badge ẩn khi unread = 0

    await Promise.all([customer.context.close(), manager.context.close(), driver.context.close()]);
});