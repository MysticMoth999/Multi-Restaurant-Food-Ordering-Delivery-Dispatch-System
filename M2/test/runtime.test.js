import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
const exec = promisify(execFile);

test("RAM demo server entry point and demo script work together", async (t) => {
    const reservation = createServer();
    await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const env = {
        ...process.env,
        DEMO_PASSWORD: "demo12345",
        HOST: "127.0.0.1",
        PORT: String(port),
        MOCK_PAYMENT_RESULT: "SUCCESS",
        DELIVERY_FEE_VND: "15000",
        API_BASE: `http://127.0.0.1:${port}/api`,
    };
    const server = spawn(process.execPath, ["src/server.js"], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(async () => {
        if (server.exitCode === null) {
            const exited = new Promise((resolve) => server.once("exit", resolve));
            server.kill();
            await exited;
        }
    });
    const startup = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Server startup timed out")), 10000);
        server.stdout.once("data", (data) => {
            clearTimeout(timeout);
            resolve(String(data));
        });
        server.once("error", (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        server.once("exit", (code) => {
            clearTimeout(timeout);
            reject(new Error(`Server stopped: ${code}`));
        });
    });
    assert.match(startup, /M2 API/);
    const health = await fetch(env.API_BASE + "/health");
    assert.equal(health.status, 200);
    const { stdout } = await exec(process.execPath, ["scripts/demo.js"], { env, timeout: 15000 });
    assert.match(stdout, /125000/);
    assert.match(stdout, /DELIVERED/);
    assert.match(stdout, /SUCCESS/);
});
