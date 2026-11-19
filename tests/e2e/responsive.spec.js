/* global document */
// M4-05, yêu cầu cuối mục 4: ở bề rộng 390 px cả 7 trang không cuộn ngang và không có lỗi console.
// File này chạy trong project "mobile-viewport" (viewport 390 px, xem playwright.config.js).
import { test, expect } from "@playwright/test";

const PAGES = [
    ["đăng nhập", "/login.html", null],
    ["trang chủ", "/index.html", null],
    ["cửa hàng", "/hokkaidosachi.html?r=1", null],
    ["đơn của tôi", "/orders.html", "khach@gomeal.vn"],
    ["quản lý nhà hàng", "/restaurant-management.html", "nhahang@gomeal.vn"],
    ["tài xế", "/driver.html", "taixe@gomeal.vn"],
    ["quản trị", "/admin.html", "admin@gomeal.vn"],
];

for (const [name, path, email] of PAGES) {
    test(`390 px: ${name} không cuộn ngang, không lỗi console`, async ({ page, context, baseURL }) => {
        // Lỗi tải tài nguyên bên thứ ba (bản đồ, font) khi mất mạng không tính; chỉ tính lỗi của chính GoMeal.
        const errors = [];
        page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
        page.on("console", message => {
            if (message.type() === "error" && message.location().url.startsWith(baseURL)) errors.push(`console: ${message.text()}`);
        });
        await context.grantPermissions(["geolocation"]);
        await context.setGeolocation({ latitude: 10.7705, longitude: 106.6932 });

        if (email) {
            await page.goto("/login.html");
            await page.fill("#email", email);
            await page.fill("#password", "demo12345");
            await page.click("#submit-button");
            await expect(page).not.toHaveURL(/login\.html/);
        }
        await page.goto(path);
        // Trang có tự làm mới nên không bao giờ "rảnh mạng"; chờ tối đa 3 giây cho dữ liệu hiện ra rồi mới đo.
        await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, "trang rộng hơn màn hình (px)").toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
    });
}