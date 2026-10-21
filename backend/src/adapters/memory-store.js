import { orderView } from "./order-view.js";
import { AsyncLocalStorage } from "node:async_hooks";
// Demo/test double only. No persistence, SQL, database driver or cross-process locking.
export class MemoryStore {
    constructor() {
        this.records = {};
        this.counters = {};
        this.context = new AsyncLocalStorage();
        this.queue = Promise.resolve();
    }
    close() {}
    matches(row, where) {
        return Object.entries(where).every(([key, value]) => row[key] === value);
    }
    rows(name, where = {}) {
        return structuredClone(
            (this.records[name] ?? []).filter((row) => this.matches(row, where))
        );
    }
    find(name, where) {
        return this.rows(name, where)[0];
    }
    insert(name, values) {
        const defaults = {
            menu_items: { category_id: "main", description: "", ingredients: "", image_url: null },
            restaurants: { phone: null },
            orders: {
                driver_id: null,
                creation_response: null,
                cancel_reason: null,
                retry_at: null,
                version: 1,
                discount: 0,
                voucher_id: null,
                delivery_lat: null,
                delivery_lng: null,
                distance_km: null,
            },
            drivers: { lat: null, lng: null, location_at: null },
            vouchers: { description: "", percent: null, amount: null, max_discount: null, min_subtotal: 0, customer_id: null, expires_at: null },
            notifications: { order_id: null, read_at: null },
        };
        const id = values.id ?? (this.counters[name] ?? 0) + 1;
        this.counters[name] = Math.max(id, this.counters[name] ?? 0);
        (this.records[name] ??= []).push(structuredClone({ ...defaults[name], ...values, id }));
        return id;
    }
    update(name, where, values) {
        if (!Object.keys(where).length) throw new Error("Update requires a condition");
        let count = 0;
        for (const row of this.records[name] ?? []) {
            if (this.matches(row, where)) {
                Object.assign(row, structuredClone(values));
                count++;
            }
        }
        return count;
    }
    remove(name, where) {
        if (!Object.keys(where).length) throw new Error("Delete requires a condition");
        const before = this.records[name] ?? [];
        this.records[name] = before.filter((row) => !this.matches(row, where));
        return before.length - this.records[name].length;
    }
    get inTransaction() { return this.context.getStore() === true; }
    async transaction(action) {
        if (this.inTransaction) return action();
        const previous = this.queue;
        let release;
        this.queue = new Promise((resolve) => { release = resolve; });
        await previous;
        try {
            return await this.context.run(true, async () => {
                const snapshot = structuredClone({ records: this.records, counters: this.counters });
                try { return await action(); }
                catch (error) {
                    this.records = snapshot.records;
                    this.counters = snapshot.counters;
                    throw error;
                }
            });
        } finally { release(); }
    }
    user(id) {
        return this.find("users", { id });
    }
    restaurant(id) {
        return this.find("restaurants", { id });
    }
    driver(userId) {
        return this.find("drivers", { user_id: userId });
    }
    order(id) {
        return this.find("orders", { id });
    }
    offer(id) {
        return this.find("driver_offers", { id });
    }
    history(orderId, status, actorId, at) {
        this.insert("order_history", { order_id: orderId, status, actor_id: actorId, at });
    }
    activity(actorId, message, at) {
        this.insert("activity", { actor_id: actorId, text: message, at });
    }
    orderView(id) { return orderView(this, id); }
}
