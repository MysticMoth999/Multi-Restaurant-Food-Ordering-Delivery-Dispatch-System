// M4-05, kịch bản 1: đăng nhập theo vai trò.
import { test, expect } from "@playwright/test";

const ROLES = [
    ["khách", "khach@gomeal.vn", /index\.html/],
    ["nhà hàng", "nhahang@gomeal.vn", /restaurant-management\.html/],
    ["tài xế", "taixe@gomeal.vn", /driver\.html/],
    ["quản trị", "admin@gomeal.vn", /admin\.html/],
];

for (const [name, email, page] of ROLES) {
    test(`đăng nhập ${name} vào đúng trang`, async ({ page: p }) => {
        await p.goto("/login.html");
        await p.fill("#email", email);
        await p.fill("#password", "demo12345");
        await p.click("#submit-button");
        await expect(p).toHaveURL(page);
    });
}

test("sai mật khẩu báo lỗi và ở lại trang đăng nhập", async ({ page }) => {
    await page.goto("/login.html");
    await page.fill("#email", "khach@gomeal.vn");
    await page.fill("#password", "sai-mat-khau");
    await page.click("#submit-button");
    await expect(page.locator("#form-error")).not.toBeEmpty();
    await expect(page).toHaveURL(/login\.html/);
});