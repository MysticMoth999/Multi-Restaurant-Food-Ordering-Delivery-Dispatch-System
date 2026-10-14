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
    // Lỗi từ API: 401 về đăng nhập, còn lại hiện thông báo dễ hiểu.
    App.fail = error => {
        if (error && error.status === 401) return App.goLogin();
        App.toast(error && error.message ? error.message : "Có lỗi xảy ra, vui lòng thử lại.");
    };

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
            return user;
        } catch {
            App.goLogin();
            return new Promise(() => {});
        }
    };
    App.currentUser = () => (api.token.get() ? api.auth.me().catch(() => null) : Promise.resolve(null));

    // Gọi lại hàm theo chu kỳ khi tab đang mở (theo NFR-05: cập nhật dưới 5 giây).
    App.poll = (fn, ms = 4000) => setInterval(() => { if (!document.hidden) fn(); }, ms);

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
