import express from "express";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "./adapters/memory-store.js";
import { DomainError, ensure, integer } from "./domain/errors.js";
import { AuthService, userView } from "./services/auth-service.js";
import { BillingService } from "./services/billing-service.js";
import { MockPaymentService } from "./services/payment-service.js";
import { OrderLifecycleService } from "./services/order-service.js";
import { DispatchService } from "./services/dispatch-service.js";
import { CatalogService } from "./services/catalog-service.js";
import { AdminService } from "./services/admin-service.js";
import { CartService } from "./services/cart-service.js";
import { NotificationService } from "./services/notification-service.js";
import { MAX_IMAGE_BYTES } from "./services/catalog-service.js";
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const UPLOAD_DIR = fileURLToPath(new URL("../uploads/", import.meta.url));
const HTTP_STATUS = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRICE_CHANGED: 409,
  PAYMENT_FAILED: 422,
  RATE_LIMIT: 429
};
export function createSystem(options = {}) {
  const store = options.store ?? new MemoryStore();
  const clock = options.clock ?? Date.now;
  const logger = options.logger ?? (event => console.error(JSON.stringify(event)));
  const uploadDir = options.uploadDir ?? UPLOAD_DIR;
  const billing = new BillingService(store, clock);
  const cart = new CartService(store, billing);
  const auth = new AuthService(store, clock);
  const payment = new MockPaymentService(store, options.mockResult ?? "SUCCESS");
  const notifications = new NotificationService(store, clock);
  const orders = new OrderLifecycleService(store, billing, payment, clock, options.fault, notifications);
  const dispatch = new DispatchService(store, clock, options.fault, notifications);
  const catalog = new CatalogService(store, billing, uploadDir);
  const admin = new AdminService(store, clock, catalog, billing);
  const tick = async () => {
    try {
      await dispatch.tick();
    } catch (error) {
      logger({
        event: "dispatch_failed",
        code: error.code ?? "INTERNAL",
        at: clock()
      });
    }
  };
  return {
    store,
    clock,
    logger,
    billing,
    cart,
    auth,
    payment,
    orders,
    dispatch,
    catalog,
    admin,
    notifications,
    uploadDir,
    tick
  };
}

// Controllers below only parse/authenticate, call services and map domain errors to HTTP.
export function createApp(system, options = {}) {
  const app = express();
  const {
    auth,
    billing,
    cart,
    orders,
    dispatch,
    catalog,
    admin,
    notifications,
    tick,
    logger
  } = system;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set("X-Request-Id", req.requestId);
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "no-store");
    const origin = req.get("Origin");
    if (options.corsOrigin && origin === options.corsOrigin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });
  // Ảnh: ảnh mẫu kèm mã nguồn (public/) và ảnh quản lý tải lên (uploads/); ghi đè Cache-Control no-store ở trên.
  app.use("/media/uploads", express.static(system.uploadDir, {
    maxAge: "1d",
    index: false
  }));
  app.use("/media", express.static(PUBLIC_DIR, {
    maxAge: "1d",
    index: false
  }));
  // Phục vụ luôn giao diện M1 (cùng cổng với API) khi chạy cả dự án từ một thư mục.
  if (options.uiDir) {
    app.use(express.static(options.uiDir, {
      index: "index.html"
    }));
  }
  app.use(express.json({
    limit: "32kb"
  }));
  app.use((req, res, next) => {
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      req.body ??= {};
      ensure(req.body && typeof req.body === "object" && !Array.isArray(req.body), "VALIDATION", "Body phải là JSON object.");
    }
    next();
  });
  const identify = async (req, res, next) => {
    const header = req.get("Authorization") ?? "";
    ensure(header.startsWith("Bearer "), "UNAUTHENTICATED", "Cần Bearer token.");
    req.token = header.slice(7);
    req.user = await auth.authenticate(req.token);
    next();
  };
  // Báo giá công khai; có token thì gắn khách để kiểm voucher.
  const maybeIdentify = async (req, res, next) => (req.get("Authorization") ? identify(req, res, next) : next());
  const role = expected => (req, res, next) => {
    ensure(req.user.role === expected, "FORBIDDEN", "Vai trò không được phép.");
    next();
  };
  const send = handler => async (req, res) => res.json({
    data: await handler(req)
  });
  const id = req => integer(Number(req.params.id), "id");
  const attempts = new Map();
  const throttle = (req, res, next) => {
    const now = system.clock();
    for (const [key, value] of attempts) {
      if (value.until <= now) {
        attempts.delete(key);
      }
    }
    const key = req.ip;
    const entry = attempts.get(key) ?? {
      count: 0,
      until: now + 60_000
    };
    entry.count += 1;
    attempts.set(key, entry);
    ensure(entry.count <= 30, "RATE_LIMIT", "Quá nhiều lần thử. Chờ một phút.");
    next();
  };
  app.get("/api/health", send(() => ({
    status: "ok",
    module: "M2"
  })));
  app.post("/api/auth/register", throttle, send(async req => ({
    user: await auth.register(req.body)
  })));
  app.post("/api/auth/login", throttle, send(async req => await auth.login(req.body)));
  app.post("/api/auth/logout", identify, send(async req => {
    await auth.logout(req.token);
    return {};
  }));
  app.get("/api/me", identify, send(req => ({
    user: userView(req.user)
  })));
  app.patch("/api/me", identify, send(async req => ({
    user: await auth.updatePhone(req.user, req.body.phone)
  })));
  app.get("/api/restaurants", send(async req => await catalog.list(req.query)));
  app.get("/api/restaurants/:id/menu", send(async req => await catalog.menu(id(req))));
  app.get("/api/pricing", send(async () => await billing.pricing()));
  app.post("/api/cart/quote", maybeIdentify, send(async req => await billing.quote(req.body.restaurantId, req.body.items, {
    deliveryLocation: req.body.deliveryLocation,
    voucherCode: req.body.voucherCode,
    customerId: req.user?.role === "CUSTOMER" ? req.user.id : null
  })));
  app.get("/api/vouchers/mine", identify, role("CUSTOMER"), send(async req => ({
    items: await billing.availableVouchers(req.user)
  })));
  app.get("/api/notifications", identify, send(async req => await notifications.list(req.user, Number(req.query.after ?? 0))));
  app.post("/api/notifications/read", identify, send(async req => await notifications.markRead(req.user, req.body)));
  app.post("/api/orders", identify, role("CUSTOMER"), send(async req => await orders.create(req.user, req.body)));
  app.get("/api/cart", identify, role("CUSTOMER"), send(async req => await cart.get(req.user)));
  app.post("/api/cart/items", identify, role("CUSTOMER"), send(async req => await cart.add(req.user, req.body)));
  app.patch("/api/cart/items", identify, role("CUSTOMER"), send(async req => await cart.change(req.user, req.body)));
  app.post("/api/cart/items/remove", identify, role("CUSTOMER"), send(async req => await cart.change(req.user, req.body, true)));
  app.delete("/api/cart", identify, role("CUSTOMER"), send(async req => await cart.clear(req.user)));
  app.get("/api/orders/mine", identify, role("CUSTOMER"), send(async req => await orders.mine(req.user, Number(req.query.page ?? 1))));
  app.get("/api/orders/:id", identify, send(async req => ({
    order: await orders.get(req.user, id(req))
  })));
  app.post("/api/orders/:id/cancel", identify, role("CUSTOMER"), send(async req => ({
    order: await orders.cancel(req.user, id(req), req.body)
  })));
  app.post("/api/orders/:id/transitions", identify, send(async req => {
    const order = await orders.transition(req.user, id(req), req.body);
    await tick();
    return {
      order,
      orderId: order.id,
      previousStatus: order.history.at(-2)?.status ?? order.status,
      currentStatus: order.status,
      updatedAt: order.updatedAt
    };
  }));
  app.get("/api/manager/dashboard", identify, role("MANAGER"), send(async req => await catalog.managerDashboard(req.user, req.query.restaurantId === undefined ? undefined : integer(Number(req.query.restaurantId), "restaurantId"))));
  app.post("/api/manager/menu", identify, role("MANAGER"), send(async req => ({
    item: await catalog.saveItem(req.user, null, req.body)
  })));
  app.patch("/api/manager/menu/:id", identify, role("MANAGER"), send(async req => ({
    item: await catalog.saveItem(req.user, id(req), req.body)
  })));
  app.post("/api/manager/menu/:id/image", identify, role("MANAGER"), express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: MAX_IMAGE_BYTES
  }), send(async req => ({
    item: await catalog.setImage(req.user, id(req), req.body)
  })));
  app.post("/api/manager/menu/:id/options", identify, role("MANAGER"), send(async req => ({
    item: await catalog.saveOption(req.user, id(req), null, req.body)
  })));
  app.patch("/api/manager/menu/:id/options/:optionId", identify, role("MANAGER"), send(async req => ({
    item: await catalog.saveOption(req.user, id(req), integer(Number(req.params.optionId), "optionId"), req.body)
  })));
  app.post("/api/manager/orders/:id/cancel", identify, role("MANAGER"), send(async req => ({
    order: await orders.cancel(req.user, id(req), req.body)
  })));
  app.get("/api/driver/board", identify, role("DRIVER"), send(async req => await dispatch.board(req.user)));
  app.put("/api/driver/status", identify, role("DRIVER"), send(async req => {
    const result = await dispatch.setStatus(req.user, req.body);
    await tick();
    return result;
  }));
  app.put("/api/driver/location", identify, role("DRIVER"), send(async req => await dispatch.updateLocation(req.user, req.body)));
  app.post("/api/driver/offers/:id/accept", identify, role("DRIVER"), send(async req => await dispatch.respond(req.user, id(req), true)));
  app.post("/api/driver/offers/:id/decline", identify, role("DRIVER"), send(async req => {
    const result = await dispatch.respond(req.user, id(req), false);
    await tick();
    return result;
  }));
  app.get("/api/admin/dashboard", identify, role("ADMIN"), send(async req => await admin.dashboard(req.user)));
  app.patch("/api/admin/restaurants/:id", identify, role("ADMIN"), send(async req => ({
    restaurant: await admin.restaurantStatus(req.user, id(req), req.body.status)
  })));
  app.patch("/api/admin/settings", identify, role("ADMIN"), send(async req => ({
    pricing: await admin.setFuelPrice(req.user, req.body.fuelPrice)
  })));
  app.get("/api/admin/vouchers", identify, role("ADMIN"), send(async req => ({
    items: await admin.vouchers(req.user)
  })));
  app.post("/api/admin/vouchers", identify, role("ADMIN"), send(async req => ({
    voucher: await admin.createVoucher(req.user, req.body)
  })));
  app.patch("/api/admin/vouchers/:id", identify, role("ADMIN"), send(async req => ({
    voucher: await admin.setVoucherActive(req.user, id(req), req.body.active)
  })));
  app.patch("/api/admin/drivers/:id", identify, role("ADMIN"), send(async req => {
    const result = await admin.lockDriver(req.user, id(req), req.body.locked);
    await tick();
    return result;
  }));
  app.use((req, res) => res.status(404).json({
    code: "NOT_FOUND",
    error: "API không tồn tại.",
    requestId: req.requestId
  }));
  app.use((error, req, res, next) => {
    let status = 500;
    let code = "INTERNAL";
    let message = "Lỗi hệ thống; hãy thử lại.";
    if (error instanceof DomainError) {
      status = HTTP_STATUS[error.code] ?? 400;
      code = error.code;
      message = error.message;
    } else if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
      status = error.type === "entity.too.large" ? 413 : 400;
      code = "VALIDATION";
      message = req.path.endsWith("/image") ? "Ảnh tối đa 2 MB." : "JSON không hợp lệ hoặc body quá lớn.";
    }
    // No body, Authorization header, password, token or stack trace is logged.
    logger({
      event: "request_failed",
      requestId: req.requestId,
      code,
      status,
      at: system.clock()
    });
    res.status(status).json({
      code,
      error: message,
      requestId: req.requestId,
      ...(error.details ? {
        data: error.details
      } : {})
    });
  });
  return app;
}
