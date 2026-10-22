export class DomainError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = "DomainError";
        this.code = code;
        this.details = details;
    }
}

export function ensure(condition, code, message, details) {
    if (!condition) {
        throw new DomainError(code, message, details);
    }
}

export function integer(value, name, min = 1, max = Number.MAX_SAFE_INTEGER) {
    ensure(
        Number.isSafeInteger(value) && value >= min && value <= max,
        "VALIDATION",
        `${name} phải là số nguyên từ ${min} đến ${max}.`
    );
    return value;
}

export function text(value, name, max = 500) {
    ensure(
        typeof value === "string" && value.trim().length > 0 && value.length <= max,
        "VALIDATION",
        `${name} không được trống hoặc vượt ${max} ký tự.`
    );
    return value.trim();
}

export function location(value) {
    ensure(
        value &&
            Number.isFinite(value.lat) &&
            Number.isFinite(value.lng) &&
            Math.abs(value.lat) <= 90 &&
            Math.abs(value.lng) <= 180,
        "VALIDATION",
        "Tọa độ không hợp lệ."
    );
    return { lat: value.lat, lng: value.lng };
}
