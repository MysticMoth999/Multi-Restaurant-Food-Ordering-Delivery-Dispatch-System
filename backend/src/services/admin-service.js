import { ensure, integer, text } from "../domain/errors.js";
import { FUEL_PRICE_RANGE } from "../domain/constants.js";
import { voucherCode, voucherView } from "./billing-service.js";
const optional = (value, name, min, max) => value === undefined || value === null || value === "" ? null : integer(value, name, min, max);
export class AdminService {
  constructor(store, clock, catalog, billing) {
    Object.assign(this, {
      store,
      clock,
      catalog,
      billing
    });
  }
  async authorize(user) {
    ensure(user.role === "ADMIN", "FORBIDDEN", "Chỉ quản trị viên được thực hiện.");
  }
  async restaurantStatus(user, id, status) {
    await this.authorize(user);
    ensure(["ACTIVE", "INACTIVE"].includes(status), "VALIDATION", "Trạng thái nhà hàng không hợp lệ.");
    return await this.store.transaction(async () => {
      ensure(await this.store.restaurant(id), "NOT_FOUND", "Không tìm thấy nhà hàng.");
      await this.store.update("restaurants", {
        id
      }, {
        status
      });
      await this.store.activity(user.id, `Nhà hàng ${id}: ${status}`, this.clock());
      return await this.catalog.restaurantView(await this.store.restaurant(id));
    });
  }
  async lockDriver(user, id, locked) {
    await this.authorize(user);
    ensure(typeof locked === "boolean", "VALIDATION", "locked phải là boolean.");
    return await this.store.transaction(async () => {
      const driver = await this.store.find("drivers", {
        id
      });
      ensure(driver, "NOT_FOUND", "Không tìm thấy tài xế.");
      ensure(!locked || driver.status !== "BUSY", "CONFLICT", "Không khóa tài xế đang giao đơn.");
      await this.store.update("drivers", {
        id
      }, {
        locked: Number(locked),
        ...(locked ? {
          status: "OFFLINE",
          lat: null,
          lng: null,
          location_at: null
        } : {}),
        updated_at: this.clock()
      });
      if (locked) {
        await this.store.remove("sessions", {
          user_id: driver.user_id
        });
        for (const offer of await this.store.rows("driver_offers", {
          driver_id: id,
          status: "PENDING"
        })) {
          await this.store.update("driver_offers", {
            id: offer.id
          }, {
            status: "REVOKED"
          });
        }
      }
      await this.store.activity(user.id, `Tài xế ${id}: ${locked ? "khóa" : "mở khóa"}`, this.clock());
      return {
        id,
        locked
      };
    });
  }
  async setFuelPrice(user, value) {
    await this.authorize(user);
    const price = integer(value, "fuelPrice", ...FUEL_PRICE_RANGE);
    return await this.store.transaction(async () => {
      const row = await this.store.find("settings", {
        name: "fuel_price"
      });
      if (row) {
        await this.store.update("settings", {
          id: row.id
        }, {
          value: String(price)
        });
      } else {
        await this.store.insert("settings", {
          name: "fuel_price",
          value: String(price)
        });
      }
      await this.store.activity(user.id, `Giá xăng: ${price.toLocaleString("vi-VN")}đ/lít`, this.clock());
      return await this.billing.pricing();
    });
  }
  async vouchers(user) {
    await this.authorize(user);
    const used = await this.store.rows("voucher_redemptions");
    return await Promise.all((await this.store.rows("vouchers")).sort((a, b) => b.id - a.id).map(async row => ({
      ...voucherView(row),
      customerEmail: row.customer_id ? (await this.store.user(row.customer_id))?.email ?? null : null,
      used: used.filter(item => item.voucher_id === row.id).length
    })));
  }
  // Voucher giảm phí giao (SHIPPING) hoặc giảm tiền món (ORDER), theo % (kèm mức giảm tối đa) hoặc số tiền cố định.
  async createVoucher(user, body) {
    await this.authorize(user);
    const code = voucherCode(body.code);
    ensure(["SHIPPING", "ORDER"].includes(body.kind), "VALIDATION", "Loại voucher là SHIPPING hoặc ORDER.");
    const percent = optional(body.percent, "percent", 1, body.kind === "ORDER" ? 50 : 100);
    const amount = optional(body.amount, "amount", 1000, 10_000_000);
    ensure((percent === null) !== (amount === null), "VALIDATION", "Chọn một trong hai: giảm theo % hoặc số tiền.");
    const minSubtotal = optional(body.minSubtotal, "minSubtotal", 0, 100_000_000) ?? 0;
    ensure(body.kind !== "ORDER" || amount === null || amount < Math.max(minSubtotal, 1), "VALIDATION", "Voucher giảm tiền món phải có giá trị đơn tối thiểu lớn hơn số tiền giảm.");
    const days = optional(body.expiresInDays, "expiresInDays", 1, 365);
    return await this.store.transaction(async () => {
      ensure(!(await this.store.find("vouchers", {
        code
      })), "CONFLICT", `Mã ${code} đã tồn tại.`);
      let customerId = null;
      if (body.customerEmail) {
        const customer = await this.store.find("users", {
          email: text(body.customerEmail, "customerEmail", 254).toLowerCase()
        });
        ensure(customer?.role === "CUSTOMER", "VALIDATION", "Không tìm thấy khách hàng với email này.");
        customerId = customer.id;
      }
      const id = await this.store.insert("vouchers", {
        code,
        description: body.description ? text(body.description, "description", 200) : "",
        kind: body.kind,
        percent,
        amount,
        max_discount: optional(body.maxDiscount, "maxDiscount", 1000, 10_000_000),
        min_subtotal: minSubtotal,
        customer_id: customerId,
        expires_at: days ? this.clock() + days * 86_400_000 : null,
        active: 1,
        created_at: this.clock()
      });
      await this.store.activity(user.id, `Tạo voucher ${code}`, this.clock());
      return voucherView(await this.store.find("vouchers", {
        id
      }));
    });
  }
  async setVoucherActive(user, id, active) {
    await this.authorize(user);
    ensure(typeof active === "boolean", "VALIDATION", "active phải là boolean.");
    return await this.store.transaction(async () => {
      const row = await this.store.find("vouchers", {
        id
      });
      ensure(row, "NOT_FOUND", "Không tìm thấy voucher.");
      await this.store.update("vouchers", {
        id
      }, {
        active: Number(active)
      });
      await this.store.activity(user.id, `Voucher ${row.code}: ${active ? "bật" : "tắt"}`, this.clock());
      return voucherView(await this.store.find("vouchers", {
        id
      }));
    });
  }
  async dashboard(user) {
    await this.authorize(user);
    const orders = await this.store.rows("orders");
    const restaurants = await this.store.rows("restaurants");
    const drivers = await this.store.rows("drivers");
    const start = new Date(this.clock()).setHours(0, 0, 0, 0);
    const today = await orders.filter(order => order.created_at >= start);
    return {
      summary: {
        ordersToday: today.length,
        revenueToday: (await orders.filter(order => order.status === "DELIVERED" && order.updated_at >= start)).reduce((sum, order) => sum + order.total, 0),
        restaurantsActive: restaurants.filter(row => row.status === "ACTIVE").length,
        restaurantsTotal: restaurants.length,
        driversOnline: drivers.filter(row => row.status !== "OFFLINE" && !row.locked).length,
        driversTotal: drivers.length,
        byStatus: await orders.reduce((counts, order) => ({
          ...counts,
          [order.status]: (counts[order.status] ?? 0) + 1
        }), {})
      },
      orders: await Promise.all(orders.sort((a, b) => b.id - a.id).slice(0, 100).map(async order => await this.store.orderView(order.id))),
      restaurants: await Promise.all(restaurants.map(async row => await this.catalog.restaurantView(row))),
      drivers: await Promise.all(drivers.map(async row => ({
        id: row.id,
        name: (await this.store.user(row.user_id)).name,
        locked: Boolean(row.locked),
        status: row.status,
        locationAt: row.location_at,
        lat: row.lat,
        lng: row.lng
      }))),
      pricing: await this.billing.pricing(),
      vouchers: await this.vouchers(user),
      activity: (await this.store.rows("activity")).sort((a, b) => b.id - a.id).slice(0, 50).map(row => ({
        text: row.text,
        at: row.at,
        actorId: row.actor_id
      }))
    };
  }
}
