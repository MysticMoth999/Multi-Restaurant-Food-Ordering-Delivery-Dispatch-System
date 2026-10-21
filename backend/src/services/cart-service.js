import { ensure, integer } from "../domain/errors.js";
import { normalizeItems } from "./billing-service.js";
export class CartService {
  constructor(store, billing) {
    Object.assign(this, {
      store,
      billing
    });
  }
  async owned(user) {
    ensure(user.role === "CUSTOMER", "FORBIDDEN", "Chỉ khách hàng được sửa giỏ.");
    return await this.store.find("carts", {
      customer_id: user.id
    });
  }
  async get(user) {
    const cart = await this.owned(user);
    return cart ? {
      restaurantId: cart.restaurant_id,
      items: JSON.parse(cart.items_json)
    } : {
      restaurantId: null,
      items: []
    };
  }
  async save(user, restaurantId, items) {
    const old = await this.owned(user);
    if (!items.length) {
      if (old) await this.store.remove("carts", {
        id: old.id
      });
      return {
        restaurantId: null,
        items: []
      };
    }
    const normalized = normalizeItems(items);
    const quote = await this.billing.quote(restaurantId, normalized);
    const values = {
      restaurant_id: restaurantId,
      items_json: JSON.stringify(normalized)
    };
    if (old) await this.store.update("carts", {
      id: old.id
    }, values);else await this.store.insert("carts", {
      customer_id: user.id,
      ...values
    });
    return {
      restaurantId,
      items: normalized,
      quote
    };
  }
  async add(user, body) {
    return await this.store.transaction(async () => {
      const cart = await this.get(user);
      const restaurantId = integer(body.restaurantId, "restaurantId");
      ensure(cart.restaurantId === null || cart.restaurantId === restaurantId, "CONFLICT", "Xóa giỏ hiện tại trước khi chọn nhà hàng khác.");
      return await this.save(user, restaurantId, [...cart.items, body.item]);
    });
  }
  async change(user, body, remove = false) {
    return await this.store.transaction(async () => {
      const cart = await this.get(user);
      const selected = normalizeItems([{
        ...body.line,
        quantity: 1
      }])[0];
      const index = await cart.items.findIndex(item => item.menuItemId === selected.menuItemId && JSON.stringify(item.selectedOptionIds) === JSON.stringify(selected.selectedOptionIds));
      ensure(index >= 0, "NOT_FOUND", "Không tìm thấy dòng giỏ.");
      if (remove) await cart.items.splice(index, 1);else cart.items[index] = normalizeItems([body.item])[0];
      return await this.save(user, cart.restaurantId, cart.items);
    });
  }
  async clear(user) {
    return await this.store.transaction(async () => await this.save(user, null, []));
  }
}
