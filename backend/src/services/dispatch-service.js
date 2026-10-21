import { ensure, integer, location } from "../domain/errors.js";
import { haversineKm, OFFER_TIMEOUT_MS, LOCATION_MAX_AGE_MS, DISPATCH_RETRY_MS } from "../domain/constants.js";
const validPoint = row => Number.isFinite(row?.lat) && Number.isFinite(row?.lng) && Math.abs(row.lat) <= 90 && Math.abs(row.lng) <= 180;
export class DispatchService {
  constructor(store, clock, fault = () => {}, notifications) {
    Object.assign(this, {
      store,
      clock,
      fault,
      notifications
    });
  }
  async driverFor(user) {
    ensure(user.role === "DRIVER", "FORBIDDEN", "Chỉ tài xế được thực hiện.");
    const driver = await this.store.driver(user.id);
    ensure(driver && !driver.locked, "FORBIDDEN", "Tài xế không hoạt động.");
    return driver;
  }
  async skip(offer, status) {
    await this.store.update("driver_offers", {
      id: offer.id,
      status: "PENDING"
    }, {
      status
    });
    if (!(await this.store.find("dispatch_skips", {
      order_id: offer.order_id,
      driver_id: offer.driver_id
    }))) {
      await this.store.insert("dispatch_skips", {
        order_id: offer.order_id,
        driver_id: offer.driver_id
      });
    }
  }
  async tick() {
    return await this.store.transaction(async () => {
      const at = this.clock();
      const pending = await this.store.rows("driver_offers", {
        status: "PENDING"
      });
      for (const offer of pending) {
        if (offer.expires_at <= at) {
          await this.skip(offer, "EXPIRED");
        }
      }
      const orders = (await this.store.rows("orders", {
        status: "READY_FOR_PICKUP",
        driver_id: null
      })).sort((a, b) => a.created_at - b.created_at || a.id - b.id);
      for (const order of orders) {
        await this.offerNearest(order, at);
      }
      return {
        scanned: orders.length
      };
    });
  }
  async offerNearest(order, at) {
    if (await this.store.find("driver_offers", {
      order_id: order.id,
      status: "PENDING"
    })) {
      return;
    }
    const restaurant = await this.store.restaurant(order.restaurant_id);
    // Mục 7.4: chỉ điều phối khi tọa độ nhà hàng hợp lệ; thiếu tọa độ thì không tính được khoảng cách.
    if (!validPoint(restaurant)) {
      if (order.retry_at === null) {
        await this.store.update("orders", {
          id: order.id
        }, {
          retry_at: at + DISPATCH_RETRY_MS
        });
        await this.store.activity(null, `Chưa điều phối được GM-${order.id}: nhà hàng thiếu tọa độ`, at);
      } else if (order.retry_at <= at) {
        await this.store.update("orders", {
          id: order.id
        }, {
          retry_at: at + DISPATCH_RETRY_MS
        });
      }
      return;
    }
    // retry_at chỉ hẹn giờ xóa danh sách đã bỏ qua; tài xế mới trực tuyến vẫn được mời ngay.
    if (order.retry_at !== null && order.retry_at <= at) {
      await this.store.remove("dispatch_skips", {
        order_id: order.id
      });
      await this.store.update("orders", {
        id: order.id
      }, {
        retry_at: null
      });
      order = {
        ...order,
        retry_at: null
      };
    }
    let driver;
    if (this.store.nearestDriver) {
      driver = await this.store.nearestDriver(order, restaurant, at);
    } else {
      const invited = new Set((await this.store.rows("driver_offers", {
        status: "PENDING"
      })).map(offer => offer.driver_id));
      const skipped = new Set((await this.store.rows("dispatch_skips", {
        order_id: order.id
      })).map(row => row.driver_id));
      const candidates = (await this.store.rows("drivers", {
        status: "AVAILABLE",
        locked: 0
      })).filter(driver => driver.location_at !== null && driver.location_at <= at && at - driver.location_at <= LOCATION_MAX_AGE_MS && !invited.has(driver.id) && !skipped.has(driver.id)).map(driver => ({
        ...driver,
        distanceKm: haversineKm(restaurant, driver)
      })).sort((a, b) => a.distanceKm - b.distanceKm || a.updated_at - b.updated_at || a.id - b.id);
      driver = candidates[0];
    }
    if (!driver) {
      if (order.retry_at === null) {
        await this.store.update("orders", {
          id: order.id
        }, {
          retry_at: at + DISPATCH_RETRY_MS
        });
      }
      return;
    }
    await this.store.insert("driver_offers", {
      order_id: order.id,
      driver_id: driver.id,
      status: "PENDING",
      distance_km: driver.distanceKm,
      expires_at: at + OFFER_TIMEOUT_MS,
      created_at: at
    });
    await this.notifications.offered(driver.user_id, order, driver.distanceKm);
  }
  async setStatus(user, body) {
    return await this.store.transaction(async () => {
      const driver = await this.driverFor(user);
      ensure(["OFFLINE", "AVAILABLE"].includes(body.status), "VALIDATION", "Chỉ đổi OFFLINE hoặc AVAILABLE.");
      ensure(driver.status !== "BUSY", "CONFLICT", "Đang giao đơn, không thể đổi trạng thái.");
      const point = body.status === "AVAILABLE" ? location(body.location) : {
        lat: null,
        lng: null
      };
      await this.store.update("drivers", {
        id: driver.id
      }, {
        ...point,
        status: body.status,
        location_at: body.status === "AVAILABLE" ? this.clock() : null,
        updated_at: this.clock()
      });
      if (body.status === "OFFLINE") {
        for (const offer of await this.store.rows("driver_offers", {
          driver_id: driver.id,
          status: "PENDING"
        })) {
          await this.skip(offer, "REVOKED");
        }
      }
      return {
        status: body.status
      };
    });
  }
  async updateLocation(user, point) {
    const driver = await this.driverFor(user);
    ensure(driver.status !== "OFFLINE", "CONFLICT", "Tài xế ngoại tuyến không gửi vị trí.");
    await this.store.update("drivers", {
      id: driver.id
    }, {
      ...location(point),
      location_at: this.clock(),
      updated_at: this.clock()
    });
    return {
      updatedAt: this.clock()
    };
  }
  async respond(user, offerId, accept) {
    return await this.store.transaction(async () => {
      const driver = await this.driverFor(user);
      const offer = await this.store.offer(integer(offerId, "offerId"));
      ensure(offer, "NOT_FOUND", "Không tìm thấy lời mời.");
      ensure(offer.driver_id === driver.id, "FORBIDDEN", "Lời mời không thuộc tài xế này.");
      const at = this.clock();
      ensure(offer.status === "PENDING" && offer.expires_at > at, "CONFLICT", "Lời mời đã hết hạn hoặc đã được xử lý.");
      const order = await this.store.order(offer.order_id);
      ensure(order.status === "READY_FOR_PICKUP" && order.driver_id === null && driver.status === "AVAILABLE", "CONFLICT", "Đơn hoặc tài xế đã thay đổi.");
      if (!accept) {
        await this.skip(offer, "DECLINED");
        return {
          declined: true,
          orderId: order.id
        };
      }
      const accepted = await this.store.update("driver_offers", {
        id: offer.id,
        status: "PENDING"
      }, {
        status: "ACCEPTED"
      });
      ensure(accepted === 1, "CONFLICT", "Lời mời đã được xử lý.");
      const reserved = await this.store.update("drivers", {
        id: driver.id,
        status: "AVAILABLE"
      }, {
        status: "BUSY",
        updated_at: at
      });
      ensure(reserved === 1, "CONFLICT", "Tài xế đã nhận đơn khác.");
      this.fault("afterDriverBusy");
      const changed = await this.store.update("orders", {
        id: order.id,
        version: order.version,
        driver_id: null
      }, {
        driver_id: driver.id,
        status: "DRIVER_ASSIGNED",
        version: order.version + 1,
        updated_at: at
      });
      ensure(changed === 1, "CONFLICT", "Đơn đã được gán.");
      await this.store.history(order.id, "DRIVER_ASSIGNED", user.id, at);
      await this.notifications.statusChanged({
        ...order,
        driver_id: driver.id
      }, "DRIVER_ASSIGNED");
      this.fault("afterAssignmentHistory");
      return {
        order: await this.store.orderView(order.id)
      };
    });
  }
  async board(user) {
    const driver = await this.driverFor(user);
    const at = this.clock();
    const offer = (await this.store.rows("driver_offers", {
      driver_id: driver.id,
      status: "PENDING"
    })).find(item => item.expires_at > at);
    const orders = await this.store.rows("orders", {
      driver_id: driver.id
    });
    const active = await orders.find(order => !["DELIVERED", "CANCELLED"].includes(order.status));
    const history = (await orders.filter(order => order.status === "DELIVERED")).sort((a, b) => b.updated_at - a.updated_at);
    const dayStart = new Date(at).setHours(0, 0, 0, 0);
    const today = history.filter(order => order.updated_at >= dayStart);
    return {
      driver: {
        id: driver.id,
        name: user.name,
        status: driver.status,
        locked: Boolean(driver.locked),
        locationAt: driver.location_at,
        lat: driver.lat,
        lng: driver.lng
      },
      offer: offer ? {
        ...(await this.store.orderView(offer.order_id)),
        offerId: offer.id,
        expiresAt: offer.expires_at,
        // Khoảng cách tài xế → nhà hàng lúc mời; distanceKm của đơn là nhà hàng → điểm giao.
        driverDistanceKm: offer.distance_km
      } : null,
      active: active ? await this.store.orderView(active.id) : null,
      history: await Promise.all(history.slice(0, 20).map(async order => await this.store.orderView(order.id))),
      summary: {
        earningsToday: today.reduce((sum, order) => sum + order.delivery_fee, 0),
        deliveredToday: today.length
      }
    };
  }
}
