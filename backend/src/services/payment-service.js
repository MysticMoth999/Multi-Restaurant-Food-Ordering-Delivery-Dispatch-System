import { randomUUID } from "node:crypto";
import { ensure } from "../domain/errors.js";
import { PAYMENT_METHODS } from "../domain/constants.js";
export class MockPaymentService {
  constructor(store, result = "SUCCESS") {
    ensure(["SUCCESS", "FAILED"].includes(result), "VALIDATION", "MOCK_PAYMENT_RESULT không hợp lệ.");
    this.store = store;
    this.result = result;
  }
  async process(orderId, amount, method) {
    ensure(this.store.inTransaction && (await this.store.order(orderId)), "VALIDATION", "Thanh toán phải nằm trong transaction tạo đơn.");
    ensure(amount > 0 && PAYMENT_METHODS.includes(method), "VALIDATION", "Thanh toán không hợp lệ.");
    ensure(method === "COD" || this.result !== "FAILED", "PAYMENT_FAILED", "Thanh toán mô phỏng thất bại; đơn chưa được lưu.");
    await this.store.insert("payments", {
      order_id: orderId,
      amount,
      status: method === "COD" ? "PENDING" : "SUCCESS",
      transaction_id: method === "COD" ? null : `mock-${randomUUID()}`
    });
  }
  async cancel(order) {
    const payment = await this.store.find("payments", {
      order_id: order.id
    });
    const cod = order.payment_method === "COD";
    ensure(payment && payment.status === (cod ? "PENDING" : "SUCCESS"), "CONFLICT", "Trạng thái thanh toán không cho phép hủy.");
    await this.store.update("payments", {
      id: payment.id
    }, {
      status: cod ? "VOIDED" : "REFUNDED"
    });
  }
  async complete(order, codCollected) {
    if (order.payment_method !== "COD") {
      return;
    }
    ensure(codCollected === true, "VALIDATION", "Phải xác nhận đã thu đủ tổng tiền COD.");
    const payment = await this.store.find("payments", {
      order_id: order.id
    });
    ensure(payment?.status === "PENDING" && payment.amount === order.total, "CONFLICT", "Thanh toán COD không hợp lệ.");
    await this.store.update("payments", {
      id: payment.id
    }, {
      status: "SUCCESS"
    });
  }
}
