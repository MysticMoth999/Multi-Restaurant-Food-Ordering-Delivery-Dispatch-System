import { ensure, integer, text, location } from "../domain/errors.js";
import { MANAGER_NEXT, DRIVER_NEXT, PAYMENT_METHODS } from "../domain/constants.js";
import { fingerprint, normalizeItems, voucherCode } from "./billing-service.js";
export class OrderLifecycleService {
  constructor(store, billing, payment, clock, fault = () => {}, notifications) {
    Object.assign(this, {
      store,
      billing,
      payment,
      clock,
      fault,
      notifications
    });
  }
  async create(user, body) {
    ensure(user.role === "CUSTOMER", "FORBIDDEN", "Chỉ khách hàng được đặt đơn.");
    const request = {
      restaurantId: integer(body.restaurantId, "restaurantId"),
      items: normalizeItems(body.items),
      deliveryAddress: text(body.deliveryAddress, "deliveryAddress"),
      // Tọa độ điểm giao bắt buộc: phí giao tính theo quãng đường và bản đồ theo dõi cần điểm đến.
      deliveryLocation: location(body.deliveryLocation),
      voucherCode: body.voucherCode ? voucherCode(body.voucherCode) : null,
      paymentMethod: body.paymentMethod,
      quoteFingerprint: text(body.quoteFingerprint, "quoteFingerprint", 64)
    };
    ensure(PAYMENT_METHODS.includes(request.paymentMethod), "VALIDATION", "Phương thức thanh toán không hợp lệ.");
    const requestKey = text(body.requestKey, "requestKey", 128);
    const requestHash = fingerprint(request);
    return await this.store.transaction(async () => {
      const existing = await this.store.find("orders", {
        customer_id: user.id,
        request_key: requestKey
      });
      if (existing) {
        ensure(existing.request_hash === requestHash, "CONFLICT", "requestKey đã dùng với nội dung khác.");
        return {
          order: JSON.parse(existing.creation_response),
          replayed: true
        };
      }
      const customer = await this.store.user(user.id);
      ensure(customer.phone && /^\d{10}$/.test(customer.phone), "VALIDATION", "Tài khoản cần có số điện thoại trước khi đặt đơn.");
      const quote = await this.billing.quote(request.restaurantId, request.items, {
        deliveryLocation: request.deliveryLocation,
        voucherCode: request.voucherCode,
        customerId: user.id
      });
      ensure(quote.quoteFingerprint === request.quoteFingerprint, "PRICE_CHANGED", "Giá hoặc nội dung món đã đổi. Vui lòng xem báo giá mới và xác nhận lại.", {
        quote
      });
      const voucher = quote.voucherCode ? await this.store.find("vouchers", {
        code: quote.voucherCode
      }) : null;
      const at = this.clock();
      const id = await this.store.insert("orders", {
        customer_id: user.id,
        restaurant_id: request.restaurantId,
        driver_id: null,
        status: "PENDING",
        subtotal: quote.subtotal,
        delivery_fee: quote.deliveryFee,
        discount: quote.discount,
        voucher_id: voucher?.id ?? null,
        total: quote.total,
        delivery_address: request.deliveryAddress,
        delivery_lat: request.deliveryLocation.lat,
        delivery_lng: request.deliveryLocation.lng,
        distance_km: quote.distanceKm,
        contact_phone: customer.phone,
        payment_method: request.paymentMethod,
        request_key: requestKey,
        request_hash: requestHash,
        created_at: at,
        updated_at: at
      });
      this.fault("afterOrder");
      for (const line of quote.lines) {
        await this.store.insert("order_items", {
          order_id: id,
          menu_item_id: line.menuItemId,
          name: line.name,
          options_json: JSON.stringify(line.options),
          unit_price: line.unitPrice,
          quantity: line.quantity,
          line_total: line.lineTotal
        });
        this.fault("afterItem");
      }
      await this.store.history(id, "PENDING", user.id, at);
      this.fault("afterHistory");
      await this.payment.process(id, quote.total, request.paymentMethod);
      this.fault("afterPayment");
      if (voucher) {
        // UNIQUE(voucher_id, customer_id) ở CSDL chặn hai đơn đồng thời cùng dùng một voucher.
        await this.store.insert("voucher_redemptions", {
          voucher_id: voucher.id,
          customer_id: user.id,
          order_id: id
        });
      }
      const payment = await this.store.find("payments", {
        order_id: id
      });
      await this.notifications.orderCreated(await this.store.order(id), customer, quote.lines.length, payment.status);
      await this.store.activity(user.id, `Tạo đơn GM-${id}`, at);
      const order = await this.store.orderView(id);
      await this.store.update("orders", {
        id
      }, {
        creation_response: JSON.stringify(order)
      });
      this.fault("beforeCommit");
      return {
        order,
        replayed: false
      };
    });
  }
  async owned(user, id) {
    const order = await this.store.order(integer(id, "orderId"));
    ensure(order, "NOT_FOUND", "Không tìm thấy đơn.");
    const restaurant = await this.store.restaurant(order.restaurant_id);
    const driver = await this.store.driver(user.id);
    ensure(user.role === "ADMIN" || user.role === "CUSTOMER" && order.customer_id === user.id || user.role === "MANAGER" && restaurant.manager_id === user.id || user.role === "DRIVER" && driver?.id === order.driver_id, "FORBIDDEN", "Không có quyền trên đơn này.");
    return order;
  }
  async get(user, id) {
    return await this.store.orderView((await this.owned(user, id)).id);
  }
  async mine(user, page) {
    integer(page, "page");
    if (this.store.customerOrders) return await this.store.customerOrders(user.id, page);
    const rows = (await this.store.rows("orders", {
      customer_id: user.id
    })).sort((a, b) => b.created_at - a.created_at || b.id - a.id);
    return {
      items: await Promise.all(rows.slice((page - 1) * 20, page * 20).map(async row => await this.store.orderView(row.id))),
      page,
      pageSize: 20,
      total: rows.length
    };
  }
  async checkVersion(order, expectedVersion) {
    integer(expectedVersion, "expectedVersion");
    ensure(order.version === expectedVersion, "CONFLICT", "Đơn đã thay đổi. Hãy tải lại.");
  }
  async setState(order, target, user, at) {
    const changed = await this.store.update("orders", {
      id: order.id,
      version: order.version
    }, {
      status: target,
      version: order.version + 1,
      updated_at: at
    });
    ensure(changed === 1, "CONFLICT", "Đơn đã thay đổi.");
    await this.store.history(order.id, target, user.id, at);
  }
  async transition(user, id, body) {
    return await this.store.transaction(async () => {
      const order = await this.owned(user, id);
      ensure(["MANAGER", "DRIVER"].includes(user.role), "FORBIDDEN", "Vai trò không được chuyển trạng thái.");
      // A replay of completion must not collect COD or append history twice.
      if (user.role === "DRIVER" && order.status === "DELIVERED" && body.targetStatus === "DELIVERED") {
        return await this.store.orderView(id);
      }
      await this.checkVersion(order, body.expectedVersion);
      const next = (user.role === "MANAGER" ? MANAGER_NEXT : DRIVER_NEXT)[order.status];
      ensure(next && body.targetStatus === next, "VALIDATION", "Trạng thái đích sai quy trình.");
      const at = this.clock();
      if (next === "DELIVERED") {
        await this.payment.complete(order, body.codCollected);
        this.fault("afterCompletionPayment");
        await this.store.update("drivers", {
          id: order.driver_id
        }, {
          status: "AVAILABLE",
          updated_at: at
        });
      }
      await this.setState(order, next, user, at);
      await this.notifications.statusChanged(order, next);
      this.fault("afterTransitionHistory");
      return await this.store.orderView(id);
    });
  }
  async cancel(user, id, body) {
    return await this.store.transaction(async () => {
      const order = await this.owned(user, id);
      ensure(["CUSTOMER", "MANAGER"].includes(user.role), "FORBIDDEN", "Vai trò không được hủy đơn.");
      await this.checkVersion(order, body.expectedVersion);
      const allowed = user.role === "CUSTOMER" ? ["PENDING"] : ["PENDING", "CONFIRMED"];
      ensure(allowed.includes(order.status), "VALIDATION", "Không thể hủy ở trạng thái này.");
      const reason = user.role === "MANAGER" ? text(body.reason, "reason") : body.reason ? text(body.reason, "reason") : "Khách tự hủy";
      await this.payment.cancel(order);
      this.fault("afterCancellationPayment");
      await this.store.update("orders", {
        id
      }, {
        cancel_reason: reason
      });
      await this.setState(order, "CANCELLED", user, this.clock());
      // Hủy đơn thì trả lại voucher cho khách.
      await this.store.remove("voucher_redemptions", {
        order_id: order.id
      });
      const payment = await this.store.find("payments", {
        order_id: order.id
      });
      await this.notifications.cancelled(order, user.role, reason, payment.status);
      this.fault("afterCancellationHistory");
      return await this.store.orderView(id);
    });
  }
}
