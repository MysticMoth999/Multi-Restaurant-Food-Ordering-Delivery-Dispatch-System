/*
 * Driver Order Board.
 * Trực tuyến = gửi vị trí để được mời đơn; ngoại tuyến = không gửi vị trí, không nhận lời mời.
 * Đơn chỉ thuộc về tài xế sau khi tài xế bấm "Nhận đơn".
 */
(() => {
    const $ = s => document.querySelector(s);
    const NEXT_LABEL = { DRIVER_ASSIGNED: "Đã lấy món", PICKED_UP: "Bắt đầu giao", DELIVERING: "Đã giao xong" };
    const DEMO_LOCATION = { lat: 10.7745, lng: 106.6965 }; // gần Hokkaido Sachi, dùng khi không lấy được GPS
    let board = null;
    let busy = false;
    let codConfirmedFor = null; // giữ dấu tích COD khi trang tự tải lại

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
    const lines = o => o.lines.map(l => `${l.quantity}× ${App.esc(l.name)}`).join(", ");
    const addresses = o => `
        <div class="delivery-address">
            <span>🍣 Lấy tại <strong>${App.esc(o.restaurant.name)}</strong> · ${App.esc(o.restaurant.address)}</span>
            <span>📍 Giao đến: ${App.esc(o.deliveryAddress)} · ☎ ${App.esc(o.contactPhone)}</span>
            <span>🧾 ${lines(o)}</span>
        </div>`;

    function render() {
        const d = board.driver;
        const online = d.status !== "OFFLINE";
        const sw = $("[data-availability]");
        sw.setAttribute("aria-checked", String(online));
        sw.disabled = d.status === "BUSY";
        $("#availability-label").textContent = d.status === "BUSY" ? "Bạn đang giao đơn" : online ? "Bạn đang trực tuyến" : "Bạn đang ngoại tuyến";
        $("#availability-note").textContent = d.status === "BUSY" ? "Hoàn tất đơn hiện tại để nhận lời mời mới hoặc chuyển ngoại tuyến."
            : online ? "Vị trí đang được gửi để hệ thống mời bạn các đơn gần nhất."
            : "Bật trực tuyến để gửi vị trí và bắt đầu nhận lời mời.";

        $("#earnings").innerHTML =
            stat("Thu nhập hôm nay", "💵", App.vnd(board.summary.earningsToday), "Phí giao của đơn đã hoàn thành") +
            stat("Đơn đã giao", "📦", board.summary.deliveredToday, "Hoàn thành trong hôm nay") +
            stat("Đánh giá", "⭐", d.rating, `Dựa trên ${d.ratingCount} đánh giá`) +
            stat("Vị trí", "📍", online ? "Đang gửi" : "Tắt", online && d.locationAt ? "Cập nhật " + App.timeAgo(d.locationAt) : "Ngoại tuyến không gửi vị trí");

        const o = board.offer;
        $("#offer").innerHTML = o ? `
            <article class="delivery-card card">
                <div class="delivery-top"><div><h3>Đơn hàng #${o.code} <span class="pill">Lời mời</span></h3><span class="muted" style="font-size:.78rem">Cách nhà hàng ${o.distanceKm} km · ${App.PAYMENT[o.paymentMethod]}</span></div><strong>${App.vnd(o.total)}</strong></div>
                ${addresses(o)}
                <div class="delivery-bottom"><span class="muted">Phí giao <strong>${App.vnd(o.deliveryFee)}</strong></span><div class="delivery-actions"><button class="button outline small" data-decline="${o.id}">Bỏ qua</button><button class="button primary small" data-accept="${o.id}">Nhận đơn</button></div></div>
            </article>`
            : `<p class="empty-state">${d.status === "OFFLINE" ? "Bạn đang ngoại tuyến nên chưa nhận lời mời." : d.status === "BUSY" ? "Đang giao đơn, lời mời mới sẽ đến sau khi hoàn tất." : "Chưa có lời mời. Giữ trực tuyến để nhận đơn gần bạn."}</p>`;

        const a = board.active;
        const cod = a && a.status === "DELIVERING" && a.paymentMethod === "COD";
        $("#active").innerHTML = a ? `
            <article class="delivery-card card">
                <div class="delivery-top"><div><h3>Đơn hàng #${a.code} ${App.pill(a.status)}</h3><span class="muted" style="font-size:.78rem">${App.PAYMENT[a.paymentMethod]} · ${a.paymentStatus === "SUCCESS" ? "đã thanh toán" : "thu khi giao"}</span></div><strong>${App.vnd(a.total)}</strong></div>
                ${addresses(a)}
                <div class="delivery-bottom">
                    ${cod ? `<label class="cod-check"><input type="checkbox" id="cod-collected" ${codConfirmedFor === a.id ? "checked" : ""}> Đã thu đủ ${App.vnd(a.total)} tiền mặt</label>` : `<span class="muted">Phí giao <strong>${App.vnd(a.deliveryFee)}</strong></span>`}
                    <div class="delivery-actions"><button class="button primary small" data-next="${a.id}">${NEXT_LABEL[a.status]}</button></div>
                </div>
            </article>` : '<p class="empty-state">Chưa có đơn đang giao.</p>';

        $("#history-list").innerHTML = board.history.length ? board.history.map(h => `
            <div class="activity-item"><span class="activity-dot" style="background:var(--green)"></span><p><strong>#${h.code}</strong> · ${App.esc(h.restaurant.name)} · phí giao ${App.vnd(h.deliveryFee)}<small>${App.clock(h.updatedAt)} · ${App.esc(h.deliveryAddress)}</small></p></div>`).join("")
            : '<p class="empty-state">Chưa có đơn nào.</p>';
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
            App.fail(e);
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
        if (!b) return;
        if (b.dataset.accept) run(() => api.driver.accept(+b.dataset.accept), "Đã nhận đơn. Hãy đến nhà hàng lấy món.");
        if (b.dataset.decline) run(() => api.driver.decline(+b.dataset.decline), "Đã bỏ qua, đơn được mời cho tài xế khác.");
        if (b.dataset.next) {
            const cod = $("#cod-collected");
            if (cod && !cod.checked) return App.toast("Xác nhận đã thu đủ tiền mặt trước khi hoàn tất.");
            run(() => api.driver.nextStatus(+b.dataset.next, cod ? cod.checked : undefined), "Đã cập nhật trạng thái đơn.");
        }
    });

    document.addEventListener("change", e => {
        if (e.target.id === "cod-collected") codConfirmedFor = e.target.checked ? board.active.id : null;
    });

    App.requireRole("DRIVER").then(() => {
        reload().then(async () => {
            // Đang trực tuyến thì gửi vị trí ngay khi mở trang, không chờ hết 30 giây đầu.
            if (board && board.driver.status !== "OFFLINE") await api.driver.sendLocation(await getLocation()).catch(() => {});
        });
        App.poll(reload, 4000);
        // Khi trực tuyến, gửi lại vị trí mỗi 30 giây.
        setInterval(async () => {
            if (board && board.driver.status !== "OFFLINE") api.driver.sendLocation(await getLocation()).catch(() => {});
        }, 30000);
    });
})();
