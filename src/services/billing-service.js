import { createHash } from "node:crypto";
import { ensure, integer } from "../domain/errors.js";

export const fingerprint = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function normalizeItems(items) {
    ensure(
        Array.isArray(items) && items.length > 0 && items.length <= 100,
        "VALIDATION",
        "Giỏ phải có từ 1 đến 100 dòng."
    );
    const merged = new Map();
    for (const item of items) {
        ensure(item && typeof item === "object", "VALIDATION", "Dòng giỏ không hợp lệ.");
        const menuItemId = integer(item.menuItemId, "menuItemId");
        const quantity = integer(item.quantity, "quantity", 1, 99);
        const ids = item.selectedOptionIds ?? item.optionIds ?? [];
        ensure(
            Array.isArray(ids) && ids.length <= 30,
            "VALIDATION",
            "Danh sách option không hợp lệ."
        );
        const selectedOptionIds = ids.map((id) => integer(id, "optionId")).sort((a, b) => a - b);
        ensure(new Set(ids).size === ids.length, "VALIDATION", "Không chọn trùng option.");
        if (item.selectedOptionIds && item.optionIds) {
            ensure(
                JSON.stringify([...item.optionIds].sort((a, b) => a - b)) ===
                    JSON.stringify(selectedOptionIds),
                "VALIDATION",
                "Hai tên trường option không được mâu thuẫn."
            );
        }
        const key = JSON.stringify([menuItemId, selectedOptionIds]);
        const previous = merged.get(key);
        if (previous) {
            previous.quantity = integer(previous.quantity + quantity, "quantity", 1, 99);
        } else {
            merged.set(key, { menuItemId, quantity, selectedOptionIds });
        }
    }
    return [...merged.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export class BillingService {
    constructor(store, deliveryFee) {
        this.store = store;
        this.deliveryFee = integer(deliveryFee, "deliveryFee", 0, 1_000_000_000);
    }
    quote(restaurantId, items) {
        integer(restaurantId, "restaurantId");
        const restaurant = this.store.restaurant(restaurantId);
        ensure(restaurant?.status === "ACTIVE", "VALIDATION", "Nhà hàng không nhận đơn.");
        const lines = normalizeItems(items).map((line) => {
            const item = this.store.find("menu_items", {
                id: line.menuItemId,
                restaurant_id: restaurantId,
            });
            ensure(item?.available, "VALIDATION", "Món không thuộc nhà hàng hoặc đã ngừng bán.");
            const options = line.selectedOptionIds.map((id) => {
                const option = this.store.find("menu_options", { id, menu_item_id: item.id });
                ensure(
                    option?.available,
                    "VALIDATION",
                    "Option không thuộc món hoặc đã ngừng bán."
                );
                return { id: option.id, name: option.name, surcharge: option.surcharge };
            });
            const unitPrice = integer(
                item.price + options.reduce((sum, option) => sum + option.surcharge, 0),
                "unitPrice",
                0
            );
            return {
                ...line,
                name: item.name,
                options,
                unitPrice,
                lineTotal: integer(unitPrice * line.quantity, "lineTotal", 0),
            };
        });
        const subtotal = integer(
            lines.reduce((sum, line) => sum + line.lineTotal, 0),
            "subtotal",
            0
        );
        const total = integer(subtotal + this.deliveryFee, "total", 1);
        const quote = { restaurantId, lines, subtotal, deliveryFee: this.deliveryFee, total };
        return { ...quote, quoteFingerprint: fingerprint(quote) };
    }
}
