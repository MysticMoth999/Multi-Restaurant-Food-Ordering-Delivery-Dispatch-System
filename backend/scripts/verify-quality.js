// npm run quality -w @gomeal/backend: kiểm cú pháp, kiểm tra tĩnh (ESLint + SonarJS, cấu hình ở eslint.config.js gốc repo)
// và test động kèm coverage service tối thiểu 70%. Ghi kết quả vào backend/reports/.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { cpus, platform, release, totalmem } from "node:os";

const eslintBin = join(dirname(createRequire(import.meta.url).resolve("eslint/package.json")), "bin", "eslint.js");
mkdirSync("reports", { recursive: true });
const steps = [
    { name: "syntax", args: ["scripts/check.js"], file: "syntax-after.txt" },
    {
        name: "static",
        args: [eslintBin, ".", "--max-warnings", "0", "--format", "json", "--output-file", "reports/static-after.json"],
        file: "static-run.txt",
    },
    {
        name: "dynamic",
        args: [
            "--test",
            "--test-concurrency=1",
            "--experimental-test-coverage",
            "--test-coverage-include=src/services/*.js",
            "--test-coverage-lines=70",
            "test/*.test.js",
        ],
        file: "dynamic-after.txt",
    },
];
const results = [];
for (const step of steps) {
    console.log(`Running ${step.name}...`);
    const start = Date.now();
    const result = spawnSync(process.execPath, step.args, { encoding: "utf8", timeout: 180_000 });
    writeFileSync(
        `reports/${step.file}`,
        (result.stdout ?? "") + (result.stderr ?? "") + (result.error ? `\n${result.error.message}` : "")
    );
    results.push({ name: step.name, exitCode: result.status, durationMs: Date.now() - start, passed: result.status === 0 });
    console.log(`${step.name}: ${result.status === 0 ? "PASS" : "FAIL"}`);
}
const summary = {
    generatedAt: new Date().toISOString(),
    environment: {
        node: process.version,
        platform: platform(),
        release: release(),
        cpu: cpus()[0]?.model,
        memoryGiB: Math.round(totalmem() / 1024 ** 3),
    },
    scope: "M2 backend; memory adapter; no database or browser UI test",
    results,
};
writeFileSync("reports/quality-summary.json", JSON.stringify(summary, null, 2) + "\n");
process.exitCode = results.every((result) => result.passed) ? 0 : 1;
