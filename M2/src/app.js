import express from "express";
import { randomUUID } from "node:crypto";
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

const HTTP_STATUS = {
    VALIDATION: 400,
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    PRICE_CHANGED: 409,
    PAYMENT_FAILED: 422,
    RATE_LIMIT: 429,
};

export function createSystem(options = {}) {
    const store = options.store ?? new MemoryStore();
    const clock = options.clock ?? Date.now;
    const logger = options.logger ?? ((event) => console.error(JSON.stringify(event)));
    const billing = new BillingService(store, options.deliveryFee ?? 15000);
    const cart = new CartService(store, billing);
    const auth = new AuthService(store, clock);
    const payment = new MockPaymentService(store, options.mockResult ?? "SUCCESS");
    const orders = new OrderLifecycleService(store, billing, payment, clock, options.fault);
    const dispatch = new DispatchService(store, clock, options.fault);
    const catalog = new CatalogService(store, billing.deliveryFee);
    const admin = new AdminService(store, clock, catalog);
    const tick = () => {
        try {
            dispatch.tick();
        } catch (error) {
            logger({ event: "dispatch_failed", code: error.code ?? "INTERNAL", at: clock() });
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
        tick,
    };
}

// Controllers below only parse/authenticate, call services and map domain errors to HTTP.
export function createApp(system, options = {}) {
    const app = express();
    const { auth, billing, cart, orders, dispatch, catalog, admin, tick, logger } = system;
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
    app.use(express.json({ limit: "32kb" }));
    app.use((req, res, next) => {
        if (["POST", "PUT", "PATCH"].includes(req.method)) {
            req.body ??= {};
            ensure(
                req.body && typeof req.body === "object" && !Array.isArray(req.body),
                "VALIDATION",
                "Body phải là JSON object."
            );
        }
        next();
    });
    const identify = (req, res, next) => {
        const header = req.get("Authorization") ?? "";
        ensure(header.startsWith("Bearer "), "UNAUTHENTICATED", "Cần Bearer token.");
        req.token = header.slice(7);
        req.user = auth.authenticate(req.token);
        next();
    };
    const role = (expected) => (req, res, next) => {
        ensure(req.user.role === expected, "FORBIDDEN", "Vai trò không được phép.");
        next();
    };
    const send = (handler) => (req, res) => res.json({ data: handler(req) });
    const id = (req) => integer(Number(req.params.id), "id");
    const attempts = new Map();
    const throttle = (req, res, next) => {
        const now = system.clock();
        for (const [key, value] of attempts) {
            if (value.until <= now) {
                attempts.delete(key);
            }
        }
        const key = req.ip;
        const entry = attempts.get(key) ?? { count: 0, until: now + 60_000 };
        entry.count += 1;
        attempts.set(key, entry);
        ensure(entry.count <= 30, "RATE_LIMIT", "Quá nhiều lần thử. Chờ một phút.");
        next();
    };

    app.get(
        "/api/health",
        send(() => ({ status: "ok", module: "M2" }))
    );
    app.post(
        "/api/auth/register",
        throttle,
        send((req) => ({ user: auth.register(req.body) }))
    );
    app.post(
        "/api/auth/login",
        throttle,
        send((req) => auth.login(req.body))
    );
    app.post(
        "/api/auth/logout",
        identify,
        send((req) => {
            auth.logout(req.token);
            return {};
        })
    );
    app.get(
        "/api/me",
        identify,
        send((req) => ({ user: userView(req.user) }))
    );
    app.patch(
        "/api/me",
        identify,
        send((req) => ({ user: auth.updatePhone(req.user, req.body.phone) }))
    );
    app.get(
        "/api/restaurants",
        send((req) => catalog.list(req.query))
    );
    app.get(
        "/api/restaurants/:id/menu",
        send((req) => catalog.menu(id(req)))
    );
    app.post(
        "/api/cart/quote",
        send((req) => billing.quote(req.body.restaurantId, req.body.items))
    );
    app.post(
        "/api/orders",
        identify,
        role("CUSTOMER"),
        send((req) => orders.create(req.user, req.body))
    );
    app.get(
        "/api/cart",
        identify,
        role("CUSTOMER"),
        send((req) => cart.get(req.user))
    );
    app.post(
        "/api/cart/items",
        identify,
        role("CUSTOMER"),
        send((req) => cart.add(req.user, req.body))
    );
    app.patch(
        "/api/cart/items",
        identify,
        role("CUSTOMER"),
        send((req) => cart.change(req.user, req.body))
    );
    app.post(
        "/api/cart/items/remove",
        identify,
        role("CUSTOMER"),
        send((req) => cart.change(req.user, req.body, true))
    );
    app.delete(
        "/api/cart",
        identify,
        role("CUSTOMER"),
        send((req) => cart.clear(req.user))
    );
    app.get(
        "/api/orders/mine",
        identify,
        role("CUSTOMER"),
        send((req) => orders.mine(req.user, Number(req.query.page ?? 1)))
    );
    app.get(
        "/api/orders/:id",
        identify,
        send((req) => ({ order: orders.get(req.user, id(req)) }))
    );
    app.post(
        "/api/orders/:id/cancel",
        identify,
        role("CUSTOMER"),
        send((req) => ({ order: orders.cancel(req.user, id(req), req.body) }))
    );
    app.post(
        "/api/orders/:id/transitions",
        identify,
        send((req) => {
            const order = orders.transition(req.user, id(req), req.body);
            tick();
            return {
                order,
                orderId: order.id,
                previousStatus: order.history.at(-2)?.status ?? order.status,
                currentStatus: order.status,
                updatedAt: order.updatedAt,
            };
        })
    );
    app.get(
        "/api/manager/dashboard",
        identify,
        role("MANAGER"),
        send((req) =>
            catalog.managerDashboard(
                req.user,
                req.query.restaurantId === undefined
                    ? undefined
                    : integer(Number(req.query.restaurantId), "restaurantId")
            )
        )
    );
    app.post(
        "/api/manager/menu",
        identify,
        role("MANAGER"),
        send((req) => ({ item: catalog.saveItem(req.user, null, req.body) }))
    );
    app.patch(
        "/api/manager/menu/:id",
        identify,
        role("MANAGER"),
        send((req) => ({ item: catalog.saveItem(req.user, id(req), req.body) }))
    );
    app.post(
        "/api/manager/menu/:id/options",
        identify,
        role("MANAGER"),
        send((req) => ({ item: catalog.saveOption(req.user, id(req), null, req.body) }))
    );
    app.patch(
        "/api/manager/menu/:id/options/:optionId",
        identify,
        role("MANAGER"),
        send((req) => ({
            item: catalog.saveOption(
                req.user,
                id(req),
                integer(Number(req.params.optionId), "optionId"),
                req.body
            ),
        }))
    );
    app.post(
        "/api/manager/orders/:id/cancel",
        identify,
        role("MANAGER"),
        send((req) => ({ order: orders.cancel(req.user, id(req), req.body) }))
    );
    app.get(
        "/api/driver/board",
        identify,
        role("DRIVER"),
        send((req) => dispatch.board(req.user))
    );
    app.put(
        "/api/driver/status",
        identify,
        role("DRIVER"),
        send((req) => {
            const result = dispatch.setStatus(req.user, req.body);
            tick();
            return result;
        })
    );
    app.put(
        "/api/driver/location",
        identify,
        role("DRIVER"),
        send((req) => dispatch.updateLocation(req.user, req.body))
    );
    app.post(
        "/api/driver/offers/:id/accept",
        identify,
        role("DRIVER"),
        send((req) => dispatch.respond(req.user, id(req), true))
    );
    app.post(
        "/api/driver/offers/:id/decline",
        identify,
        role("DRIVER"),
        send((req) => {
            const result = dispatch.respond(req.user, id(req), false);
            tick();
            return result;
        })
    );
    app.get(
        "/api/admin/dashboard",
        identify,
        role("ADMIN"),
        send((req) => admin.dashboard(req.user))
    );
    app.patch(
        "/api/admin/restaurants/:id",
        identify,
        role("ADMIN"),
        send((req) => ({ restaurant: admin.restaurantStatus(req.user, id(req), req.body.status) }))
    );
    app.patch(
        "/api/admin/drivers/:id",
        identify,
        role("ADMIN"),
        send((req) => {
            const result = admin.lockDriver(req.user, id(req), req.body.locked);
            tick();
            return result;
        })
    );
    app.use((req, res) =>
        res
            .status(404)
            .json({ code: "NOT_FOUND", error: "API không tồn tại.", requestId: req.requestId })
    );
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
            message = "JSON không hợp lệ hoặc body quá lớn.";
        }
        // No body, Authorization header, password, token or stack trace is logged.
        logger({
            event: "request_failed",
            requestId: req.requestId,
            code,
            status,
            at: system.clock(),
        });
        res.status(status).json({
            code,
            error: message,
            requestId: req.requestId,
            ...(error.details ? { data: error.details } : {}),
        });
    });
    return app;
}
