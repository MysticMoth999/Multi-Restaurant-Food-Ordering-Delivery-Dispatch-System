import { hashPassword } from "../src/services/auth-service.js";

export function seedData(store, password = "demo12345", clock = Date.now) {
    if (store.rows("users").length) {
        throw new Error("Dữ liệu demo đã có tài khoản; không nạp lại fixture.");
    }
    return store.transaction(() => {
        const accounts = [
            [1, "khach@gomeal.vn", "Khách demo", "CUSTOMER", "0912345678"],
            [2, "khach2@gomeal.vn", "Khách thứ hai", "CUSTOMER", "0912345679"],
            [3, "chuacosdt@gomeal.vn", "Khách chưa có số", "CUSTOMER", null],
            [11, "nhahang@gomeal.vn", "Quản lý Hokkaido", "MANAGER", "0912345680"],
            [12, "nhahang2@gomeal.vn", "Quản lý Sushi Góc Phố", "MANAGER", "0912345681"],
            [21, "taixe@gomeal.vn", "Tài xế 1", "DRIVER", "0912345682"],
            [22, "taixe2@gomeal.vn", "Tài xế 2", "DRIVER", "0912345683"],
            [23, "taixe3@gomeal.vn", "Tài xế 3", "DRIVER", "0912345684"],
            [24, "taixe4@gomeal.vn", "Tài xế 4", "DRIVER", "0912345685"],
            [25, "taixe5@gomeal.vn", "Tài xế 5", "DRIVER", "0912345686"],
            [31, "admin@gomeal.vn", "Quản trị viên", "ADMIN", "0912345687"],
        ];
        for (const [id, email, name, role, phone] of accounts) {
            store.insert("users", {
                id,
                email,
                name,
                role,
                phone,
                password_hash: hashPassword(password),
            });
        }
        store.insert("restaurants", {
            id: 1,
            manager_id: 11,
            name: "Hokkaido Sachi",
            address: "25 Nguyễn Trãi, Quận 1",
            cuisine: "Nhật Bản",
            lat: 10.7705,
            lng: 106.6932,
            status: "ACTIVE",
        });
        store.insert("restaurants", {
            id: 2,
            manager_id: 12,
            name: "Sushi Góc Phố",
            address: "12 Pasteur, Quận 1",
            cuisine: "Nhật Bản",
            lat: 10.7765,
            lng: 106.7009,
            status: "ACTIVE",
        });
        for (const [id, restaurant_id, name, price] of [
            [1, 1, "Nigiri cá hồi", 50000],
            [2, 1, "California roll", 80000],
            [3, 2, "Sushi set", 90000],
        ]) {
            store.insert("menu_items", { id, restaurant_id, name, price, available: 1 });
        }
        store.insert("menu_options", {
            id: 1,
            menu_item_id: 1,
            name: "Thêm sốt",
            surcharge: 5000,
            available: 1,
        });
        store.insert("menu_options", {
            id: 2,
            menu_item_id: 2,
            name: "Thêm phô mai",
            surcharge: 10000,
            available: 1,
        });
        for (let id = 1; id <= 5; id += 1) {
            store.insert("drivers", {
                id,
                user_id: 20 + id,
                status: "OFFLINE",
                locked: 0,
                updated_at: clock(),
            });
        }
        return accounts.map(([id, email, , role]) => ({ id, email, role }));
    });
}
