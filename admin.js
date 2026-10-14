/* Trang quản trị: giám sát đơn toàn hệ thống, kích hoạt/tạm ngưng nhà hàng, khóa/mở khóa tài xế. */
(() => {
    const $ = s => document.querySelector(s);
    const DRIVER_STATUS = { AVAILABLE: ["Trực tuyến", "green"], BUSY: ["Đang giao", "blue"], OFFLINE: ["Ngoại tuyến", "gray"] };
    let data = null;

    const stat = (label, icon, value, note) =>
        `<article class="stat-card card"><div class="stat-label">${label} <span>${icon}</span></div><div class="stat-value">${value}</div><span class="muted" style="font-size:.76rem">${note}</span></article>`;

    function render() {
        const s = data.summary;
        $("#stats").innerHTML =
            stat("Doanh thu hôm nay", "💰", App.vnd(s.revenueToday), "Tổng tiền đơn đã giao") +
            stat("Đơn hàng hôm nay", "🧾", s.ordersToday, "Tính từ 0 giờ") +
            stat("Nhà hàng hoạt động", "🍽️", s.restaurantsActive, `Trong tổng số ${s.restaurantsTotal} nhà hàng`) +
            stat("Tài xế trực tuyến", "🛵", s.driversOnline, `Trong tổng số ${s.driversTotal} tài xế`);

        $("#order-rows").innerHTML = data.orders.map(o => `
            <tr><td><strong>#${o.code}</strong><small>${App.clock(o.createdAt)}</small></td><td>${App.esc(o.customerName)}</td><td>${App.esc(o.restaurant.name)}</td><td>${App.vnd(o.total)}</td><td>${App.pill(o.status)}</td></tr>`).join("");

        $("#activity").innerHTML = data.activity.map(a => `
            <div class="activity-item"><span class="activity-dot"></span><p>${App.esc(a.text)}<small>${App.timeAgo(a.at)}</small></p></div>`).join("") || '<p class="empty-state">Chưa có hoạt động.</p>';

        const total = Object.values(s.byStatus).reduce((a, b) => a + b, 0) || 1;
        $("#status-bars").innerHTML = Object.keys(App.STATUS).filter(k => s.byStatus[k]).map(k => `
            <div class="status-bar"><span>${App.STATUS[k][0]}</span><div class="progress"><span style="width:${(s.byStatus[k] / total * 100).toFixed(1)}%"></span></div><strong>${s.byStatus[k]}</strong></div>`).join("");

        $("#restaurant-rows").innerHTML = data.restaurants.map(r => `
            <tr><td><strong>${App.esc(r.name)}</strong><small>${App.esc(r.cuisine)}</small></td><td>${App.esc(r.address)}</td><td>${r.ordersTotal}</td>
                <td>${r.status === "ACTIVE" ? '<span class="pill green">Hoạt động</span>' : '<span class="pill red">Tạm ngưng</span>'}</td>
                <td><button class="button outline small" data-restaurant="${r.id}" data-status="${r.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"}">${r.status === "ACTIVE" ? "Tạm ngưng" : "Kích hoạt"}</button></td></tr>`).join("");

        $("#driver-rows").innerHTML = data.drivers.map(d => {
            const [label, tone] = d.locked ? ["Đã khóa", "red"] : DRIVER_STATUS[d.status];
            return `
            <tr><td><strong>${App.esc(d.name)}</strong></td>
                <td><span class="pill ${tone}">${label}${d.activeOrder ? " #" + d.activeOrder : ""}</span></td>
                <td>${d.locationAt ? "Cập nhật " + App.timeAgo(d.locationAt) : '<span class="muted">Không gửi</span>'}</td>
                <td>★ ${d.rating}</td>
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
    });
    $("#reset-demo").addEventListener("click", () => {
        if (confirm("Đặt lại toàn bộ dữ liệu demo về trạng thái ban đầu?")) run(() => api.admin.reset(), "Đã đặt lại dữ liệu demo.");
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
