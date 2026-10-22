import { ensure, integer, text } from "../domain/errors.js";
import { MANAGER_NEXT, DRIVER_NEXT, PAYMENT_METHODS } from "../domain/constants.js";
import { fingerprint, normalizeItems } from "./billing-service.js";

export class OrderLifecycleService {
    constructor(store, billing, payment, clock, fault = () => {}) {
        Object.assign(this, { store, billing, payment, clock, fault });
    }
    create(user, body) {
        ensure(user.role === "CUSTOMER", "FORBIDDEN", "Chỉ khách hàng được đặt đơn.");
        const request = {
            restaurantId: integer(body.restaurantId, "restaurantId"),
            items: normalizeItems(body.items),
            deliveryAddress: text(body.deliveryAddress, "deliveryAddress"),
            paymentMethod: body.paymentMethod,
            quoteFingerprint: text(body.quoteFingerprint, "quoteFingerprint", 64),
        };
        ensure(
            PAYMENT_METHODS.includes(request.paymentMethod),
            "VALIDATION",
            "Phương thức thanh toán không hợp lệ."
        );
        const requestKey = text(body.requestKey, "requestKey", 128);
        const requestHash = fingerprint(request);
        return this.store.transaction(() => {
            const existing = this.store.find("orders", {
                customer_id: user.id,
                request_key: requestKey,
            });
            if (existing) {
                ensure(
                    existing.request_hash === requestHash,
                    "CONFLICT",
                    "requestKey đã dùng với nội dung khác."
                );
                return { order: JSON.parse(existing.creation_response), replayed: true };
            }
            const customer = this.store.user(user.id);
            ensure(
                customer.phone && /^\d{10}$/.test(customer.phone),
                "VALIDATION",
                "Tài khoản cần có số điện thoại trước khi đặt đơn."
            );
            const quote = this.billing.quote(request.restaurantId, request.items);
            ensure(
                quote.quoteFingerprint === request.quoteFingerprint,
                "PRICE_CHANGED",
                "Giá hoặc nội dung món đã đổi. Vui lòng xem báo giá mới và xác nhận lại.",
                { quote }
            );
            const at = this.clock();
            const id = this.store.insert("orders", {
                customer_id: user.id,
                restaurant_id: request.restaurantId,
                driver_id: null,
                status: "PENDING",
                subtotal: quote.subtotal,
                delivery_fee: quote.deliveryFee,
                total: quote.total,
                delivery_address: request.deliveryAddress,
                contact_phone: customer.phone,
                payment_method: request.paymentMethod,
                request_key: requestKey,
                request_hash: requestHash,
                created_at: at,
                updated_at: at,
            });
            this.fault("afterOrder");
            for (const line of quote.lines) {
                this.store.insert("order_items", {
                    order_id: id,
                    menu_item_id: line.menuItemId,
                    name: line.name,
                    options_json: JSON.stringify(line.options),
                    unit_price: line.unitPrice,
                    quantity: line.quantity,
                    line_total: line.lineTotal,
                });
                this.fault("afterItem");
            }
            this.store.history(id, "PENDING", user.id, at);
            this.fault("afterHistory");
            this.payment.process(id, quote.total, request.paymentMethod);
            this.fault("afterPayment");
            this.store.activity(user.id, `Tạo đơn GM-${id}`, at);
            const order = this.store.orderView(id);
            this.store.update("orders", { id }, { creation_response: JSON.stringify(order) });
            this.fault("beforeCommit");
            return { order, replayed: false };
        });
    }
    owned(user, id) {
        const order = this.store.order(integer(id, "orderId"));
        ensure(order, "NOT_FOUND", "Không tìm thấy đơn.");
        const restaurant = this.store.restaurant(order.restaurant_id);
        const driver = this.store.driver(user.id);
        ensure(
            user.role === "ADMIN" ||
                (user.role === "CUSTOMER" && order.customer_id === user.id) ||
                (user.role === "MANAGER" && restaurant.manager_id === user.id) ||
                (user.role === "DRIVER" && driver?.id === order.driver_id),
            "FORBIDDEN",
            "Không có quyền trên đơn này."
        );
        return order;
    }
    get(user, id) {
        return this.store.orderView(this.owned(user, id).id);
    }
    mine(user, page) {
        integer(page, "page");
        const rows = this.store
            .rows("orders", { customer_id: user.id })
            .sort((a, b) => b.created_at - a.created_at || b.id - a.id);
        return {
            items: rows
                .slice((page - 1) * 20, page * 20)
                .map((row) => this.store.orderView(row.id)),
            page,
            pageSize: 20,
            total: rows.length,
        };
    }
    checkVersion(order, expectedVersion) {
        integer(expectedVersion, "expectedVersion");
        ensure(order.version === expectedVersion, "CONFLICT", "Đơn đã thay đổi. Hãy tải lại.");
    }
    setState(order, target, user, at) {
        const changed = this.store.update(
            "orders",
            { id: order.id, version: order.version },
            { status: target, version: order.version + 1, updated_at: at }
        );
        ensure(changed === 1, "CONFLICT", "Đơn đã thay đổi.");
        this.store.history(order.id, target, user.id, at);
    }
    transition(user, id, body) {
        return this.store.transaction(() => {
            const order = this.owned(user, id);
            ensure(
                ["MANAGER", "DRIVER"].includes(user.role),
                "FORBIDDEN",
                "Vai trò không được chuyển trạng thái."
            );
            // A replay of completion must not collect COD or append history twice.
            if (
                user.role === "DRIVER" &&
                order.status === "DELIVERED" &&
                body.targetStatus === "DELIVERED"
            ) {
                return this.store.orderView(id);
            }
            this.checkVersion(order, body.expectedVersion);
            const next = (user.role === "MANAGER" ? MANAGER_NEXT : DRIVER_NEXT)[order.status];
            ensure(
                next && body.targetStatus === next,
                "VALIDATION",
                "Trạng thái đích sai quy trình."
            );
            const at = this.clock();
            if (next === "DELIVERED") {
                this.payment.complete(order, body.codCollected);
                this.fault("afterCompletionPayment");
                this.store.update(
                    "drivers",
                    { id: order.driver_id },
                    { status: "AVAILABLE", updated_at: at }
                );
            }
            this.setState(order, next, user, at);
            this.fault("afterTransitionHistory");
            return this.store.orderView(id);
        });
    }
    cancel(user, id, body) {
        return this.store.transaction(() => {
            const order = this.owned(user, id);
            ensure(
                ["CUSTOMER", "MANAGER"].includes(user.role),
                "FORBIDDEN",
                "Vai trò không được hủy đơn."
            );
            this.checkVersion(order, body.expectedVersion);
            const allowed = user.role === "CUSTOMER" ? ["PENDING"] : ["PENDING", "CONFIRMED"];
            ensure(allowed.includes(order.status), "VALIDATION", "Không thể hủy ở trạng thái này.");
            const reason =
                user.role === "MANAGER"
                    ? text(body.reason, "reason")
                    : body.reason
                      ? text(body.reason, "reason")
                      : "Khách tự hủy";
            this.payment.cancel(order);
            this.fault("afterCancellationPayment");
            this.store.update("orders", { id }, { cancel_reason: reason });
            this.setState(order, "CANCELLED", user, this.clock());
            this.fault("afterCancellationHistory");
            return this.store.orderView(id);
        });
    }
}
