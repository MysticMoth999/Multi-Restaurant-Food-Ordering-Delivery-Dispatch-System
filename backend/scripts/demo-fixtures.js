import { hashPassword } from "../src/services/auth-service.js";
export async function seedData(store, password = "demo12345", clock = Date.now) {
  if ((await store.rows("users")).length) {
    throw new Error("Dữ liệu demo đã có tài khoản; không nạp lại fixture.");
  }
  return await store.transaction(async () => {
    const accounts = [[1, "khach@gomeal.vn", "Khách demo", "CUSTOMER", "0912345678"], [2, "khach2@gomeal.vn", "Khách thứ hai", "CUSTOMER", "0912345679"], [3, "chuacosdt@gomeal.vn", "Khách chưa có số", "CUSTOMER", null], [11, "nhahang@gomeal.vn", "Quản lý Hokkaido", "MANAGER", "0912345680"], [12, "nhahang2@gomeal.vn", "Quản lý Sushi Góc Phố", "MANAGER", "0912345681"], [13, "nhahang3@gomeal.vn", "Quản lý Phở Bắc Hà Nội", "MANAGER", "0912345688"], [14, "nhahang4@gomeal.vn", "Quản lý Napoli Pizza", "MANAGER", "0912345689"], [15, "nhahang5@gomeal.vn", "Quản lý Trà Sữa Mây", "MANAGER", "0912345690"], [21, "taixe@gomeal.vn", "Tài xế 1", "DRIVER", "0912345682"], [22, "taixe2@gomeal.vn", "Tài xế 2", "DRIVER", "0912345683"], [23, "taixe3@gomeal.vn", "Tài xế 3", "DRIVER", "0912345684"], [24, "taixe4@gomeal.vn", "Tài xế 4", "DRIVER", "0912345685"], [25, "taixe5@gomeal.vn", "Tài xế 5", "DRIVER", "0912345686"], [31, "admin@gomeal.vn", "Quản trị viên", "ADMIN", "0912345687"]];
    for (const [id, email, name, role, phone] of accounts) {
      await store.insert("users", {
        id,
        email,
        name,
        role,
        phone,
        password_hash: hashPassword(password)
      });
    }
    // Nhà hàng 1–2 (Nhật) giữ nguyên id/món 1–3 mà test dùng; 3–5 thêm món Việt, Ý, đồ uống để demo đa dạng.
    for (const [id, manager_id, name, address, cuisine, phone, lat, lng] of [
      [1, 11, "Hokkaido Sachi", "25 Nguyễn Trãi, Quận 1", "Nhật Bản", "0283822001", 10.7705, 106.6932],
      [2, 12, "Sushi Góc Phố", "12 Pasteur, Quận 1", "Nhật Bản", "0283822002", 10.7765, 106.7009],
      [3, 13, "Phở Bắc Hà Nội", "48 Lý Tự Trọng, Quận 1", "Việt Nam", "0283822003", 10.7792, 106.6985],
      [4, 14, "Napoli Pizza & Pasta", "102 Hai Bà Trưng, Quận 1", "Ý", "0283822004", 10.7856, 106.699],
      [5, 15, "Trà Sữa Mây", "210 Võ Văn Tần, Quận 3", "Đồ uống & tráng miệng", "0283822005", 10.7748, 106.688]
    ]) {
      await store.insert("restaurants", { id, manager_id, name, address, cuisine, phone, lat, lng, status: "ACTIVE" });
    }
    for (const [id, restaurant_id, name, price, image, description, ingredients] of [
      [1, 1, "Nigiri cá hồi", 50000, "salmon_nigiri.jpg", "Hai miếng nigiri cá hồi tươi trên cơm giấm.", "Cá hồi Na Uy, cơm giấm, wasabi"],
      [2, 1, "California roll", 80000, "california-roll.jpg", "Cuộn 8 miếng, phủ trứng cá.", "Thanh cua, bơ, dưa leo, trứng cá, cơm giấm, rong biển"],
      [3, 2, "Sushi set", 90000, "set-sushi-tong-hop.jpg", "Set 12 miếng sushi tổng hợp.", "Cá hồi, cá ngừ, tôm, trứng cuộn, cơm giấm"],
      [4, 1, "Sashimi cá hồi", 120000, "sashimi-ca-hoi.jpg", "8 lát cá hồi cắt dày, ăn kèm củ cải bào.", "Cá hồi Na Uy, củ cải trắng, tía tô, wasabi"],
      [5, 1, "Tempura tôm", 79000, "tempura-tom.jpg", "5 con tôm chiên giòn nhẹ, chấm sốt tentsuyu.", "Tôm sú, bột tempura, sốt tentsuyu"],
      [6, 1, "Gyoza chiên", 59000, "gyoza-chien.jpg", "6 bánh xếp nhân thịt, áp chảo giòn đáy.", "Thịt heo, bắp cải, hẹ, vỏ bánh, giấm tương"],
      [7, 1, "Chirashi don", 139000, "chirashi-don.jpg", "Cơm giấm phủ cá sống và trứng cuộn.", "Cá hồi, cá ngừ, tôm, trứng cuộn, cơm giấm"],
      [8, 1, "Nigiri lươn nướng", 69000, "nigiri-luon-nuong.jpg", "Hai miếng lươn nướng sốt kabayaki.", "Lươn Nhật, sốt kabayaki, mè, cơm giấm"],
      [9, 2, "Nigiri cá ngừ", 50000, "nigiri-ca-ngu.jpg", "Hai miếng cá ngừ đỏ trên cơm giấm.", "Cá ngừ đại dương, cơm giấm, wasabi"],
      [10, 2, "Gunkan trứng cá hồi", 65000, "gunkan_salmon.jpg", "2 miếng gunkan trứng cá hồi ngâm tương.", "Trứng cá hồi, rong biển, cơm giấm"],
      [11, 2, "Kappa maki", 55000, "kappa-maki.jpg", "6 miếng cuộn dưa leo, hợp người ăn chay.", "Dưa leo, mè, rong biển, cơm giấm"],
      [12, 3, "Phở bò tái chín", 65000, "pho-bo.jpg", "Nước dùng xương bò hầm 12 giờ, bánh phở tươi.", "Bò tái, bò chín, bánh phở, hành, ngò gai, quế, hồi"],
      [13, 3, "Bún chả Hà Nội", 70000, "bun-cha.jpg", "Chả viên và thịt nướng than, nước chấm chua ngọt.", "Thịt heo, bún, đu đủ ngâm, rau sống, nước mắm"],
      [14, 3, "Bánh mì thịt nướng", 35000, "banh-mi.jpg", "Bánh mì giòn, thịt nướng, pa tê, đồ chua.", "Bánh mì, thịt heo nướng, pa tê, dưa leo, đồ chua, ngò"],
      [15, 3, "Gỏi cuốn tôm thịt", 40000, "goi-cuon.jpg", "3 cuốn, chấm tương đậu phộng.", "Tôm, thịt ba chỉ, bún, rau thơm, bánh tráng"],
      [16, 3, "Cà phê sữa đá", 29000, "ca-phe-sua-da.jpg", "Phin Robusta, sữa đặc.", "Cà phê Robusta, sữa đặc, đá"],
      [17, 4, "Pizza Margherita", 159000, "pizza-margherita.jpg", "Đế mỏng 26 cm nướng lò, sốt cà chua và mozzarella.", "Bột mì, sốt cà chua, mozzarella, húng quế"],
      [18, 4, "Pizza hải sản", 199000, "pizza-hai-san.jpg", "Tôm, mực, nghêu trên đế mỏng 26 cm.", "Tôm, mực, nghêu, mozzarella, sốt cà chua, ớt chuông"],
      [19, 4, "Spaghetti carbonara", 129000, "spaghetti-carbonara.jpg", "Sốt trứng và phô mai kiểu Roma.", "Mì spaghetti, lòng đỏ trứng, pecorino, thịt heo xông khói, tiêu đen"],
      [20, 4, "Salad Caesar", 89000, "salad-caesar.jpg", "Xà lách romaine, bánh mì nướng giòn, sốt Caesar.", "Xà lách romaine, parmesan, bánh mì, sốt Caesar"],
      [21, 4, "Tiramisu", 65000, "tiramisu.jpg", "Bánh kem mascarpone vị cà phê.", "Mascarpone, bánh ladyfinger, cà phê espresso, cacao"],
      [22, 5, "Trà sữa trân châu đường đen", 45000, "tra-sua-tran-chau.jpg", "Size M, trân châu nấu đường đen.", "Hồng trà, sữa tươi, trân châu, đường đen"],
      [23, 5, "Trà đào cam sả", 49000, "tra-dao-cam-sa.jpg", "Trà đen, đào ngâm, cam tươi và sả.", "Trà đen, đào, cam, sả, đường"],
      [24, 5, "Matcha latte", 55000, "matcha-latte.jpg", "Matcha Uji pha sữa tươi.", "Bột matcha, sữa tươi, đường"],
      [25, 5, "Bánh flan", 25000, "banh-flan.jpg", "Flan trứng sữa, sốt caramel.", "Trứng, sữa, đường caramel"],
      [26, 5, "Bơ dầm sữa", 45000, "bo-dam-sua.jpg", "Bơ sáp dầm cùng sữa tươi, sữa đặc và đá.", "Bơ sáp, sữa tươi, sữa đặc, đá"]
    ]) {
      await store.insert("menu_items", {
        id,
        restaurant_id,
        name,
        price,
        available: 1,
        description,
        ingredients,
        image_url: `/media/demo/${image}`
      });
    }
    for (const [id, menu_item_id, name, surcharge] of [
      [1, 1, "Thêm sốt", 5000],
      [2, 2, "Thêm phô mai", 10000],
      [3, 12, "Thêm thịt bò", 20000],
      [4, 12, "Thêm trứng chần", 8000],
      [5, 13, "Thêm chả", 20000],
      [6, 17, "Thêm phô mai", 25000],
      [7, 17, "Đế viền phô mai", 35000],
      [8, 19, "Thêm thịt xông khói", 20000],
      [9, 22, "Size L", 8000],
      [10, 22, "Thêm trân châu", 7000],
      [11, 24, "Thêm kem cheese", 10000],
      [12, 4, "Thêm wasabi tươi", 10000],
      [13, 7, "Thêm trứng cá hồi", 30000]
    ]) {
      await store.insert("menu_options", { id, menu_item_id, name, surcharge, available: 1 });
    }
    for (let id = 1; id <= 5; id += 1) {
      await store.insert("drivers", {
        id,
        user_id: 20 + id,
        status: "OFFLINE",
        locked: 0,
        updated_at: clock()
      });
    }
    // Voucher mẫu: miễn phí giao, giảm % tiền món, và voucher riêng của khách demo.
    for (const [id, code, description, kind, percent, amount, max_discount, min_subtotal, customer_id] of [
      [1, "FREESHIP", "Miễn phí giao tối đa 30.000đ cho đơn từ 100.000đ", "SHIPPING", 100, null, 30000, 100000, null],
      [2, "GIAM20", "Giảm 20% tiền món, tối đa 50.000đ, đơn từ 150.000đ", "ORDER", 20, null, 50000, 150000, null],
      [3, "KHACHMOI", "Giảm 30.000đ cho khách demo, đơn từ 60.000đ", "ORDER", null, 30000, null, 60000, 1]
    ]) {
      await store.insert("vouchers", {
        id,
        code,
        description,
        kind,
        percent,
        amount,
        max_discount,
        min_subtotal,
        customer_id,
        expires_at: null,
        active: 1,
        created_at: clock()
      });
    }
    return accounts.map(([id, email,, role]) => ({
      id,
      email,
      role
    }));
  });
}
