import { ensure, integer, location } from "../domain/errors.js";
import {
    haversineKm,
    OFFER_TIMEOUT_MS,
    LOCATION_MAX_AGE_MS,
    DISPATCH_RETRY_MS,
} from "../domain/constants.js";

export class DispatchService {
    constructor(store, clock, fault = () => {}) {
        Object.assign(this, { store, clock, fault });
    }
    driverFor(user) {
        ensure(user.role === "DRIVER", "FORBIDDEN", "Chỉ tài xế được thực hiện.");
        const driver = this.store.driver(user.id);
        ensure(driver && !driver.locked, "FORBIDDEN", "Tài xế không hoạt động.");
        return driver;
    }
    skip(offer, status) {
        this.store.update("driver_offers", { id: offer.id, status: "PENDING" }, { status });
        if (
            !this.store.find("dispatch_skips", {
                order_id: offer.order_id,
                driver_id: offer.driver_id,
            })
        ) {
            this.store.insert("dispatch_skips", {
                order_id: offer.order_id,
                driver_id: offer.driver_id,
            });
        }
    }
    tick() {
        return this.store.transaction(() => {
            const at = this.clock();
            const pending = this.store.rows("driver_offers", { status: "PENDING" });
            for (const offer of pending) {
                if (offer.expires_at <= at) {
                    this.skip(offer, "EXPIRED");
                }
            }
            const orders = this.store
                .rows("orders", { status: "READY_FOR_PICKUP", driver_id: null })
                .sort((a, b) => a.created_at - b.created_at || a.id - b.id);
            for (const order of orders) {
                this.offerNearest(order, at);
            }
            return { scanned: orders.length };
        });
    }
    offerNearest(order, at) {
        if (this.store.find("driver_offers", { order_id: order.id, status: "PENDING" })) {
            return;
        }
        if (order.retry_at !== null) {
            if (order.retry_at > at) {
                return;
            }
            this.store.remove("dispatch_skips", { order_id: order.id });
            this.store.update("orders", { id: order.id }, { retry_at: null });
        }
        const restaurant = this.store.restaurant(order.restaurant_id);
        const invited = new Set(
            this.store.rows("driver_offers", { status: "PENDING" }).map((offer) => offer.driver_id)
        );
        const skipped = new Set(
            this.store.rows("dispatch_skips", { order_id: order.id }).map((row) => row.driver_id)
        );
        const candidates = this.store
            .rows("drivers", { status: "AVAILABLE", locked: 0 })
            .filter(
                (driver) =>
                    driver.location_at !== null &&
                    driver.location_at <= at &&
                    at - driver.location_at <= LOCATION_MAX_AGE_MS &&
                    !invited.has(driver.id) &&
                    !skipped.has(driver.id)
            )
            .map((driver) => ({ ...driver, distanceKm: haversineKm(restaurant, driver) }))
            .sort(
                (a, b) => a.distanceKm - b.distanceKm || a.updated_at - b.updated_at || a.id - b.id
            );
        const driver = candidates[0];
        if (!driver) {
            this.store.update("orders", { id: order.id }, { retry_at: at + DISPATCH_RETRY_MS });
            return;
        }
        this.store.insert("driver_offers", {
            order_id: order.id,
            driver_id: driver.id,
            status: "PENDING",
            distance_km: driver.distanceKm,
            expires_at: at + OFFER_TIMEOUT_MS,
            created_at: at,
        });
    }
    setStatus(user, body) {
        return this.store.transaction(() => {
            const driver = this.driverFor(user);
            ensure(
                ["OFFLINE", "AVAILABLE"].includes(body.status),
                "VALIDATION",
                "Chỉ đổi OFFLINE hoặc AVAILABLE."
            );
            ensure(
                driver.status !== "BUSY",
                "CONFLICT",
                "Đang giao đơn, không thể đổi trạng thái."
            );
            const point =
                body.status === "AVAILABLE" ? location(body.location) : { lat: null, lng: null };
            this.store.update(
                "drivers",
                { id: driver.id },
                {
                    ...point,
                    status: body.status,
                    location_at: body.status === "AVAILABLE" ? this.clock() : null,
                    updated_at: this.clock(),
                }
            );
            if (body.status === "OFFLINE") {
                for (const offer of this.store.rows("driver_offers", {
                    driver_id: driver.id,
                    status: "PENDING",
                })) {
                    this.skip(offer, "REVOKED");
                }
            }
            return { status: body.status };
        });
    }
    updateLocation(user, point) {
        const driver = this.driverFor(user);
        ensure(driver.status !== "OFFLINE", "CONFLICT", "Tài xế ngoại tuyến không gửi vị trí.");
        this.store.update(
            "drivers",
            { id: driver.id },
            { ...location(point), location_at: this.clock(), updated_at: this.clock() }
        );
        return { updatedAt: this.clock() };
    }
    respond(user, offerId, accept) {
        return this.store.transaction(() => {
            const driver = this.driverFor(user);
            const offer = this.store.offer(integer(offerId, "offerId"));
            ensure(offer, "NOT_FOUND", "Không tìm thấy lời mời.");
            ensure(offer.driver_id === driver.id, "FORBIDDEN", "Lời mời không thuộc tài xế này.");
            const at = this.clock();
            ensure(
                offer.status === "PENDING" && offer.expires_at > at,
                "CONFLICT",
                "Lời mời đã hết hạn hoặc đã được xử lý."
            );
            const order = this.store.order(offer.order_id);
            ensure(
                order.status === "READY_FOR_PICKUP" &&
                    order.driver_id === null &&
                    driver.status === "AVAILABLE",
                "CONFLICT",
                "Đơn hoặc tài xế đã thay đổi."
            );
            if (!accept) {
                this.skip(offer, "DECLINED");
                return { declined: true, orderId: order.id };
            }
            const accepted = this.store.update(
                "driver_offers",
                { id: offer.id, status: "PENDING" },
                { status: "ACCEPTED" }
            );
            ensure(accepted === 1, "CONFLICT", "Lời mời đã được xử lý.");
            const reserved = this.store.update(
                "drivers",
                { id: driver.id, status: "AVAILABLE" },
                { status: "BUSY", updated_at: at }
            );
            ensure(reserved === 1, "CONFLICT", "Tài xế đã nhận đơn khác.");
            this.fault("afterDriverBusy");
            const changed = this.store.update(
                "orders",
                { id: order.id, version: order.version, driver_id: null },
                {
                    driver_id: driver.id,
                    status: "DRIVER_ASSIGNED",
                    version: order.version + 1,
                    updated_at: at,
                }
            );
            ensure(changed === 1, "CONFLICT", "Đơn đã được gán.");
            this.store.history(order.id, "DRIVER_ASSIGNED", user.id, at);
            this.fault("afterAssignmentHistory");
            return { order: this.store.orderView(order.id) };
        });
    }
    board(user) {
        const driver = this.driverFor(user);
        const at = this.clock();
        const offer = this.store
            .rows("driver_offers", { driver_id: driver.id, status: "PENDING" })
            .find((item) => item.expires_at > at);
        const orders = this.store.rows("orders", { driver_id: driver.id });
        const active = orders.find((order) => !["DELIVERED", "CANCELLED"].includes(order.status));
        const history = orders
            .filter((order) => order.status === "DELIVERED")
            .sort((a, b) => b.updated_at - a.updated_at);
        const dayStart = new Date(at).setHours(0, 0, 0, 0);
        const today = history.filter((order) => order.updated_at >= dayStart);
        return {
            driver: {
                id: driver.id,
                name: user.name,
                status: driver.status,
                locked: Boolean(driver.locked),
                locationAt: driver.location_at,
                lat: driver.lat,
                lng: driver.lng,
            },
            offer: offer
                ? {
                      ...this.store.orderView(offer.order_id),
                      offerId: offer.id,
                      expiresAt: offer.expires_at,
                      distanceKm: offer.distance_km,
                  }
                : null,
            active: active ? this.store.orderView(active.id) : null,
            history: history.slice(0, 20).map((order) => this.store.orderView(order.id)),
            summary: {
                earningsToday: today.reduce((sum, order) => sum + order.delivery_fee, 0),
                deliveredToday: today.length,
            },
        };
    }
}
