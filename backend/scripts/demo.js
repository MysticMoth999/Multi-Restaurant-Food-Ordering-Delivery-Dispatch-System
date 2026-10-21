import { randomUUID } from "node:crypto";

const base = process.env.API_BASE ?? "http://127.0.0.1:3000/api";
const password = process.env.DEMO_PASSWORD ?? "demo12345";
async function request(method, path, body, token) {
    const response = await fetch(base + path, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(`${response.status} ${result.code}: ${result.error}`);
    }
    return result.data;
}
async function login(email) {
    return (await request("POST", "/auth/login", { email, password })).token;
}
try {
    const customer = await login("khach@gomeal.vn");
    const manager = await login("nhahang@gomeal.vn");
    const driver = await login("taixe@gomeal.vn");
    await request(
        "PUT",
        "/driver/status",
        { status: "AVAILABLE", location: { lat: 10.7705, lng: 106.6932 } },
        driver
    );
    const items = [{ menuItemId: 1, quantity: 2, selectedOptionIds: [1] }];
    const deliveryLocation = { lat: 10.78, lng: 106.7 };
    const quote = await request("POST", "/cart/quote", { restaurantId: 1, items, deliveryLocation });
    console.log("Báo giá:", quote.total, "VND");
    const body = {
        restaurantId: 1,
        items,
        deliveryAddress: "18 Lê Văn Sỹ, Quận 3",
        deliveryLocation,
        paymentMethod: "COD",
        requestKey: randomUUID(),
        quoteFingerprint: quote.quoteFingerprint,
    };
    let { order } = await request("POST", "/orders", body, customer);
    const replay = await request("POST", "/orders", body, customer);
    console.log("Tạo đơn:", order.code, order.status, "retry cùng key:", replay.replayed);
    for (const targetStatus of ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP"]) {
        ({ order } = await request(
            "POST",
            `/orders/${order.id}/transitions`,
            { targetStatus, expectedVersion: order.version },
            manager
        ));
        console.log("Nhà hàng:", order.status);
    }
    const board = await request("GET", "/driver/board", undefined, driver);
    if (board.offer?.id !== order.id) {
        throw new Error(
            "Tài xế 1 chưa được mời đơn này; kiểm tra các đơn đang chờ hoặc tài xế khác trên dữ liệu demo."
        );
    }
    ({ order } = await request("POST", `/driver/offers/${board.offer.offerId}/accept`, {}, driver));
    console.log("Nhận lời mời:", order.status);
    for (const targetStatus of ["PICKED_UP", "DELIVERING", "DELIVERED"]) {
        ({ order } = await request(
            "POST",
            `/orders/${order.id}/transitions`,
            { targetStatus, expectedVersion: order.version, codCollected: true },
            driver
        ));
        console.log("Tài xế:", order.status);
    }
    console.log("Thanh toán:", order.paymentStatus, "| lịch sử:", order.history.length, "bước");
    for (const token of [customer, manager, driver]) {
        await request("POST", "/auth/logout", {}, token);
    }
} catch (error) {
    console.error("Demo chưa hoàn tất:", error.message);
    process.exitCode = 1;
}
