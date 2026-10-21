/* Trang quản trị: giám sát đơn toàn hệ thống, kích hoạt/tạm ngưng nhà hàng, khóa/mở khóa tài xế.
 * Chỉ số tổng hợp lấy từ summary của M2. M2 chưa có /admin/reset, tổng đơn theo nhà hàng, đánh giá tài xế: không hiển thị. */
(() => {
    const $ = s => document.querySelector(s);
    const DRIVER_STATUS = { AVAILABLE: ["Trực tuyến", "green"], BUSY: ["Đang giao", "blue"], OFFLINE: ["Ngoại tuyến", "gray"] };
    let data = null;

    const stat = (label, icon, value, note) =>
        `<article class="stat-card card"><div class="stat-label">${label} <span>${icon}</span></div><div class="stat-value">${value}</div><span class="muted" style="font-size:.76rem">${note}</span></article>`;

    const offer = v => (v.percent ? `Giảm ${v.percent}%` : `Giảm ${App.vnd(v.amount)}`) + (v.kind === "SHIPPING" ? " phí giao" : " tiền món") + (v.maxDiscount ? `, tối đa ${App.vnd(v.maxDiscount)}` : "");
    function renderPricing() {
        const p = data.pricing;
        if (document.activeElement !== $("#fuel-price")) $("#fuel-price").value = p.fuelPrice;
        $("#fuel-note").textContent = `Giá tham chiếu ${App.vnd(p.referenceFuelPrice)}/lít · hệ số hiện tại ×${(p.fuelPrice / p.referenceFuelPrice).toFixed(2)} · nhận đơn tối đa ${p.maxKm} km.`;
        let from = 0;
        $("#tier-rows").innerHTML = p.tiers.map(t => { const row = `<tr><td>${from}–${t.upToKm} km</td><td><strong>${App.vnd(t.fee)}</strong></td></tr>`; from = t.upToKm; return row; }).join("");
        $("#value-rows").innerHTML = p.orderValueDiscounts.map(d => `<tr><td>${App.vnd(d.minSubtotal)}</td><td>${d.percent === 100 ? "Miễn phí" : d.percent + "%"}</td></tr>`).join("");
        $("#voucher-rows").innerHTML = data.vouchers.map(v => `
            <tr><td><strong>${App.esc(v.code)}</strong><small>${App.esc(v.description)}</small></td>
                <td>${App.esc(offer(v))}</td>
                <td><small>Đơn từ ${App.vnd(v.minSubtotal)}${v.customerEmail ? "<br>Chỉ " + App.esc(v.customerEmail) : ""}${v.expiresAt ? "<br>HSD " + new Date(v.expiresAt).toLocaleDateString("vi-VN") : ""}</small></td>
                <td>${v.used}</td>
                <td>${v.active ? '<span class="pill green">Đang bật</span>' : '<span class="pill red">Đã tắt</span>'}</td>
                <td><button class="button outline small" data-voucher="${v.id}" data-active="${!v.active}">${v.active ? "Tắt" : "Bật"}</button></td></tr>`).join("") || '<tr><td colspan="6" class="empty-state">Chưa có voucher.</td></tr>';
    }

    function render() {
        const s = data.summary;
        renderPricing();
        $("#stats").innerHTML =
            stat("Doanh thu hôm nay", "💰", App.vnd(s.revenueToday), "Tổng tiền đơn đã giao") +
            stat("Đơn hàng hôm nay", "🧾", s.ordersToday, "Tính từ 0 giờ") +
            stat("Nhà hàng hoạt động", "🍽️", s.restaurantsActive, `Trong tổng số ${s.restaurantsTotal} nhà hàng`) +
            stat("Tài xế trực tuyến", "🛵", s.driversOnline, `Trong tổng số ${s.driversTotal} tài xế`);

        $("#order-rows").innerHTML = data.orders.slice(0, 10).map(o => `
            <tr><td><strong>#${App.esc(o.code)}</strong><small>${App.clock(o.createdAt)}</small></td><td>${App.esc(o.customerName)}</td><td>${App.esc(o.restaurant.name)}</td><td>${App.vnd(o.total)}</td><td>${App.pill(o.status)}</td></tr>`).join("");

        $("#activity").innerHTML = data.activity.map(a => `
            <div class="activity-item"><span class="activity-dot"></span><p>${App.esc(a.text)}<small>${App.timeAgo(a.at)}</small></p></div>`).join("") || '<p class="empty-state">Chưa có hoạt động.</p>';

        const total = Object.values(s.byStatus).reduce((a, b) => a + b, 0) || 1;
        $("#status-bars").innerHTML = Object.keys(App.STATUS).filter(k => s.byStatus[k]).map(k => `
            <div class="status-bar"><span>${App.STATUS[k][0]}</span><div class="progress"><span style="width:${(s.byStatus[k] / total * 100).toFixed(1)}%"></span></div><strong>${s.byStatus[k]}</strong></div>`).join("");

        $("#restaurant-rows").innerHTML = data.restaurants.map(r => `
            <tr><td><strong>${App.esc(r.name)}</strong><small>${App.esc(r.cuisine)}</small></td><td>${App.esc(r.address)}</td>
                <td>${r.status === "ACTIVE" ? '<span class="pill green">Hoạt động</span>' : '<span class="pill red">Tạm ngưng</span>'}</td>
                <td><button class="button outline small" data-restaurant="${r.id}" data-status="${r.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"}">${r.status === "ACTIVE" ? "Tạm ngưng" : "Kích hoạt"}</button></td></tr>`).join("");

        $("#driver-rows").innerHTML = data.drivers.map(d => {
            const [label, tone] = d.locked ? ["Đã khóa", "red"] : DRIVER_STATUS[d.status] || [d.status, ""];
            return `
            <tr><td><strong>${App.esc(d.name)}</strong></td>
                <td><span class="pill ${tone}">${App.esc(label)}</span></td>
                <td>${d.locationAt ? "Cập nhật " + App.timeAgo(d.locationAt) : '<span class="muted">Không gửi</span>'}</td>
                <td><button class="button outline small" data-driver="${d.id}" data-locked="${!d.locked}">${d.locked ? "Mở khóa" : "Khóa"}</button></td></tr>`;
        }).join("");
    }

    async function reload() {
        try {
            data = await api.admin.dashboard();
            render();
        } catch (e) {
            App.fail(e);
        }
    }

    async function run(action, okMessage) {
        try {
            await action();
            App.toast(okMessage);
        } catch (e) {
            App.fail(e);
        }
        reload();
    }

    document.addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b || !data) return;
        if (b.dataset.restaurant) run(() => api.admin.setRestaurantStatus(+b.dataset.restaurant, b.dataset.status), "Đã cập nhật trạng thái nhà hàng.");
        if (b.dataset.driver) run(() => api.admin.setDriverLocked(+b.dataset.driver, b.dataset.locked === "true"), "Đã cập nhật tài khoản tài xế.");
        if (b.dataset.voucher) run(() => api.admin.setVoucherActive(+b.dataset.voucher, b.dataset.active === "true"), "Đã cập nhật voucher.");
    });
    $("#fuel-form").addEventListener("submit", e => {
        e.preventDefault();
        run(() => api.admin.setFuelPrice(Number($("#fuel-price").value)), "Đã lưu giá xăng; phí giao đã tính lại theo giá mới.");
    });
    $("#voucher-form").addEventListener("submit", async e => {
        e.preventDefault();
        const f = e.target.elements;
        const num = el => (el.value === "" ? null : Number(el.value));
        const body = { code: f.code.value.trim(), kind: f.kind.value, percent: num(f.percent), amount: num(f.amount), maxDiscount: num(f.maxDiscount), minSubtotal: num(f.minSubtotal) ?? 0, expiresInDays: num(f.expiresInDays), description: f.description.value.trim(), ...(f.customerEmail.value.trim() ? { customerEmail: f.customerEmail.value.trim() } : {}) };
        try {
            await api.admin.createVoucher(body);
            e.target.reset();
            $("#voucher-error").textContent = "";
            App.toast("Đã tạo voucher " + body.code.toUpperCase() + ".");
            reload();
        } catch (err) {
            if (err.status === 401) return App.goLogin();
            $("#voucher-error").textContent = err.message;
        }
    });
    $("#export-csv").addEventListener("click", () => {
        if (!data) return;
        const rows = [["Mã đơn", "Giờ đặt", "Khách hàng", "Nhà hàng", "Tổng tiền", "Trạng thái"],
            ...data.orders.map(o => [o.code, new Date(o.createdAt).toLocaleString("vi-VN"), o.customerName, o.restaurant.name, o.total, App.STATUS[o.status][0]])];
        const csv = "﻿" + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        link.download = "don-hang-gomeal.csv";
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });

    App.requireRole("ADMIN").then(() => {
        reload();
        App.poll(reload, 5000);
    });
})();
