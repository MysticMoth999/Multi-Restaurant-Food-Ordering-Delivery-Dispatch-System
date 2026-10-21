import { createHash } from "node:crypto";
import { ensure, integer, location } from "../domain/errors.js";
import {
  DELIVERY_TIERS,
  MAX_DELIVERY_KM,
  REFERENCE_FUEL_PRICE,
  ORDER_VALUE_FEE_DISCOUNTS,
  MIN_ORDER_TOTAL,
  haversineKm
} from "../domain/constants.js";
export const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const roundUpThousand = value => Math.ceil(value / 1000) * 1000;
const vnd = value => value.toLocaleString("vi-VN") + "đ";
export const voucherCode = value => {
  ensure(typeof value === "string" && /^[A-Za-z0-9_-]{3,32}$/.test(value.trim()), "VALIDATION", "Mã voucher gồm 3–32 chữ, số, '-' hoặc '_'.");
  return value.trim().toUpperCase();
};
export function normalizeItems(items) {
  ensure(Array.isArray(items) && items.length > 0 && items.length <= 100, "VALIDATION", "Giỏ phải có từ 1 đến 100 dòng.");
  const merged = new Map();
  for (const item of items) {
    ensure(item && typeof item === "object", "VALIDATION", "Dòng giỏ không hợp lệ.");
    const menuItemId = integer(item.menuItemId, "menuItemId");
    const quantity = integer(item.quantity, "quantity", 1, 99);
    const ids = item.selectedOptionIds ?? item.optionIds ?? [];
    ensure(Array.isArray(ids) && ids.length <= 30, "VALIDATION", "Danh sách option không hợp lệ.");
    const selectedOptionIds = ids.map(id => integer(id, "optionId")).sort((a, b) => a - b);
    ensure(new Set(ids).size === ids.length, "VALIDATION", "Không chọn trùng option.");
    if (item.selectedOptionIds && item.optionIds) {
      ensure(JSON.stringify([...item.optionIds].sort((a, b) => a - b)) === JSON.stringify(selectedOptionIds), "VALIDATION", "Hai tên trường option không được mâu thuẫn.");
    }
    const key = JSON.stringify([menuItemId, selectedOptionIds]);
    const previous = merged.get(key);
    if (previous) {
      previous.quantity = integer(previous.quantity + quantity, "quantity", 1, 99);
    } else {
      merged.set(key, {
        menuItemId,
        quantity,
        selectedOptionIds
      });
    }
  }
  return [...merged.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
export class BillingService {
  constructor(store, clock = Date.now) {
    this.store = store;
    this.clock = clock;
  }
  async fuelPrice() {
    const row = await this.store.find("settings", {
      name: "fuel_price"
    });
    const value = row ? Number(row.value) : REFERENCE_FUEL_PRICE;
    return Number.isSafeInteger(value) && value > 0 ? value : REFERENCE_FUEL_PRICE;
  }
  // Bảng bậc phí đã nhân theo giá xăng hiện tại, làm tròn lên nghìn đồng.
  async pricing() {
    const fuelPrice = await this.fuelPrice();
    return {
      fuelPrice,
      referenceFuelPrice: REFERENCE_FUEL_PRICE,
      maxKm: MAX_DELIVERY_KM,
      tiers: DELIVERY_TIERS.map(tier => ({
        upToKm: tier.upToKm,
        fee: roundUpThousand(tier.fee * fuelPrice / REFERENCE_FUEL_PRICE)
      })),
      orderValueDiscounts: ORDER_VALUE_FEE_DISCOUNTS
    };
  }
  async deliveryFee(distanceKm) {
    const { tiers } = await this.pricing();
    if (distanceKm === null) {
      return tiers[0].fee;
    }
    const tier = tiers.find(row => distanceKm <= row.upToKm);
    ensure(tier, "VALIDATION", `Điểm giao cách nhà hàng ${distanceKm.toLocaleString("vi-VN")} km, ngoài phạm vi giao ${MAX_DELIVERY_KM} km.`);
    return tier.fee;
  }
  // Voucher hợp lệ cho khách: đang bật, còn hạn, đúng khách (nếu gán riêng), đủ giá trị đơn, khách chưa dùng.
  async usableVoucher(code, customerId, subtotal) {
    const voucher = await this.store.find("vouchers", {
      code
    });
    ensure(voucher && voucher.active, "VALIDATION", "Mã voucher không tồn tại hoặc đã ngừng áp dụng.");
    ensure(customerId, "VALIDATION", "Đăng nhập tài khoản khách hàng để dùng voucher.");
    ensure(voucher.customer_id === null || voucher.customer_id === customerId, "VALIDATION", "Voucher không áp dụng cho tài khoản này.");
    ensure(voucher.expires_at === null || voucher.expires_at > this.clock(), "VALIDATION", "Voucher đã hết hạn.");
    ensure(subtotal >= voucher.min_subtotal, "VALIDATION", `Voucher ${voucher.code} áp dụng cho đơn có tiền món từ ${vnd(voucher.min_subtotal)}.`);
    ensure(!(await this.store.find("voucher_redemptions", {
      voucher_id: voucher.id,
      customer_id: customerId
    })), "VALIDATION", `Bạn đã dùng voucher ${voucher.code}.`);
    return voucher;
  }
  async availableVouchers(user) {
    const at = this.clock();
    const used = new Set((await this.store.rows("voucher_redemptions", {
      customer_id: user.id
    })).map(row => row.voucher_id));
    return (await this.store.rows("vouchers", {
      active: 1
    })).filter(row => (row.customer_id === null || row.customer_id === user.id) && (row.expires_at === null || row.expires_at > at) && !used.has(row.id)).map(voucherView);
  }
  // extras: deliveryLocation {lat,lng} (bắt buộc khi đặt đơn), voucherCode, customerId (để kiểm voucher).
  async quote(restaurantId, items, extras = {}) {
    integer(restaurantId, "restaurantId");
    const restaurant = await this.store.restaurant(restaurantId);
    ensure(restaurant?.status === "ACTIVE", "VALIDATION", "Nhà hàng không nhận đơn.");
    const lines = await Promise.all(normalizeItems(items).map(async line => {
      const item = await this.store.find("menu_items", {
        id: line.menuItemId,
        restaurant_id: restaurantId
      });
      ensure(item?.available, "VALIDATION", "Món không thuộc nhà hàng hoặc đã ngừng bán.");
      const options = await Promise.all(line.selectedOptionIds.map(async id => {
        const option = await this.store.find("menu_options", {
          id,
          menu_item_id: item.id
        });
        ensure(option?.available, "VALIDATION", "Option không thuộc món hoặc đã ngừng bán.");
        return {
          id: option.id,
          name: option.name,
          surcharge: option.surcharge
        };
      }));
      const unitPrice = integer(item.price + options.reduce((sum, option) => sum + option.surcharge, 0), "unitPrice", 0);
      return {
        ...line,
        name: item.name,
        options,
        unitPrice,
        lineTotal: integer(unitPrice * line.quantity, "lineTotal", 0)
      };
    }));
    const subtotal = integer(lines.reduce((sum, line) => sum + line.lineTotal, 0), "subtotal", 0);
    const point = extras.deliveryLocation == null ? null : location(extras.deliveryLocation);
    const distanceKm = point ? Math.round(haversineKm(restaurant, point) * 10) / 10 : null;
    const deliveryFee = await this.deliveryFee(distanceKm);
    const discounts = [];
    const valueTier = ORDER_VALUE_FEE_DISCOUNTS.find(row => subtotal >= row.minSubtotal);
    if (valueTier) {
      discounts.push({
        type: "ORDER_VALUE",
        label: valueTier.percent === 100 ? `Miễn phí giao cho đơn từ ${vnd(valueTier.minSubtotal)}` : `Giảm ${valueTier.percent}% phí giao cho đơn từ ${vnd(valueTier.minSubtotal)}`,
        amount: Math.round(deliveryFee * valueTier.percent / 100)
      });
    }
    let code = null;
    if (extras.voucherCode) {
      const voucher = await this.usableVoucher(voucherCode(extras.voucherCode), extras.customerId, subtotal);
      const feeLeft = deliveryFee - discounts.reduce((sum, row) => sum + row.amount, 0);
      const base = voucher.kind === "SHIPPING" ? feeLeft : subtotal;
      let amount = voucher.percent !== null ? Math.round(base * voucher.percent / 100) : voucher.amount;
      if (voucher.max_discount !== null) {
        amount = Math.min(amount, voucher.max_discount);
      }
      amount = Math.min(amount, base, subtotal + feeLeft - MIN_ORDER_TOTAL);
      ensure(amount > 0, "VALIDATION", voucher.kind === "SHIPPING" ? "Đơn này đã được miễn phí giao, voucher giao hàng không còn tác dụng." : "Voucher không giảm được cho đơn này.");
      code = voucher.code;
      discounts.push({
        type: "VOUCHER",
        label: `Voucher ${voucher.code}`,
        amount
      });
    }
    const discount = discounts.reduce((sum, row) => sum + row.amount, 0);
    const total = integer(subtotal + deliveryFee - discount, "total", 1);
    const quote = {
      restaurantId,
      lines,
      subtotal,
      deliveryLocation: point,
      distanceKm,
      deliveryFee,
      discounts,
      discount,
      voucherCode: code,
      total
    };
    return {
      ...quote,
      quoteFingerprint: fingerprint(quote)
    };
  }
}
export const voucherView = row => ({
  id: row.id,
  code: row.code,
  description: row.description,
  kind: row.kind,
  percent: row.percent,
  amount: row.amount,
  maxDiscount: row.max_discount,
  minSubtotal: row.min_subtotal,
  customerId: row.customer_id,
  expiresAt: row.expires_at,
  active: Boolean(row.active)
});
