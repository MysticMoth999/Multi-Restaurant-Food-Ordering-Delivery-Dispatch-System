import { ensure, integer, text, location } from "../domain/errors.js";
import { haversineKm } from "../domain/constants.js";

export class CatalogService {
    constructor(store, deliveryFee) {
        Object.assign(this, { store, deliveryFee });
    }
    restaurantView(row) {
        return {
            id: row.id,
            name: row.name,
            address: row.address,
            cuisine: row.cuisine,
            lat: row.lat,
            lng: row.lng,
            status: row.status,
            deliveryFee: this.deliveryFee,
        };
    }
    list(query) {
        const page = integer(Number(query.page ?? 1), "page");
        const hasLocation = query.lat !== undefined || query.lng !== undefined;
        const point = hasLocation
            ? location({ lat: Number(query.lat), lng: Number(query.lng) })
            : null;
        const search = String(query.q ?? "")
            .toLocaleLowerCase("vi")
            .trim();
        let rows = this.store
            .rows("restaurants", { status: "ACTIVE" })
            .filter((row) => row.name.toLocaleLowerCase("vi").includes(search));
        rows = rows.map((row) => ({
            ...this.restaurantView(row),
            ...(point ? { distanceKm: haversineKm(point, row) } : {}),
        }));
        if (point) {
            rows = rows
                .filter((row) => row.distanceKm <= 5)
                .sort((a, b) => a.distanceKm - b.distanceKm || a.id - b.id);
        } else {
            rows.sort((a, b) => a.id - b.id);
        }
        return {
            items: rows.slice((page - 1) * 20, page * 20),
            page,
            pageSize: 20,
            total: rows.length,
        };
    }
    itemView(item) {
        return {
            id: item.id,
            restaurantId: item.restaurant_id,
            name: item.name,
            categoryId: item.category_id,
            description: item.description,
            price: item.price,
            available: Boolean(item.available),
            options: this.store.rows("menu_options", { menu_item_id: item.id }).map((option) => ({
                id: option.id,
                name: option.name,
                surcharge: option.surcharge,
                available: Boolean(option.available),
            })),
        };
    }
    menu(id, includeInactive = false) {
        const restaurant = this.store.restaurant(integer(id, "restaurantId"));
        ensure(
            restaurant && (includeInactive || restaurant.status === "ACTIVE"),
            "NOT_FOUND",
            "Không tìm thấy nhà hàng hoạt động."
        );
        return {
            restaurant: this.restaurantView(restaurant),
            items: this.store
                .rows("menu_items", { restaurant_id: id })
                .map((item) => this.itemView(item)),
        };
    }
    managed(user, restaurantId) {
        ensure(user.role === "MANAGER", "FORBIDDEN", "Chỉ quản lý nhà hàng được thực hiện.");
        const owned = this.store.rows("restaurants", { manager_id: user.id });
        const restaurant = restaurantId ? owned.find((row) => row.id === restaurantId) : owned[0];
        ensure(restaurant, "FORBIDDEN", "Nhà hàng không thuộc quản lý.");
        return restaurant;
    }
    saveItem(user, id, body) {
        return this.store.transaction(() => {
            const old = id ? this.store.find("menu_items", { id }) : null;
            if (id) {
                ensure(old, "NOT_FOUND", "Không tìm thấy món.");
            }
            const restaurant = this.managed(user, old?.restaurant_id ?? body.restaurantId);
            const values = {};
            if (!id || body.name !== undefined) {
                values.name = text(body.name, "name", 150);
            }
            if (!id || body.price !== undefined) {
                values.price = integer(body.price, "price", 0, 1_000_000_000);
            }
            if (!id || body.categoryId !== undefined) {
                values.category_id = text(body.categoryId ?? "main", "categoryId", 80);
            }
            if (body.description !== undefined) {
                ensure(
                    typeof body.description === "string" && body.description.length <= 1000,
                    "VALIDATION",
                    "Mô tả không hợp lệ."
                );
                values.description = body.description;
            }
            if (body.available !== undefined) {
                ensure(
                    typeof body.available === "boolean",
                    "VALIDATION",
                    "available phải là boolean."
                );
                values.available = Number(body.available);
            }
            ensure(Object.keys(values).length, "VALIDATION", "Không có trường hợp lệ để cập nhật.");
            if (id) {
                this.store.update("menu_items", { id }, values);
            } else {
                id = this.store.insert("menu_items", {
                    restaurant_id: restaurant.id,
                    available: 1,
                    ...values,
                });
            }
            return this.itemView(this.store.find("menu_items", { id }));
        });
    }
    saveOption(user, itemId, optionId, body) {
        return this.store.transaction(() => {
            const item = this.store.find("menu_items", { id: itemId });
            ensure(item, "NOT_FOUND", "Không tìm thấy món.");
            this.managed(user, item.restaurant_id);
            if (optionId) {
                ensure(
                    this.store.find("menu_options", { id: optionId, menu_item_id: itemId }),
                    "NOT_FOUND",
                    "Không tìm thấy option của món."
                );
            }
            const values = {};
            if (!optionId || body.name !== undefined) {
                values.name = text(body.name, "name", 100);
            }
            if (!optionId || body.surcharge !== undefined) {
                values.surcharge = integer(body.surcharge, "surcharge", 0, 1_000_000_000);
            }
            if (body.available !== undefined) {
                ensure(
                    typeof body.available === "boolean",
                    "VALIDATION",
                    "available phải là boolean."
                );
                values.available = Number(body.available);
            }
            ensure(Object.keys(values).length, "VALIDATION", "Không có trường hợp lệ.");
            if (optionId) {
                this.store.update("menu_options", { id: optionId }, values);
            } else {
                optionId = this.store.insert("menu_options", {
                    menu_item_id: itemId,
                    available: 1,
                    ...values,
                });
            }
            return this.itemView(item);
        });
    }
    managerDashboard(user, restaurantId) {
        const restaurant = this.managed(user, restaurantId);
        const orders = this.store
            .rows("orders", { restaurant_id: restaurant.id })
            .sort((a, b) => b.id - a.id);
        return {
            ...this.menu(restaurant.id, true),
            orders: orders.slice(0, 100).map((order) => this.store.orderView(order.id)),
        };
    }
}
