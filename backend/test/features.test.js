import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture, serve, requestBody, createOrder, readyOrder, online, DELIVERY_POINT } from "./helpers.js";
const fails = async (fn, code, pattern) => await assert.rejects(fn, error => error.code === code && (!pattern || pattern.test(error.message)));
// Điểm cách nhà hàng 1 (10.7705, 106.6932) khoảng d km về phía bắc.
const north = km => ({
  lat: 10.7705 + km / 111.2,
  lng: 106.6932
});
const items = [{
  menuItemId: 1,
  quantity: 1,
  selectedOptionIds: []
}];
test("Delivery fee: km tiers, fuel price, order value discount and 10 km limit", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  const fee = async (point, quantity = 1) => await s.billing.quote(1, [{
    ...items[0],
    quantity
  }], {
    deliveryLocation: point
  });
  assert.equal((await fee(north(1))).deliveryFee, 15000);
  assert.equal((await fee(north(4))).deliveryFee, 22000);
  assert.equal((await fee(north(6))).deliveryFee, 29000);
  assert.equal((await fee(north(9))).deliveryFee, 38000);
  await fails(async () => await fee(north(11)), "VALIDATION", /ngoài phạm vi giao 10 km/);
  const quote = await fee(north(4));
  assert.equal(quote.distanceKm, 4);
  assert.equal(quote.total, 50000 + 22000);
  // Tiền món 250.000đ: giảm 50% phí; 500.000đ: miễn phí giao.
  const half = await fee(north(4), 5);
  assert.deepEqual([half.deliveryFee, half.discount, half.total], [22000, 11000, 250000 + 11000]);
  const free = await fee(north(4), 10);
  assert.deepEqual([free.discount, free.total], [22000, 500000]);
  // Giá xăng tăng 20%: phí bậc ×1,2, làm tròn lên nghìn đồng.
  await s.admin.setFuelPrice(await s.user(31), 27600);
  assert.equal((await fee(north(4))).deliveryFee, 27000);
  assert.equal((await s.billing.pricing()).tiers[0].fee, 18000);
  await fails(async () => await s.admin.setFuelPrice(await s.user(31), 5000), "VALIDATION");
  await fails(async () => await s.admin.setFuelPrice(await s.user(1), 25000), "FORBIDDEN");
  // Đặt đơn bắt buộc có tọa độ điểm giao; đơn lưu khoảng cách và phí theo bậc.
  await fails(async () => await s.orders.create(await s.user(1), await requestBody(s, {
    deliveryLocation: undefined
  })), "VALIDATION");
});
test("Vouchers: discount, single use per customer, returned on cancel, owner and expiry rules", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  const customer = await s.user(1);
  const two = [{
    menuItemId: 2,
    quantity: 2,
    selectedOptionIds: []
  }];
  const quote = await s.billing.quote(1, two, {
    deliveryLocation: DELIVERY_POINT,
    voucherCode: "freeship",
    customerId: 1
  });
  assert.equal(quote.voucherCode, "FREESHIP");
  assert.deepEqual([quote.subtotal, quote.deliveryFee, quote.discount, quote.total], [160000, 15000, 15000, 160000]);
  // Voucher cần đăng nhập; voucher riêng của khách 1 không dùng được cho khách 2; chưa đủ giá trị đơn thì báo lỗi.
  await fails(async () => await s.billing.quote(1, two, {
    deliveryLocation: DELIVERY_POINT,
    voucherCode: "FREESHIP"
  }), "VALIDATION", /Đăng nhập/);
  await fails(async () => await s.billing.quote(1, two, {
    deliveryLocation: DELIVERY_POINT,
    voucherCode: "KHACHMOI",
    customerId: 2
  }), "VALIDATION", /không áp dụng/);
  await fails(async () => await s.billing.quote(1, items, {
    deliveryLocation: DELIVERY_POINT,
    voucherCode: "FREESHIP",
    customerId: 1
  }), "VALIDATION", /từ 100\.000đ/);
  const body = {
    ...(await requestBody(s)),
    items: two,
    voucherCode: "FREESHIP",
    quoteFingerprint: quote.quoteFingerprint
  };
  const { order } = await s.orders.create(customer, body);
  assert.deepEqual([order.discount, order.voucherCode, order.total], [15000, "FREESHIP", 160000]);
  assert.equal((await s.billing.availableVouchers(customer)).some(v => v.code === "FREESHIP"), false);
  await fails(async () => await s.billing.quote(1, two, {
    deliveryLocation: DELIVERY_POINT,
    voucherCode: "FREESHIP",
    customerId: 1
  }), "VALIDATION", /đã dùng/);
  // Khách tự hủy khi chờ xác nhận: voucher được trả lại.
  await s.orders.cancel(customer, order.id, {
    expectedVersion: order.version
  });
  assert.equal((await s.billing.availableVouchers(customer)).some(v => v.code === "FREESHIP"), true);
  // Voucher giảm tiền món theo số tiền cố định, voucher hết hạn, mã trùng.
  const admin = await s.user(31);
  const voucher = await s.admin.createVoucher(admin, {
    code: "giam10k",
    kind: "ORDER",
    amount: 10000,
    minSubtotal: 50000,
    expiresInDays: 1
  });
  assert.equal(voucher.code, "GIAM10K");
  const fixed = await s.billing.quote(1, items, {
    deliveryLocation: DELIVERY_POINT,
    voucherCode: "GIAM10K",
    customerId: 1
  });
  assert.deepEqual([fixed.discount, fixed.total], [10000, 55000]);
  await fails(async () => await s.admin.createVoucher(admin, {
    code: "GIAM10K",
    kind: "ORDER",
    amount: 10000,
    minSubtotal: 50000
  }), "CONFLICT");
  await fails(async () => await s.admin.createVoucher(admin, {
    code: "SAI",
    kind: "ORDER",
    percent: 10,
    amount: 5000
  }), "VALIDATION");
  s.advance(2 * 86_400_000);
  await fails(async () => await s.billing.quote(1, items, {
    deliveryLocation: DELIVERY_POINT,
    voucherCode: "GIAM10K",
    customerId: 1
  }), "VALIDATION", /hết hạn/);
  await s.admin.setVoucherActive(admin, 1, false);
  await fails(async () => await s.billing.quote(1, two, {
    deliveryLocation: DELIVERY_POINT,
    voucherCode: "FREESHIP",
    customerId: 1
  }), "VALIDATION", /ngừng áp dụng/);
});
test("Notifications: order, status, offer, payment confirmation and read state per user", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  const kinds = async id => (await s.notifications.list(await s.user(id))).items.map(n => n.kind);
  const order = await readyOrder(s, await createOrder(s, {
    paymentMethod: "COD"
  }));
  assert.deepEqual(await kinds(11), ["NEW_ORDER"]);
  await online(s, 1);
  await s.dispatch.tick();
  assert.deepEqual(await kinds(21), ["OFFER"]);
  const board = await s.dispatch.board(await s.user(21));
  let current = (await s.dispatch.respond(await s.user(21), board.offer.offerId, true)).order;
  for (const targetStatus of ["PICKED_UP", "DELIVERING", "DELIVERED"]) {
    current = await s.orders.transition(await s.user(21), order.id, {
      targetStatus,
      expectedVersion: current.version,
      codCollected: true
    });
  }
  const customer = await s.notifications.list(await s.user(1));
  assert.equal(customer.items.filter(n => n.kind === "ORDER_STATUS").length, 7);
  assert.ok(customer.items.some(n => n.kind === "PAYMENT" && /thu 125\.000đ tiền mặt/.test(n.body)));
  assert.ok(customer.items.some(n => n.title === "Đã có tài xế" && n.body.includes("0912345682")));
  assert.equal(customer.unread, customer.items.length);
  assert.equal((await s.notifications.markRead(await s.user(1), {
    all: true
  })).unread, 0);
  // Không đọc được thông báo của người khác; after chỉ lấy thông báo mới hơn.
  assert.equal((await s.notifications.list(await s.user(2))).items.length, 0);
  assert.equal((await s.notifications.list(await s.user(1), customer.lastId)).items.length, 0);
  // Thanh toán ví/thẻ báo đã thanh toán ngay khi đặt.
  await createOrder(s, {
    paymentMethod: "MOCK_WALLET"
  });
  assert.ok((await s.notifications.list(await s.user(1), customer.lastId)).items.some(n => n.kind === "PAYMENT" && /ví điện tử/.test(n.body)));
});
test("Tracking: driver location and contacts appear only while the order is on the road", async t => {
  const s = await fixture();
  t.after(async () => await s.store.close());
  const order = await readyOrder(s);
  assert.equal(order.driverLocation, null);
  assert.deepEqual(order.deliveryLocation, DELIVERY_POINT);
  assert.equal(order.distanceKm, 1.3);
  assert.equal(order.restaurant.phone, "0283822001");
  await online(s, 1);
  await s.dispatch.tick();
  const offer = (await s.dispatch.board(await s.user(21))).offer;
  let current = (await s.dispatch.respond(await s.user(21), offer.offerId, true)).order;
  assert.equal(current.driverPhone, "0912345682");
  await s.dispatch.updateLocation(await s.user(21), {
    lat: 10.772,
    lng: 106.694
  });
  current = await s.orders.get(await s.user(1), order.id);
  assert.deepEqual([current.driverLocation.lat, current.driverLocation.lng], [10.772, 106.694]);
  for (const targetStatus of ["PICKED_UP", "DELIVERING", "DELIVERED"]) {
    current = await s.orders.transition(await s.user(21), order.id, {
      targetStatus,
      expectedVersion: current.version,
      codCollected: true
    });
  }
  assert.equal(current.driverLocation, null);
});
test("Menu image upload: owner only, real image bytes, 2 MB limit, served from /media", async t => {
  const dir = await mkdtemp(join(tmpdir(), "gomeal-upload-"));
  const s = await fixture({
    uploadDir: dir
  });
  const http = await serve(s);
  t.after(async () => {
    await http.close();
    await s.store.close();
    await rm(dir, {
      recursive: true,
      force: true
    });
  });
  const token = async email => (await s.auth.login({
    email,
    password: "demo12345"
  })).token;
  const manager = await token("nhahang@gomeal.vn");
  const other = await token("nhahang2@gomeal.vn");
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  const upload = async (bytes, type, auth, itemId = 1) => {
    const response = await fetch(`${http.base}/manager/menu/${itemId}/image`, {
      method: "POST",
      headers: {
        "Content-Type": type,
        Authorization: `Bearer ${auth}`
      },
      body: bytes
    });
    return {
      status: response.status,
      json: await response.json()
    };
  };
  const ok = await upload(png, "image/png", manager);
  assert.equal(ok.status, 200);
  assert.match(ok.json.data.item.imageUrl, /^\/media\/uploads\/[0-9a-f-]+\.png$/);
  assert.deepEqual(await readdir(dir), [ok.json.data.item.imageUrl.split("/").pop()]);
  const served = await fetch(http.base.replace(/\/api$/, "") + ok.json.data.item.imageUrl);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
  // Đổi ảnh thì file cũ bị xóa.
  const again = await upload(png, "image/png", manager);
  assert.deepEqual(await readdir(dir), [again.json.data.item.imageUrl.split("/").pop()]);
  assert.equal((await upload(Buffer.from("<script>alert(1)</script>".padEnd(64)), "image/png", manager)).status, 400);
  assert.equal((await upload(png, "text/plain", manager)).status, 400);
  assert.equal((await upload(png, "image/png", other)).status, 403);
  assert.equal((await upload(Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]), "image/png", manager)).status, 413);
  // Thành phần và mô tả lưu cùng món.
  const item = await s.catalog.saveItem(await s.user(11), 1, {
    ingredients: "Cá hồi, cơm",
    description: "Món mới"
  });
  assert.deepEqual([item.ingredients, item.description], ["Cá hồi, cơm", "Món mới"]);
  await assert.rejects(async () => await s.catalog.saveItem(await s.user(11), 1, {
    ingredients: "x".repeat(1001)
  }), error => error.code === "VALIDATION");
});
