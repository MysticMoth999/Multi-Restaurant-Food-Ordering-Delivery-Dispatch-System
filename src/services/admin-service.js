import { ensure } from "../domain/errors.js";

export class AdminService {
    constructor(store, clock, catalog) {
        Object.assign(this, { store, clock, catalog });
    }
    authorize(user) {
        ensure(user.role === "ADMIN", "FORBIDDEN", "Chỉ quản trị viên được thực hiện.");
    }
    restaurantStatus(user, id, status) {
        this.authorize(user);
        ensure(
            ["ACTIVE", "INACTIVE"].includes(status),
            "VALIDATION",
            "Trạng thái nhà hàng không hợp lệ."
        );
        return this.store.transaction(() => {
            ensure(this.store.restaurant(id), "NOT_FOUND", "Không tìm thấy nhà hàng.");
            this.store.update("restaurants", { id }, { status });
            this.store.activity(user.id, `Nhà hàng ${id}: ${status}`, this.clock());
            return this.catalog.restaurantView(this.store.restaurant(id));
        });
    }
    lockDriver(user, id, locked) {
        this.authorize(user);
        ensure(typeof locked === "boolean", "VALIDATION", "locked phải là boolean.");
        return this.store.transaction(() => {
            const driver = this.store.find("drivers", { id });
            ensure(driver, "NOT_FOUND", "Không tìm thấy tài xế.");
            ensure(
                !locked || driver.status !== "BUSY",
                "CONFLICT",
                "Không khóa tài xế đang giao đơn."
            );
            this.store.update(
                "drivers",
                { id },
                {
                    locked: Number(locked),
                    ...(locked
                        ? { status: "OFFLINE", lat: null, lng: null, location_at: null }
                        : {}),
                    updated_at: this.clock(),
                }
            );
            if (locked) {
                this.store.remove("sessions", { user_id: driver.user_id });
                for (const offer of this.store.rows("driver_offers", {
                    driver_id: id,
                    status: "PENDING",
                })) {
                    this.store.update("driver_offers", { id: offer.id }, { status: "REVOKED" });
                }
            }
            this.store.activity(
                user.id,
                `Tài xế ${id}: ${locked ? "khóa" : "mở khóa"}`,
                this.clock()
            );
            return { id, locked };
        });
    }
    dashboard(user) {
        this.authorize(user);
        const orders = this.store.rows("orders");
        const restaurants = this.store.rows("restaurants");
        const drivers = this.store.rows("drivers");
        const start = new Date(this.clock()).setHours(0, 0, 0, 0);
        const today = orders.filter((order) => order.created_at >= start);
        return {
            summary: {
                ordersToday: today.length,
                revenueToday: orders
                    .filter((order) => order.status === "DELIVERED" && order.updated_at >= start)
                    .reduce((sum, order) => sum + order.total, 0),
                restaurantsActive: restaurants.filter((row) => row.status === "ACTIVE").length,
                restaurantsTotal: restaurants.length,
                driversOnline: drivers.filter((row) => row.status !== "OFFLINE" && !row.locked)
                    .length,
                driversTotal: drivers.length,
                byStatus: orders.reduce(
                    (counts, order) => ({
                        ...counts,
                        [order.status]: (counts[order.status] ?? 0) + 1,
                    }),
                    {}
                ),
            },
            orders: orders
                .sort((a, b) => b.id - a.id)
                .slice(0, 100)
                .map((order) => this.store.orderView(order.id)),
            restaurants: restaurants.map((row) => this.catalog.restaurantView(row)),
            drivers: drivers.map((row) => ({
                id: row.id,
                name: this.store.user(row.user_id).name,
                locked: Boolean(row.locked),
                status: row.status,
                locationAt: row.location_at,
            })),
            activity: this.store
                .rows("activity")
                .sort((a, b) => b.id - a.id)
                .slice(0, 50)
                .map((row) => ({ text: row.text, at: row.at, actorId: row.actor_id })),
        };
    }
}
