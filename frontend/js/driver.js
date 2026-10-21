/*
 * Driver Order Board.
 * Trực tuyến = gửi vị trí để được mời đơn; ngoại tuyến = không gửi vị trí, không nhận lời mời.
 * Đơn chỉ thuộc về tài xế sau khi tài xế bấm "Nhận đơn". Nhận/bỏ qua dùng board.offer.offerId (offer.id là mã đơn).
 * Các bước giao đi qua POST /orders/:id/transitions với expectedVersion của đơn đang hiển thị; 409 thì tải lại bảng việc.
 */
(() => {
    const $ = s => document.querySelector(s);
    const NEXT = {
        DRIVER_ASSIGNED: ["PICKED_UP", "Đã lấy món"],
        PICKED_UP: ["DELIVERING", "Bắt đầu giao"],
        DELIVERING: ["DELIVERED", "Đã giao xong"]
    };
    const DEMO_LOCATION = { lat: 10.7745, lng: 106.6965 }; // gần Hokkaido Sachi, dùng khi không lấy được GPS
    let board = null;
    let busy = false;
    let codConfirmedFor = null; // giữ dấu tích COD khi trang tự tải lại
    let lastSent = 0;
    const track = App.trackingMap($("#driver-map"));
    let mapFor = null;
    const SIM_STEP_KM = 0.15; // mỗi 5 giây khi mô phỏng (~110 km/h, cho demo nhanh)

    $("#today").textContent = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" });

    // Lấy vị trí từ trình duyệt; không được thì dùng vị trí mô phỏng để demo.
    const getLocation = () => new Promise(resolve => {
        const fallback = () => resolve({ ...DEMO_LOCATION });
        if (!navigator.geolocation) return fallback();
        const timer = setTimeout(fallback, 4000);
        navigator.geolocation.getCurrentPosition(
            p => { clearTimeout(timer); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
            () => { clearTimeout(timer); fallback(); },
            { timeout: 4000, maximumAge: 30000 }
        );
    });

    const stat = (label, icon, value, note) =>
        `<article class="stat-card card"><div class="stat-label">${label} <span>${icon}</span></div><div class="stat-value">${value}</div><span class="muted" style="font-size:.76rem">${note}</span></article>`;
    const lines = o => o.lines.map(l => `${l.quantity}× ${App.esc(l.name)}${l.options.length ? " (" + App.esc(App.optionNames(l.options)) + ")" : ""}`).join(", ");
    const addresses = o => `
        <div class="delivery-address">
            <span>🍣 Lấy tại <strong>${App.esc(o.restaurant.name)}</strong> · ${App.esc(o.restaurant.address)}</span>
            <span>📍 Giao đến: ${App.esc(o.deliveryAddress)}${o.distanceKm != null ? ` · cách nhà hàng ${App.km(o.distanceKm)}` : ""} · ☎ ${App.esc(o.contactPhone)}</span>
            <span>🧾 ${lines(o)}</span>
        </div>`;
    // Nơi tài xế cần đến: nhà hàng (lời mời / đã nhận) hoặc điểm giao (đã lấy món).
    const targetOf = o => (o.status === "PICKED_UP" || o.status === "DELIVERING") ? o.deliveryLocation : o.restaurant;

    function renderMap() {
        const o = board.active || board.offer;
        $("#map-panel").hidden = !o;
        if (!o) return;
        if (mapFor !== o.id) { track.refit(); mapFor = o.id; }
        const me = board.driver.lat != null ? { lat: board.driver.lat, lng: board.driver.lng } : null;
        const toDelivery = board.active && targetOf(board.active) === board.active.deliveryLocation;
        track.update({ restaurant: o.restaurant, delivery: o.deliveryLocation, driver: me }, toDelivery ? "delivery" : "restaurant");
        track.refresh();
        const target = targetOf(o);
        $("#driver-track-info").innerHTML = me && target
            ? `<span>Còn khoảng <strong>${App.km(App.distanceKm(me, target))}</strong> tới ${toDelivery ? "điểm giao" : "nhà hàng"}</span><span>Vị trí gửi ${App.timeAgo(board.driver.locationAt)}</span>`
            : "<span>Chưa có vị trí của bạn.</span>";
    }
    // Đồng hồ lời mời chỉ để tài xế biết; còn hạn hay không do backend quyết định khi bấm.
    const remaining = expiresAt => {
        const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
        return s ? `Còn ${s} giây` : "Đã hết hạn";
    };

    function render() {
        const d = board.driver;
        const online = d.status !== "OFFLINE";
        const sw = $("[data-availability]");
        sw.setAttribute("aria-checked", String(online));
        sw.disabled = d.status === "BUSY";
        $("#availability-label").textContent = d.status === "BUSY" ? "Bạn đang giao đơn" : online ? "Bạn đang trực tuyến" : "Bạn đang ngoại tuyến";
        $("#availability-note").textContent = d.status === "BUSY" ? "Đang giao: vị trí gửi mỗi 5 giây để khách theo dõi. Hoàn tất đơn để nhận lời mời mới."
            : online ? "Vị trí đang được gửi mỗi 30 giây để hệ thống mời bạn các đơn gần nhất."
            : "Bật trực tuyến để gửi vị trí và bắt đầu nhận lời mời.";

        // M2 chưa có đánh giá tài xế: bỏ thẻ đánh giá; thu nhập là số backend trả về.
        $("#earnings").innerHTML =
            stat("Thu nhập hôm nay", "💵", App.vnd(board.summary.earningsToday), "Phí giao của đơn đã hoàn thành") +
            stat("Đơn đã giao", "📦", board.summary.deliveredToday, "Hoàn thành trong hôm nay") +
            stat("Vị trí", "📍", online ? "Đang gửi" : "Tắt", online && d.locationAt ? "Cập nhật " + App.timeAgo(d.locationAt) : "Ngoại tuyến không gửi vị trí");

        const o = board.offer;
        $("#offer").innerHTML = o ? `
            <article class="delivery-card card">
                <div class="delivery-top"><div><h3>Đơn hàng #${App.esc(o.code)} <span class="pill">Lời mời</span> <span class="pill blue" data-countdown="${o.expiresAt}">${remaining(o.expiresAt)}</span></h3><span class="muted" style="font-size:.78rem">Bạn cách nhà hàng ${App.km(o.driverDistanceKm)} · ${App.PAYMENT[o.paymentMethod] || App.esc(o.paymentMethod)}</span></div><strong>${App.vnd(o.total)}</strong></div>
                ${addresses(o)}
                <div class="delivery-bottom"><span class="muted">Phí giao <strong>${App.vnd(o.deliveryFee)}</strong></span><div class="delivery-actions"><button class="button outline small" data-decline="${o.offerId}">Bỏ qua</button><button class="button primary small" data-accept="${o.offerId}">Nhận đơn</button></div></div>
            </article>`
            : `<p class="empty-state">${d.status === "OFFLINE" ? "Bạn đang ngoại tuyến nên chưa nhận lời mời." : d.status === "BUSY" ? "Đang giao đơn, lời mời mới sẽ đến sau khi hoàn tất." : "Chưa có lời mời. Giữ trực tuyến để nhận đơn gần bạn."}</p>`;

        const a = board.active;
        const cod = a && a.status === "DELIVERING" && a.paymentMethod === "COD";
        $("#active").innerHTML = a ? `
            <article class="delivery-card card">
                <div class="delivery-top"><div><h3>Đơn hàng #${App.esc(a.code)} ${App.pill(a.status)}</h3><span class="muted" style="font-size:.78rem">${App.PAYMENT[a.paymentMethod] || App.esc(a.paymentMethod)} · ${a.paymentStatus === "SUCCESS" ? "đã thanh toán" : "thu khi giao"}</span></div><strong>${App.vnd(a.total)}</strong></div>
                ${addresses(a)}
                <div class="call-row" style="margin:0 0 12px">${App.call(a.contactPhone, "Gọi khách")}${App.call(a.restaurant.phone, "Gọi nhà hàng")}</div>
                <div class="delivery-bottom">
                    ${cod ? `<label class="cod-check"><input type="checkbox" id="cod-collected" ${codConfirmedFor === a.id ? "checked" : ""}> Đã thu đủ ${App.vnd(a.total)} tiền mặt</label>` : `<span class="muted">Phí giao <strong>${App.vnd(a.deliveryFee)}</strong> · ${a.paymentStatus === "SUCCESS" ? App.PAID : "chưa thanh toán"}</span>`}
                    ${NEXT[a.status] ? `<div class="delivery-actions"><button class="button primary small" data-next="${a.id}">${NEXT[a.status][1]}</button></div>` : ""}
                </div>
            </article>` : '<p class="empty-state">Chưa có đơn đang giao.</p>';

        $("#history-list").innerHTML = board.history.length ? board.history.map(h => `
            <div class="activity-item"><span class="activity-dot" style="background:var(--green)"></span><p><strong>#${App.esc(h.code)}</strong> · ${App.esc(h.restaurant.name)} · phí giao ${App.vnd(h.deliveryFee)}<small>${App.clock(h.updatedAt)} · ${App.esc(h.deliveryAddress)}</small></p></div>`).join("")
            : '<p class="empty-state">Chưa có đơn nào.</p>';
        renderMap();
    }

    async function reload() {
        if (busy) return;
        try {
            board = await api.driver.board();
            render();
        } catch (e) {
            App.fail(e);
        }
    }

    async function run(action, okMessage) {
        busy = true;
        try {
            await action();
            if (okMessage) App.toast(okMessage);
        } catch (e) {
            App.fail(e); // 409: lời mời hết hạn / đơn đã đổi → bảng việc được tải lại ngay bên dưới
        } finally {
            busy = false;
        }
        await reload();
    }

    $("[data-availability]").addEventListener("click", () => {
        if (!board) return;
        if (board.driver.status === "OFFLINE") {
            run(async () => api.driver.setStatus("AVAILABLE", await getLocation()), "Đã trực tuyến và gửi vị trí.");
        } else {
            run(() => api.driver.setStatus("OFFLINE"), "Đã chuyển ngoại tuyến, ngừng gửi vị trí.");
        }
    });

    document.addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b || !board) return;
        if (b.dataset.accept) run(() => api.driver.accept(+b.dataset.accept), "Đã nhận đơn. Hãy đến nhà hàng lấy món.");
        if (b.dataset.decline) run(() => api.driver.decline(+b.dataset.decline), "Đã bỏ qua, đơn được mời cho tài xế khác.");
        if (b.dataset.next) {
            const a = board.active;
            if (!a || a.id !== +b.dataset.next || !NEXT[a.status]) return;
            const cod = $("#cod-collected");
            if (cod && !cod.checked) return App.toast("Xác nhận đã thu đủ tiền mặt trước khi hoàn tất.");
            const extra = cod ? { codCollected: true } : undefined;
            run(() => api.driver.transition(a, NEXT[a.status][0], extra), "Đã cập nhật trạng thái đơn.");
        }
    });

    document.addEventListener("change", e => {
        if (e.target.id === "cod-collected") codConfirmedFor = e.target.checked ? board.active.id : null;
    });

    // Đếm ngược lời mời mỗi giây, không gọi API.
    setInterval(() => {
        document.querySelectorAll("[data-countdown]").forEach(el => { el.textContent = remaining(+el.dataset.countdown); });
    }, 1000);

    // Mô phỏng: từ vị trí hiện tại tiến một đoạn về phía nhà hàng/điểm giao của đơn đang giao.
    const simulatedStep = () => {
        const a = board.active, target = a && targetOf(a);
        if (!target || board.driver.lat == null) return null;
        const me = { lat: board.driver.lat, lng: board.driver.lng };
        const km = App.distanceKm(me, target);
        if (km <= SIM_STEP_KM) return { lat: target.lat, lng: target.lng };
        const f = SIM_STEP_KM / km;
        return { lat: +(me.lat + (target.lat - me.lat) * f).toFixed(6), lng: +(me.lng + (target.lng - me.lng) * f).toFixed(6) };
    };
    // Chỉ gửi vị trí khi trực tuyến; đang giao đơn thì 5 giây/lần để khách theo dõi, còn lại 30 giây/lần.
    const sendLocation = async (force) => {
        if (!board || board.driver.status === "OFFLINE") return;
        const busyNow = board.driver.status === "BUSY";
        if (!force && !busyNow && Date.now() - lastSent < 30000) return;
        const point = ($("#simulate").checked && simulatedStep()) || await getLocation();
        lastSent = Date.now();
        try {
            await api.driver.sendLocation(point);
            board.driver.lat = point.lat; board.driver.lng = point.lng; board.driver.locationAt = Date.now();
            renderMap();
        } catch { /* lần sau gửi lại */ }
    };

    App.requireRole("DRIVER").then(() => {
        // Đang trực tuyến thì gửi vị trí ngay khi mở trang, không chờ hết 30 giây đầu.
        reload().then(() => sendLocation(true));
        App.poll(reload, 4000);
        setInterval(() => sendLocation(false), 5000);
    });
})();
