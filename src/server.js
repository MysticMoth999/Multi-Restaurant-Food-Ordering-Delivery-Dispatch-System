import { createSystem, createApp } from "./app.js";
import { seedData } from "../scripts/demo-fixtures.js";
import { DISPATCH_RETRY_MS } from "./domain/constants.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT phải từ 1 đến 65535.");
}
const system = createSystem({
    deliveryFee: Number(process.env.DELIVERY_FEE_VND ?? 15000),
    mockResult: process.env.MOCK_PAYMENT_RESULT ?? "SUCCESS",
});
seedData(system.store, process.env.DEMO_PASSWORD ?? "demo12345");
const app = createApp(system, { corsOrigin: process.env.CORS_ORIGIN });
const server = app.listen(port, process.env.HOST ?? "127.0.0.1", () => {
    console.log(
        `M2 API (RAM demo; data resets on restart): http://${process.env.HOST ?? "127.0.0.1"}:${port}/api/health`
    );
});
system.tick();
const worker = setInterval(system.tick, DISPATCH_RETRY_MS);
worker.unref();
let stopping = false;
function stop() {
    if (stopping) {
        return;
    }
    stopping = true;
    clearInterval(worker);
    server.close(() => {
        system.store.close();
    });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
