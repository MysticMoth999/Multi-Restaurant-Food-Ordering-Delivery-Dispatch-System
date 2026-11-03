// M4-05, kịch bản 8: quản trị đổi giá xăng, tạo/tắt voucher, tạm ngưng nhà hàng, khóa tài xế. Mỗi bước hoàn tác để không ảnh hưởng spec khác.
import { test, expect } from "@playwright/test";

test("quản trị viên thao tác hệ thống", async ({ page, request }) => {
    await page.goto("/login.html");
    await page.fill("#email", "admin@gomeal.vn");
    await page.fill("#password", "demo12345");
    await page.click("#submit-button");
    await expect(page).toHaveURL(/admin\.html/);

    // Giá xăng: lưu 25.000 rồi trả về 23.000. /api/pricing công khai nên đọc lại để chắc đã lưu thật.
    await page.fill("#fuel-price", "25000");
    await page.click('#fuel-form button[type="submit"]');
    await expect.poll(async () => JSON.stringify((await (await request.get("/api/pricing")).json()).data)).toContain("25000");
    await page.fill("#fuel-price", "23000");
    await page.click('#fuel-form button[type="submit"]');

    // Voucher: tạo rồi tắt.
    await page.fill("#v-code", "E2E10");
    await page.selectOption("#v-kind", "SHIPPING");
    await page.fill("#v-percent", "10");
    await page.fill("#v-desc", "Voucher do kiểm thử E2E");
    await page.click('#voucher-form button[type="submit"]');
    const voucher = page.locator("tr", { hasText: "E2E10" });
    await expect(voucher).toBeVisible();
    await voucher.locator("[data-voucher]").click();
    await expect(voucher.locator("[data-voucher]")).toHaveText("Bật"); // đã tắt, nút chuyển thành "Bật"

    // Tạm ngưng nhà hàng 2: khách không còn thấy trong danh sách, rồi kích hoạt lại.
    const restaurant = page.locator('[data-restaurant="2"]');
    await restaurant.click();
    await expect(restaurant).toHaveText("Kích hoạt");
    await expect.poll(async () => (await (await request.get("/api/restaurants")).json()).data.items.some(r => r.id === 2)).toBe(false);
    await restaurant.click();
    await expect(restaurant).toHaveText("Tạm ngưng");

    // Khóa tài xế 5 (đang ngoại tuyến) rồi mở khóa.
    const driver = page.locator('[data-driver="5"]');
    await driver.click();
    await expect(driver).toHaveText("Mở khóa");
    await driver.click();
    await expect(driver).toHaveText("Khóa");
});