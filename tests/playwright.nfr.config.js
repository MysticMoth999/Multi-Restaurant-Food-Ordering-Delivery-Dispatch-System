// M4-06: cấu hình riêng cho bài đo NFR-05 (lâu, không chạy trong `npm run e2e`). Dùng lại cấu hình E2E, chỉ đổi thư mục test.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

export default defineConfig({
    ...base,
    testDir: "./nfr",
    timeout: 30 * 60_000,
    retries: 0,
    reporter: [["list"]],
    projects: base.projects.filter(project => project.name === "chromium"),
});