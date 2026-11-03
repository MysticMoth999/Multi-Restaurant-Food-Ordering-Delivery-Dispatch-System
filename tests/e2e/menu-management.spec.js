// M4-05, kịch bản 7: quản lý món có ảnh, mô tả, thành phần; ngừng bán.
import { test, expect } from "@playwright/test";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const NAME = `Món E2E ${Date.now()}`;

test("quản lý thêm món có ảnh, mô tả, thành phần rồi ngừng bán", async ({ page, browser }) => {
    await page.goto("/login.html");
    await page.fill("#email", "nhahang@gomeal.vn");
    await page.fill("#password", "demo12345");
    await page.click("#submit-button");
    await expect(page).toHaveURL(/restaurant-management\.html/);

    await page.click("#add-menu-item");
    await page.fill("#item-name", NAME);
    await page.fill("#item-price", "45000");
    await page.fill("#item-description", "Mô tả do kiểm thử E2E");
    await page.fill("#item-ingredients", "Cá hồi, cơm giấm");
    await page.setInputFiles("#item-image", { name: "mon.png", mimeType: "image/png", buffer: PNG_1X1 });
    await page.click("#item-submit");

    const row = page.locator("#menu-items tr", { hasText: NAME });
    await expect(row).toBeVisible();
    await expect(row.locator("img.menu-thumb")).toBeVisible(); // ảnh đã tải lên và hiển thị
    await expect(row).toContainText("Cá hồi, cơm giấm");

    
    const guest = await (await browser.newContext()).newPage();
    await guest.goto("/hokkaidosachi.html?r=1");
    await expect(guest.getByText(NAME)).toBeVisible();

    
    await row.locator("[data-toggle]").click();
    await expect(row).toContainText("Tạm hết");
    await guest.reload();
    await expect(guest.locator("button", { hasText: "Hết món" }).first()).toBeDisabled();
    await guest.context().close();
});

test("ảnh trên 2 MB và file không phải ảnh bị từ chối", async ({ page }) => {
    await page.goto("/login.html");
    await page.fill("#email", "nhahang@gomeal.vn");
    await page.fill("#password", "demo12345");
    await page.click("#submit-button");
    await expect(page).toHaveURL(/restaurant-management\.html/);

    await page.click("#add-menu-item");
    await page.fill("#item-name", `${NAME} lỗi ảnh`);
    await page.fill("#item-price", "45000");
    await page.setInputFiles("#item-image", { name: "to.png", mimeType: "image/png", buffer: Buffer.alloc(3 * 1024 * 1024) });
    await page.click("#item-submit");
    await expect(page.locator("#item-error")).toContainText("2 MB");

    
    await page.setInputFiles("#item-image", { name: "gia.jpg", mimeType: "image/jpeg", buffer: Buffer.from("day khong phai anh") });
    await page.click("#item-submit");
    await expect(page.locator("#item-error")).not.toBeEmpty();
});