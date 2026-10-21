-- MySQL 8.0.16+ InnoDB, utf8mb4. DDL commits implicitly; migration runner records completion.
CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE,
 name TEXT NOT NULL, password_hash TEXT NOT NULL, phone VARCHAR(10),
 role VARCHAR(16) NOT NULL CHECK(role IN ('CUSTOMER','MANAGER','DRIVER','ADMIN')),
 CHECK(phone IS NULL OR (length(phone)=10 AND REGEXP_LIKE(phone,'^[0-9]{10}$')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS sessions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, token_hash VARCHAR(64) NOT NULL UNIQUE,
 user_id BIGINT UNSIGNED NOT NULL, expires_at BIGINT NOT NULL,
 KEY ix_sessions_user(user_id),
 KEY ix_sessions_expiry(expires_at),
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS restaurants (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, manager_id BIGINT UNSIGNED NOT NULL,
 name TEXT NOT NULL, address TEXT NOT NULL, cuisine TEXT NOT NULL,
 lat DOUBLE NOT NULL CHECK(lat BETWEEN -90 AND 90),
 lng DOUBLE NOT NULL CHECK(lng BETWEEN -180 AND 180),
 status VARCHAR(32) NOT NULL CHECK(status IN ('ACTIVE','INACTIVE')),
 location POINT NOT NULL SRID 4326,
 SPATIAL INDEX ix_restaurant_location(location),
 KEY ix_restaurants_manager(manager_id),
 KEY ix_restaurants_status(status,id),
 FOREIGN KEY (manager_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS menu_items (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, restaurant_id BIGINT UNSIGNED NOT NULL,
 name TEXT NOT NULL, category_id VARCHAR(80) NOT NULL DEFAULT 'main',
 description VARCHAR(1000) NOT NULL DEFAULT '', price BIGINT NOT NULL CHECK(price BETWEEN 0 AND 1000000000),
 available BIGINT NOT NULL DEFAULT 1 CHECK(available IN (0,1)),
 KEY ix_menu_restaurant(restaurant_id,id),
 FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS menu_options (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, menu_item_id BIGINT UNSIGNED NOT NULL,
 name TEXT NOT NULL, surcharge BIGINT NOT NULL CHECK(surcharge BETWEEN 0 AND 1000000000),
 available BIGINT NOT NULL DEFAULT 1 CHECK(available IN (0,1)),
 KEY ix_options_item(menu_item_id,id),
 FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS drivers (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL UNIQUE,
 status VARCHAR(32) NOT NULL CHECK(status IN ('OFFLINE','AVAILABLE','BUSY')),
 locked BIGINT NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
 lat DOUBLE CHECK(lat BETWEEN -90 AND 90), lng DOUBLE CHECK(lng BETWEEN -180 AND 180),
 location_at BIGINT, updated_at BIGINT NOT NULL,
 CHECK((lat IS NULL AND lng IS NULL AND location_at IS NULL) OR
       (lat IS NOT NULL AND lng IS NOT NULL AND location_at IS NOT NULL)),
 KEY ix_drivers_available(status,locked,location_at),
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS orders (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, customer_id BIGINT UNSIGNED NOT NULL,
 restaurant_id BIGINT UNSIGNED NOT NULL, driver_id BIGINT UNSIGNED,
 status VARCHAR(32) NOT NULL CHECK(status IN ('PENDING','CONFIRMED','PREPARING','READY_FOR_PICKUP','DRIVER_ASSIGNED','PICKED_UP','DELIVERING','DELIVERED','CANCELLED')),
 subtotal BIGINT NOT NULL CHECK(subtotal BETWEEN 0 AND 9007199254740991),
 delivery_fee BIGINT NOT NULL CHECK(delivery_fee BETWEEN 0 AND 1000000000),
 total BIGINT NOT NULL CHECK(total BETWEEN 1 AND 9007199254740991 ), CHECK(total=subtotal+delivery_fee),
 delivery_address TEXT NOT NULL, contact_phone VARCHAR(10) NOT NULL,
 payment_method TEXT NOT NULL CHECK(payment_method IN ('COD','MOCK_WALLET','MOCK_CARD')),
 request_key VARCHAR(128) COLLATE utf8mb4_bin NOT NULL CHECK(length(request_key) BETWEEN 1 AND 128), request_hash VARCHAR(64) NOT NULL,
 creation_response JSON,
 cancel_reason TEXT, retry_at BIGINT, version BIGINT NOT NULL DEFAULT 1 CHECK(version>=1),
 created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
 UNIQUE(customer_id, request_key),
 CHECK(status NOT IN ('DRIVER_ASSIGNED','PICKED_UP','DELIVERING','DELIVERED') OR driver_id IS NOT NULL),
 active_driver_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status IN ('DRIVER_ASSIGNED','PICKED_UP','DELIVERING') THEN driver_id ELSE NULL END) STORED,
 UNIQUE KEY uq_driver_active_order(active_driver_id),
 KEY ix_orders_customer(customer_id,created_at DESC,id DESC),
 KEY ix_orders_restaurant(restaurant_id,id DESC),
 KEY ix_orders_driver(driver_id,updated_at DESC),
 KEY ix_dispatch_queue(status,driver_id,created_at,id),
 FOREIGN KEY (customer_id) REFERENCES users(id),
 FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
 FOREIGN KEY (driver_id) REFERENCES drivers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS order_items (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL,
 menu_item_id BIGINT UNSIGNED NOT NULL, name TEXT NOT NULL,
 options_json JSON NOT NULL CHECK(JSON_TYPE(options_json)='ARRAY'),
 unit_price BIGINT NOT NULL CHECK(unit_price BETWEEN 0 AND 9007199254740991),
 quantity BIGINT NOT NULL CHECK(quantity BETWEEN 1 AND 99),
 line_total BIGINT NOT NULL CHECK(line_total BETWEEN 0 AND 9007199254740991 ), CHECK(line_total=unit_price*quantity),
 KEY ix_lines_order(order_id,id),
 FOREIGN KEY (order_id) REFERENCES orders(id),
 FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS payments (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL UNIQUE,
 amount BIGINT NOT NULL CHECK(amount BETWEEN 1 AND 9007199254740991),
 status VARCHAR(32) NOT NULL CHECK(status IN ('PENDING','SUCCESS','FAILED','VOIDED','REFUNDED')),
 transaction_id VARCHAR(100) UNIQUE,
 FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS order_history (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL,
 status VARCHAR(32) NOT NULL CHECK(status IN ('PENDING','CONFIRMED','PREPARING','READY_FOR_PICKUP','DRIVER_ASSIGNED','PICKED_UP','DELIVERING','DELIVERED','CANCELLED')),
 actor_id BIGINT UNSIGNED, at BIGINT NOT NULL,
 KEY ix_history_order(order_id,id),
 KEY ix_history_actor(actor_id),
 FOREIGN KEY (order_id) REFERENCES orders(id),
 FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS driver_offers (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL,
 driver_id BIGINT UNSIGNED NOT NULL,
 status VARCHAR(32) NOT NULL CHECK(status IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','REVOKED')),
 distance_km DOUBLE NOT NULL CHECK(distance_km>=0), expires_at BIGINT NOT NULL,
 created_at BIGINT NOT NULL, CHECK(expires_at>created_at),
 pending_order_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status='PENDING' THEN order_id ELSE NULL END) STORED,
 pending_driver_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status='PENDING' THEN driver_id ELSE NULL END) STORED,
 UNIQUE KEY uq_offer_order_pending(pending_order_id),
 UNIQUE KEY uq_offer_driver_pending(pending_driver_id),
 KEY ix_offers_expiry(status,expires_at),
 KEY ix_offers_driver(driver_id,id),
 FOREIGN KEY (order_id) REFERENCES orders(id),
 FOREIGN KEY (driver_id) REFERENCES drivers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS dispatch_skips (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL,
 driver_id BIGINT UNSIGNED NOT NULL, UNIQUE(order_id, driver_id),
 KEY ix_skips_driver(driver_id),
 FOREIGN KEY (order_id) REFERENCES orders(id),
 FOREIGN KEY (driver_id) REFERENCES drivers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS carts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, customer_id BIGINT UNSIGNED NOT NULL UNIQUE,
 restaurant_id BIGINT UNSIGNED NOT NULL,
 items_json JSON NOT NULL CHECK(JSON_TYPE(items_json)='ARRAY'),
 KEY ix_carts_restaurant(restaurant_id),
 FOREIGN KEY (customer_id) REFERENCES users(id),
 FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS activity (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, actor_id BIGINT UNSIGNED, text TEXT NOT NULL, at BIGINT NOT NULL,
 KEY ix_activity_actor(actor_id),
 FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- POINT text for EPSG 4326 uses latitude then longitude (native SRS axis order).
CREATE TRIGGER restaurant_location_insert BEFORE INSERT ON restaurants FOR EACH ROW
 SET NEW.location=ST_GeomFromText(CONCAT('POINT(',NEW.lat,' ',IF(NEW.lng=-180,180,NEW.lng),')'),4326);
CREATE TRIGGER restaurant_location_update BEFORE UPDATE ON restaurants FOR EACH ROW
 SET NEW.location=ST_GeomFromText(CONCAT('POINT(',NEW.lat,' ',IF(NEW.lng=-180,180,NEW.lng),')'),4326);
