import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSystem, createApp } from "./app.js";
import { seedData } from "../scripts/demo-fixtures.js";
import { DISPATCH_RETRY_MS } from "./domain/constants.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT phải từ 1 đến 65535.");
}
const system = createSystem({
    // Chỉ nạp adapter MySQL (gói @gomeal/database) khi dùng MySQL, để STORE=memory chạy được dù thiếu gói đó.
    store: process.env.STORE === "memory"
        ? undefined
        : await (await import("@gomeal/database/src/mysql-store.js")).MysqlStore.open(),
    mockResult: process.env.MOCK_PAYMENT_RESULT ?? "SUCCESS",
});
// Seeding and emptiness check share a write lock, including concurrent startup.
await system.store.transaction(async () => {
    if (process.env.SEED_DEMO !== "false" && !(await system.store.find("users", {}))) {
        await seedData(system.store, process.env.DEMO_PASSWORD ?? "demo12345");
    }
});
// Giao diện (thư mục frontend/ cạnh backend/ trong repo); UI_DIR đổi được, UI_DIR=none để tắt.
const uiDir = process.env.UI_DIR ?? fileURLToPath(new URL("../../frontend/", import.meta.url));
const serveUi = uiDir !== "none" && existsSync(uiDir);
const app = createApp(system, { corsOrigin: process.env.CORS_ORIGIN, uiDir: serveUi ? uiDir : undefined });
const server = app.listen(port, process.env.HOST ?? "127.0.0.1", (error) => {
    // Express 5 gọi callback cả khi lỗi (ví dụ cổng đã bị chiếm); báo rõ rồi thoát.
    if (error) {
        console.error(error.code === "EADDRINUSE" ? `Cổng ${port} đang được chương trình khác dùng. Tắt server cũ rồi chạy lại.` : error);
        process.exit(1);
    }
    const base = `http://${process.env.HOST ?? "127.0.0.1"}:${port}`;
    console.log(`M2 API (${process.env.STORE === "memory" ? "RAM demo" : "MySQL persistent"}): ${base}/api/health`);
    if (serveUi) console.log(`Giao diện GoMeal: ${base}/`);
});
await system.tick();
const worker = setInterval(system.tick, DISPATCH_RETRY_MS);
worker.unref();
let stopping = false;
function stop() {
    if (stopping) {
        return;
    }
    stopping = true;
    clearInterval(worker);
    server.close(async () => {
        await system.store.close();
    });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
