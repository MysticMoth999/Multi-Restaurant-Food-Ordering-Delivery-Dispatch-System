/*
 * Lớp gọi API của View. Mọi trang chỉ lấy dữ liệu qua đây (mục 15.3).
 * Hiện gọi backend giả lập trong mock-backend.js; khi có backend thật, đổi USE_MOCK = false và đặt API_BASE.
 */
(() => {
    const USE_MOCK = true;
    const API_BASE = "/api";
    const TOKEN_KEY = "gomeal.token";

    const token = {
        get() {
            try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY); } catch { return null; }
        },
        set(value, remember) {
            try { (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, value); } catch { /* bỏ qua */ }
        },
        clear() {
            try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch { /* bỏ qua */ }
        }
    };

    class ApiError extends Error {
        constructor(status, message, data) { super(message); this.status = status; this.data = data; }
    }

    async function request(method, path, body) {
        const auth = token.get();
        let res;
        if (USE_MOCK) {
            await new Promise(r => setTimeout(r, 150)); // giả độ trễ mạng
            res = window.GoMealBackend.handle(method, path, body && JSON.parse(JSON.stringify(body)), auth);
        } else {
            const r = await fetch(API_BASE + path, {
                method,
                headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer " + auth } : {}) },
                body: body ? JSON.stringify(body) : undefined
            });
            res = { status: r.status, ...(await r.json().catch(() => ({}))) };
        }
        if (res.status >= 400) {
            if (res.status === 401) token.clear();
            throw new ApiError(res.status, res.error || "Có lỗi xảy ra, vui lòng thử lại.", res.data);
        }
        return res.data;
    }
    const get = path => request("GET", path);
    const post = (path, body) => request("POST", path, body);
    const put = (path, body) => request("PUT", path, body);
    const patch = (path, body) => request("PATCH", path, body);

    window.api = {
        token, ApiError,
        auth: {
            async login(email, password, remember) {
                const data = await post("/auth/login", { email, password });
                token.set(data.token, remember);
                return data.user; // vai trò lấy từ phản hồi gắn với token
            },
            register: body => post("/auth/register", body),
            async logout() { await post("/auth/logout").catch(() => {}); token.clear(); },
            me: () => get("/me").then(d => d.user),
            updatePhone: phone => patch("/me", { phone }).then(d => d.user)
        },
        restaurants: {
            list: q => get("/restaurants?q=" + encodeURIComponent(q || "")).then(d => d.items),
            menu: id => get(`/restaurants/${id}/menu`)
        },
        cart: { quote: (restaurantId, items) => post("/cart/quote", { restaurantId, items }) },
        orders: {
            create: body => post("/orders", body).then(d => d.order),
            mine: (page = 1) => get("/orders/mine?page=" + page),
            get: id => get(`/orders/${id}`).then(d => d.order),
            cancel: (id, reason) => post(`/orders/${id}/cancel`, { reason }).then(d => d.order)
        },
        manager: {
            dashboard: () => get("/manager/dashboard"),
            updateRestaurant: body => patch("/manager/restaurant", body),
            addItem: body => post("/manager/menu", body),
            updateItem: (id, body) => patch(`/manager/menu/${id}`, body),
            nextStatus: id => post(`/manager/orders/${id}/next`),
            cancel: (id, reason) => post(`/manager/orders/${id}/cancel`, { reason })
        },
        driver: {
            board: () => get("/driver/board"),
            setStatus: (status, location) => put("/driver/status", { status, location }),
            sendLocation: location => put("/driver/location", location),
            accept: id => post(`/driver/offers/${id}/accept`),
            decline: id => post(`/driver/offers/${id}/decline`),
            nextStatus: (id, codCollected) => post(`/driver/orders/${id}/next`, { codCollected })
        },
        admin: {
            dashboard: () => get("/admin/dashboard"),
            setRestaurantStatus: (id, status) => patch(`/admin/restaurants/${id}`, { status }),
            setDriverLocked: (id, locked) => patch(`/admin/drivers/${id}`, { locked }),
            reset: () => post("/admin/reset")
        }
    };
})();
