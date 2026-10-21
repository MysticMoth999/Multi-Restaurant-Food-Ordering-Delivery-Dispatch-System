import { randomUUID } from "node:crypto";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { ensure, integer, text, location } from "../domain/errors.js";
import { haversineKm } from "../domain/constants.js";
// Nhận diện ảnh theo byte đầu file, không tin Content-Type do client gửi.
const IMAGE_TYPES = [
  ["jpg", bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff],
  ["png", bytes => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["webp", bytes => bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP"]
];
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const UPLOAD_URL_PREFIX = "/media/uploads/";
const longText = (value, name) => {
  ensure(typeof value === "string" && value.length <= 1000, "VALIDATION", `${name} tối đa 1000 ký tự.`);
  return value.trim();
};
export class CatalogService {
  constructor(store, billing, uploadDir) {
    Object.assign(this, {
      store,
      billing,
      uploadDir
    });
  }
  async restaurantView(row) {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      cuisine: row.cuisine,
      phone: row.phone,
      lat: row.lat,
      lng: row.lng,
      status: row.status,
      // Phí bậc thấp nhất (đến 3 km); phí thật theo quãng đường hiện trong báo giá.
      deliveryFee: await this.billing.deliveryFee(null)
    };
  }
  async list(query) {
    const page = integer(Number(query.page ?? 1), "page");
    const hasLocation = query.lat !== undefined || query.lng !== undefined;
    const point = hasLocation ? location({
      lat: Number(query.lat),
      lng: Number(query.lng)
    }) : null;
    const search = String(query.q ?? "").toLocaleLowerCase("vi").trim();
    if (this.store.restaurantPage) {
      const result = await this.store.restaurantPage({
        point,
        search,
        page
      });
      return {
        items: await Promise.all(result.items.map(async row => ({
          ...(await this.restaurantView(row)),
          ...(point ? {
            distanceKm: row.distance_km
          } : {})
        }))),
        total: result.total,
        page,
        pageSize: 20
      };
    }
    let rows = (await this.store.rows("restaurants", {
      status: "ACTIVE"
    })).filter(row => row.name.toLocaleLowerCase("vi").includes(search));
    rows = await Promise.all(rows.map(async row => ({
      ...(await this.restaurantView(row)),
      ...(point ? {
        distanceKm: haversineKm(point, row)
      } : {})
    })));
    if (point) {
      rows = rows.filter(row => row.distanceKm <= 5).sort((a, b) => a.distanceKm - b.distanceKm || a.id - b.id);
    } else {
      rows.sort((a, b) => a.id - b.id);
    }
    return {
      items: rows.slice((page - 1) * 20, page * 20),
      page,
      pageSize: 20,
      total: rows.length
    };
  }
  async itemView(item) {
    return {
      id: item.id,
      restaurantId: item.restaurant_id,
      name: item.name,
      categoryId: item.category_id,
      description: item.description,
      ingredients: item.ingredients,
      imageUrl: item.image_url,
      price: item.price,
      available: Boolean(item.available),
      options: (await this.store.rows("menu_options", {
        menu_item_id: item.id
      })).map(option => ({
        id: option.id,
        name: option.name,
        surcharge: option.surcharge,
        available: Boolean(option.available)
      }))
    };
  }
  async menu(id, includeInactive = false) {
    const restaurant = await this.store.restaurant(integer(id, "restaurantId"));
    ensure(restaurant && (includeInactive || restaurant.status === "ACTIVE"), "NOT_FOUND", "Không tìm thấy nhà hàng hoạt động.");
    return {
      restaurant: await this.restaurantView(restaurant),
      items: await Promise.all((await this.store.rows("menu_items", {
        restaurant_id: id
      })).map(async item => await this.itemView(item)))
    };
  }
  async managed(user, restaurantId) {
    ensure(user.role === "MANAGER", "FORBIDDEN", "Chỉ quản lý nhà hàng được thực hiện.");
    const owned = await this.store.rows("restaurants", {
      manager_id: user.id
    });
    const restaurant = restaurantId ? owned.find(row => row.id === restaurantId) : owned[0];
    ensure(restaurant, "FORBIDDEN", "Nhà hàng không thuộc quản lý.");
    return restaurant;
  }
  async saveItem(user, id, body) {
    return await this.store.transaction(async () => {
      const old = id ? await this.store.find("menu_items", {
        id
      }) : null;
      if (id) {
        ensure(old, "NOT_FOUND", "Không tìm thấy món.");
      }
      const restaurant = await this.managed(user, old?.restaurant_id ?? body.restaurantId);
      const values = {};
      if (!id || body.name !== undefined) {
        values.name = text(body.name, "name", 150);
      }
      if (!id || body.price !== undefined) {
        values.price = integer(body.price, "price", 0, 1_000_000_000);
      }
      if (!id || body.categoryId !== undefined) {
        values.category_id = text(body.categoryId ?? "main", "categoryId", 80);
      }
      if (body.description !== undefined) {
        values.description = longText(body.description, "Mô tả");
      }
      if (body.ingredients !== undefined) {
        values.ingredients = longText(body.ingredients, "Thành phần");
      }
      if (body.available !== undefined) {
        ensure(typeof body.available === "boolean", "VALIDATION", "available phải là boolean.");
        values.available = Number(body.available);
      }
      ensure(Object.keys(values).length, "VALIDATION", "Không có trường hợp lệ để cập nhật.");
      if (id) {
        await this.store.update("menu_items", {
          id
        }, values);
      } else {
        id = await this.store.insert("menu_items", {
          restaurant_id: restaurant.id,
          available: 1,
          ...values
        });
      }
      return await this.itemView(await this.store.find("menu_items", {
        id
      }));
    });
  }
  async saveOption(user, itemId, optionId, body) {
    return await this.store.transaction(async () => {
      const item = await this.store.find("menu_items", {
        id: itemId
      });
      ensure(item, "NOT_FOUND", "Không tìm thấy món.");
      await this.managed(user, item.restaurant_id);
      if (optionId) {
        ensure(await this.store.find("menu_options", {
          id: optionId,
          menu_item_id: itemId
        }), "NOT_FOUND", "Không tìm thấy option của món.");
      }
      const values = {};
      if (!optionId || body.name !== undefined) {
        values.name = text(body.name, "name", 100);
      }
      if (!optionId || body.surcharge !== undefined) {
        values.surcharge = integer(body.surcharge, "surcharge", 0, 1_000_000_000);
      }
      if (body.available !== undefined) {
        ensure(typeof body.available === "boolean", "VALIDATION", "available phải là boolean.");
        values.available = Number(body.available);
      }
      ensure(Object.keys(values).length, "VALIDATION", "Không có trường hợp lệ.");
      if (optionId) {
        await this.store.update("menu_options", {
          id: optionId
        }, values);
      } else {
        optionId = await this.store.insert("menu_options", {
          menu_item_id: itemId,
          available: 1,
          ...values
        });
      }
      return await this.itemView(item);
    });
  }
  // Ảnh minh họa món: lưu file vào uploadDir với tên ngẫu nhiên, CSDL chỉ giữ đường dẫn.
  async setImage(user, itemId, bytes) {
    ensure(Buffer.isBuffer(bytes) && bytes.length > 0, "VALIDATION", "Gửi file ảnh JPG, PNG hoặc WEBP (Content-Type image/*).");
    ensure(bytes.length <= MAX_IMAGE_BYTES, "VALIDATION", "Ảnh tối đa 2 MB.");
    const type = IMAGE_TYPES.find(([, test]) => bytes.length >= 12 && test(bytes));
    ensure(type, "VALIDATION", "File không phải ảnh JPG, PNG hoặc WEBP.");
    const item = await this.store.find("menu_items", {
      id: itemId
    });
    ensure(item, "NOT_FOUND", "Không tìm thấy món.");
    await this.managed(user, item.restaurant_id);
    await mkdir(this.uploadDir, {
      recursive: true
    });
    const name = `${randomUUID()}.${type[0]}`;
    await writeFile(join(this.uploadDir, name), bytes);
    try {
      await this.store.transaction(async () => {
        await this.managed(user, item.restaurant_id);
        await this.store.update("menu_items", {
          id: itemId
        }, {
          image_url: UPLOAD_URL_PREFIX + name
        });
      });
    } catch (error) {
      await unlink(join(this.uploadDir, name)).catch(() => {});
      throw error;
    }
    if (item.image_url?.startsWith(UPLOAD_URL_PREFIX)) {
      await unlink(join(this.uploadDir, basename(item.image_url))).catch(() => {});
    }
    return await this.itemView(await this.store.find("menu_items", {
      id: itemId
    }));
  }
  async managerDashboard(user, restaurantId) {
    const restaurant = await this.managed(user, restaurantId);
    const orders = (await this.store.rows("orders", {
      restaurant_id: restaurant.id
    })).sort((a, b) => b.id - a.id);
    return {
      ...(await this.menu(restaurant.id, true)),
      orders: await Promise.all(orders.slice(0, 100).map(async order => await this.store.orderView(order.id)))
    };
  }
}
