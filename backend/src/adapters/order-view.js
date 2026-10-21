import { TRACKING_STATUSES } from "../domain/constants.js";
export async function orderView(store, id) {
  const o = await store.order(id);
  if (!o) {
    return null;
  }
  const payment = await store.find("payments", {
    order_id: id
  });
  const restaurant = await store.restaurant(o.restaurant_id);
  const assigned = o.driver_id ? await store.find("drivers", {
    id: o.driver_id
  }) : null;
  const driver = assigned ? await store.user(assigned.user_id) : null;
  const voucher = o.voucher_id ? await store.find("vouchers", {
    id: o.voucher_id
  }) : null;
  // Vị trí tài xế chỉ trả khi đơn đang trên đường (đã nhận → đang giao).
  const tracking = assigned && TRACKING_STATUSES.includes(o.status) && assigned.lat !== null;
  return {
    id: o.id,
    orderId: o.id,
    code: `GM-${o.id}`,
    customerId: o.customer_id,
    restaurantId: o.restaurant_id,
    driverId: o.driver_id,
    status: o.status,
    orderStatus: o.status,
    version: o.version,
    subtotal: o.subtotal,
    deliveryFee: o.delivery_fee,
    discount: o.discount ?? 0,
    voucherCode: voucher?.code ?? null,
    total: o.total,
    deliveryAddress: o.delivery_address,
    deliveryLocation: o.delivery_lat === null || o.delivery_lat === undefined ? null : {
      lat: o.delivery_lat,
      lng: o.delivery_lng
    },
    distanceKm: o.distance_km ?? null,
    contactPhone: o.contact_phone,
    paymentMethod: o.payment_method,
    paymentStatus: payment?.status,
    transactionId: payment?.transaction_id,
    cancelReason: o.cancel_reason,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      address: restaurant.address,
      phone: restaurant.phone ?? null,
      lat: restaurant.lat,
      lng: restaurant.lng
    },
    customerName: (await store.user(o.customer_id)).name,
    driverName: driver?.name ?? null,
    driverPhone: driver?.phone ?? null,
    driverLocation: tracking ? {
      lat: assigned.lat,
      lng: assigned.lng,
      at: assigned.location_at
    } : null,
    lines: (await store.rows("order_items", {
      order_id: id
    })).map(line => ({
      menuItemId: line.menu_item_id,
      name: line.name,
      options: JSON.parse(line.options_json),
      unitPrice: line.unit_price,
      quantity: line.quantity,
      lineTotal: line.line_total
    })),
    history: await Promise.all((await store.rows("order_history", {
      order_id: id
    })).map(async row => ({
      status: row.status,
      at: row.at,
      actorId: row.actor_id,
      by: (await store.user(row.actor_id))?.name ?? "Dispatch worker"
    })))
  };
}
