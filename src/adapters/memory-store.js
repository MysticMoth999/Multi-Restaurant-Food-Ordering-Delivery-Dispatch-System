// Demo/test double only. No persistence, SQL, database driver or cross-process locking.
export class MemoryStore {
    constructor() {
        this.records = {};
        this.counters = {};
        this.inTransaction = false;
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
            menu_items: { category_id: "main", description: "" },
            orders: {
                driver_id: null,
                creation_response: null,
                cancel_reason: null,
                retry_at: null,
                version: 1,
            },
            drivers: { lat: null, lng: null, location_at: null },
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
    transaction(action) {
        if (this.inTransaction) return action();
        const snapshot = structuredClone({ records: this.records, counters: this.counters });
        this.inTransaction = true;
        try {
            const result = action();
            if (result && typeof result.then === "function")
                throw new Error("Transaction callbacks must be synchronous.");
            return result;
        } catch (error) {
            this.records = snapshot.records;
            this.counters = snapshot.counters;
            throw error;
        } finally {
            this.inTransaction = false;
        }
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
    orderView(id) {
        const o = this.order(id);
        if (!o) {
            return null;
        }
        const payment = this.find("payments", { order_id: id });
        const restaurant = this.restaurant(o.restaurant_id);
        const assigned = o.driver_id ? this.find("drivers", { id: o.driver_id }) : null;
        const driver = assigned ? this.user(assigned.user_id) : null;
        return {
            id: o.id,
            orderId: o.id,
            code: `GM-${o.id}`,
            customerId: o.customer_id,
            restaurantId: o.restaurant_id,
            driverId: o.driver_id,
            status: o.status,
            orderStatus: o.status,
            version: o.version,
            subtotal: o.subtotal,
            deliveryFee: o.delivery_fee,
            total: o.total,
            deliveryAddress: o.delivery_address,
            contactPhone: o.contact_phone,
            paymentMethod: o.payment_method,
            paymentStatus: payment?.status,
            transactionId: payment?.transaction_id,
            cancelReason: o.cancel_reason,
            createdAt: o.created_at,
            updatedAt: o.updated_at,
            restaurant: { id: restaurant.id, name: restaurant.name, address: restaurant.address },
            customerName: this.user(o.customer_id).name,
            driverName: driver?.name ?? null,
            lines: this.rows("order_items", { order_id: id }).map((line) => ({
                menuItemId: line.menu_item_id,
                name: line.name,
                options: JSON.parse(line.options_json),
                unitPrice: line.unit_price,
                quantity: line.quantity,
                lineTotal: line.line_total,
            })),
            history: this.rows("order_history", { order_id: id }).map((row) => ({
                status: row.status,
                at: row.at,
                actorId: row.actor_id,
                by: this.user(row.actor_id)?.name ?? "Dispatch worker",
            })),
        };
    }
}
