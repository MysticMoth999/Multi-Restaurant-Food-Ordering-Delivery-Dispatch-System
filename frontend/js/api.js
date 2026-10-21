/*
 * Lớp gọi API của View. Mọi trang chỉ lấy dữ liệu qua đây (mục 15.3).
 * Nối backend M2 (docs/API.md). Muốn chạy lại bản giả lập: đặt USE_MOCK = true và nạp mock-backend.js trước file này.
 * Lỗi của M2 có dạng { code, error, requestId, data? }; ApiError giữ nguyên các trường đó cho trang xử lý.
 */
(() => {
    const USE_MOCK = false;
    // Trang do backend phục vụ (npm start ở gốc repo) thì gọi API cùng địa chỉ trang;
    // mở bằng server tĩnh riêng (Live Server cổng 5500) hoặc file:// thì gọi backend ở 127.0.0.1:3000.
    const API_ORIGIN = location.protocol.startsWith("http") && location.port !== "5500" ? location.origin : "http://127.0.0.1:3000";
    const API_BASE = API_ORIGIN + "/api";
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

    // Thông báo dễ hiểu theo mã HTTP khi backend không gửi kèm câu chữ.
    const FALLBACK = {
        0: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
        401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
        403: "Tài khoản không có quyền thực hiện thao tác này.",
        404: "Không tìm thấy dữ liệu yêu cầu.",
        409: "Dữ liệu vừa thay đổi. Trang sẽ tải lại để bạn kiểm tra.",
        422: "Thanh toán mô phỏng không thành công. Vui lòng chọn cách khác hoặc thử lại.",
        429: "Bạn thử quá nhiều lần. Vui lòng chờ một phút rồi thử lại."
    };

    class ApiError extends Error {
        constructor(status, code, message, data, requestId) {
            super(message || FALLBACK[status] || "Có lỗi xảy ra, vui lòng thử lại.");
            this.status = status; // 0 = lỗi mạng, chưa biết backend đã nhận yêu cầu hay chưa
            this.code = code;     // VALIDATION, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, PRICE_CHANGED, PAYMENT_FAILED, RATE_LIMIT
            this.data = data;     // ví dụ PRICE_CHANGED kèm data.quote mới
            this.requestId = requestId;
        }
        get network() { return this.status === 0; }
        get conflict() { return this.status === 409; }
    }

    // file: ảnh gửi thẳng dạng nhị phân (Content-Type image/*), không bọc JSON.
    async function request(method, path, body, file) {
        const auth = token.get();
        let res;
        if (USE_MOCK) {
            await new Promise(r => setTimeout(r, 150)); // giả độ trễ mạng
            res = window.GoMealBackend.handle(method, path, body && JSON.parse(JSON.stringify(body)), auth);
        } else {
            let r;
            try {
                r = await fetch(API_BASE + path, {
                    method,
                    headers: { ...(file ? { "Content-Type": file.type } : body ? { "Content-Type": "application/json" } : {}), ...(auth ? { Authorization: "Bearer " + auth } : {}) },
                    body: file || (body ? JSON.stringify(body) : undefined)
                });
            } catch {
                throw new ApiError(0, "NETWORK");
            }
            res = { status: r.status, requestId: r.headers.get("X-Request-Id"), ...(await r.json().catch(() => ({}))) };
        }
        if (res.status >= 400) {
            if (res.status === 401) token.clear();
            throw new ApiError(res.status, res.code, res.error, res.data, res.requestId);
        }
        return res.data;
    }
    const get = path => request("GET", path);
    const post = (path, body = {}) => request("POST", path, body);
    const put = (path, body) => request("PUT", path, body);
    const patch = (path, body) => request("PATCH", path, body);

    // Một yêu cầu đổi trạng thái đơn: targetStatus + version của đơn đang hiển thị (M2 trả 409 nếu đơn đã đổi).
    const transition = (order, targetStatus, extra) =>
        post(`/orders/${order.id}/transitions`, { targetStatus, expectedVersion: order.version, ...extra }).then(d => d.order);

    window.api = {
        token, ApiError,
        // Đường dẫn ảnh backend trả về dạng /media/...; ghép với địa chỉ backend để hiển thị.
        media: url => (url ? API_ORIGIN + url : null),
        pricing: () => get("/pricing"),
        vouchers: () => get("/vouchers/mine").then(d => d.items),
        notifications: {
            list: (after = 0) => get("/notifications?after=" + after),
            readAll: () => post("/notifications/read", { all: true })
        },
        auth: {
            async login(email, password, remember) {
                const data = await post("/auth/login", { email, password });
                token.set(data.token, remember);
                return data.user; // vai trò lấy từ phản hồi gắn với token
            },
            register: body => post("/auth/register", body).then(d => d.user),
            async logout() { await post("/auth/logout").catch(() => {}); token.clear(); },
            me: () => get("/me").then(d => d.user),
            updatePhone: phone => patch("/me", { phone }).then(d => d.user)
        },
        restaurants: {
            list: q => get("/restaurants?q=" + encodeURIComponent(q || "")).then(d => d.items),
            menu: id => get(`/restaurants/${id}/menu`)
        },
        cart: {
            // items: [{ menuItemId, quantity, selectedOptionIds }]; extra: { deliveryLocation, voucherCode }
            // → { lines, subtotal, distanceKm, deliveryFee, discounts, discount, total, quoteFingerprint }
            quote: (restaurantId, items, extra = {}) => post("/cart/quote", { restaurantId, items, ...extra })
        },
        orders: {
            // body gồm quoteFingerprint và requestKey; trả { order, replayed }
            create: body => post("/orders", body),
            mine: (page = 1) => get("/orders/mine?page=" + page),
            get: id => get(`/orders/${id}`).then(d => d.order),
            cancel: (order, reason) => post(`/orders/${order.id}/cancel`, { expectedVersion: order.version, ...(reason ? { reason } : {}) }).then(d => d.order)
        },
        manager: {
            dashboard: () => get("/manager/dashboard"),
            addItem: body => post("/manager/menu", body).then(d => d.item),
            updateItem: (id, body) => patch(`/manager/menu/${id}`, body).then(d => d.item),
            uploadImage: (id, file) => request("POST", `/manager/menu/${id}/image`, null, file).then(d => d.item),
            transition,
            cancel: (order, reason) => post(`/manager/orders/${order.id}/cancel`, { expectedVersion: order.version, reason }).then(d => d.order)
        },
        driver: {
            board: () => get("/driver/board"),
            setStatus: (status, location) => put("/driver/status", status === "OFFLINE" ? { status } : { status, location }),
            sendLocation: location => put("/driver/location", location),
            accept: offerId => post(`/driver/offers/${offerId}/accept`).then(d => d.order),
            decline: offerId => post(`/driver/offers/${offerId}/decline`),
            transition
        },
        admin: {
            dashboard: () => get("/admin/dashboard"),
            setRestaurantStatus: (id, status) => patch(`/admin/restaurants/${id}`, { status }),
            setDriverLocked: (id, locked) => patch(`/admin/drivers/${id}`, { locked }),
            setFuelPrice: fuelPrice => patch("/admin/settings", { fuelPrice }).then(d => d.pricing),
            createVoucher: body => post("/admin/vouchers", body).then(d => d.voucher),
            setVoucherActive: (id, active) => patch(`/admin/vouchers/${id}`, { active }).then(d => d.voucher)
        }
    };
})();
