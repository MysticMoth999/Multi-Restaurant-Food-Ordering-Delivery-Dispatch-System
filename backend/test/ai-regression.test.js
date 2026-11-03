// Test hồi quy cho 3 lỗi tìm được khi review mã có AI hỗ trợ (docs/KIEM-THU-TINH-DONG-AI.md).
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, serve } from "./helpers.js";

test("AI-01: malformed alias optionIds returns 400 instead of internal 500", async t => {
  const s = await fixture();
  const http = await serve(s);
  t.after(async () => {
    await http.close();
    await s.store.close();
  });
  for (const optionIds of [123, {}, true, "1"]) {
    const response = await http.call("POST", "/cart/quote", {
      restaurantId: 1,
      items: [{ menuItemId: 1, quantity: 1, selectedOptionIds: [1], optionIds }]
    });
    assert.equal(response.status, 400);
    assert.equal(response.json.code, "VALIDATION");
  }
});

test("AI-02: password spaces are significant and cannot authenticate a different password", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  await s.auth.register({ email: "spaces@example.com", name: "Test", password: " secret123 " });
  await assert.rejects(s.auth.login({ email: "spaces@example.com", password: "secret123" }), error => error.code === "UNAUTHENTICATED");
  assert.ok((await s.auth.login({ email: "spaces@example.com", password: " secret123 " })).token);
  await assert.rejects(s.auth.register({ email: "blank@example.com", name: "Test", password: "        " }), error => error.code === "VALIDATION");
});

test("AI-03: empty location query values are invalid, numeric zero is valid", async t => {
  const s = await fixture();
  const http = await serve(s);
  t.after(async () => {
    await http.close();
    await s.store.close();
  });
  for (const path of ["/restaurants?lat=&lng=106", "/restaurants?lat=10&lng=", "/restaurants?lat=%20&lng=106", "/restaurants?lat=10"]) {
    assert.equal((await http.call("GET", path)).status, 400, path);
  }
  assert.equal((await http.call("GET", "/restaurants?lat=0&lng=0")).status, 200);
});
