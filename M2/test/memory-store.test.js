import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/adapters/memory-store.js";

test("RAM adapter isolates instances and read copies; thrown work rolls back", () => {
    const store = new MemoryStore();
    const id = store.insert("orders", { status: "PENDING" });
    const copy = store.order(id);
    copy.status = "DELIVERED";
    assert.equal(store.order(id).status, "PENDING");
    assert.throws(
        () =>
            store.transaction(() => {
                store.update("orders", { id }, { status: "CONFIRMED" });
                store.history(id, "CONFIRMED", null, 1);
                throw new Error("mock failure");
            }),
        /mock failure/
    );
    assert.equal(store.order(id).status, "PENDING");
    assert.deepEqual(store.rows("order_history"), []);
    assert.equal(store.inTransaction, false);
    assert.deepEqual(new MemoryStore().rows("orders"), []);
});
