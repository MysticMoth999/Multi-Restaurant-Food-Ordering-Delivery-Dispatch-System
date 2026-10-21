/* Tiện ích giao diện dùng chung cho mọi trang. Logic riêng của từng trang nằm trong file js cùng tên trang. */
(() => {
    const App = {};

    App.vnd = n => Number(n || 0).toLocaleString("vi-VN") + "đ"; // chỉ định dạng số tiền backend trả về
    App.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    App.clock = ts => new Date(ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    App.timeAgo = ts => {
        const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
        if (s < 60) return s + " giây trước";
        if (s < 3600) return Math.floor(s / 60) + " phút trước";
        return Math.floor(s / 3600) + " giờ trước";
    };
    App.initials = name => String(name || "?").split(/\s+/).map(w => w[0]).slice(-2).join("").toUpperCase();

    // Nhãn và màu trạng thái đơn, dùng thống nhất trên mọi giao diện (mục 16.5 của tài liệu).
    App.STATUS = {
        PENDING: ["Chờ xác nhận", ""], CONFIRMED: ["Đã xác nhận", ""], PREPARING: ["Đang chuẩn bị", ""],
        READY_FOR_PICKUP: ["Chờ tài xế", ""], DRIVER_ASSIGNED: ["Đã có tài xế", "blue"], PICKED_UP: ["Đã lấy món", "blue"],
        DELIVERING: ["Đang giao", "blue"], DELIVERED: ["Hoàn thành", "green"], CANCELLED: ["Đã hủy", "red"]
    };
    App.pill = status => {
        const [label, tone] = App.STATUS[status] || [status, ""];
        return `<span class="pill ${tone}">${label}</span>`;
    };
    App.PAYMENT = { COD: "Tiền mặt khi nhận", MOCK_WALLET: "Ví điện tử", MOCK_CARD: "Thẻ" };
    App.HOME = { CUSTOMER: "index.html", MANAGER: "restaurant-management.html", DRIVER: "driver.html", ADMIN: "admin.html" };

    App.toast = message => {
        let node = document.querySelector(".toast");
        if (!node) {
            node = document.createElement("div");
            node.className = "toast";
            node.setAttribute("role", "status");
            document.body.append(node);
        }
        node.textContent = message;
        node.classList.add("show", "on");
        clearTimeout(App.toast.timer);
        App.toast.timer = setTimeout(() => node.classList.remove("show", "on"), 2600);
    };

    App.goLogin = () => {
        const here = location.pathname.split("/").pop() + location.search;
        location.replace("login.html?next=" + encodeURIComponent(here));
    };
    // Lỗi từ API: 401 về đăng nhập, còn lại (403/409/422/429/lỗi mạng) hiện thông báo của backend.
    // 409 chỉ báo cho người dùng; trang tự tải lại dữ liệu và để người dùng thao tác lại, không gửi lại thay họ.
    App.fail = error => {
        if (error && error.status === 401) return App.goLogin();
        App.toast(error && error.message ? error.message : "Có lỗi xảy ra, vui lòng thử lại.");
    };

    // Khóa idempotency cho một lần đặt đơn (requestKey).
    App.uuid = () => (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : "k-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);

    // Tên option của dòng đơn: M2 trả object {id,name,surcharge}; vẫn đọc được chuỗi của bản cũ.
    App.optionNames = options => (options || []).map(o => (typeof o === "string" ? o : o.name)).join(", ");

    // API M2 chưa có ảnh/logo/rating/ETA: dùng ảnh chung của giao diện, ẩn các số liệu chưa có.
    App.FALLBACK_COVER = "img/sushiback.jpg";

    App.showUser = user => {
        document.querySelectorAll("[data-user-name]").forEach(el => { el.textContent = user.name; });
        document.querySelectorAll("[data-user-avatar]").forEach(el => { el.textContent = App.initials(user.name); });
    };

    // Trang chỉ dành cho một vai trò: vai trò lấy từ API /me theo token, không theo lựa chọn của người dùng.
    App.requireRole = async role => {
        try {
            const user = await api.auth.me();
            if (user.role !== role) {
                location.replace(App.HOME[user.role]);
                return new Promise(() => {});
            }
            App.showUser(user);
            App.notifications.mount(user);
            return user;
        } catch {
            App.goLogin();
            return new Promise(() => {});
        }
    };
    App.currentUser = () => (api.token.get() ? api.auth.me().catch(() => null) : Promise.resolve(null));

    // Gọi lại hàm theo chu kỳ khi tab đang mở (theo NFR-05: cập nhật dưới 5 giây).
    App.poll = (fn, ms = 4000) => setInterval(() => { if (!document.hidden) fn(); }, ms);

    App.media = url => api.media(url);
    App.km = n => Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " km";
    // Khoảng cách chỉ để hiển thị "còn bao xa"; tiền và điều phối do backend tính.
    App.distanceKm = (a, b) => {
        const r = d => d * Math.PI / 180;
        const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
        return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
    };
    // Nút gọi nhanh: mở trình gọi điện của thiết bị (tel:).
    App.call = (phone, label) => phone ? `<a class="button outline small call-button" href="tel:${App.esc(phone)}" title="Gọi ${App.esc(phone)}">📞 ${App.esc(label)}</a>` : "";
    App.PAID = '<span class="pill green">✓ Đã thanh toán</span>';

    // ---------- Thông báo trong ứng dụng ----------
    // Chuông trên thanh đầu trang; hỏi backend 5 giây/lần, có thông báo mới thì hiện toast (và thông báo trình duyệt nếu được phép).
    const NOTIFY_LINK = { CUSTOMER: id => `orders.html?id=${id}`, MANAGER: () => "restaurant-management.html#orders", DRIVER: () => "driver.html", ADMIN: () => "admin.html" };
    App.notifications = (() => {
        const state = { lastId: null, items: [], unread: 0, role: null, timer: null };
        const bell = document.createElement("div");
        bell.className = "notify";
        bell.innerHTML = `<button class="notify-bell" type="button" aria-label="Thông báo" aria-expanded="false" aria-haspopup="true">🔔<span class="notify-badge" hidden></span></button>
            <div class="notify-panel" hidden><div class="notify-head"><strong>Thông báo</strong><button type="button" class="text-button" data-browser-notify>Bật thông báo trình duyệt</button></div><div class="notify-list"></div></div>`;
        const panel = bell.querySelector(".notify-panel");
        const button = bell.querySelector(".notify-bell");
        const render = () => {
            const badge = bell.querySelector(".notify-badge");
            badge.hidden = !state.unread;
            badge.textContent = state.unread > 9 ? "9+" : state.unread;
            bell.querySelector("[data-browser-notify]").hidden = !("Notification" in window) || Notification.permission !== "default";
            bell.querySelector(".notify-list").innerHTML = state.items.length ? state.items.map(n => `
                <a class="notify-item${n.read ? "" : " unread"}" href="${n.orderId && NOTIFY_LINK[state.role] ? NOTIFY_LINK[state.role](n.orderId) : "#"}">
                    <strong>${App.esc(n.title)}</strong><span>${App.esc(n.body)}</span><small>${App.timeAgo(n.createdAt)}</small></a>`).join("")
                : '<p class="empty-state">Chưa có thông báo.</p>';
        };
        const show = n => {
            App.toast(`🔔 ${n.title}: ${n.body}`);
            if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
                try { new Notification(n.title, { body: n.body }); } catch { /* trình duyệt không hỗ trợ */ }
            }
        };
        async function poll() {
            try {
                const data = await api.notifications.list(state.lastId ?? 0);
                if (state.lastId !== null) data.items.slice().reverse().forEach(show);
                state.items = [...data.items, ...state.items].slice(0, 30);
                state.lastId = Math.max(state.lastId ?? 0, data.lastId);
                state.unread = data.unread;
                render();
            } catch (e) {
                if (e.status === 401) clearInterval(state.timer);
            }
        }
        button.addEventListener("click", async () => {
            const open = panel.hidden;
            panel.hidden = !open;
            button.setAttribute("aria-expanded", String(open));
            if (open && state.unread) {
                await api.notifications.readAll().catch(() => {});
                state.unread = 0;
                state.items = state.items.map(n => ({ ...n, read: true }));
                setTimeout(render, 1500);
            }
        });
        bell.querySelector("[data-browser-notify]").addEventListener("click", async () => {
            await Notification.requestPermission();
            render();
        });
        const close = () => { panel.hidden = true; button.setAttribute("aria-expanded", "false"); };
        document.addEventListener("click", e => { if (!bell.contains(e.target)) close(); });
        document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
        return {
            // Gắn chuông vào chỗ [data-bell] (nếu trang có) hoặc đầu nhóm nút trên thanh đầu trang.
            mount(user) {
                if (!user) return;
                state.role = user.role;
                const slot = document.querySelector("[data-bell]") || document.querySelector(".top-actions");
                if (!slot) return;
                if (slot.matches("[data-bell]")) slot.replaceChildren(bell); else slot.prepend(bell);
                if (!state.timer) {
                    poll();
                    state.timer = App.poll(poll, 5000);
                }
            }
        };
    })();

    document.addEventListener("click", async event => {
        const navToggle = event.target.closest("[data-nav-toggle]");
        if (navToggle) {
            const open = document.querySelector(".main-nav").classList.toggle("open");
            navToggle.setAttribute("aria-expanded", String(open));
        }
        const demo = event.target.closest("[data-demo-toast]");
        if (demo) {
            event.preventDefault();
            App.toast(demo.dataset.demoToast);
        }
        const logout = event.target.closest("[data-logout]");
        if (logout) {
            event.preventDefault();
            await api.auth.logout();
            location.href = "login.html";
        }
    });

    window.App = App;
})();
