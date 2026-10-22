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

export function haversineKm(a, b) {
    const radians = (degrees) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(b.lat - a.lat);
    const longitudeDelta = radians(b.lng - a.lng);
    const value =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}
