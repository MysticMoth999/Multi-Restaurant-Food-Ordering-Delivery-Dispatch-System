/*
 * Restaurant Manager Portal: đơn hàng, thực đơn và thông tin nhà hàng — tất cả đọc/ghi qua API M2.
 * Chuyển trạng thái qua POST /orders/:id/transitions với targetStatus + expectedVersion của đơn đang hiển thị.
 * Gặp 409 (đơn vừa đổi) thì báo và tải lại; người quản lý tự quyết định thao tác tiếp, trang không tự gửi lại.
 */
(() => {
    const $ = s => document.querySelector(s);
    const NEXT = {
        PENDING: ["CONFIRMED", "Xác nhận"],
        CONFIRMED: ["PREPARING", "Bắt đầu chuẩn bị"],
        PREPARING: ["READY_FOR_PICKUP", "Báo sẵn sàng"]
    };
    const DOT = { PENDING: "var(--yellow)", DELIVERED: "var(--green)", CANCELLED: "var(--red)" };
    const KITCHEN = ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP"];
    const ON_ROAD = ["DRIVER_ASSIGNED", "PICKED_UP", "DELIVERING"];
    let data = null;
    let editingId = null;
    let cancelId = null;
    let busy = false;

    const stat = (label, icon, value, note) =>
        `<article class="stat-card card"><div class="stat-label">${label} <span>${icon}</span></div><div class="stat-value">${value}</div><span class="muted" style="font-size:.76rem">${note}</span></article>`;
    const orderById = id => data.orders.find(o => o.id === id);
    const count = statuses => data.orders.filter(o => statuses.includes(o.status)).length;

    // M2 chưa có API chỉ số (doanh thu, đánh giá): chỉ đếm số đơn/món từ dữ liệu đang có, không tự cộng tiền.
    function renderSummary() {
        const r = data.restaurant;
        document.querySelectorAll("[data-restaurant-name]").forEach(el => { el.textContent = r.name; });
        $("#open-status").innerHTML = r.status === "ACTIVE" ? '<span class="pill green">● Đang nhận đơn</span>' : '<span class="pill red">● Tạm ngưng bởi quản trị</span>';
        $("#storefront-link").href = "./hokkaidosachi.html?r=" + r.id;
        const pending = count(["PENDING"]);
        $("#stats").innerHTML =
            stat("Đơn chờ xác nhận", "🧾", pending, "Cần xác nhận hoặc hủy") +
            stat("Đang chuẩn bị", "🍳", count(KITCHEN), "Đã xác nhận, chưa có tài xế nhận") +
            stat("Đang giao", "🛵", count(ON_ROAD), "Tài xế đã nhận đơn") +
            stat("Món đang bán", "🍱", data.items.filter(i => i.available).length, `Trong tổng số ${data.items.length} món`);
        $("#pending-count").textContent = pending + " đơn mới";
    }

    function renderOrders() {
        $("#order-list").innerHTML = data.orders.length ? data.orders.map(o => {
            const items = o.lines.map(l => `${l.quantity}× ${l.name}${l.options.length ? " (" + App.optionNames(l.options) + ")" : ""}`).join("; ");
            let actions = "";
            if (NEXT[o.status]) actions += `<button class="button small ${o.status === "PREPARING" ? "primary" : "outline"}" data-next="${o.id}">${NEXT[o.status][1]}</button>`;
            if (o.status === "PENDING" || o.status === "CONFIRMED") actions += `<button class="button small outline" data-cancel="${o.id}">Hủy</button>`;
            if (o.status === "READY_FOR_PICKUP") actions = '<span class="pill">Đang mời tài xế</span>';
            if (o.driverName && o.status !== "DELIVERED" && o.status !== "CANCELLED") actions = `<span class="pill blue">🛵 ${App.esc(o.driverName)}</span>${App.call(o.driverPhone, "Gọi tài xế")}`;
            if (o.status !== "DELIVERED" && o.status !== "CANCELLED") actions += App.call(o.contactPhone, "Gọi khách");
            return `
                <div class="activity-item order-row">
                    <span class="activity-dot" style="background:${DOT[o.status] || "var(--blue)"}"></span>
                    <p><strong>#${App.esc(o.code)}</strong> · ${App.esc(o.customerName)} · ${App.vnd(o.total)} ${App.pill(o.status)}
                        <small>${App.esc(items)}</small>
                        <small>${App.clock(o.createdAt)} · ${App.PAYMENT[o.paymentMethod] || App.esc(o.paymentMethod)}${o.paymentStatus === "SUCCESS" ? " · đã thanh toán" : ""}${o.distanceKm != null ? " · giao " + App.km(o.distanceKm) : ""}${o.cancelReason ? " · Lý do hủy: " + App.esc(o.cancelReason) : ""}</small></p>
                    <span class="row-actions">${actions}</span>
                </div>`;
        }).join("") : '<p class="empty-state">Chưa có đơn hàng.</p>';
    }

    function renderMenu() {
        const q = $("#menu-search").value.trim().toLocaleLowerCase("vi");
        const list = data.items.filter(i => i.name.toLocaleLowerCase("vi").includes(q));
        const options = i => (i.options || []).map(o => `${App.esc(o.name)} (+${App.vnd(o.surcharge)})${o.available ? "" : " · tạm hết"}`).join("<br>") || '<span class="muted">Không có</span>';
        $("#menu-items").innerHTML = list.length ? list.map(i => `
            <tr>
                <td>${i.imageUrl ? `<img class="menu-thumb" src="${App.esc(App.media(i.imageUrl))}" alt="">` : '<span class="menu-thumb emoji">🍣</span>'}<strong>${App.esc(i.name)}</strong>${i.ingredients ? `<small class="muted" style="display:block">${App.esc(i.ingredients)}</small>` : ""}</td>
                <td><small>${options(i)}</small></td>
                <td>${App.vnd(i.price)}</td>
                <td>${i.available ? '<span class="pill green">Đang bán</span>' : '<span class="pill red">Tạm hết</span>'}</td>
                <td><div class="row-actions"><button class="button outline small" data-edit="${i.id}">Sửa</button><button class="button outline small" data-toggle="${i.id}">${i.available ? "Ngừng bán" : "Mở bán"}</button></div></td>
            </tr>`).join("") : '<tr><td colspan="5" class="empty-state">Không có món phù hợp.</td></tr>';
    }

    async function reload(full) {
        if (busy) return;
        try {
            data = await api.manager.dashboard();
            renderSummary();
            renderOrders();
            renderMenu();
            if (full) {
                const f = $("#settings-form").elements;
                f.name.value = data.restaurant.name;
                f.cuisine.value = data.restaurant.cuisine || "";
                f.address.value = data.restaurant.address || "";
            }
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
            App.fail(e); // 409: thông báo "Đơn đã thay đổi", bảng được tải lại ngay bên dưới
        } finally {
            busy = false;
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
            f.price.value = item.price;
            f.description.value = item.description || "";
            f.ingredients.value = item.ingredients || "";
        }
        $("#item-preview").innerHTML = item && item.imageUrl ? `<img class="image-preview" src="${App.esc(App.media(item.imageUrl))}" alt="">` : "🍣";
        $("#item-dialog").showModal();
    }

    document.addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b || !data) return;
        const d = b.dataset;
        if (d.next) {
            const order = orderById(+d.next);
            if (order && NEXT[order.status]) run(() => api.manager.transition(order, NEXT[order.status][0]), "Đã cập nhật trạng thái đơn.");
        }
        if (d.toggle) {
            const item = data.items.find(i => i.id === +d.toggle);
            run(() => api.manager.updateItem(item.id, { available: !item.available }), item.available ? "Đã ngừng bán món." : "Đã mở bán lại món.");
        }
        if (d.edit) openItemDialog(data.items.find(i => i.id === +d.edit));
        if (d.cancel) {
            const order = orderById(+d.cancel);
            if (!order) return;
            cancelId = order.id;
            $("#cancel-form").reset();
            $("#cancel-error").textContent = "";
            $("#cancel-code").textContent = "#" + order.code;
            $("#cancel-dialog").showModal();
        }
        if (b.matches("[data-dialog-close]")) b.closest("dialog").close();
    });
    $("#add-menu-item").addEventListener("click", () => openItemDialog(null));
    $("#item-image").addEventListener("change", e => {
        const file = e.target.files[0];
        if (file) $("#item-preview").innerHTML = `<img class="image-preview" src="${URL.createObjectURL(file)}" alt="">`;
    });
    $("#menu-search").addEventListener("input", renderMenu);

    $("#item-form").addEventListener("submit", async e => {
        e.preventDefault();
        if (!e.target.reportValidity()) return;
        const f = e.target.elements;
        const body = { name: f.name.value.trim(), price: Number(f.price.value), description: f.description.value.trim(), ingredients: f.ingredients.value.trim() };
        const file = f.image.files[0];
        if (file && file.size > 2 * 1024 * 1024) return ($("#item-error").textContent = "Ảnh tối đa 2 MB.");
        try {
            const item = editingId ? await api.manager.updateItem(editingId, body) : await api.manager.addItem({ restaurantId: data.restaurant.id, ...body });
            // Ảnh gửi sau khi đã có món (cần mã món); backend tự kiểm loại file.
            if (file) await api.manager.uploadImage(item.id, file);
            $("#item-dialog").close();
            App.toast(editingId ? "Đã lưu món." : "Đã thêm món vào thực đơn.");
            reload();
        } catch (err) {
            if (err.status === 401) return App.goLogin();
            $("#item-error").textContent = err.message;
        }
    });
    $("#cancel-form").addEventListener("submit", async e => {
        e.preventDefault();
        if (!e.target.reportValidity()) return;
        // Hủy theo version của đơn đang hiển thị khi mở hộp thoại.
        const order = orderById(cancelId);
        try {
            await api.manager.cancel(order, e.target.elements.reason.value.trim());
            $("#cancel-dialog").close();
            App.toast("Đã hủy đơn.");
        } catch (err) {
            if (err.status === 401) return App.goLogin();
            $("#cancel-error").textContent = err.conflict ? err.message + " Danh sách đơn đã được tải lại." : err.message;
        }
        reload();
    });

    App.requireRole("MANAGER").then(() => {
        reload(true);
        App.poll(() => { if (!document.querySelector("dialog[open]")) reload(); }, 5000);
    });
})();
