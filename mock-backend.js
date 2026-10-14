/*
 * GoMeal — backend giả lập, chỉ để minh họa UI.
 * Làm thay backend thật những việc mà View không được tự làm: cấp token kèm vai trò (FR-12), tính tiền (BR-03),
 * chuyển trạng thái đơn (mục 8) và mời tài xế gần nhất (mục 7.4). Không có transaction, idempotency hay bảo mật thật.
 * Dữ liệu lưu trong localStorage để các trang dùng chung. Trang không gọi file này trực tiếp mà đi qua api.js.
 */
(() => {
    const DB_KEY = "gomeal.demo-db.v1";
    const DELIVERY_FEE = 15000; // BR-03: phí giao cố định trong cấu hình
    const MINUTE = 60000;
    const RETRY_MS = 30000; // không còn tài xế để mời thì thử lại sau 30 giây
    const now = () => Date.now();

    const STATUS_TEXT = {
        PENDING: "Chờ xác nhận", CONFIRMED: "Đã xác nhận", PREPARING: "Đang chuẩn bị", READY_FOR_PICKUP: "Chờ tài xế",
        DRIVER_ASSIGNED: "Đã có tài xế", PICKED_UP: "Đã lấy món", DELIVERING: "Đang giao", DELIVERED: "Hoàn thành", CANCELLED: "Đã hủy"
    };
    const NEXT_BY_MANAGER = { PENDING: "CONFIRMED", CONFIRMED: "PREPARING", PREPARING: "READY_FOR_PICKUP" };
    const NEXT_BY_DRIVER = { DRIVER_ASSIGNED: "PICKED_UP", PICKED_UP: "DELIVERING", DELIVERING: "DELIVERED" };
    const PHONE_RE = /^0\d{9}$/;

    class ApiError extends Error {
        constructor(status, message, data) { super(message); this.status = status; this.data = data; }
    }
    const fail = (status, message, data) => { throw new ApiError(status, message, data); };

    // ---------- Dữ liệu mẫu ----------
    function seed() {
        const t = now();
        const options = {
            portion: { id: "portion", name: "Phần", options: [{ id: "portion-2", name: "2 miếng", surcharge: 0 }, { id: "portion-4", name: "4 miếng", surcharge: 35000 }] },
            wasabi: { id: "wasabi", name: "Wasabi", options: [{ id: "wasabi-vua", name: "Vừa", surcharge: 0 }, { id: "wasabi-nhieu", name: "Nhiều", surcharge: 0 }, { id: "wasabi-khong", name: "Không", surcharge: 0 }] },
            sauce: { id: "sauce", name: "Sốt chấm", options: [{ id: "sauce-shoyu", name: "Shoyu", surcharge: 0 }, { id: "sauce-mayo", name: "Mayo cay", surcharge: 3000 }, { id: "sauce-unagi", name: "Unagi", surcharge: 5000 }] }
        };
        const item = (id, restaurantId, categoryId, name, price, description, image, emoji, groups, available = true) =>
            ({ id, restaurantId, categoryId, name, price, description, image, emoji, optionGroups: groups, available });
        const db = {
            nextId: { user: 100, item: 100, order: 100, code: 2052 },
            sessions: {},
            activity: [],
            optionGroups: options,
            categories: [{ id: "nigiri", name: "Nigiri & sashimi" }, { id: "maki", name: "Maki & set" }, { id: "chien", name: "Chiên & nướng" }],
            // Tài khoản demo, mật khẩu chung "demo123" (chỉ dùng cho prototype).
            users: [
                { id: 1, role: "CUSTOMER", name: "Minh Anh", email: "khach@gomeal.vn", phone: "0912345678" },
                { id: 2, role: "CUSTOMER", name: "Quốc Bảo", email: "quocbao@example.com", phone: "0903111222" },
                { id: 3, role: "CUSTOMER", name: "Thu Hà", email: "thuha@example.com", phone: "0938222333" },
                { id: 4, role: "CUSTOMER", name: "Hải Yến", email: "haiyen@example.com", phone: "0977333444" },
                { id: 11, role: "MANAGER", name: "Hokkaido Sachi", email: "nhahang@gomeal.vn", phone: "0283822888", restaurantId: 1 },
                { id: 21, role: "DRIVER", name: "Nguyễn An", email: "taixe@gomeal.vn", phone: "0905123456", driverId: 1 },
                { id: 22, role: "DRIVER", name: "Trần Văn Nam", email: "taixe2@gomeal.vn", phone: "0905234567", driverId: 2 },
                { id: 23, role: "DRIVER", name: "Lê Minh Khoa", email: "taixe3@gomeal.vn", phone: "0905345678", driverId: 3 },
                { id: 31, role: "ADMIN", name: "Quản trị viên", email: "admin@gomeal.vn", phone: "0909000111" }
            ].map(u => ({ ...u, password: "demo123" })),
            restaurants: [
                { id: 1, name: "Hokkaido Sachi Sushi", cuisine: "Sushi & sashimi · Nhật Bản", address: "25 Nguyễn Trãi, Quận 1", hours: "10:00 – 22:00", lat: 10.7705, lng: 106.6932, status: "ACTIVE", rating: 4.8, ratingCount: 124, eta: "25–35 phút", cover: "hokkaidobackground.jpg", logo: "hokkaidosachi.png" },
                { id: 2, name: "Sushi Góc Phố", cuisine: "Sushi · Nhật Bản", address: "12 Pasteur, Quận 1", hours: "09:00 – 21:00", lat: 10.7765, lng: 106.7009, status: "INACTIVE", rating: 4.5, ratingCount: 38, eta: "20–30 phút", cover: "set-sushi-tong-hop.jpg", logo: null },
                { id: 3, name: "Bếp Nhật Mỗi Ngày", cuisine: "Cơm & món chiên · Nhật Bản", address: "88 Cách Mạng Tháng 8, Quận 3", hours: "10:30 – 21:30", lat: 10.7818, lng: 106.6863, status: "INACTIVE", rating: 4.6, ratingCount: 52, eta: "30–40 phút", cover: "chirashi-don.jpg", logo: null }
            ],
            // Bảng giá chuẩn: trang khách và trang quản lý cùng đọc từ đây nên luôn đồng bộ.
            menuItems: [
                item(1, 1, "nigiri", "Nigiri cá hồi", 45000, "Cá hồi tươi trên cơm sushi.", "salmon_nigiri.jpg", "🍣", ["portion", "wasabi"]),
                item(2, 1, "nigiri", "Sashimi cá hồi", 120000, "8 lát cá hồi cắt dày.", "sashimi-ca-hoi.jpg", "🍣", ["wasabi"]),
                item(3, 1, "maki", "California roll", 85000, "8 miếng: cua, bơ, dưa leo.", "california-roll.jpg", "🍙", ["sauce"]),
                item(4, 1, "nigiri", "Gunkan trứng cá hồi", 65000, "2 miếng, trứng cá hồi ngâm.", "gunkan_salmon.jpg", "🍣", ["wasabi"]),
                item(5, 1, "chien", "Tempura tôm", 79000, "5 con, chiên giòn nhẹ.", "tempura-tom.jpg", "🍤", ["sauce"], false),
                item(7, 1, "nigiri", "Nigiri cá ngừ", 50000, "Cá ngừ đỏ trên cơm sushi.", "nigiri-ca-ngu.jpg", "🍣", ["portion", "wasabi"]),
                item(8, 1, "maki", "Set sushi tổng hợp", 249000, "12 miếng nigiri và maki.", "set-sushi-tong-hop.jpg", "🍱", ["wasabi"]),
                item(9, 1, "maki", "Kappa maki", 55000, "6 miếng cuộn dưa leo.", "kappa-maki.jpg", "🍙", ["wasabi"]),
                item(10, 1, "maki", "Chirashi don", 159000, "Cơm trộn hải sản tươi.", "chirashi-don.jpg", "🍚", ["wasabi"]),
                item(11, 1, "chien", "Gyoza chiên", 59000, "6 viên, vỏ giòn.", "gyoza-chien.jpg", "🥟", ["sauce"]),
                item(13, 1, "nigiri", "Nigiri lươn nướng", 60000, "Lươn nướng sốt unagi.", "nigiri-luon-nuong.jpg", "🍣", ["portion", "wasabi"]),
                item(21, 2, "nigiri", "Nigiri cá hồi", 42000, "2 miếng cá hồi Na Uy.", "salmon_nigiri.jpg", "🍣", ["wasabi"]),
                item(22, 2, "maki", "California roll", 79000, "8 miếng cuộn cua và bơ.", "california-roll.jpg", "🍙", ["sauce"]),
                item(31, 3, "maki", "Chirashi don", 149000, "Cơm trộn cá hồi, cá ngừ.", "chirashi-don.jpg", "🍚", []),
                item(32, 3, "chien", "Gyoza chiên", 55000, "6 viên nhân thịt.", "gyoza-chien.jpg", "🥟", ["sauce"])
            ],
            drivers: [
                { id: 1, name: "Nguyễn An", status: "AVAILABLE", locked: false, lat: 10.7741, lng: 106.6958, locationAt: t, rating: 4.9, ratingCount: 238 },
                { id: 2, name: "Trần Văn Nam", status: "AVAILABLE", locked: false, lat: 10.7862, lng: 106.6801, locationAt: t, rating: 4.7, ratingCount: 112 },
                { id: 3, name: "Lê Minh Khoa", status: "OFFLINE", locked: false, lat: null, lng: null, locationAt: null, rating: 4.8, ratingCount: 64 }
            ],
            orders: []
        };

        // Đơn mẫu, tiền do hàm quote() tính như mọi đơn khác.
        const sample = (code, customerId, restaurantId, items, status, minutesAgo, paymentMethod, driverId, address) => {
            const q = quote(db, restaurantId, items, true); // đơn cũ có thể thuộc nhà hàng nay đã tạm ngưng
            const at = t - minutesAgo * MINUTE;
            const flow = ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "DRIVER_ASSIGNED", "PICKED_UP", "DELIVERING", "DELIVERED"];
            const driverName = driverId ? db.drivers.find(d => d.id === driverId).name : "";
            const history = flow.slice(0, flow.indexOf(status) + 1).map((s, i) => ({
                status: s, at: at + i * 5 * MINUTE,
                by: s === "PENDING" ? "Khách hàng" : i <= 3 ? "Nhà hàng" : "Tài xế " + driverName
            }));
            db.orders.push({
                id: db.nextId.order++, code: "GM-" + code, customerId, restaurantId, driverId, status,
                lines: q.lines, subtotal: q.subtotal, deliveryFee: q.deliveryFee, total: q.total, paymentMethod,
                paymentStatus: paymentMethod === "COD" && status !== "DELIVERED" ? "PENDING" : "SUCCESS",
                deliveryAddress: address, contactPhone: db.users.find(u => u.id === customerId).phone,
                createdAt: at, updatedAt: history[history.length - 1].at, history, offer: null, declined: [], cancelReason: null
            });
        };
        sample(2043, 1, 1, [{ menuItemId: 7, optionIds: ["portion-2", "wasabi-vua"], quantity: 2 }, { menuItemId: 11, optionIds: ["sauce-shoyu"], quantity: 1 }], "DELIVERED", 2 * 24 * 60, "MOCK_CARD", 1, "18 Lê Văn Sỹ, Phường 13, Quận 3");
        sample(2045, 3, 1, [{ menuItemId: 1, optionIds: ["portion-4", "wasabi-vua"], quantity: 1 }, { menuItemId: 9, optionIds: ["wasabi-vua"], quantity: 2 }], "DELIVERED", 95, "COD", 1, "120 Võ Văn Tần, Quận 3");
        sample(2047, 2, 2, [{ menuItemId: 22, optionIds: ["sauce-shoyu"], quantity: 1 }], "DELIVERED", 70, "MOCK_WALLET", 2, "45 Lý Tự Trọng, Quận 1");
        sample(2048, 1, 1, [{ menuItemId: 8, optionIds: ["wasabi-vua"], quantity: 1 }, { menuItemId: 2, optionIds: ["wasabi-khong"], quantity: 1 }], "PREPARING", 18, "MOCK_WALLET", null, "18 Lê Văn Sỹ, Phường 13, Quận 3");
        sample(2049, 1, 1, [{ menuItemId: 4, optionIds: ["wasabi-nhieu"], quantity: 1 }], "PENDING", 2, "COD", null, "18 Lê Văn Sỹ, Phường 13, Quận 3");
        sample(2050, 4, 1, [{ menuItemId: 3, optionIds: ["sauce-unagi"], quantity: 2 }], "PENDING", 4, "COD", null, "42 Nguyễn Đình Chiểu, Quận 3");
        sample(2051, 2, 1, [{ menuItemId: 10, optionIds: ["wasabi-vua"], quantity: 1 }, { menuItemId: 11, optionIds: ["sauce-mayo"], quantity: 2 }], "READY_FOR_PICKUP", 30, "COD", null, "18 Lê Văn Sỹ, Phường 13, Quận 3");
        log(db, "Nhà hàng mới đăng ký — Bếp Nhật Mỗi Ngày", t - 8 * MINUTE);
        log(db, "Tài xế Trần Văn Nam bắt đầu trực tuyến", t - 24 * MINUTE);
        return db;
    }

    const log = (db, text, at = now()) => { db.activity.unshift({ text, at }); db.activity.length = Math.min(db.activity.length, 30); };
    const load = () => {
        try { const raw = localStorage.getItem(DB_KEY); if (raw) return JSON.parse(raw); } catch { /* dùng dữ liệu mẫu */ }
        return seed();
    };
    const save = db => { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* bỏ qua */ } };

    // ---------- Tính tiền (thay cho BillingService) ----------
    function quote(db, restaurantId, items, seeding = false) {
        const restaurant = db.restaurants.find(r => r.id === restaurantId);
        if (!restaurant || (!seeding && restaurant.status !== "ACTIVE")) fail(400, "Nhà hàng đang tạm ngưng nhận đơn.");
        if (!Array.isArray(items) || !items.length) fail(400, "Giỏ hàng đang trống.");
        const lines = items.map(line => {
            if (!line || !Array.isArray(line.optionIds)) fail(400, "Dữ liệu giỏ hàng không hợp lệ.");
            const item = db.menuItems.find(m => m.id === line.menuItemId && m.restaurantId === restaurantId);
            if (!item) fail(400, "Giỏ chỉ được chứa món của một nhà hàng.");
            if (!item.available) fail(400, `Món "${item.name}" đã ngừng bán, vui lòng bỏ khỏi giỏ.`);
            if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) fail(400, "Số lượng mỗi món từ 1 đến 99.");
            const chosen = item.optionGroups.map(g => db.optionGroups[g].options.find(o => line.optionIds.includes(o.id)) || fail(400, "Lựa chọn món không hợp lệ."));
            const unitPrice = item.price + chosen.reduce((s, o) => s + o.surcharge, 0);
            return { menuItemId: item.id, name: item.name, image: item.image, emoji: item.emoji, optionIds: line.optionIds, options: chosen.map(o => o.name), unitPrice, quantity: line.quantity, lineTotal: unitPrice * line.quantity };
        });
        const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
        return { lines, subtotal, deliveryFee: DELIVERY_FEE, total: subtotal + DELIVERY_FEE };
    }

    // ---------- Điều phối: mời tài xế gần nhất, tài xế nhận hoặc bỏ qua ----------
    const distanceKm = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 109);
    function dispatch(db) {
        for (const order of db.orders) {
            if (order.status !== "READY_FOR_PICKUP" || order.offer) continue;
            const restaurant = db.restaurants.find(r => r.id === order.restaurantId);
            const invited = new Set(db.orders.filter(o => o.offer).map(o => o.offer.driverId));
            const best = db.drivers
                .filter(d => d.status === "AVAILABLE" && !d.locked && d.locationAt && !invited.has(d.id) && !order.declined.includes(d.id))
                .sort((a, b) => distanceKm(restaurant, a) - distanceKm(restaurant, b))[0];
            if (best) {
                order.offer = { driverId: best.id, distanceKm: Math.round(distanceKm(restaurant, best) * 10) / 10 };
                order.retryAt = null;
            } else if (order.declined.length) {
                // Ai rảnh cũng đã bỏ qua: chờ 30 giây rồi mời lại từ đầu.
                if (!order.retryAt) order.retryAt = now() + RETRY_MS;
                else if (now() >= order.retryAt) Object.assign(order, { declined: [], retryAt: null });
            }
        }
    }

    function setStatus(db, order, status, by) {
        order.status = status;
        order.updatedAt = now();
        order.history.push({ status, at: order.updatedAt, by });
        log(db, `Đơn #${order.code} → ${STATUS_TEXT[status]}`);
    }

    // ---------- Dữ liệu trả về ----------
    const userView = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });
    const restaurantView = r => ({ ...r, deliveryFee: DELIVERY_FEE });
    const itemView = (db, m) => ({ ...m, optionGroups: m.optionGroups.map(g => db.optionGroups[g]) });
    const orderView = (db, { offer, declined, retryAt, ...o }) => ({ // không trả dữ liệu điều phối nội bộ
        ...o, statusText: STATUS_TEXT[o.status],
        restaurant: db.restaurants.find(r => r.id === o.restaurantId),
        customerName: (db.users.find(u => u.id === o.customerId) || {}).name,
        driverName: o.driverId ? db.drivers.find(d => d.id === o.driverId).name : null
    });
    const sortNewest = list => [...list].sort((a, b) => b.createdAt - a.createdAt);
    const startOfToday = () => new Date().setHours(0, 0, 0, 0);

    // ---------- API ----------
    const routes = [];
    const on = (method, path, role, handler) => routes.push({ method, re: new RegExp("^" + path.replace(/:id/, "(\\d+)") + "$"), role, handler });

    // Đăng ký, đăng nhập: đăng ký bằng email; số điện thoại có thể bổ sung sau nhưng bắt buộc trước khi đặt đơn.
    on("POST", "/auth/register", null, ({ db, body }) => {
        const email = String(body.email || "").trim().toLowerCase();
        const name = String(body.name || "").trim();
        if (!name || !/^\S+@\S+\.\S+$/.test(email) || String(body.password || "").length < 6) fail(400, "Vui lòng nhập họ tên, email hợp lệ và mật khẩu tối thiểu 6 ký tự.");
        if (body.phone && !PHONE_RE.test(body.phone)) fail(400, "Số điện thoại gồm 10 số, bắt đầu bằng 0.");
        if (db.users.some(u => u.email === email)) fail(409, "Email này đã được đăng ký.");
        const user = { id: db.nextId.user++, role: "CUSTOMER", name, email, phone: body.phone || null, password: body.password };
        db.users.push(user);
        return { user: userView(user) };
    });
    on("POST", "/auth/login", null, ({ db, body }) => {
        const user = db.users.find(u => u.email === String(body.email || "").trim().toLowerCase() && u.password === body.password);
        if (!user) fail(401, "Email hoặc mật khẩu không đúng.");
        if (user.driverId && db.drivers.find(d => d.id === user.driverId).locked) fail(403, "Tài khoản tài xế đang bị khóa.");
        const token = "demo-" + Math.random().toString(36).slice(2);
        db.sessions[token] = user.id; // vai trò gắn với token, không lấy từ lựa chọn trên form
        return { token, user: userView(user) };
    });
    on("POST", "/auth/logout", null, ({ db, token }) => { delete db.sessions[token]; return {}; });
    on("GET", "/me", "*", ({ user }) => ({ user: userView(user) }));
    on("PATCH", "/me", "*", ({ user, body }) => {
        if (!PHONE_RE.test(body.phone || "")) fail(400, "Số điện thoại gồm 10 số, bắt đầu bằng 0.");
        user.phone = body.phone;
        return { user: userView(user) };
    });

    // Khách hàng
    on("GET", "/restaurants", null, ({ db, query }) => {
        const q = (query.q || "").toLocaleLowerCase("vi");
        const match = r => `${r.name} ${r.cuisine} ${db.menuItems.filter(m => m.restaurantId === r.id).map(m => m.name).join(" ")}`.toLocaleLowerCase("vi").includes(q);
        return { items: db.restaurants.filter(r => r.status === "ACTIVE" && match(r)).map(restaurantView) };
    });
    on("GET", "/restaurants/:id/menu", null, ({ db, id }) => {
        const r = db.restaurants.find(x => x.id === id && x.status === "ACTIVE") || fail(404, "Nhà hàng không tồn tại hoặc đang tạm ngưng.");
        const items = db.menuItems.filter(m => m.restaurantId === id);
        return { restaurant: restaurantView(r), categories: db.categories.filter(c => items.some(m => m.categoryId === c.id)), items: items.map(m => itemView(db, m)) };
    });
    on("POST", "/cart/quote", null, ({ db, body }) => quote(db, body.restaurantId, body.items));
    on("POST", "/orders", "CUSTOMER", ({ db, user, body }) => {
        if (!user.phone) fail(400, "Tài khoản cần có số điện thoại trước khi đặt đơn.");
        if (!String(body.deliveryAddress || "").trim()) fail(400, "Vui lòng nhập địa chỉ nhận hàng.");
        if (!["COD", "MOCK_WALLET", "MOCK_CARD"].includes(body.paymentMethod)) fail(400, "Phương thức thanh toán không hợp lệ.");
        const q = quote(db, body.restaurantId, body.items);
        const t = now();
        const order = {
            id: db.nextId.order++, code: "GM-" + db.nextId.code++, customerId: user.id, restaurantId: body.restaurantId, driverId: null, status: "PENDING",
            lines: q.lines, subtotal: q.subtotal, deliveryFee: q.deliveryFee, total: q.total, paymentMethod: body.paymentMethod,
            paymentStatus: body.paymentMethod === "COD" ? "PENDING" : "SUCCESS", // thanh toán mô phỏng luôn thành công trong demo
            deliveryAddress: body.deliveryAddress.trim(), contactPhone: user.phone,
            createdAt: t, updatedAt: t, history: [{ status: "PENDING", at: t, by: "Khách hàng" }], offer: null, declined: [], cancelReason: null
        };
        db.orders.push(order);
        log(db, `Đơn mới #${order.code}`);
        return { order: orderView(db, order) };
    });

    // Khách: lịch sử đơn (20 đơn/trang, mới nhất trước), theo dõi đơn, tự hủy khi nhà hàng chưa xác nhận
    on("GET", "/orders/mine", "CUSTOMER", ({ db, user, query }) => {
        const page = Math.max(1, parseInt(query.page, 10) || 1);
        const mine = sortNewest(db.orders.filter(o => o.customerId === user.id));
        return { items: mine.slice((page - 1) * 20, page * 20).map(o => orderView(db, o)), page, pageSize: 20, total: mine.length };
    });
    const myOrder = (db, user, id) => {
        const order = db.orders.find(o => o.id === id) || fail(404, "Không tìm thấy đơn hàng.");
        if (order.customerId !== user.id) fail(403, "Bạn không có quyền xem đơn này.");
        return order;
    };
    on("GET", "/orders/:id", "CUSTOMER", ({ db, user, id }) => ({ order: orderView(db, myOrder(db, user, id)) }));
    on("POST", "/orders/:id/cancel", "CUSTOMER", ({ db, user, id, body }) => {
        const order = myOrder(db, user, id);
        if (order.status !== "PENDING") fail(409, "Nhà hàng đã xác nhận đơn nên bạn không thể tự hủy. Vui lòng liên hệ nhà hàng.");
        order.cancelReason = String(body.reason || "").trim() || "Khách tự hủy";
        order.paymentStatus = order.paymentStatus === "SUCCESS" ? "REFUNDED" : "VOIDED";
        setStatus(db, order, "CANCELLED", "Khách hàng");
        return { order: orderView(db, order) };
    });

    // Quản lý nhà hàng
    const myRestaurant = (db, user) => db.restaurants.find(r => r.id === user.restaurantId);
    on("GET", "/manager/dashboard", "MANAGER", ({ db, user }) => {
        const r = myRestaurant(db, user);
        const orders = db.orders.filter(o => o.restaurantId === r.id);
        const items = db.menuItems.filter(m => m.restaurantId === r.id);
        return {
            restaurant: restaurantView(r),
            categories: db.categories,
            items: items.map(m => itemView(db, m)),
            orders: sortNewest(orders).slice(0, 12).map(o => orderView(db, o)),
            summary: {
                revenueToday: orders.filter(o => o.status === "DELIVERED" && o.updatedAt >= startOfToday()).reduce((s, o) => s + o.subtotal, 0),
                pendingOrders: orders.filter(o => o.status === "PENDING").length,
                preparingOrders: orders.filter(o => o.status === "CONFIRMED" || o.status === "PREPARING").length,
                itemsAvailable: items.filter(m => m.available).length, itemsTotal: items.length
            }
        };
    });
    const pick = (body, keys) => Object.fromEntries(keys.filter(k => body[k] !== undefined).map(k => [k, body[k]]));
    on("PATCH", "/manager/restaurant", "MANAGER", ({ db, user, body }) => {
        const changes = pick(body, ["name", "cuisine", "hours"]);
        if (Object.values(changes).some(v => !String(v).trim())) fail(400, "Thông tin nhà hàng không được để trống.");
        Object.assign(myRestaurant(db, user), changes); // nhà hàng không tự đổi trạng thái hay tọa độ được
        return {};
    });
    on("POST", "/manager/menu", "MANAGER", ({ db, user, body }) => {
        const name = String(body.name || "").trim();
        if (!name || !Number.isInteger(body.price) || body.price <= 0) fail(400, "Vui lòng nhập tên món và giá là số nguyên lớn hơn 0.");
        if (!db.categories.some(c => c.id === body.categoryId)) fail(400, "Nhóm món không hợp lệ.");
        db.menuItems.push({ id: db.nextId.item++, restaurantId: user.restaurantId, categoryId: body.categoryId, name, price: body.price, description: "", image: null, emoji: "🍱", optionGroups: [], available: true });
        return {};
    });
    on("PATCH", "/manager/menu/:id", "MANAGER", ({ db, user, id, body }) => {
        const item = db.menuItems.find(m => m.id === id && m.restaurantId === user.restaurantId) || fail(403, "Món không thuộc nhà hàng của bạn.");
        const changes = pick(body, ["name", "categoryId", "price", "available"]);
        if (changes.name !== undefined && !String(changes.name).trim()) fail(400, "Vui lòng nhập tên món.");
        if (changes.price !== undefined && (!Number.isInteger(changes.price) || changes.price <= 0)) fail(400, "Giá bán phải là số nguyên lớn hơn 0.");
        if (changes.categoryId !== undefined && !db.categories.some(c => c.id === changes.categoryId)) fail(400, "Nhóm món không hợp lệ.");
        Object.assign(item, changes); // đơn cũ giữ giá đã chốt trong order.lines (BR-04)
        return {};
    });
    on("POST", "/manager/orders/:id/next", "MANAGER", ({ db, user, id }) => {
        const order = db.orders.find(o => o.id === id && o.restaurantId === user.restaurantId) || fail(403, "Đơn không thuộc nhà hàng của bạn.");
        const next = NEXT_BY_MANAGER[order.status] || fail(409, "Đơn đã chuyển trạng thái khác, đang tải lại.");
        setStatus(db, order, next, "Nhà hàng");
        return {};
    });
    on("POST", "/manager/orders/:id/cancel", "MANAGER", ({ db, user, id, body }) => {
        const order = db.orders.find(o => o.id === id && o.restaurantId === user.restaurantId) || fail(403, "Đơn không thuộc nhà hàng của bạn.");
        if (!["PENDING", "CONFIRMED"].includes(order.status)) fail(409, "Chỉ hủy được đơn chờ xác nhận hoặc đã xác nhận.");
        if (!String(body.reason || "").trim()) fail(400, "Vui lòng nhập lý do hủy.");
        order.cancelReason = body.reason.trim();
        order.paymentStatus = order.paymentStatus === "SUCCESS" ? "REFUNDED" : "VOIDED";
        setStatus(db, order, "CANCELLED", "Nhà hàng");
        return {};
    });

    // Tài xế
    const myDriver = (db, user) => db.drivers.find(d => d.id === user.driverId);
    on("GET", "/driver/board", "DRIVER", ({ db, user }) => {
        const d = myDriver(db, user);
        const mine = db.orders.filter(o => o.driverId === d.id);
        const delivered = mine.filter(o => o.status === "DELIVERED").sort((a, b) => b.updatedAt - a.updatedAt);
        const today = delivered.filter(o => o.updatedAt >= startOfToday());
        const offer = db.orders.find(o => o.offer && o.offer.driverId === d.id);
        const active = mine.find(o => NEXT_BY_DRIVER[o.status]);
        return {
            driver: d,
            summary: { earningsToday: today.reduce((s, o) => s + o.deliveryFee, 0), deliveredToday: today.length },
            offer: offer ? { ...orderView(db, offer), distanceKm: offer.offer.distanceKm } : null,
            active: active ? orderView(db, active) : null,
            history: delivered.slice(0, 5).map(o => orderView(db, o))
        };
    });
    on("PUT", "/driver/status", "DRIVER", ({ db, user, body }) => {
        const d = myDriver(db, user);
        if (d.status === "BUSY") fail(409, "Hoàn tất đơn đang giao trước khi đổi trạng thái.");
        if (body.status === "AVAILABLE") {
            // Trực tuyến bắt buộc kèm vị trí: không có vị trí thì không tính được tài xế gần nhất.
            const loc = body.location;
            if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) fail(400, "Cần vị trí hiện tại để trực tuyến.");
            Object.assign(d, { status: "AVAILABLE", lat: body.location.lat, lng: body.location.lng, locationAt: now() });
        } else {
            Object.assign(d, { status: "OFFLINE", locationAt: null }); // ngoại tuyến: không gửi vị trí, không nhận lời mời
            for (const o of db.orders) if (o.offer && o.offer.driverId === d.id) { o.declined.push(d.id); o.offer = null; }
        }
        log(db, `Tài xế ${d.name} ${d.status === "AVAILABLE" ? "bắt đầu trực tuyến" : "chuyển ngoại tuyến"}`);
        return {};
    });
    on("PUT", "/driver/location", "DRIVER", ({ db, user, body }) => {
        const d = myDriver(db, user);
        if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) fail(400, "Tọa độ không hợp lệ.");
        if (d.status !== "OFFLINE") Object.assign(d, { lat: body.lat, lng: body.lng, locationAt: now() });
        return {};
    });
    const myOffer = (db, d, id) => db.orders.find(o => o.id === id && o.offer && o.offer.driverId === d.id) || fail(409, "Lời mời không còn hiệu lực.");
    on("POST", "/driver/offers/:id/accept", "DRIVER", ({ db, user, id }) => {
        const d = myDriver(db, user), order = myOffer(db, d, id);
        Object.assign(order, { driverId: d.id, offer: null });
        d.status = "BUSY";
        setStatus(db, order, "DRIVER_ASSIGNED", "Tài xế " + d.name);
        return {};
    });
    on("POST", "/driver/offers/:id/decline", "DRIVER", ({ db, user, id }) => {
        const d = myDriver(db, user), order = myOffer(db, d, id);
        order.declined.push(d.id);
        order.offer = null; // dispatch() sẽ mời tài xế gần kế tiếp
        log(db, `Tài xế ${d.name} bỏ qua đơn #${order.code}`);
        return {};
    });
    on("POST", "/driver/orders/:id/next", "DRIVER", ({ db, user, id, body }) => {
        const d = myDriver(db, user);
        const order = db.orders.find(o => o.id === id && o.driverId === d.id) || fail(403, "Đơn không được gán cho bạn.");
        const next = NEXT_BY_DRIVER[order.status] || fail(409, "Đơn đã hoàn tất.");
        if (next === "DELIVERED") {
            if (order.paymentMethod === "COD" && !body.codCollected) fail(400, "Xác nhận đã thu đủ tiền mặt trước khi hoàn tất.");
            order.paymentStatus = "SUCCESS";
            d.status = "AVAILABLE";
        }
        setStatus(db, order, next, "Tài xế " + d.name);
        return {};
    });

    // Quản trị
    on("GET", "/admin/dashboard", "ADMIN", ({ db }) => {
        const today = startOfToday();
        const byStatus = {};
        for (const o of db.orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
        return {
            summary: {
                revenueToday: db.orders.filter(o => o.status === "DELIVERED" && o.updatedAt >= today).reduce((s, o) => s + o.total, 0),
                ordersToday: db.orders.filter(o => o.createdAt >= today).length,
                restaurantsActive: db.restaurants.filter(r => r.status === "ACTIVE").length, restaurantsTotal: db.restaurants.length,
                driversOnline: db.drivers.filter(d => d.status !== "OFFLINE").length, driversTotal: db.drivers.length, byStatus
            },
            orders: sortNewest(db.orders).slice(0, 10).map(o => orderView(db, o)),
            restaurants: db.restaurants.map(r => ({ ...r, ordersTotal: db.orders.filter(o => o.restaurantId === r.id).length })),
            drivers: db.drivers.map(d => ({ ...d, activeOrder: (db.orders.find(o => o.driverId === d.id && NEXT_BY_DRIVER[o.status]) || {}).code || null })),
            activity: db.activity.slice(0, 8)
        };
    });
    on("PATCH", "/admin/restaurants/:id", "ADMIN", ({ db, id, body }) => {
        const r = db.restaurants.find(x => x.id === id) || fail(404, "Không tìm thấy nhà hàng.");
        if (!["ACTIVE", "INACTIVE"].includes(body.status)) fail(400, "Trạng thái nhà hàng không hợp lệ.");
        r.status = body.status;
        log(db, `${r.status === "ACTIVE" ? "Kích hoạt" : "Tạm ngưng"} nhà hàng ${r.name}`);
        return {};
    });
    on("PATCH", "/admin/drivers/:id", "ADMIN", ({ db, id, body }) => {
        const d = db.drivers.find(x => x.id === id) || fail(404, "Không tìm thấy tài xế.");
        if (body.locked && d.status === "BUSY") fail(409, "Tài xế đang giao đơn, chưa thể khóa.");
        d.locked = !!body.locked;
        if (d.locked) {
            Object.assign(d, { status: "OFFLINE", locationAt: null });
            for (const o of db.orders) if (o.offer && o.offer.driverId === d.id) { o.declined.push(d.id); o.offer = null; } // mời người khác
            const userId = db.users.find(u => u.driverId === d.id).id;
            for (const [t, uid] of Object.entries(db.sessions)) if (uid === userId) delete db.sessions[t]; // đăng xuất tài xế bị khóa
        }
        log(db, `${d.locked ? "Khóa" : "Mở khóa"} tài xế ${d.name}`);
        return {};
    });
    on("POST", "/admin/reset", "ADMIN", ({ reset }) => { reset(); return {}; });

    // ---------- Xử lý một yêu cầu ----------
    function handle(method, url, body, token) {
        let db = load();
        try {
            dispatch(db); // thay cho Dispatch worker chạy nền
            const [path, qs] = url.split("?");
            const r = routes.find(x => x.method === method && x.re.test(path)) || fail(404, "Không tìm thấy API " + path);
            const user = db.users.find(u => u.id === db.sessions[token]);
            if (r.role && !user) fail(401, "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
            if (r.role && r.role !== "*" && user.role !== r.role) fail(403, "Tài khoản không có quyền dùng chức năng này.");
            const m = path.match(r.re);
            const data = r.handler({ db, user, token, body: body || {}, id: m[1] ? +m[1] : null, query: Object.fromEntries(new URLSearchParams(qs || "")), reset: () => { db = { ...seed(), sessions: db.sessions }; } });
            dispatch(db);
            save(db);
            return { status: 200, data };
        } catch (e) {
            if (!(e instanceof ApiError)) { console.error(e); return { status: 500, error: "Lỗi hệ thống giả lập." }; }
            return { status: e.status, error: e.message, data: e.data };
        }
    }

    window.GoMealBackend = { handle };
})();
