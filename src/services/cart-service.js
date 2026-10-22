import { ensure, integer } from "../domain/errors.js";
import { normalizeItems } from "./billing-service.js";

export class CartService {
    constructor(store, billing) {
        Object.assign(this, { store, billing });
    }
    owned(user) {
        ensure(user.role === "CUSTOMER", "FORBIDDEN", "Chỉ khách hàng được sửa giỏ.");
        return this.store.find("carts", { customer_id: user.id });
    }
    get(user) {
        const cart = this.owned(user);
        return cart
            ? { restaurantId: cart.restaurant_id, items: JSON.parse(cart.items_json) }
            : { restaurantId: null, items: [] };
    }
    save(user, restaurantId, items) {
        const old = this.owned(user);
        if (!items.length) {
            if (old) this.store.remove("carts", { id: old.id });
            return { restaurantId: null, items: [] };
        }
        const normalized = normalizeItems(items);
        const quote = this.billing.quote(restaurantId, normalized);
        const values = { restaurant_id: restaurantId, items_json: JSON.stringify(normalized) };
        if (old) this.store.update("carts", { id: old.id }, values);
        else this.store.insert("carts", { customer_id: user.id, ...values });
        return { restaurantId, items: normalized, quote };
    }
    add(user, body) {
        return this.store.transaction(() => {
            const cart = this.get(user);
            const restaurantId = integer(body.restaurantId, "restaurantId");
            ensure(
                cart.restaurantId === null || cart.restaurantId === restaurantId,
                "CONFLICT",
                "Xóa giỏ hiện tại trước khi chọn nhà hàng khác."
            );
            return this.save(user, restaurantId, [...cart.items, body.item]);
        });
    }
    change(user, body, remove = false) {
        return this.store.transaction(() => {
            const cart = this.get(user);
            const selected = normalizeItems([{ ...body.line, quantity: 1 }])[0];
            const index = cart.items.findIndex(
                (item) =>
                    item.menuItemId === selected.menuItemId &&
                    JSON.stringify(item.selectedOptionIds) ===
                        JSON.stringify(selected.selectedOptionIds)
            );
            ensure(index >= 0, "NOT_FOUND", "Không tìm thấy dòng giỏ.");
            if (remove) cart.items.splice(index, 1);
            else cart.items[index] = normalizeItems([body.item])[0];
            return this.save(user, cart.restaurantId, cart.items);
        });
    }
    clear(user) {
        return this.store.transaction(() => this.save(user, null, []));
    }
}
