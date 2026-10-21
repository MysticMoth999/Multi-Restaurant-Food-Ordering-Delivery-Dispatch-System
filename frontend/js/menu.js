/*
 * Trang thực đơn của một nhà hàng (Customer Menu App).
 * Giỏ chỉ lưu lựa chọn (món, option, số lượng). Thành tiền từng dòng, tiền món, phí giao và tổng
 * đều lấy từ API báo giá của backend; trang không tự tính tiền (mục 15.3).
 * Option của M2 là danh sách độc lập, ID số (items[].options): khách chọn 0..n option cho mỗi món.
 * Đặt đơn gửi quoteFingerprint của báo giá đang hiển thị và requestKey (giữ nguyên khi thử lại cùng nội dung).
 */
(() => {
    const $ = s => document.querySelector(s);
    const CART_KEY = "gomeal.cart.v2"; // v2: option ID số của M2; giỏ kiểu cũ (ID chuỗi của mock) bị bỏ qua
    const ATTEMPT_KEY = "gomeal.orderAttempt";
    const LOC_KEY = "gomeal.deliveryLocation";
    const restaurantId = Number(new URLSearchParams(location.search).get("r")) || 1;
    // loc: điểm giao khách chọn trên bản đồ (phí giao tính theo quãng đường); voucher: mã đang áp dụng.
    const S = { menu: null, cat: "all", quote: null, quoteError: null, me: null, seq: 0, loc: null, voucher: "", voucherError: "", vouchers: [], picker: null };
    try { S.loc = JSON.parse(sessionStorage.getItem(LOC_KEY)); } catch { /* chưa chọn */ }
    const saveLoc = () => { try { sessionStorage.setItem(LOC_KEY, JSON.stringify(S.loc)); } catch { /* bỏ qua */ } };

    const isId = v => Number.isSafeInteger(v) && v > 0;
    const loadCart = () => {
        try {
            const c = JSON.parse(sessionStorage.getItem(CART_KEY));
            if (c && isId(c.restaurantId) && Array.isArray(c.items)) {
                c.items = c.items.filter(l => isId(l.menuItemId) && isId(l.quantity) && Array.isArray(l.selectedOptionIds) && l.selectedOptionIds.every(isId));
                return c;
            }
        } catch { /* giỏ trống */ }
        return { restaurantId, items: [] };
    };
    const saveCart = () => { try { sessionStorage.setItem(CART_KEY, JSON.stringify(S.cart)); } catch { /* bỏ qua */ } };
    S.cart = loadCart();

    // Lần đặt đơn chưa có kết quả: { payload, key }. Cùng nội dung thì dùng lại key để backend không tạo đơn trùng.
    const loadAttempt = () => { try { return JSON.parse(sessionStorage.getItem(ATTEMPT_KEY)); } catch { return null; } };
    const saveAttempt = a => { try { a ? sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(a)) : sessionStorage.removeItem(ATTEMPT_KEY); } catch { /* bỏ qua */ } };

    const lineKey = l => JSON.stringify([l.menuItemId, [...(l.selectedOptionIds || [])].sort((a, b) => a - b)]);
    const itemById = id => S.menu.items.find(i => i.id === id);
    const normalize = t => t.toLocaleLowerCase("vi").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
    const EMOJI = "🍣"; // món chưa có ảnh: hiện biểu tượng chung
    const pic = i => i.imageUrl
        ? `<img src="${App.esc(App.media(i.imageUrl))}" alt="${App.esc(i.name)}" loading="lazy" onerror="this.replaceWith(document.createTextNode('${EMOJI}'))">`
        : EMOJI;
    const optionsOf = i => i.options || [];

    // ---------- Tài khoản trên header ----------
    async function renderAccount() {
        S.me = await App.currentUser();
        if (!S.me) return;
        const orders = S.me.role === "CUSTOMER" ? '<a class="account" href="./orders.html">Đơn của tôi</a>' : "";
        $("[data-account]").innerHTML = `<span data-bell></span><span class="who">${App.esc(S.me.name)}</span>${orders}<a class="account" href="#" data-logout>Đăng xuất</a>`;
        App.notifications.mount(S.me);
    }

    // ---------- Thực đơn ----------
    function renderRestaurant() {
        const r = S.menu.restaurant;
        document.title = r.name + " — GoMeal";
        $("#restaurantName").textContent = r.name;
        // M2 chưa có rating/ảnh bìa/logo: ẩn rating, dùng ảnh chung, ẩn logo.
        $("#restaurantRatingBox").hidden = r.rating == null;
        if (r.rating != null) {
            $("#restaurantRating").textContent = r.rating;
            $("#restaurantRatingCount").textContent = r.ratingCount ?? 0;
        }
        $("#restaurantCuisine").textContent = r.cuisine;
        $("#restaurantAddress").textContent = r.address;
        $("#restaurantCover").src = "./" + (r.cover || App.FALLBACK_COVER);
        if (r.logo) $("#restaurantLogo").src = "./" + r.logo;
        else $("#restaurantLogo").hidden = true;
    }

    function renderMenu() {
        // M2 chưa có API danh mục (chỉ có categoryId dạng chữ): không có danh mục thì ẩn thanh tab.
        const categories = S.menu.categories || [];
        $("#tabs").hidden = !categories.length;
        const cats = [{ id: "all", name: "Tất cả" }, ...categories];
        $("#tabs").innerHTML = cats.map(c => `<button class="tab" role="tab" data-c="${App.esc(c.id)}" aria-selected="${S.cat === c.id}">${App.esc(c.name)}</button>`).join("");
        const query = normalize($("#menuSearch").value.trim());
        const list = S.menu.items.filter(i => (S.cat === "all" || i.categoryId === S.cat) && (!query || normalize(`${i.name} ${i.description || ""}`).includes(query)));
        $("#grid").innerHTML = list.length
            ? list.map(i => `
                <article class="item${i.available ? "" : " unavailable"}">
                    <div class="pic">${pic(i)}</div>
                    <div class="b">
                        <h3>${App.esc(i.name)}</h3>
                        <p>${App.esc(i.description || "")}</p>
                        ${i.ingredients ? `<p class="ingredients"><b>Thành phần:</b> ${App.esc(i.ingredients)}</p>` : ""}
                        ${i.available ? "" : '<span class="tag-off">Tạm hết</span>'}
                        <div class="row">
                            <span class="price">${optionsOf(i).some(o => o.available) ? "từ " : ""}${App.vnd(i.price)}</span>
                            <button class="add" data-a="${i.id}" ${i.available ? "" : "disabled"}>${i.available ? "Thêm" : "Hết món"}</button>
                        </div>
                    </div>
                </article>`).join("")
            : `<div class="empty">Không tìm thấy món phù hợp. Hãy thử từ khóa khác.</div>`;
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
        const ask = () => api.cart.quote(S.cart.restaurantId, S.cart.items, { deliveryLocation: S.loc, ...(S.voucher ? { voucherCode: S.voucher } : {}) });
        try {
            let quote;
            try {
                quote = await ask();
                S.voucherError = "";
            } catch (e) {
                // Voucher không hợp lệ: báo lý do, bỏ voucher và báo giá lại không có voucher.
                if (!S.voucher || e.code !== "VALIDATION") throw e;
                S.voucherError = e.message;
                S.voucher = "";
                quote = await ask();
            }
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

    // Ảnh dòng giỏ lấy từ thực đơn (báo giá không kèm ảnh).
    const imageOf = line => { const item = S.menu && itemById(line.menuItemId); return item ? item.imageUrl : null; };
    // Báo giá M2 sắp xếp lại các dòng, nên ghép dòng giỏ với dòng báo giá theo món + bộ option, không theo vị trí.
    const quotedLine = line => S.quote && S.quote.lines.find(q => lineKey(q) === lineKey(line));

    function renderCart() {
        const items = S.cart.items;
        // Dòng giỏ: tên và option từ thực đơn, thành tiền từ báo giá (nếu có).
        $("#lines").innerHTML = items.length
            ? items.map((line, k) => {
                const quoted = quotedLine(line);
                const it = quoted || (S.menu && itemById(line.menuItemId)) || { name: "Món của nhà hàng khác", options: [] };
                const options = quoted ? App.optionNames(quoted.options)
                    : optionsOf(it).filter(o => line.selectedOptionIds.includes(o.id)).map(o => o.name).join(", ");
                return `
                    <div class="line">
                        ${imageOf(line)
                            ? `<img class="line-pic" src="${App.esc(App.media(imageOf(line)))}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'line-pic line-emoji', textContent: '🍱' }))">`
                            : '<span class="line-pic line-emoji" aria-hidden="true">🍱</span>'}
                        <b class="line-title">${App.esc(it.name)}</b>
                        <small class="line-detail">${App.esc(options || "Không thêm tùy chọn")}</small>
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
        $("#feeLabel").textContent = q && q.distanceKm != null ? `Phí giao hàng (${App.km(q.distanceKm)})` : "Phí giao hàng";
        $("#fee").textContent = q ? App.vnd(q.deliveryFee) : "…";
        $("#discountRows").innerHTML = discountRows(q);
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

    // Cùng món và cùng bộ option thì cộng dồn; khác option thì thành dòng riêng (giống quy tắc gộp của M2).
    function put(menuItemId, optionIds) {
        const selectedOptionIds = [...optionIds].sort((a, b) => a - b);
        const key = lineKey({ menuItemId, selectedOptionIds });
        const existing = S.cart.items.find(l => lineKey(l) === key);
        if (existing && existing.quantity >= 99) return App.toast("Tối đa 99 phần mỗi món.");
        if (!existing && S.cart.items.length >= 100) return App.toast("Giỏ tối đa 100 dòng.");
        changeCart(items => existing ? existing.quantity++ : items.push({ menuItemId, quantity: 1, selectedOptionIds }));
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
        const options = optionsOf(it);
        if (!options.some(o => o.available)) return put(id, []);

        // Option độc lập, không bắt buộc: mỗi option một ô đánh dấu. Phụ thu chỉ để tham khảo; tiền do báo giá tính.
        const f = $("#optF");
        f.innerHTML = `<h3>${EMOJI} ${App.esc(it.name)}</h3>
                <fieldset>
                    <legend>Tùy chọn thêm (không bắt buộc)</legend>
                    ${options.map(o => `
                        <label><input type="checkbox" name="opt" value="${o.id}" ${o.available ? "" : "disabled"}> ${App.esc(o.name)}${o.surcharge ? ` (+${App.vnd(o.surcharge)})` : ""}${o.available ? "" : " · tạm hết"}</label>`).join("")}
                </fieldset>
                <div class="btns"><button type="button" class="gh" id="optX">Huỷ</button><button class="full" value="ok">Thêm vào giỏ</button></div>`;
        $("#optX").onclick = () => $("#optD").close();
        f.onsubmit = e => {
            e.preventDefault();
            put(id, [...f.querySelectorAll('input[name="opt"]:checked')].map(c => Number(c.value)));
            $("#optD").close();
        };
        $("#optD").showModal();
    }

    const discountRows = q => (q ? q.discounts : []).map(d => `<div class="discount"><span>${App.esc(d.label)}</span><span>−${App.vnd(d.amount)}</span></div>`).join("");

    // ---------- Đặt hàng ----------
    // Tổng tiền trong hộp xác nhận luôn là báo giá mà fingerprint sắp gửi đi đại diện.
    function renderCheckoutQuote(previous) {
        const q = S.quote;
        $("#coSub").textContent = App.vnd(q.subtotal);
        $("#coFeeLabel").textContent = q.distanceKm != null ? `Phí giao hàng (${App.km(q.distanceKm)})` : "Phí giao hàng";
        $("#coFee").textContent = App.vnd(q.deliveryFee);
        $("#coDiscounts").innerHTML = discountRows(q);
        $("#voucherMsg").textContent = S.voucherError || (q.voucherCode ? `Đã áp dụng voucher ${q.voucherCode}.` : "");
        $("#voucherMsg").className = "hint" + (S.voucherError ? " err-text" : q.voucherCode ? " ok-text" : "");
        $("#coTot").innerHTML = previous && previous.total !== q.total
            ? `<s class="muted">${App.vnd(previous.total)}</s> ${App.vnd(q.total)}`
            : App.vnd(q.total);
    }

    async function openCheckout() {
        S.me = await App.currentUser();
        if (!S.me) {
            saveCart();
            App.toast("Vui lòng đăng nhập để đặt hàng.");
            return setTimeout(App.goLogin, 700);
        }
        if (S.me.role !== "CUSTOMER") return App.toast("Chỉ tài khoản khách hàng mới đặt được đơn.");
        if (!S.quote) return;
        renderCheckoutQuote();
        loadVouchers();
        $("#coErr").textContent = "";
        $("#coSubmit").textContent = "Đặt hàng";
        $("#phone").value = S.me.phone || "";
        $("#phoneHint").textContent = S.me.phone
            ? "Lấy từ tài khoản. Nếu sửa, số mới sẽ được lưu vào tài khoản."
            : "Tài khoản chưa có số điện thoại. Cần nhập để đặt đơn; số này sẽ được lưu vào tài khoản.";
        $("#coD").showModal();
        // Bản đồ chỉ đo được kích thước khi hộp thoại đã mở.
        if (!S.picker) S.picker = App.pickerMap($("#pickMap"), S.loc, S.menu.restaurant, pickLocation);
        else S.picker.refresh();
        ($("#addr").value ? $("#coSubmit") : $("#addr")).focus();
    }

    // Báo giá lại trong hộp đặt hàng (đổi điểm giao hoặc voucher); khóa nút Đặt hàng đến khi có báo giá mới.
    function requote() {
        S.quote = null;
        $("#coSubmit").disabled = true;
        refreshQuote().then(() => {
            if (S.quote) renderCheckoutQuote();
            else $("#coErr").textContent = S.quoteError || "";
            $("#coSubmit").disabled = !S.quote;
        });
    }

    function pickLocation(point) {
        S.loc = point;
        saveLoc();
        requote();
    }

    async function loadVouchers() {
        try {
            S.vouchers = await api.vouchers();
        } catch { S.vouchers = []; }
        $("#voucherSelect").innerHTML = '<option value="">— Chọn voucher của bạn —</option>' + S.vouchers.map(v =>
            `<option value="${App.esc(v.code)}" ${v.code === S.voucher ? "selected" : ""}>${App.esc(v.code)} · ${App.esc(v.description)}</option>`).join("");
    }

    function applyVoucher(code) {
        S.voucher = code.trim().toUpperCase();
        S.voucherError = "";
        requote();
    }

    async function submitOrder(e) {
        e.preventDefault();
        const address = $("#addr").value.trim();
        const phone = $("#phone").value.replace(/[\s().-]/g, "");
        if (!address) return ($("#coErr").textContent = "Vui lòng nhập địa chỉ nhận hàng.");
        if (!/^0\d{9}$/.test(phone)) return ($("#coErr").textContent = "Số điện thoại gồm 10 số, bắt đầu bằng 0.");
        if (!S.quote) return ($("#coErr").textContent = "Đang lấy báo giá, vui lòng thử lại sau giây lát.");
        $("#coSubmit").disabled = true;
        $("#coErr").textContent = "";
        try {
            if (phone !== S.me.phone) S.me = await api.auth.updatePhone(phone);
            const body = {
                restaurantId: S.cart.restaurantId,
                items: S.cart.items,
                deliveryAddress: address,
                deliveryLocation: S.loc,
                ...(S.quote.voucherCode ? { voucherCode: S.quote.voucherCode } : {}),
                paymentMethod: new FormData($("#coF")).get("pay"),
                quoteFingerprint: S.quote.quoteFingerprint
            };
            // Mỗi lần đặt với nội dung mới thì một requestKey mới; thử lại cùng nội dung (sau lỗi mạng) giữ key cũ.
            const payload = JSON.stringify(body);
            let attempt = loadAttempt();
            if (!attempt || attempt.payload !== payload) attempt = { payload, key: App.uuid() };
            saveAttempt(attempt);
            const { order } = await api.orders.create({ ...body, requestKey: attempt.key });
            saveAttempt(null);
            S.cart = { restaurantId, items: [] };
            S.voucher = "";
            $("#voucherCode").value = "";
            saveCart();
            refreshQuote();
            $("#coD").close();
            // Hiển thị đúng số liệu đơn backend vừa tạo.
            $("#doneCode").textContent = "#" + order.code;
            $("#doneTrack").href = "./orders.html?id=" + order.id;
            $("#doneStatus").innerHTML = App.pill(order.status);
            $("#doneSub").textContent = App.vnd(order.subtotal);
            $("#doneFee").textContent = App.vnd(order.deliveryFee);
            $("#doneDiscount").textContent = order.discount ? "−" + App.vnd(order.discount) : "0đ";
            $("#doneTot").textContent = App.vnd(order.total);
            $("#donePay").textContent = App.PAYMENT[order.paymentMethod] + (order.paymentStatus === "SUCCESS" ? " · đã thanh toán (mô phỏng)" : " · thu khi giao");
            $("#doneD").showModal();
        } catch (err) {
            if (err.status === 401) return App.goLogin();
            if (err.code === "PRICE_CHANGED" && err.data && err.data.quote) {
                // Giá/món đã đổi: hiện báo giá mới, khách phải tự bấm xác nhận lại (lần bấm sau là yêu cầu mới, key mới).
                const previous = S.quote;
                S.quote = err.data.quote;
                renderCart();
                renderCheckoutQuote(previous);
                $("#coSubmit").textContent = "Xác nhận giá mới và đặt hàng";
                $("#coErr").textContent = `${err.message} Tổng mới: ${App.vnd(S.quote.total)}.`;
            } else if (err.network) {
                $("#coErr").textContent = "Mất kết nối khi gửi đơn. Bấm Đặt hàng để thử lại, hệ thống sẽ không tạo đơn trùng.";
            } else {
                $("#coErr").textContent = err.message;
                if (err.status === 400 || err.conflict) refreshQuote(); // món/option có thể vừa ngừng bán
            }
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
    $("#voucherSelect").addEventListener("change", e => { $("#voucherCode").value = e.target.value; applyVoucher(e.target.value); });
    $("#voucherApply").addEventListener("click", () => applyVoucher($("#voucherCode").value));
    $("#myLocation").addEventListener("click", () => {
        if (!navigator.geolocation) return App.toast("Trình duyệt không hỗ trợ lấy vị trí.");
        navigator.geolocation.getCurrentPosition(
            p => { const point = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }; if (S.picker) S.picker.set(point); pickLocation(point); },
            () => App.toast("Không lấy được vị trí. Hãy bấm chọn điểm giao trên bản đồ."),
            { timeout: 8000 }
        );
    });

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
        // Chưa chọn điểm giao: mặc định một điểm gần nhà hàng (khoảng 0,8 km), khách đổi được khi đặt hàng.
        const r = S.menu.restaurant;
        if (!S.loc || !Number.isFinite(S.loc.lat) || App.distanceKm(S.loc, r) > 10) { S.loc = { lat: +(r.lat + 0.006).toFixed(6), lng: +(r.lng + 0.004).toFixed(6) }; saveLoc(); }
        if (S.cart.restaurantId !== restaurantId && !S.cart.items.length) S.cart.restaurantId = restaurantId;
        renderCart();
        refreshQuote();
    })();
})();
