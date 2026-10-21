// Tiện ích dùng chung cho các lệnh ở gốc repo (setup, start, test).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import net from "node:net";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const FRONTEND = join(ROOT, "frontend");
export const BACKEND = join(ROOT, "backend");
export const DATABASE = join(ROOT, "database");
export const ENV_FILE = join(ROOT, ".env");
export const MYSQL_SCRIPT = join(DATABASE, "scripts", "mysql-local.ps1");
export const MANAGED_PORT = 3307; // instance MySQL riêng do database/scripts/mysql-local.ps1 quản lý

export const step = (message) => console.log(`\n▶ ${message}`);
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Ghép thành một chuỗi lệnh (npm trên Windows là npm.cmd nên cần shell); tham số có khoảng trắng được đặt trong ngoặc kép.
const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
export function run(command, args, cwd = ROOT) {
    const result = spawnSync([command, ...args].map(quote).join(" "), { cwd, stdio: "inherit", shell: true });
    if (result.status !== 0) throw new Error(`Lệnh "${command} ${args.join(" ")}" thất bại.`);
}

export function readEnv(path = ENV_FILE) {
    if (!existsSync(path)) return {};
    return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/)
        .filter((line) => /^\s*[A-Z0-9_]+\s*=/.test(line))
        .map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
}

// Cấu hình thật = .env ở gốc, biến môi trường đè lên (giống cách Node nạp --env-file; CI đặt DB_* bằng biến môi trường).
export function config() {
    const env = { DB_HOST: "127.0.0.1", DB_PORT: String(MANAGED_PORT), DB_USER: "gomeal", DB_NAME: "gomeal_m3",
        TEST_DB_NAME: "gomeal_m3_test", BACKEND_TEST_DB_NAME: "gomeal_m2_test", LOAD_DB_NAME: "gomeal_m3_load", ...readEnv() };
    for (const key of Object.keys(env)) if (process.env[key] !== undefined) env[key] = process.env[key];
    return env;
}

export function checkNode() {
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 24) throw new Error(`Cần Node.js 24 trở lên (máy đang có ${process.version}).`);
}

export const portOpen = (port, host = "127.0.0.1") => new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
});

// Instance riêng chỉ dùng khi cấu hình trỏ tới 127.0.0.1:3307; nếu nhóm dùng MySQL khác thì không đụng tới.
export const usesManagedMysql = (env) => env.DB_HOST === "127.0.0.1" && Number(env.DB_PORT) === MANAGED_PORT;

export async function ensureMysql(env) {
    if (await portOpen(Number(env.DB_PORT), env.DB_HOST)) return;
    if (!usesManagedMysql(env)) {
        throw new Error(`Không kết nối được MySQL ở ${env.DB_HOST}:${env.DB_PORT}. Hãy bật MySQL đó, hoặc dùng "npm run start:demo" (không cần MySQL).`);
    }
    if (process.platform !== "win32") throw new Error("Script bật MySQL riêng chỉ hỗ trợ Windows; hãy tự bật MySQL 8 ở cổng 3307.");
    step("Bật MySQL riêng của dự án (cổng 3307)");
    run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", MYSQL_SCRIPT, "start"], DATABASE);
    for (let i = 0; i < 60; i += 1) {
        if (await portOpen(MANAGED_PORT)) return;
        await sleep(1000);
    }
    throw new Error("MySQL chưa mở cổng 3307 sau 60 giây. Xem log ở %LOCALAPPDATA%\\GoMealM3\\mysql8\\server.err.");
}
