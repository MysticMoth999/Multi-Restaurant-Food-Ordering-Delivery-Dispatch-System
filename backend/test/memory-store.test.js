import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/adapters/memory-store.js";
test("RAM adapter isolates instances and read copies; thrown work rolls back", async () => {
  const store = new MemoryStore();
  const id = await store.insert("orders", {
    status: "PENDING"
  });
  const copy = await store.order(id);
  copy.status = "DELIVERED";
  assert.equal((await store.order(id)).status, "PENDING");
  await assert.rejects(async () => await store.transaction(async () => {
    await store.update("orders", {
      id
    }, {
      status: "CONFIRMED"
    });
    await store.history(id, "CONFIRMED", null, 1);
    throw new Error("mock failure");
  }), /mock failure/);
  assert.equal((await store.order(id)).status, "PENDING");
  assert.deepEqual(await store.rows("order_history"), []);
  assert.equal(store.inTransaction, false);
  assert.deepEqual(new MemoryStore().rows("orders"), []);
});
