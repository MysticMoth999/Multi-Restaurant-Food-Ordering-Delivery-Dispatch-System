// Kiểm tra tĩnh cho cả repo (npm run lint). Bộ rule lấy từ bản kiểm thử tĩnh của M2 (backend/docs/KIEM-THU-TINH-DONG-AI.md):
// recommended + cấm eval/Function động, khối rỗng, so sánh lỏng + 5 rule SonarJS.
import js from "@eslint/js";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";

const rules = {
    "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-empty": "error",
    eqeqeq: ["error", "always", { null: "ignore" }],
    "sonarjs/no-identical-functions": "error",
    "sonarjs/no-all-duplicated-branches": "error",
    "sonarjs/no-element-overwrite": "error",
    "sonarjs/no-gratuitous-expressions": "error",
    "sonarjs/no-use-of-empty-return-value": "error",
};

export default [
    { ignores: ["**/node_modules/**", "**/coverage/**", "backend/uploads/**", "backend/reports/**", "database/data/**", "tests/test-results/**", "tests/playwright-report/**"] },
    js.configs.recommended,
    {
        plugins: { sonarjs },
        languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.node },
        rules,
    },
    // Giao diện: script thường chạy trên trình duyệt, chia sẻ App/api qua window.
    {
        files: ["frontend/js/**/*.js"],
        languageOptions: {
            sourceType: "script",
            globals: { ...globals.browser, App: "writable", api: "writable", L: "readonly", google: "readonly" },
        },
    },
];
