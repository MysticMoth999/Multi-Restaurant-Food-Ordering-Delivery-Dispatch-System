/* Restaurant Manager Portal: chỉ số, đơn hàng, thực đơn và thông tin nhà hàng — tất cả đọc/ghi qua API. */
(() => {
    const $ = s => document.querySelector(s);
    const NEXT_ACTION = { PENDING: "Xác nhận", CONFIRMED: "Bắt đầu chuẩn bị", PREPARING: "Báo sẵn sàng" };
    const DOT = { PENDING: "var(--yellow)", DELIVERED: "var(--green)", CANCELLED: "var(--red)" };
    let data = null;
    let editingId = null;
    let cancelId = null;

    const stat = (label, icon, value, note, good) =>
        `<article class="stat-card card"><div class="stat-label">${label} <span>${icon}</span></div><div class="stat-value">${value}</div><span class="${good ? "stat-change" : "muted"}" style="font-size:.76rem">${note}</span></article>`;

    function renderSummary() {
        const { restaurant: r, summary: s } = data;
        document.querySelectorAll("[data-restaurant-name]").forEach(el => { el.textContent = r.name; });
        $("#open-status").innerHTML = r.status === "ACTIVE" ? '<span class="pill green">● Đang nhận đơn</span>' : '<span class="pill red">● Tạm ngưng bởi quản trị</span>';
        $("#storefront-link").href = "./hokkaidosachi.html?r=" + r.id;
        $("#stats").innerHTML =
            stat("Doanh thu hôm nay", "💰", App.vnd(s.revenueToday), "Tiền món của đơn đã giao", true) +
            stat("Đơn chờ xác nhận", "🧾", s.pendingOrders, `${s.preparingOrders} đơn đang xử lý`) +
            stat("Món đang bán", "🍱", s.itemsAvailable, `Trong tổng số ${s.itemsTotal} món`) +
            stat("Đánh giá trung bình", "⭐", `${r.rating} / 5`, `${r.ratingCount} lượt đánh giá`);
        $("#pending-count").textContent = s.pendingOrders + " đơn mới";
        $("#rating-pill").textContent = `★ ${r.rating} / 5`;
    }

    function renderOrders() {
        $("#order-list").innerHTML = data.orders.length ? data.orders.map(o => {
            const items = o.lines.map(l => `${l.quantity}× ${l.name}${l.options.length ? " (" + l.options.join(", ") + ")" : ""}`).join("; ");
            let actions = "";
            if (NEXT_ACTION[o.status]) actions += `<button class="button small ${o.status === "PREPARING" ? "primary" : "outline"}" data-next="${o.id}">${NEXT_ACTION[o.status]}</button>`;
            if (o.status === "PENDING" || o.status === "CONFIRMED") actions += `<button class="button small outline" data-cancel="${o.id}" data-code="${o.code}">Hủy</button>`;
            if (o.status === "READY_FOR_PICKUP") actions = '<span class="pill">Đang mời tài xế</span>';
            if (o.driverName && o.status !== "DELIVERED") actions = `<span class="pill blue">🛵 ${App.esc(o.driverName)}</span>`;
            return `
                <div class="activity-item order-row">
                    <span class="activity-dot" style="background:${DOT[o.status] || "var(--blue)"}"></span>
                    <p><strong>#${o.code}</strong> · ${App.esc(o.customerName)} · ${App.vnd(o.total)} ${App.pill(o.status)}
                        <small>${App.esc(items)}</small>
                        <small>${App.clock(o.createdAt)} · ${App.PAYMENT[o.paymentMethod]}${o.cancelReason ? " · Lý do hủy: " + App.esc(o.cancelReason) : ""}</small></p>
                    <span class="row-actions">${actions}</span>
                </div>`;
        }).join("") : '<p class="empty-state">Chưa có đơn hàng.</p>';
    }

    function renderMenu() {
        const categoryName = id => (data.categories.find(c => c.id === id) || {}).name || "";
        const select = $("#menu-category");
        if (select.options.length === 1) {
            select.insertAdjacentHTML("beforeend", data.categories.map(c => `<option value="${c.id}">${App.esc(c.name)}</option>`).join(""));
            $("#item-category").innerHTML = data.categories.map(c => `<option value="${c.id}">${App.esc(c.name)}</option>`).join("");
        }
        const q = $("#menu-search").value.trim().toLocaleLowerCase("vi");
        const list = data.items.filter(i => (!select.value || i.categoryId === select.value) && i.name.toLocaleLowerCase("vi").includes(q));
        $("#menu-items").innerHTML = list.length ? list.map(i => `
            <tr>
                <td>${i.image ? `<img class="menu-thumb" src="./${App.esc(i.image)}" alt="">` : `<span class="menu-thumb emoji">${i.emoji}</span>`}<strong>${App.esc(i.name)}</strong></td>
                <td>${App.esc(categoryName(i.categoryId))}</td>
                <td>${App.vnd(i.price)}</td>
                <td>${i.available ? '<span class="pill green">Đang bán</span>' : '<span class="pill red">Tạm hết</span>'}</td>
                <td><div class="row-actions"><button class="button outline small" data-edit="${i.id}">Sửa</button><button class="button outline small" data-toggle="${i.id}">${i.available ? "Ngừng bán" : "Mở bán"}</button></div></td>
            </tr>`).join("") : '<tr><td colspan="5" class="empty-state">Không có món phù hợp.</td></tr>';
    }

    async function reload(full) {
        try {
            data = await api.manager.dashboard();
            renderSummary();
            renderOrders();
            renderMenu();
            if (full) {
                const f = $("#settings-form").elements;
                f.name.value = data.restaurant.name;
                f.cuisine.value = data.restaurant.cuisine;
                f.hours.value = data.restaurant.hours;
            }
        } catch (e) {
            App.fail(e);
        }
    }

    async function run(action, okMessage) {
        try {
            await action();
            if (okMessage) App.toast(okMessage);
        } catch (e) {
            App.fail(e);
        }
        await reload();
    }

    function openItemDialog(item) {
        editingId = item ? item.id : null;
        $("#item-form").reset();
        const f = $("#item-form").elements;
        $("#item-error").textContent = "";
        $("#item-dialog-title").textContent = item ? "Sửa món" : "Thêm món mới";
        $("#item-submit").textContent = item ? "Lưu" : "Thêm món";
        if (item) {
            f.name.value = item.name;
            f.categoryId.value = item.categoryId;
            f.price.value = item.price;
        }
        $("#item-dialog").showModal();
    }

    document.addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b || !data) return;
        const d = b.dataset;
        if (d.next) run(() => api.manager.nextStatus(+d.next), "Đã cập nhật trạng thái đơn.");
        if (d.toggle) {
            const item = data.items.find(i => i.id === +d.toggle);
            run(() => api.manager.updateItem(item.id, { available: !item.available }), item.available ? "Đã ngừng bán món." : "Đã mở bán lại món.");
        }
        if (d.edit) openItemDialog(data.items.find(i => i.id === +d.edit));
        if (d.cancel) {
            cancelId = +d.cancel;
            $("#cancel-form").reset();
            $("#cancel-error").textContent = "";
            $("#cancel-code").textContent = "#" + d.code;
            $("#cancel-dialog").showModal();
        }
        if (b.matches("[data-dialog-close]")) b.closest("dialog").close();
    });
    $("#add-menu-item").addEventListener("click", () => openItemDialog(null));
    $("#menu-search").addEventListener("input", renderMenu);
    $("#menu-category").addEventListener("change", renderMenu);

    $("#item-form").addEventListener("submit", async e => {
        e.preventDefault();
        if (!e.target.reportValidity()) return;
        const f = e.target.elements;
        const body = { name: f.name.value.trim(), categoryId: f.categoryId.value, price: Number(f.price.value) };
        try {
            if (editingId) await api.manager.updateItem(editingId, body);
            else await api.manager.addItem(body);
            $("#item-dialog").close();
            App.toast(editingId ? "Đã lưu món." : "Đã thêm món vào thực đơn.");
            reload();
        } catch (err) {
            $("#item-error").textContent = err.message;
        }
    });
    $("#cancel-form").addEventListener("submit", async e => {
        e.preventDefault();
        try {
            await api.manager.cancel(cancelId, e.target.elements.reason.value);
            $("#cancel-dialog").close();
            App.toast("Đã hủy đơn.");
            reload();
        } catch (err) {
            $("#cancel-error").textContent = err.message;
        }
    });
    $("#settings-form").addEventListener("submit", e => {
        e.preventDefault();
        if (!e.target.reportValidity()) return;
        const f = e.target.elements;
        run(() => api.manager.updateRestaurant({ name: f.name.value.trim(), cuisine: f.cuisine.value.trim(), hours: f.hours.value.trim() }), "Đã lưu thông tin nhà hàng.");
    });

    App.requireRole("MANAGER").then(() => {
        reload(true);
        App.poll(() => { if (!document.querySelector("dialog[open]")) reload(); }, 5000);
    });
})();
