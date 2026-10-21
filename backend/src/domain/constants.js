export const ORDER_STATUSES = [
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "DRIVER_ASSIGNED",
    "PICKED_UP",
    "DELIVERING",
    "DELIVERED",
    "CANCELLED",
];
export const MANAGER_NEXT = {
    PENDING: "CONFIRMED",
    CONFIRMED: "PREPARING",
    PREPARING: "READY_FOR_PICKUP",
};
export const DRIVER_NEXT = {
    DRIVER_ASSIGNED: "PICKED_UP",
    PICKED_UP: "DELIVERING",
    DELIVERING: "DELIVERED",
};
export const PAYMENT_METHODS = ["COD", "MOCK_WALLET", "MOCK_CARD"];
export const OFFER_TIMEOUT_MS = 60_000;
export const LOCATION_MAX_AGE_MS = 120_000;
export const DISPATCH_RETRY_MS = 30_000;
export const TOKEN_TTL_MS = 60 * 60_000;

// Phí giao theo bậc quãng đường (km đường chim bay nhà hàng → điểm giao), tính ở giá xăng tham chiếu.
export const DELIVERY_TIERS = [
    { upToKm: 3, fee: 15000 },
    { upToKm: 5, fee: 22000 },
    { upToKm: 7, fee: 29000 },
    { upToKm: 10, fee: 38000 },
];
export const MAX_DELIVERY_KM = 10;
// Giá xăng (đ/lít) admin cập nhật được; phí bậc nhân theo tỉ lệ giá hiện tại / giá tham chiếu.
export const REFERENCE_FUEL_PRICE = 23000;
export const FUEL_PRICE_RANGE = [10000, 60000];
// Giảm phí giao theo giá trị đơn: lấy mức cao nhất mà tiền món đạt tới.
export const ORDER_VALUE_FEE_DISCOUNTS = [
    { minSubtotal: 500000, percent: 100 },
    { minSubtotal: 250000, percent: 50 },
];
// Tổng tiền sau giảm giá tối thiểu (để luôn có một khoản thanh toán hợp lệ).
export const MIN_ORDER_TOTAL = 1000;
// Đơn đang trên đường: khách và nhà hàng được xem vị trí tài xế.
export const TRACKING_STATUSES = ["DRIVER_ASSIGNED", "PICKED_UP", "DELIVERING"];

export function haversineKm(a, b) {
    const radians = (degrees) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(b.lat - a.lat);
    const longitudeDelta = radians(b.lng - a.lng);
    const value =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}
