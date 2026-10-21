/* Đơn của tôi: lịch sử đơn (UC-07), theo dõi đơn (UC-06), khách tự hủy khi đơn còn chờ xác nhận (UC-12).
 * Hủy gửi expectedVersion của đơn đang hiển thị; nếu đơn vừa đổi (409) thì tải lại để khách xem trạng thái mới. */
(() => {
    const $ = s => document.querySelector(s);
    const STEPS = ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "DRIVER_ASSIGNED", "PICKED_UP", "DELIVERING", "DELIVERED"];
    const PAYMENT_STATUS = { PENDING: "Thu khi giao", SUCCESS: "Đã thanh toán", FAILED: "Thanh toán thất bại (mô phỏng)", REFUNDED: "Đã hoàn tiền (mô phỏng)", VOIDED: "Đã hủy thu tiền" };
    const DRIVER_STEPS = new Set(["DRIVER_ASSIGNED", "PICKED_UP", "DELIVERING", "DELIVERED"]);
    const S = { orders: [], page: 1, total: 0, selectedId: Number(new URLSearchParams(location.search).get("id")) || null, detail: null, mapFor: null };
    // Bản đồ giữ nguyên qua các lần vẽ lại chi tiết đơn (4 giây/lần), chỉ cập nhật vị trí các điểm.
    const mapEl = Object.assign(document.createElement("div"), { className: "track-map" });
    const track = App.trackingMap(mapEl);
    const ACTIVE = new Set(["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "DRIVER_ASSIGNED", "PICKED_UP", "DELIVERING"]);

    const dateTime = ts => {
        const d = new Date(ts), two = n => String(n).padStart(2, "0");
        return `${two(d.getHours())}:${two(d.getMinutes())} ${two(d.getDate())}/${two(d.getMonth() + 1)}`;
    };

    function renderHistory() {
        $("#history").setAttribute("aria-busy", "false");
        $("#history-count").textContent = S.total ? `${S.total} đơn` : "";
        $("#history").innerHTML = S.orders.length ? S.orders.map(o => `
            <button type="button" class="order-item${o.id === S.selectedId ? " selected" : ""}" data-id="${o.id}" ${o.id === S.selectedId ? 'aria-current="true"' : ""}>
                <span class="order-item-top"><strong>#${o.code}</strong>${App.pill(o.status)}</span>
                <span class="order-item-name">${App.esc(o.restaurant.name)}</span>
                <span class="muted">${dateTime(o.createdAt)} · ${App.vnd(o.total)}</span>
            </button>`).join("")
            : '<p class="empty-state">Bạn chưa có đơn nào. <a class="text-link" href="./index.html">Chọn nhà hàng</a></p>';
        $("#load-more").hidden = S.orders.length >= S.total;
    }

    // history[].by là tên người thao tác (hoặc "Dispatch worker"); hiển thị theo góc nhìn của khách.
    const actor = (h, o) => h.actorId === o.customerId ? "Bạn"
        : !h.actorId || h.by === "Dispatch worker" ? "Hệ thống"
        : DRIVER_STEPS.has(h.status) ? h.by
        : "Nhà hàng";

    function stepper(o) {
        const reached = new Map(o.history.map(h => [h.status, h.at]));
        const by = new Map(o.history.map(h => [h.status, actor(h, o)]));
        const steps = o.status === "CANCELLED" ? STEPS.filter(s => reached.has(s)).concat("CANCELLED") : STEPS;
        return `<ol class="stepper" aria-label="Tiến trình đơn">${steps.map(s => {
            const state = s === o.status ? (s === "CANCELLED" ? "cancelled" : "current") : reached.has(s) ? "done" : "todo";
            const at = s === "CANCELLED" ? reached.get("CANCELLED") : reached.get(s);
            return `<li class="step ${state}"${state === "current" ? ' aria-current="step"' : ""}><span class="step-dot" aria-hidden="true"></span><span class="step-label">${App.STATUS[s][0]}</span><span class="step-time">${at ? App.clock(at) : ""}</span>${by.has(s) ? `<span class="step-time">${App.esc(by.get(s))}</span>` : ""}</li>`;
        }).join("")}</ol>`;
    }

    // Tài xế đang đến nhà hàng (đã nhận đơn) hoặc đang đến điểm giao (đã lấy món).
    function trackingInfo(o) {
        if (!o.driverLocation) return o.status === "READY_FOR_PICKUP" ? "Đang tìm tài xế gần nhà hàng nhất…" : "Vị trí tài xế hiện khi có tài xế nhận đơn.";
        const toRestaurant = o.status === "DRIVER_ASSIGNED";
        const target = toRestaurant ? o.restaurant : o.deliveryLocation;
        const km = target ? App.distanceKm(o.driverLocation, target) : null;
        return `<span>🛵 <strong>${App.esc(o.driverName || "Tài xế")}</strong> ${toRestaurant ? "đang đến nhà hàng" : "đang đến chỗ bạn"}${km != null ? `, còn khoảng <strong>${App.km(km)}</strong>` : ""}</span><span>Cập nhật ${App.timeAgo(o.driverLocation.at)}</span>`;
    }

    function renderMap(o) {
        const slot = $("[data-map-slot]");
        if (!slot) return;
        slot.replaceWith(mapEl);
        if (S.mapFor !== o.id) { track.refit(); S.mapFor = o.id; }
        track.update({ restaurant: o.restaurant, delivery: o.deliveryLocation, driver: o.driverLocation }, o.status === "DRIVER_ASSIGNED" ? "restaurant" : "delivery");
        track.refresh();
    }

    function renderDetail() {
        const o = S.detail;
        if (!o) return;
        const onRoad = o.driverName && ["DRIVER_ASSIGNED", "PICKED_UP", "DELIVERING"].includes(o.status);
        const calls = ACTIVE.has(o.status) ? App.call(o.restaurant.phone, "Gọi nhà hàng") + (onRoad ? App.call(o.driverPhone, "Gọi tài xế") : "") : "";
        const lines = o.lines.map(l => `
            <div class="receipt-line"><span>${l.quantity}× ${App.esc(l.name)}${l.options.length ? `<small>${App.esc(App.optionNames(l.options))}</small>` : ""}</span><span>${App.vnd(l.lineTotal)}</span></div>`).join("");
        let action = "";
        if (o.status === "PENDING") action = `<div class="detail-action"><p class="muted">Nhà hàng chưa xác nhận nên bạn có thể tự hủy đơn.</p><button class="button outline" type="button" data-cancel>Hủy đơn</button></div>`;
        else if (o.status === "CONFIRMED") action = `<div class="detail-action"><p class="muted">Nhà hàng đã xác nhận đơn. Nếu cần hủy, vui lòng liên hệ nhà hàng.</p></div>`;
        $("#detail").innerHTML = `
            <div class="panel-heading"><div><h2 id="detail-title">Đơn #${o.code}</h2><span class="muted" style="font-size:.8rem">Đặt lúc ${dateTime(o.createdAt)}</span></div>${App.pill(o.status)}</div>
            ${stepper(o)}
            ${o.status === "CANCELLED" ? `<p class="cancel-note">Đơn đã hủy${o.cancelReason ? ": " + App.esc(o.cancelReason) : ""}.</p>` : ""}
            <dl class="kv">
                <dt>Nhà hàng</dt><dd>${App.esc(o.restaurant.name)} · ${App.esc(o.restaurant.address)}</dd>
                <dt>Giao đến</dt><dd>${App.esc(o.deliveryAddress)}</dd>
                <dt>Liên hệ</dt><dd>${App.esc(o.contactPhone)}</dd>
                <dt>Tài xế</dt><dd>${o.driverName ? App.esc(o.driverName) : '<span class="muted">Chưa có</span>'}</dd>
                <dt>Thanh toán</dt><dd>${App.PAYMENT[o.paymentMethod]} · ${o.paymentStatus === "SUCCESS" ? App.PAID : PAYMENT_STATUS[o.paymentStatus] || App.esc(o.paymentStatus || "")}</dd>
            </dl>
            ${calls ? `<div class="call-row">${calls}</div>` : ""}
            ${ACTIVE.has(o.status) && o.deliveryLocation ? `<div data-map-slot></div><div class="track-info">${trackingInfo(o)}</div>` : ""}
            <div class="receipt-box">${lines}
                <div class="receipt-line muted"><span>Tiền món</span><span>${App.vnd(o.subtotal)}</span></div>
                <div class="receipt-line muted"><span>Phí giao hàng${o.distanceKm != null ? ` (${App.km(o.distanceKm)})` : ""}</span><span>${App.vnd(o.deliveryFee)}</span></div>
                ${o.discount ? `<div class="receipt-line discount"><span>Giảm giá${o.voucherCode ? ` (voucher ${App.esc(o.voucherCode)})` : ""}</span><span>−${App.vnd(o.discount)}</span></div>` : ""}
                <div class="receipt-line total"><span>Tổng cộng</span><span>${App.vnd(o.total)}</span></div>
            </div>
            ${action}`;
        renderMap(o);
    }

    // Lịch sử 20 đơn/trang (FR-07); khi tự làm mới thì nạp lại đủ số trang đang xem.
    async function loadHistory(pages = S.page) {
        const all = [];
        for (let p = 1; p <= pages; p++) {
            const data = await api.orders.mine(p);
            S.total = data.total;
            all.push(...data.items);
        }
        S.page = pages;
        S.orders = all;
        renderHistory();
    }

    async function loadDetail() {
        if (!S.selectedId) return;
        try {
            S.detail = await api.orders.get(S.selectedId);
            renderDetail();
        } catch (e) {
            if (e.status === 401) return App.goLogin();
            $("#detail").innerHTML = `<p class="empty-state">${App.esc(e.message)}</p>`;
        }
    }

    async function refresh() {
        try {
            await loadHistory();
            if (!S.selectedId && S.orders.length) S.selectedId = S.orders[0].id;
            await loadDetail();
            renderHistory();
        } catch (e) {
            App.fail(e);
        }
    }

    document.addEventListener("click", e => {
        const item = e.target.closest(".order-item");
        if (item) {
            S.selectedId = +item.dataset.id;
            history.replaceState(null, "", "?id=" + S.selectedId);
            renderHistory();
            loadDetail().then(() => { if (matchMedia("(max-width: 900px)").matches) $("#detail").scrollIntoView({ behavior: "smooth" }); });
        }
        if (e.target.closest("[data-cancel]")) {
            $("#cancel-form").reset();
            $("#cancel-error").textContent = "";
            $("#cancel-code").textContent = "#" + S.detail.code;
            $("#cancel-dialog").showModal();
        }
        if (e.target.closest("[data-dialog-close]")) $("#cancel-dialog").close();
    });
    $("#load-more").addEventListener("click", () => loadHistory(S.page + 1).catch(App.fail));
    $("#cancel-form").addEventListener("submit", async e => {
        e.preventDefault();
        try {
            S.detail = await api.orders.cancel(S.detail, e.target.elements.reason.value.trim());
            $("#cancel-dialog").close();
            App.toast("Đã hủy đơn #" + S.detail.code + ".");
            renderDetail();
            loadHistory().catch(App.fail);
        } catch (err) {
            if (err.status === 401) return App.goLogin();
            // Ví dụ 409: nhà hàng vừa xác nhận đơn. Tải lại để khách thấy trạng thái mới, không tự gửi hủy lại.
            $("#cancel-error").textContent = err.conflict ? "Đơn vừa thay đổi nên chưa hủy được. Trạng thái mới đã được tải lại." : err.message;
            loadDetail().then(() => loadHistory()).catch(() => {});
        }
    });

    App.requireRole("CUSTOMER").then(() => {
        refresh();
        App.poll(() => { if (!$("#cancel-dialog").open) refresh(); }, 4000); // NFR-05: hiển thị trạng thái mới dưới 5 giây
    });
})();
