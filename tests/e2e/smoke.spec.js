   import { test, expect } from "@playwright/test";

   test("backend RAM chạy và trang đăng nhập mở được", async ({ page, request }) => {
       const health = await request.get("/api/health");
       expect(health.ok()).toBeTruthy();

       await page.goto("/login.html");
       await expect(page.locator("#email")).toBeVisible();
       await expect(page.locator("#password")).toBeVisible();
       await expect(page.locator("#submit-button")).toBeVisible();
   });