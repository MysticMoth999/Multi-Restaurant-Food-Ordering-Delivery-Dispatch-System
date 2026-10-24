import test from "node:test";
import assert from "node:assert/strict";
import { fixture, serve } from "./helpers.js";

test("AI-01: malformed alias optionIds returns 400 instead of internal 500", async (t) => {
    const s = fixture();
    const http = await serve(s);
    t.after(() => http.close());
    for (const optionIds of [123, {}, true, "1"]) {
        const response = await http.call("POST", "/cart/quote", {
            restaurantId: 1,
            items: [{ menuItemId: 1, quantity: 1, selectedOptionIds: [1], optionIds }],
        });
        assert.equal(response.status, 400);
        assert.equal(response.json.code, "VALIDATION");
    }
});

test("AI-02: password spaces are significant and cannot authenticate a different password", () => {
    const s = fixture();
    s.auth.register({ email: "spaces@example.com", name: "Test", password: " secret123 " });
    assert.throws(
        () => s.auth.login({ email: "spaces@example.com", password: "secret123" }),
        (error) => error.code === "UNAUTHENTICATED"
    );
    assert.ok(s.auth.login({ email: "spaces@example.com", password: " secret123 " }).token);
});

test("AI-03: empty location query values are invalid, numeric zero is valid", async (t) => {
    const s = fixture();
    const http = await serve(s);
    t.after(() => http.close());
    for (const path of [
        "/restaurants?lat=&lng=106",
        "/restaurants?lat=10&lng=",
        "/restaurants?lat=%20&lng=106",
    ]) {
        assert.equal((await http.call("GET", path)).status, 400);
    }
    assert.equal((await http.call("GET", "/restaurants?lat=0&lng=0")).status, 200);
});
