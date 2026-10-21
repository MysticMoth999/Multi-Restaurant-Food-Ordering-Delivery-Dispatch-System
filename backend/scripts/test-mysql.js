import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
const files = readdirSync("test").filter((name) => name.endsWith(".test.js")).map((name) => `test/${name}`);
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], {
    env: { ...process.env, M2_TEST_STORE: "mysql", TEST_DB_NAME: process.env.BACKEND_TEST_DB_NAME ?? "gomeal_m2_test" },
    stdio: "inherit",
});
process.exitCode = result.status ?? 1;
