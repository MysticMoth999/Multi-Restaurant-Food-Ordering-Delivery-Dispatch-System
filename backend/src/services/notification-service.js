import { ensure, integer } from "../domain/errors.js";
const vnd = value => value.toLocaleString("vi-VN") + "đ";
const PAYMENT_LABEL = {
  COD: "tiền mặt",
  MOCK_WALLET: "ví điện tử (mô phỏng)",
  MOCK_CARD: "thẻ (mô phỏng)"
};
// Thông báo trong ứng dụng. Ghi trong cùng transaction với nghiệp vụ nên rollback thì thông báo cũng không còn.
export class NotificationService {
  constructor(store, clock) {
    Object.assign(this, {
      store,
      clock
    });
  }
  async push(userId, orderId, kind, title, body) {
    if (!userId) {
      return;
    }
    await this.store.insert("notifications", {
      user_id: userId,
      order_id: orderId ?? null,
      kind,
      title,
      body,
      created_at: this.clock(),
      read_at: null
    });
  }
  async context(order) {
    const restaurant = await this.store.restaurant(order.restaurant_id);
    const driver = order.driver_id ? await this.store.find("drivers", {
      id: order.driver_id
    }) : null;
    const driverUser = driver ? await this.store.user(driver.user_id) : null;
    return {
      code: `#GM-${order.id}`,
      restaurant,
      driverUser
    };
  }
  async orderCreated(order, customer, lineCount, paymentStatus) {
    const { code, restaurant } = await this.context(order);
    await this.push(order.customer_id, order.id, "ORDER_PLACED", "Đặt đơn thành công", `Đơn ${code} tại ${restaurant.name} đã gửi tới nhà hàng, chờ xác nhận.`);
    if (paymentStatus === "SUCCESS") {
      await this.push(order.customer_id, order.id, "PAYMENT", "Xác nhận đã thanh toán", `Đã thanh toán ${vnd(order.total)} cho đơn ${code} bằng ${PAYMENT_LABEL[order.payment_method]}.`);
    }
    await this.push(restaurant.manager_id, order.id, "NEW_ORDER", `Đơn mới ${code}`, `${customer.name} đặt ${lineCount} món, tổng ${vnd(order.total)}. Hãy xác nhận đơn.`);
  }
  async statusChanged(order, status) {
    const { code, restaurant, driverUser } = await this.context(order);
    const driverName = driverUser?.name ?? "Tài xế";
    const toCustomer = {
      CONFIRMED: ["Nhà hàng đã xác nhận", `${restaurant.name} đã nhận đơn ${code}.`],
      PREPARING: ["Đang chuẩn bị món", `${restaurant.name} đang chuẩn bị đơn ${code}.`],
      READY_FOR_PICKUP: ["Món đã sẵn sàng", `Đơn ${code} đã xong, hệ thống đang tìm tài xế gần nhất.`],
      DRIVER_ASSIGNED: ["Đã có tài xế", `${driverName}${driverUser?.phone ? " (" + driverUser.phone + ")" : ""} đang đến ${restaurant.name} lấy đơn ${code}.`],
      PICKED_UP: ["Tài xế đã lấy món", `${driverName} đã lấy đơn ${code}.`],
      DELIVERING: ["Đơn đang được giao", `${driverName} đang trên đường giao đơn ${code}. Xem vị trí trên bản đồ.`],
      DELIVERED: ["Giao hàng thành công", `Đơn ${code} đã giao. Chúc bạn ngon miệng!`]
    }[status];
    if (toCustomer) {
      await this.push(order.customer_id, order.id, "ORDER_STATUS", ...toCustomer);
    }
    const toManager = {
      DRIVER_ASSIGNED: [`Tài xế nhận đơn ${code}`, `${driverName} sẽ đến lấy món.`],
      PICKED_UP: [`Đã giao món cho tài xế`, `${driverName} đã lấy đơn ${code}.`],
      DELIVERED: [`Đơn ${code} đã giao xong`, `Khách đã nhận đơn ${code}.`]
    }[status];
    if (toManager) {
      await this.push(restaurant.manager_id, order.id, "ORDER_STATUS", ...toManager);
    }
    if (status === "DELIVERED" && order.payment_method === "COD") {
      await this.push(order.customer_id, order.id, "PAYMENT", "Xác nhận đã thanh toán", `${driverName} đã xác nhận thu ${vnd(order.total)} tiền mặt cho đơn ${code}.`);
    }
  }
  async cancelled(order, byRole, reason, paymentStatus) {
    const { code, restaurant } = await this.context(order);
    const money = paymentStatus === "REFUNDED" ? ` Đã hoàn ${vnd(order.total)} (mô phỏng).` : "";
    if (byRole === "CUSTOMER") {
      await this.push(restaurant.manager_id, order.id, "ORDER_CANCELLED", `Khách đã hủy đơn ${code}`, reason);
      await this.push(order.customer_id, order.id, "ORDER_CANCELLED", `Đã hủy đơn ${code}`, `Bạn đã hủy đơn.${money}`);
    } else {
      await this.push(order.customer_id, order.id, "ORDER_CANCELLED", `Nhà hàng đã hủy đơn ${code}`, `Lý do: ${reason}.${money}`);
    }
  }
  async offered(driverUserId, order, distanceKm) {
    await this.push(driverUserId, order.id, "OFFER", `Lời mời giao đơn #GM-${order.id}`, `Cách nhà hàng ${distanceKm.toLocaleString("vi-VN", {
      maximumFractionDigits: 1
    })} km. Nhận trong 60 giây.`);
  }
  async list(user, after = 0) {
    integer(after, "after", 0);
    const rows = (await this.store.rows("notifications", {
      user_id: user.id
    })).sort((a, b) => b.id - a.id);
    return {
      items: rows.filter(row => row.id > after).slice(0, 30).map(row => ({
        id: row.id,
        orderId: row.order_id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        createdAt: row.created_at,
        read: row.read_at !== null
      })),
      unread: rows.filter(row => row.read_at === null).length,
      lastId: rows[0]?.id ?? 0
    };
  }
  async markRead(user, body) {
    const at = this.clock();
    if (body.all === true) {
      await this.store.update("notifications", {
        user_id: user.id,
        read_at: null
      }, {
        read_at: at
      });
    } else {
      ensure(Array.isArray(body.ids) && body.ids.length <= 100, "VALIDATION", "ids phải là mảng tối đa 100 phần tử.");
      for (const id of body.ids) {
        await this.store.update("notifications", {
          id: integer(id, "id"),
          user_id: user.id,
          read_at: null
        }, {
          read_at: at
        });
      }
    }
    return {
      unread: (await this.store.rows("notifications", {
        user_id: user.id,
        read_at: null
      })).length
    };
  }
}
