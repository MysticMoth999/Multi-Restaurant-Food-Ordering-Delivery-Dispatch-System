/* Đăng nhập / đăng ký bằng email. Trang đích do vai trò backend trả về quyết định (FR-12). */
(() => {
    const form = document.querySelector("#login-form");
    const $ = id => form.querySelector("#" + id);
    const error = $("form-error");
    let registering = false;

    // Chỉ cho quay lại trang trong cùng thư mục, tránh chuyển hướng ra ngoài.
    const next = new URLSearchParams(location.search).get("next");
    const safeNext = next && /^[\w-]+\.html(\?[\w=&%-]*)?$/.test(next) ? next : null;

    function setMode(register) {
        registering = register;
        error.textContent = "";
        form.querySelectorAll("[data-register-only]").forEach(el => {
            el.hidden = !register;
            el.querySelectorAll("input").forEach(input => { input.disabled = !register; });
        });
        form.querySelectorAll("[data-login-only]").forEach(el => { el.hidden = register; });
        $("name").required = register;
        $("confirm-password").required = register;
        $("password").autocomplete = register ? "new-password" : "current-password";
        $("form-title").textContent = register ? "Tạo tài khoản" : "Đăng nhập";
        $("form-intro").textContent = register
            ? "Đăng ký bằng email. Số điện thoại cần có trước khi đặt đơn, bạn có thể nhập ngay hoặc bổ sung sau."
            : "Nhập email và mật khẩu. Hệ thống tự mở trang theo loại tài khoản của bạn.";
        $("submit-button").textContent = register ? "Tạo tài khoản" : "Đăng nhập";
        $("auth-switch-label").textContent = register ? "Đã có tài khoản?" : "Chưa có tài khoản?";
        $("auth-mode-toggle").textContent = register ? "Đăng nhập" : "Đăng ký";
        (register ? $("name") : $("email")).focus();
    }

    $("auth-mode-toggle").addEventListener("click", event => {
        event.preventDefault();
        setMode(!registering);
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        error.textContent = "";
        const data = Object.fromEntries(new FormData(form));
        const phone = (data.phone || "").replace(/[\s().-]/g, "");
        if (!form.reportValidity()) return;
        if (registering) {
            if (data.password.length < 6) return (error.textContent = "Mật khẩu tối thiểu 6 ký tự.");
            if (data.password !== data.confirmPassword) return (error.textContent = "Mật khẩu nhập lại chưa khớp.");
            if (phone && !/^0\d{9}$/.test(phone)) return (error.textContent = "Số điện thoại gồm 10 số, bắt đầu bằng 0.");
        }
        const button = $("submit-button");
        button.disabled = true;
        try {
            if (registering) {
                await api.auth.register({ name: data.name.trim(), email: data.email.trim(), phone: phone || null, password: data.password });
                const email = data.email;
                form.reset();
                setMode(false);
                $("email").value = email;
                $("password").focus();
                App.toast("Đăng ký thành công. Mời bạn đăng nhập.");
                return;
            }
            const user = await api.auth.login(data.email.trim(), data.password, !!data.remember);
            location.href = user.role === "CUSTOMER" && safeNext ? safeNext : App.HOME[user.role];
        } catch (e) {
            error.textContent = e.message;
        } finally {
            button.disabled = false;
        }
    });
})();
