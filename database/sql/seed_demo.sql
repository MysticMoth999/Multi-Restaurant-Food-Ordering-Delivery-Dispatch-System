-- Synthetic GoMeal data. Apply schema.sql first; target business tables must be empty.
SET NAMES utf8mb4;
START TRANSACTION;
INSERT INTO `users` (`id`,`email`,`name`,`role`,`phone`,`password_hash`) VALUES
(1,'khach@gomeal.vn','Khách demo','CUSTOMER','0912345678','27496feb427d3a4634c59b1bc1dffbcc:7c0e90a73a63935f0f7e4307e589905293083661f46eaaf8c4bc11601e8c60f026033e8e6da20b4c5e9dbf7a150c4ba426021b1f9480996160ef7f8f0176e3f5'),
(2,'khach2@gomeal.vn','Khách thứ hai','CUSTOMER','0912345679','fca8b0c501d811633e4ca035286cb9da:c73bdc3345d0ee8e64958b8b1b9cd597fee4757768ff406e8f968cc0f1ec39a0f683caf4a0ef84c3c625cd14fab0e88cfa100bbcb33ba13612acb0d379cd9c83'),
(3,'chuacosdt@gomeal.vn','Khách chưa có số','CUSTOMER',NULL,'6b8ee1b8c9e60cfab3a7cd63d7e5b3ca:5a6737b6123d74fa98951d38e0756b2ca9e4a8256a2002f32c1e80aac5d77ed1bdcb4fbfba07fb82e1b1ff153598e2f4d9a22bda2654899ad9ff4d21e4785799'),
(11,'nhahang@gomeal.vn','Quản lý Hokkaido','MANAGER','0912345680','172e005cbe9c56e074005bdf16520e76:fac5ecdc47328dee4dce422f3c65f3c79b71f3ce9a96c4bbcf8204b6778d801a5debc0c38574adf31ebe052aa9b5b4bed81f34a802148dfbbb73927e1d451f5a'),
(12,'nhahang2@gomeal.vn','Quản lý Sushi Góc Phố','MANAGER','0912345681','3fd2abf7436c2b8b2064898b3d354d26:1ef550d5a0e2c818b97378df1b398a6cf3b5a72f74a918150f18e9f0e133573d2e6deafcd1058f019fee35c90b488719ec423bf2123384cd2596ca814b2b26dc'),
(21,'taixe@gomeal.vn','Tài xế 1','DRIVER','0912345682','f917c7b9231ca7998d00d623583a129e:10c113e6a07f563e5a405df3db7e07ae4950ba820aa0e6f75f630ec378ae64eefd03cc4245633eaa87e0356ff47716adf5c105aecd7c7ddc00190e33cbf5bc0f'),
(22,'taixe2@gomeal.vn','Tài xế 2','DRIVER','0912345683','48c12f7a03a2b28c61f34907625088db:dcde239b18a9ef2e94b6fd671cd169485046b896069a95a5c0daf0582154b1776b7a8b46f1199aede7fb608e045a87d507be65712eed9b021dcda47118667d84'),
(23,'taixe3@gomeal.vn','Tài xế 3','DRIVER','0912345684','318b341d52a4b8d85ec1757d0ef8c2ff:a29ac9ea6a0788ef923e0d157bdb9479637fe48ad4805e22d470ebbc14472c0dfeae7ac44b0b9039fffe19d7be51fb7dba3fe53c72077ea0b1197c75775a05bf'),
(24,'taixe4@gomeal.vn','Tài xế 4','DRIVER','0912345685','83c7ff4fb356132653f159bb85b6a6c5:ea6acfff34a9b78eae72c7b56d40bdff7f9342ba0222f298199d5df4a4f5e365b64ae0c707ffb3de4bf52e97ca746123bae41741096ad222d512385b37f1a76c'),
(25,'taixe5@gomeal.vn','Tài xế 5','DRIVER','0912345686','8b385ac51902b01d6ff789472ff4add2:b884900974a02733c8f04aeaef1112cef3faec55c56b826f6a2a8d2510ca28599957510c675c7284343c594cde6c9bb40b63992456425199351191a8c9af7c4e'),
(31,'admin@gomeal.vn','Quản trị viên','ADMIN','0912345687','6bcf6a86d3dd08fcd85316d18e464223:9cb7a80d9300eedec04f370572c4ef9c8071fd65150b9e569a6aabf24a310cc841b2d9d847a448dbe091933705eaa8e853c3fedbedf4b5809cd09246ff5d945d');
INSERT INTO `restaurants` (`phone`,`id`,`manager_id`,`name`,`address`,`cuisine`,`lat`,`lng`,`status`,location) VALUES
('0283822001',1,11,'Hokkaido Sachi','25 Nguyễn Trãi, Quận 1','Nhật Bản',10.7705,106.6932,'ACTIVE',ST_GeomFromText('POINT(10.7705 106.6932)',4326)),
('0283822002',2,12,'Sushi Góc Phố','12 Pasteur, Quận 1','Nhật Bản',10.7765,106.7009,'ACTIVE',ST_GeomFromText('POINT(10.7765 106.7009)',4326));
INSERT INTO `menu_items` (`category_id`,`description`,`ingredients`,`image_url`,`id`,`restaurant_id`,`name`,`price`,`available`) VALUES
('main','Hai miếng nigiri cá hồi tươi trên cơm giấm.','Cá hồi Na Uy, cơm giấm, wasabi','/media/demo/salmon_nigiri.jpg',1,1,'Nigiri cá hồi',50000,1),
('main','Cuộn 8 miếng, phủ trứng cá.','Thanh cua, bơ, dưa leo, trứng cá, cơm giấm, rong biển','/media/demo/california-roll.jpg',2,1,'California roll',80000,1),
('main','Set 12 miếng sushi tổng hợp.','Cá hồi, cá ngừ, tôm, trứng cuộn, cơm giấm','/media/demo/set-sushi-tong-hop.jpg',3,2,'Sushi set',90000,1);
INSERT INTO `menu_options` (`id`,`menu_item_id`,`name`,`surcharge`,`available`) VALUES
(1,1,'Thêm sốt',5000,1),
(2,2,'Thêm phô mai',10000,1);
INSERT INTO `drivers` (`lat`,`lng`,`location_at`,`id`,`user_id`,`status`,`locked`,`updated_at`) VALUES
(NULL,NULL,NULL,1,21,'OFFLINE',0,1792564119156),
(NULL,NULL,NULL,2,22,'OFFLINE',0,1792564119156),
(NULL,NULL,NULL,3,23,'OFFLINE',0,1792564119156),
(NULL,NULL,NULL,4,24,'OFFLINE',0,1792564119156),
(NULL,NULL,NULL,5,25,'OFFLINE',0,1792564119156);
INSERT INTO `vouchers` (`description`,`percent`,`amount`,`max_discount`,`min_subtotal`,`customer_id`,`expires_at`,`id`,`code`,`kind`,`active`,`created_at`) VALUES
('Miễn phí giao tối đa 30.000đ cho đơn từ 100.000đ',100,NULL,30000,100000,NULL,NULL,1,'FREESHIP','SHIPPING',1,1792564119156),
('Giảm 20% tiền món, tối đa 50.000đ, đơn từ 150.000đ',20,NULL,50000,150000,NULL,NULL,2,'GIAM20','ORDER',1,1792564119156),
('Giảm 30.000đ cho khách demo, đơn từ 60.000đ',NULL,30000,NULL,60000,1,NULL,3,'KHACHMOI','ORDER',1,1792564119156);
COMMIT;
