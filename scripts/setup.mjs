// npm run setup: chuẩn bị máy sau khi clone repo.
// Cài thư viện (npm workspaces), tạo .env ở gốc, bật MySQL riêng (cổng 3307), tạo CSDL và tài khoản ứng dụng,
// áp migration, nạp dữ liệu demo. Chạy lại nhiều lần vẫn an toàn: không ghi đè .env có sẵn, không xóa dữ liệu.
//   --no-db         chỉ cài thư viện và tạo .env (dùng với npm run start:demo, không cần MySQL)
//   --skip-install  bỏ bước npm ci (CI đã cài trước)
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { ROOT, FRONTEND, BACKEND, DATABASE, ENV_FILE, step, run, readEnv, config, checkNode, ensureMysql } from "./common.mjs";

const noDb = process.argv.includes("--no-db");
checkNode();
for (const dir of [FRONTEND, BACKEND, DATABASE]) {
    if (!existsSync(dir)) throw new Error(`Thiếu thư mục ${dir}. Hãy lấy đủ mã nguồn của nhánh main.`);
}

if (!process.argv.includes("--skip-install")) {
    step("Cài thư viện cho backend và database (npm workspaces)");
    run("npm", ["ci"]);
}

// Một mật khẩu tài khoản ứng dụng cho mỗi máy: dùng lại mật khẩu đang có, nếu chưa có thì sinh ngẫu nhiên.
const secretFile = join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? ROOT, ".local"), "GoMealM3", "app-password.txt");
const password = process.env.DB_PASSWORD || readEnv().DB_PASSWORD
    || (existsSync(secretFile) ? readFileSync(secretFile, "utf8").trim() : "") || randomBytes(18).toString("hex");
if (!existsSync(secretFile)) {
    mkdirSync(dirname(secretFile), { recursive: true });
    writeFileSync(secretFile, password);
}

step("Tạo .env ở gốc repo (nếu chưa có)");
if (existsSync(ENV_FILE)) {
    console.log("  Giữ nguyên .env đang có.");
} else {
    writeFileSync(ENV_FILE, readFileSync(join(ROOT, ".env.example"), "utf8").replace(/^DB_PASSWORD=.*$/m, `DB_PASSWORD=${password}`));
    console.log("  Đã tạo .env từ .env.example.");
}
if (noDb) {
    console.log("\nXong (bỏ qua CSDL). Chạy: npm run start:demo  → mở http://127.0.0.1:3000");
    process.exit(0);
}

const env = config();
await ensureMysql(env);

step("Tạo CSDL và tài khoản ứng dụng");
const mysql = createRequire(join(DATABASE, "package.json"))("mysql2/promise");
const databases = [...new Set([env.DB_NAME, env.TEST_DB_NAME, env.BACKEND_TEST_DB_NAME, env.LOAD_DB_NAME])];
const appPassword = env.DB_PASSWORD || password;
let admin;
try {
    // Instance riêng khởi tạo bằng --initialize-insecure: root chưa có mật khẩu, chỉ nghe 127.0.0.1. CI đặt MYSQL_ROOT_PASSWORD.
    admin = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), user: "root", password: process.env.MYSQL_ROOT_PASSWORD ?? "" });
} catch (error) {
    console.log(`  Không đăng nhập được root (${error.code}). Nếu tài khoản ${env.DB_USER} đã được cấp quyền thì bỏ qua bước này;`);
    console.log("  nếu chưa, đặt biến MYSQL_ROOT_PASSWORD rồi chạy lại npm run setup.");
}
if (admin) {
    for (const db of databases) {
        if (!/^[a-z0-9_]+$/.test(db)) throw new Error(`Tên CSDL không hợp lệ: ${db}`);
        await admin.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    }
    for (const host of ["localhost", "127.0.0.1", "%"]) {
        await admin.query("CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?", [env.DB_USER, host, appPassword]);
        await admin.query("ALTER USER ?@? IDENTIFIED BY ?", [env.DB_USER, host, appPassword]);
        for (const db of databases) await admin.query(`GRANT ALL PRIVILEGES ON \`${db}\`.* TO ?@?`, [env.DB_USER, host]);
    }
    // MySQL bật binary log (bản cài thường, Docker/CI) chỉ cho tài khoản thường tạo trigger khi bật cờ này.
    await admin.query("SET GLOBAL log_bin_trust_function_creators = 1").catch(() => {});
    await admin.end();
    console.log(`  CSDL: ${databases.join(", ")}; tài khoản ${env.DB_USER} (mật khẩu lưu trong .env, không commit).`);
}

step("Áp migration và nạp dữ liệu demo");
run("npm", ["run", "migrate", "-w", "@gomeal/database"]);
const app = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: appPassword, database: env.DB_NAME });
const [[{ n }]] = await app.query("SELECT count(*) AS n FROM users");
await app.end();
run("npm", ["run", n === 0 ? "seed:demo" : "upgrade-demo", "-w", "@gomeal/database"]);

console.log("\nXong. Chạy: npm start  → mở http://127.0.0.1:3000 (tài khoản demo trong docs/HUONG-DAN-CHAY.md).");
