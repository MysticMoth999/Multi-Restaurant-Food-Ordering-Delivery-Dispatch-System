// npm start: bật MySQL riêng nếu cần, chạy backend; backend phục vụ luôn giao diện tại http://127.0.0.1:3000.
// npm run start:demo: dữ liệu trong RAM, không cần MySQL (mất khi tắt).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, BACKEND, config, checkNode, ensureMysql } from "./common.mjs";

const demo = process.argv.includes("--demo");
checkNode();
if (!existsSync(join(ROOT, "node_modules", "express"))) {
    console.error(`Chưa cài thư viện. Chạy "npm run setup"${demo ? " -- --no-db" : ""} trước.`);
    process.exit(1);
}
if (!demo) {
    try {
        await ensureMysql(config());
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}
const server = spawn(process.execPath, ["--env-file-if-exists=../.env", "src/server.js"], {
    cwd: BACKEND,
    stdio: "inherit",
    env: { ...process.env, ...(demo ? { STORE: "memory" } : {}) },
});
const stop = () => server.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
