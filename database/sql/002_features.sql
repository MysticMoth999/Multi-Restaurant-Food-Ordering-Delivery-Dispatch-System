-- 002: SĐT nhà hàng, ảnh/thành phần món, điểm giao + phí theo km, voucher, thông báo, cấu hình giá xăng.
-- Runner chạy từng câu trên cùng một kết nối; câu PREPARE dùng biến phiên để xóa CHECK tổng tiền cũ (tên do MySQL tự đặt).
ALTER TABLE restaurants ADD COLUMN phone VARCHAR(10) NULL CHECK(phone IS NULL OR REGEXP_LIKE(phone,'^[0-9]{10}$'));
ALTER TABLE menu_items
 ADD COLUMN ingredients VARCHAR(1000) NOT NULL DEFAULT '',
 ADD COLUMN image_url VARCHAR(255) NULL CHECK(image_url IS NULL OR image_url LIKE '/media/%');
CREATE TABLE IF NOT EXISTS vouchers (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(32) COLLATE utf8mb4_bin NOT NULL UNIQUE CHECK(REGEXP_LIKE(code,'^[A-Z0-9_-]{3,32}$','c')),
 description VARCHAR(200) NOT NULL DEFAULT '',
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('SHIPPING','ORDER')),
 percent INT NULL CHECK(percent IS NULL OR percent BETWEEN 1 AND 100),
 amount BIGINT NULL CHECK(amount IS NULL OR amount BETWEEN 1000 AND 10000000),
 max_discount BIGINT NULL CHECK(max_discount IS NULL OR max_discount BETWEEN 1000 AND 10000000),
 min_subtotal BIGINT NOT NULL DEFAULT 0 CHECK(min_subtotal >= 0),
 customer_id BIGINT UNSIGNED NULL,
 expires_at BIGINT NULL,
 active BIGINT NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at BIGINT NOT NULL,
 CHECK((percent IS NULL) <> (amount IS NULL)),
 KEY ix_vouchers_customer(customer_id),
 FOREIGN KEY (customer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
ALTER TABLE orders
 ADD COLUMN discount BIGINT NOT NULL DEFAULT 0 CHECK(discount >= 0),
 ADD COLUMN voucher_id BIGINT UNSIGNED NULL,
 ADD COLUMN delivery_lat DOUBLE NULL CHECK(delivery_lat BETWEEN -90 AND 90),
 ADD COLUMN delivery_lng DOUBLE NULL CHECK(delivery_lng BETWEEN -180 AND 180),
 ADD COLUMN distance_km DOUBLE NULL CHECK(distance_km >= 0),
 ADD KEY ix_orders_voucher(voucher_id),
 ADD CONSTRAINT fk_orders_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(id);
SET @old_total_check = (SELECT cc.constraint_name FROM information_schema.check_constraints cc JOIN information_schema.table_constraints tc ON tc.constraint_schema = cc.constraint_schema AND tc.constraint_name = cc.constraint_name WHERE tc.table_schema = DATABASE() AND tc.table_name = 'orders' AND tc.constraint_type = 'CHECK' AND REPLACE(cc.check_clause, '`', '') LIKE '%total = (subtotal + delivery_fee)%' LIMIT 1);
SET @drop_total_check = IF(@old_total_check IS NULL, 'DO 0', CONCAT('ALTER TABLE orders DROP CHECK `', @old_total_check, '`'));
PREPARE drop_total_check FROM @drop_total_check;
EXECUTE drop_total_check;
DEALLOCATE PREPARE drop_total_check;
ALTER TABLE orders ADD CONSTRAINT chk_orders_total CHECK(total = subtotal + delivery_fee - discount);
CREATE TABLE IF NOT EXISTS voucher_redemptions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 voucher_id BIGINT UNSIGNED NOT NULL, customer_id BIGINT UNSIGNED NOT NULL, order_id BIGINT UNSIGNED NOT NULL UNIQUE,
 UNIQUE KEY uq_voucher_customer(voucher_id, customer_id),
 KEY ix_redemptions_customer(customer_id),
 FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
 FOREIGN KEY (customer_id) REFERENCES users(id),
 FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS notifications (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL, order_id BIGINT UNSIGNED NULL,
 kind VARCHAR(32) NOT NULL, title VARCHAR(150) NOT NULL, body VARCHAR(500) NOT NULL,
 created_at BIGINT NOT NULL, read_at BIGINT NULL,
 KEY ix_notifications_user(user_id, id),
 KEY ix_notifications_order(order_id),
 FOREIGN KEY (user_id) REFERENCES users(id),
 FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS settings (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(64) NOT NULL UNIQUE, value VARCHAR(200) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
