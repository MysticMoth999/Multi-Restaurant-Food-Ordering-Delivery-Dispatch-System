/* Trang chủ: danh sách nhà hàng ACTIVE lấy từ API, tìm theo tên nhà hàng (M2 chưa tìm theo tên món). */
(() => {
    const grid = document.querySelector("#restaurant-grid");
    const empty = document.querySelector("#restaurant-empty");
    const search = document.querySelector("#restaurant-search");

    async function renderAccount() {
        const user = await App.currentUser();
        if (!user) return;
        const work = user.role === "CUSTOMER"
            ? '<a class="button outline" href="./orders.html">Đơn của tôi</a>'
            : `<a class="button outline" href="./${App.HOME[user.role]}">Trang làm việc</a>`;
        document.querySelector("[data-account]").innerHTML =
            `<span class="user-chip"><span class="avatar">${App.esc(App.initials(user.name))}</span>${App.esc(user.name)}</span>${work}<a class="button outline" href="#" data-logout>Đăng xuất</a>`;
        App.notifications.mount(user);
    }

    // M2 chưa trả ảnh bìa/rating/ETA: dùng ảnh chung và hiện địa chỉ thay cho các số liệu chưa có.
    const rating = r => r.rating != null ? `<span><strong>★ ${App.esc(r.rating)}</strong> (${App.esc(r.ratingCount ?? 0)} đánh giá)</span>` : "";
    const card = r => `
        <article class="restaurant-card card">
            <img class="restaurant-cover" src="./${App.esc(r.cover || App.FALLBACK_COVER)}" alt="Món ăn tại ${App.esc(r.name)}">
            <div class="restaurant-info">
                <h3>${App.esc(r.name)}</h3><p>${App.esc(r.cuisine)}</p>
                <div class="restaurant-meta">${rating(r)}<span>📍 ${App.esc(r.address)}</span>${r.eta ? `<span>${App.esc(r.eta)}</span>` : ""}</div>
                <div class="restaurant-action"><span class="pill">Phí giao từ ${App.vnd(r.deliveryFee)}</span><a class="button primary small" href="./hokkaidosachi.html?r=${r.id}">Xem thực đơn</a></div>
            </div>
        </article>`;

    async function renderRestaurants() {
        try {
            const items = await api.restaurants.list(search.value.trim());
            grid.innerHTML = items.map(card).join("");
            empty.hidden = items.length > 0;
        } catch (e) {
            App.fail(e);
        } finally {
            grid.setAttribute("aria-busy", "false");
        }
    }

    let timer;
    search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(renderRestaurants, 250);
    });

    renderAccount();
    renderRestaurants();
})();
