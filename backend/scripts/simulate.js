// Mô phỏng vận hành qua HTTP trên server đang chạy (npm start): khách đặt đơn, nhà hàng xác nhận,
// tài xế nhận lời mời và di chuyển trên bản đồ tới nhà hàng rồi tới điểm giao.
// Dùng: npm run simulate -- --orders 4 --every 15 --customer khach@gomeal.vn
// Mặc định để taixe@gomeal.vn cho người dùng tự thao tác; mô phỏng dùng taixe2..taixe5.
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[i + 1]]] : pairs), []));
const BASE = process.env.API_BASE ?? `http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? 3000}/api`;
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo12345";
const ORDERS = Number(args.orders ?? 4);
const EVERY_MS = Number(args.every ?? 15) * 1000;
const CUSTOMER = args.customer ?? "khach@gomeal.vn";
const DRIVERS = (args.drivers ?? "taixe2,taixe3,taixe4,taixe5").split(",").map((name) => `${name}@gomeal.vn`);
const STEP_KM = 0.12; // mỗi 2 giây (~216 km/h) để demo không phải chờ lâu
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const time = () => new Date().toLocaleTimeString("vi-VN");
const log = (...parts) => console.log(`[${time()}]`, ...parts);
const random = (min, max) => min + Math.random() * (max - min);
const km = (a, b) => {
    const r = (d) => (d * Math.PI) / 180;
    const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
};
// Điểm cách tâm một khoảng ngẫu nhiên (km) theo hướng ngẫu nhiên.
const around = (center, minKm, maxKm) => {
    const d = random(minKm, maxKm) / 6371, angle = random(0, 2 * Math.PI);
    return {
        lat: +(center.lat + (d * Math.cos(angle) * 180) / Math.PI).toFixed(6),
        lng: +(center.lng + (d * Math.sin(angle) * 180) / Math.PI / Math.cos((center.lat * Math.PI) / 180)).toFixed(6),
    };
};

async function call(method, path, body, token) {
    const response = await fetch(BASE + path, {
        method,
        headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(json.error ?? `HTTP ${response.status}`), { status: response.status, code: json.code });
    return json.data;
}
const login = async (email) => (await call("POST", "/auth/login", { email, password: PASSWORD })).token;

const state = { stopping: false, created: [], drivers: [] };

async function customerLoop(restaurants) {
    const token = await login(CUSTOMER);
    for (let n = 1; n <= ORDERS && !state.stopping; n += 1) {
        const restaurant = restaurants[n % restaurants.length];
        const menu = await call("GET", `/restaurants/${restaurant.id}/menu`);
        const items = menu.items.filter((item) => item.available).sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 2))
            .map((item) => ({ menuItemId: item.id, quantity: 1 + Math.floor(Math.random() * 3), selectedOptionIds: [] }));
        const deliveryLocation = around(restaurant, 0.8, 3.5);
        try {
            const quote = await call("POST", "/cart/quote", { restaurantId: restaurant.id, items, deliveryLocation }, token);
            const paymentMethod = ["COD", "MOCK_WALLET", "MOCK_CARD"][n % 3];
            const { order } = await call("POST", "/orders", {
                restaurantId: restaurant.id, items, deliveryLocation, paymentMethod,
                deliveryAddress: `Điểm giao mô phỏng số ${n}`, requestKey: `sim-${Date.now()}-${n}`, quoteFingerprint: quote.quoteFingerprint,
            }, token);
            state.created.push(order.id);
            log(`🧾 Khách đặt ${order.code} tại ${restaurant.name}: ${order.total.toLocaleString("vi-VN")}đ, giao ${quote.distanceKm.toLocaleString("vi-VN")} km (${paymentMethod})`);
        } catch (error) {
            log(`⚠️  Không đặt được đơn: ${error.message}`);
        }
        await sleep(EVERY_MS);
    }
}

// Quản lý nhà hàng: mỗi 3 giây đẩy đơn lên một bước PENDING → CONFIRMED → PREPARING → READY_FOR_PICKUP.
async function managerLoop(email) {
    const token = await login(email);
    const NEXT = { PENDING: "CONFIRMED", CONFIRMED: "PREPARING", PREPARING: "READY_FOR_PICKUP" };
    while (!state.stopping) {
        try {
            const { orders, restaurant } = await call("GET", "/manager/dashboard", null, token);
            for (const order of orders.filter((o) => NEXT[o.status] && state.created.includes(o.id))) {
                await call("POST", `/orders/${order.id}/transitions`, { targetStatus: NEXT[order.status], expectedVersion: order.version }, token);
                log(`🍳 ${restaurant.name}: ${order.code} → ${NEXT[order.status]}`);
            }
        } catch (error) {
            if (error.status !== 409) log(`⚠️  ${email}: ${error.message}`);
        }
        await sleep(3000);
    }
}

// Tài xế: trực tuyến, nhận lời mời, chạy về nhà hàng, lấy món, chạy tới điểm giao, hoàn tất.
async function driverLoop(email, start) {
    const token = await login(email);
    const me = { email, position: start, token, idleSent: 0 };
    state.drivers.push(me);
    // Tài xế đang giữ đơn (BUSY) thì không đổi trạng thái được; vòng lặp bên dưới sẽ giao tiếp đơn đó.
    await call("PUT", "/driver/status", { status: "AVAILABLE", location: start }, token).catch((error) => { if (error.status !== 409) log(`⚠️  ${email}: ${error.message}`); });
    while (!state.stopping) {
        try {
            const board = await call("GET", "/driver/board", null, token);
            const name = board.driver.name;
            if (board.offer && !board.active) {
                if (Math.random() < 0.15) {
                    await call("POST", `/driver/offers/${board.offer.offerId}/decline`, {}, token);
                    log(`🙅 ${name} bỏ qua ${board.offer.code}`);
                } else {
                    await call("POST", `/driver/offers/${board.offer.offerId}/accept`, {}, token);
                    log(`🛵 ${name} nhận ${board.offer.code}`);
                }
            } else if (board.active) {
                const order = board.active;
                const target = order.status === "DRIVER_ASSIGNED" ? order.restaurant : order.deliveryLocation;
                const left = km(me.position, target);
                if (left > 0.03) {
                    const f = Math.min(1, STEP_KM / left);
                    me.position = { lat: +(me.position.lat + (target.lat - me.position.lat) * f).toFixed(6), lng: +(me.position.lng + (target.lng - me.position.lng) * f).toFixed(6) };
                    await call("PUT", "/driver/location", me.position, token);
                } else {
                    const next = { DRIVER_ASSIGNED: "PICKED_UP", PICKED_UP: "DELIVERING", DELIVERING: "DELIVERED" }[order.status];
                    await call("POST", `/orders/${order.id}/transitions`, { targetStatus: next, expectedVersion: order.version, ...(next === "DELIVERED" ? { codCollected: true } : {}) }, token);
                    log(`📦 ${name}: ${order.code} → ${next}`);
                }
            } else if (Date.now() - me.idleSent > 20000) {
                // Đang rảnh: gửi vị trí định kỳ để vẫn được tính là vị trí mới (dưới 2 phút).
                await call("PUT", "/driver/location", me.position, token);
                me.idleSent = Date.now();
            }
        } catch (error) {
            if (error.status !== 409) log(`⚠️  ${email}: ${error.message}`);
        }
        await sleep(2000);
    }
}

async function finished() {
    const token = await login(CUSTOMER);
    while (!state.stopping) {
        await sleep(5000);
        if (state.created.length < ORDERS) continue;
        const { items } = await call("GET", "/orders/mine", null, token);
        const mine = items.filter((order) => state.created.includes(order.id));
        if (mine.length && mine.every((order) => ["DELIVERED", "CANCELLED"].includes(order.status))) {
            log(`✅ Đã giao xong ${mine.length} đơn mô phỏng.`);
            return;
        }
    }
}

async function stop() {
    if (state.stopping) return;
    state.stopping = true;
    for (const driver of state.drivers) await call("PUT", "/driver/status", { status: "OFFLINE" }, driver.token).catch(() => {});
    log("Đã cho các tài xế mô phỏng ngoại tuyến. Kết thúc.");
    process.exit(0);
}
process.on("SIGINT", stop);

try {
    await call("GET", "/health");
} catch {
    console.error(`Không kết nối được ${BASE}. Hãy chạy "npm start" trước.`);
    process.exit(1);
}
const restaurants = (await call("GET", "/restaurants")).items;
log(`Bắt đầu mô phỏng: ${ORDERS} đơn, ${DRIVERS.length} tài xế, khách ${CUSTOMER}. Bấm Ctrl+C để dừng.`);
log(`Mở http://127.0.0.1:5500/orders.html bằng tài khoản ${CUSTOMER} để xem bản đồ theo dõi đơn.`);
DRIVERS.forEach((email, i) => driverLoop(email, around(restaurants[i % restaurants.length], 0.5, 2)).catch((error) => log(`⚠️  ${email}: ${error.message}`)));
for (const email of ["nhahang@gomeal.vn", "nhahang2@gomeal.vn"]) managerLoop(email).catch((error) => log(`⚠️  ${email}: ${error.message}`));
await sleep(3000);
customerLoop(restaurants).catch((error) => log(`⚠️  khách: ${error.message}`));
await finished();
await stop();
