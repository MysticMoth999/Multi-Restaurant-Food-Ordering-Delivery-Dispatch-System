/*
 * Trang thực đơn của một nhà hàng (Customer Menu App).
 * Giỏ chỉ lưu lựa chọn (món, option, số lượng). Thành tiền từng dòng, tiền món, phí giao và tổng
 * đều lấy từ API báo giá của backend; trang không tự tính tiền (mục 15.3).
 */
(() => {
    const $ = s => document.querySelector(s);
    const CART_KEY = "gomeal.cart";
    const restaurantId = Number(new URLSearchParams(location.search).get("r")) || 1;
    const S = { menu: null, cat: "all", quote: null, quoteError: null, me: null, seq: 0 };

    const loadCart = () => {
        try { const c = JSON.parse(sessionStorage.getItem(CART_KEY)); if (c && Array.isArray(c.items)) return c; } catch { /* giỏ trống */ }
        return { restaurantId, items: [] };
    };
    const saveCart = () => { try { sessionStorage.setItem(CART_KEY, JSON.stringify(S.cart)); } catch { /* bỏ qua */ } };
    S.cart = loadCart();

    const itemById = id => S.menu.items.find(i => i.id === id);
    const normalize = t => t.toLocaleLowerCase("vi").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
    const pic = i => i.image
        ? `<img src="./${App.esc(i.image)}" alt="${App.esc(i.name)}" loading="lazy" onerror="this.replaceWith(document.createTextNode('${i.emoji}'))">`
        : i.emoji;

    // ---------- Tài khoản trên header ----------
    async function renderAccount() {
        S.me = await App.currentUser();
        if (!S.me) return;
        const orders = S.me.role === "CUSTOMER" ? '<a class="account" href="./orders.html">Đơn của tôi</a>' : "";
        $("[data-account]").innerHTML = `<span class="who">${App.esc(S.me.name)}</span>${orders}<a class="account" href="#" data-logout>Đăng xuất</a>`;
    }

    // ---------- Thực đơn ----------
    function renderRestaurant() {
        const r = S.menu.restaurant;
        document.title = r.name + " — GoMeal";
        $("#restaurantName").textContent = r.name;
        $("#restaurantRating").textContent = r.rating;
        $("#restaurantRatingCount").textContent = r.ratingCount;
        $("#restaurantCuisine").textContent = r.cuisine;
        $("#restaurantAddress").textContent = r.address;
        $("#restaurantCover").src = "./" + r.cover;
        if (r.logo) $("#restaurantLogo").src = "./" + r.logo;
        else $("#restaurantLogo").hidden = true;
    }

    function renderMenu() {
        const cats = [{ id: "all", name: "Tất cả" }, ...S.menu.categories];
        $("#tabs").innerHTML = cats.map(c => `<button class="tab" role="tab" data-c="${c.id}" aria-selected="${S.cat === c.id}">${App.esc(c.name)}</button>`).join("");
        const query = normalize($("#menuSearch").value.trim());
        const list = S.menu.items.filter(i => (S.cat === "all" || i.categoryId === S.cat) && (!query || normalize(`${i.name} ${i.description}`).includes(query)));
        $("#grid").innerHTML = list.length
            ? list.map(i => `
                <article class="item${i.available ? "" : " unavailable"}">
                    <div class="pic">${pic(i)}</div>
                    <div class="b">
                        <h3>${App.esc(i.name)}</h3>
                        <p>${App.esc(i.description)}</p>
                        ${i.available ? "" : '<span class="tag-off">Tạm hết</span>'}
                        <div class="row">
                            <span class="price">${i.optionGroups.length ? "từ " : ""}${App.vnd(i.price)}</span>
                            <button class="add" data-a="${i.id}" ${i.available ? "" : "disabled"}>${i.available ? "Thêm" : "Hết món"}</button>
                        </div>
                    </div>
                </article>`).join("")
            : `<div class="empty">Không tìm thấy món phù hợp. Hãy thử từ khóa hoặc nhóm món khác.</div>`;
    }

    // ---------- Giỏ hàng ----------
    async function refreshQuote() {
        const seq = ++S.seq;
        S.quoteError = null;
        if (!S.cart.items.length) {
            S.quote = null;
            return renderCart();
        }
        $("#cartSummary").classList.add("loading");
        try {
            const quote = await api.cart.quote(S.cart.restaurantId, S.cart.items);
            if (seq !== S.seq) return; // đã có báo giá mới hơn
            S.quote = quote;
        } catch (e) {
            if (seq !== S.seq) return;
            S.quote = null;
            S.quoteError = e.message;
        }
        $("#cartSummary").classList.remove("loading");
        renderCart();
    }

    function renderCart() {
        const items = S.cart.items;
        // Dòng giỏ: tên và option từ thực đơn, thành tiền từ báo giá (nếu có).
        $("#lines").innerHTML = items.length
            ? items.map((line, k) => {
                const quoted = S.quote && S.quote.lines[k];
                const it = quoted || itemById(line.menuItemId) || { name: "Món của nhà hàng khác", optionGroups: [] };
                const options = quoted ? quoted.options.join(", ")
                    : (it.optionGroups || []).map(g => (g.options.find(o => line.optionIds.includes(o.id)) || {}).name).filter(Boolean).join(", ");
                return `
                    <div class="line">
                        <img class="line-pic" src="./${App.esc(it.image || "")}" alt="" onerror="this.hidden=true">
                        <b class="line-title">${App.esc(it.name)}</b>
                        <small class="line-detail">${App.esc(options || "Mặc định")}</small>
                        <div class="line-bottom">
                            <span class="line-price">${quoted ? App.vnd(quoted.lineTotal) : "…"}</span>
                            <span class="qty">
                                <button data-m="${k}" aria-label="Giảm số lượng ${App.esc(it.name)}">−</button>
                                <span>${line.quantity}</span>
                                <button data-p="${k}" aria-label="Tăng số lượng ${App.esc(it.name)}" ${line.quantity >= 99 ? "disabled" : ""}>+</button>
                            </span>
                        </div>
                    </div>`;
            }).join("")
            : `<div class="cart-empty"><span class="cart-empty-icon" aria-hidden="true">🛍</span><span>Giỏ hàng hiện đang trống</span></div>`;

        const q = S.quote;
        $("#sub").textContent = q ? App.vnd(q.subtotal) : "…";
        $("#fee").textContent = q ? App.vnd(q.deliveryFee) : "…";
        $("#tot").textContent = q ? App.vnd(q.total) : "…";
        $("#cartSummary").hidden = !items.length;
        $("#checkout").disabled = !q;
        $("#cartError").hidden = !S.quoteError;
        $("#cartError").textContent = S.quoteError || "";
    }

    function changeCart(mutate) {
        mutate(S.cart.items);
        S.quote = null; // báo giá cũ không còn đúng; khóa Đặt hàng đến khi có báo giá mới
        saveCart();
        renderCart(); // cập nhật số lượng ngay, tiền chờ báo giá
        refreshQuote();
    }

    function put(menuItemId, optionIds) {
        const key = JSON.stringify([menuItemId, optionIds]);
        const existing = S.cart.items.find(l => JSON.stringify([l.menuItemId, l.optionIds]) === key);
        if (existing && existing.quantity >= 99) return App.toast("Tối đa 99 phần mỗi món.");
        changeCart(items => existing ? existing.quantity++ : items.push({ menuItemId, optionIds, quantity: 1 }));
        App.toast("Đã thêm " + itemById(menuItemId).name);
    }

    function add(id) {
        const it = itemById(id);
        // BR-01: một giỏ một nhà hàng; hỏi khách trước khi xóa giỏ cũ.
        if (S.cart.items.length && S.cart.restaurantId !== restaurantId) {
            if (!confirm("Giỏ đang có món của nhà hàng khác. Xóa giỏ cũ để thêm món của nhà hàng này?")) return;
            S.cart = { restaurantId, items: [] };
        }
        S.cart.restaurantId = restaurantId;
        if (!it.optionGroups.length) return put(id, []);

        const f = $("#optF");
        f.innerHTML = `<h3>${it.emoji} ${App.esc(it.name)}</h3>`
            + it.optionGroups.map((g, gi) => `
                <fieldset>
                    <legend>${App.esc(g.name)}</legend>
                    ${g.options.map((o, oi) => `
                        <label><input type="radio" name="g${gi}" value="${o.id}" ${oi ? "" : "checked"}> ${App.esc(o.name)}${o.surcharge ? ` (+${App.vnd(o.surcharge)})` : ""}</label>`).join("")}
                </fieldset>`).join("")
            + `<div class="btns"><button type="button" class="gh" id="optX">Huỷ</button><button class="full" value="ok">Thêm vào giỏ</button></div>`;
        $("#optX").onclick = () => $("#optD").close();
        f.onsubmit = e => {
            e.preventDefault();
            put(id, it.optionGroups.map((g, gi) => f.elements["g" + gi].value));
            $("#optD").close();
        };
        $("#optD").showModal();
    }

    // ---------- Đặt hàng ----------
    async function openCheckout() {
        S.me = await App.currentUser();
        if (!S.me) {
            saveCart();
            App.toast("Vui lòng đăng nhập để đặt hàng.");
            return setTimeout(App.goLogin, 700);
        }
        if (S.me.role !== "CUSTOMER") return App.toast("Chỉ tài khoản khách hàng mới đặt được đơn.");
        const q = S.quote;
        $("#coSub").textContent = App.vnd(q.subtotal);
        $("#coFee").textContent = App.vnd(q.deliveryFee);
        $("#coTot").textContent = App.vnd(q.total);
        $("#coErr").textContent = "";
        $("#phone").value = S.me.phone || "";
        $("#phoneHint").textContent = S.me.phone
            ? "Lấy từ tài khoản. Nếu sửa, số mới sẽ được lưu vào tài khoản."
            : "Tài khoản chưa có số điện thoại. Cần nhập để đặt đơn; số này sẽ được lưu vào tài khoản.";
        $("#coD").showModal();
        ($("#addr").value ? $("#coSubmit") : $("#addr")).focus();
    }

    async function submitOrder(e) {
        e.preventDefault();
        const address = $("#addr").value.trim();
        const phone = $("#phone").value.replace(/[\s().-]/g, "");
        if (!address) return ($("#coErr").textContent = "Vui lòng nhập địa chỉ nhận hàng.");
        if (!/^0\d{9}$/.test(phone)) return ($("#coErr").textContent = "Số điện thoại gồm 10 số, bắt đầu bằng 0.");
        $("#coSubmit").disabled = true;
        try {
            if (phone !== S.me.phone) S.me = await api.auth.updatePhone(phone);
            const order = await api.orders.create({
                restaurantId: S.cart.restaurantId,
                items: S.cart.items,
                deliveryAddress: address,
                paymentMethod: new FormData($("#coF")).get("pay")
            });
            S.cart = { restaurantId, items: [] };
            saveCart();
            refreshQuote();
            $("#coD").close();
            // Hiển thị đúng số liệu đơn backend vừa tạo.
            $("#doneCode").textContent = "#" + order.code;
            $("#doneTrack").href = "./orders.html?id=" + order.id;
            $("#doneStatus").innerHTML = App.pill(order.status);
            $("#doneSub").textContent = App.vnd(order.subtotal);
            $("#doneFee").textContent = App.vnd(order.deliveryFee);
            $("#doneTot").textContent = App.vnd(order.total);
            $("#donePay").textContent = App.PAYMENT[order.paymentMethod] + (order.paymentStatus === "SUCCESS" ? " · đã thanh toán" : " · thu khi giao");
            $("#doneD").showModal();
        } catch (err) {
            if (err.status === 401) return App.goLogin();
            $("#coErr").textContent = err.message;
        } finally {
            $("#coSubmit").disabled = false;
        }
    }

    // ---------- Sự kiện ----------
    document.addEventListener("click", e => {
        const t = e.target.closest("button");
        if (!t || !S.menu) return;
        const d = t.dataset;
        if (d.c) {
            S.cat = d.c;
            renderMenu();
        } else if (d.a) {
            add(+d.a);
        } else if (d.p !== undefined) {
            changeCart(items => { if (items[+d.p].quantity < 99) items[+d.p].quantity++; });
        } else if (d.m !== undefined) {
            changeCart(items => { if (--items[+d.m].quantity < 1) items.splice(+d.m, 1); });
        }
    });
    $("#menuSearch").addEventListener("input", renderMenu);
    $("#checkout").addEventListener("click", openCheckout);
    $("#coX").addEventListener("click", () => $("#coD").close());
    $("#coF").addEventListener("submit", submitOrder);

    (async () => {
        renderAccount();
        try {
            S.menu = await api.restaurants.menu(restaurantId);
        } catch (e) {
            $("#restaurantName").textContent = "Không mở được thực đơn";
            $("#grid").innerHTML = `<div class="empty">${App.esc(e.message)} <a href="./index.html">Về trang chủ</a></div>`;
            return;
        }
        renderRestaurant();
        renderMenu();
        if (S.cart.restaurantId !== restaurantId && !S.cart.items.length) S.cart.restaurantId = restaurantId;
        renderCart();
        refreshQuote();
    })();
})();
