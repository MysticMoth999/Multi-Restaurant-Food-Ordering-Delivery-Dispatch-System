-- Synthetic GoMeal data. Apply schema.sql first; target business tables must be empty.
SET NAMES utf8mb4;
START TRANSACTION;
INSERT INTO `users` (`id`,`email`,`name`,`role`,`phone`,`password_hash`) VALUES
(1,'khach@gomeal.vn','Khách demo','CUSTOMER','0912345678','64a4a346de7d4725556caeaa33145ca3:7d16f3af74253c0c4d6a264cedeb5c49f2fcda6e610c0fcf48d2d8afb7d0c1a00da3fcb6a1fd99bc355b486d3a737004ba03599eadabd5511b9e3658226851bd'),
(2,'khach2@gomeal.vn','Khách thứ hai','CUSTOMER','0912345679','a6090cbe62e508d5ff276c11ba9c86aa:c995bdf8207d5c2068e69d770fda6d7416c83a3dfc19d506b8f4bf8271a1c2a7df1dc6af25aa34548dacf4d1539bd48403b9c0d94e802886acad4a03fc517fdd'),
(3,'chuacosdt@gomeal.vn','Khách chưa có số','CUSTOMER',NULL,'c963c23afdfb264ad07fe28989b8eb3e:d9e1a870018bf5baa7cc21834e3225158f321d2b0ef099e0c14acebeac822755643ea0058ba878087dda13b3efb99f1f6457688fba45123037dc8bd466663074'),
(11,'nhahang@gomeal.vn','Quản lý Hokkaido','MANAGER','0912345680','06cab2ec0c4f37ec5523be85be5b856e:3007376eaab8d9deaccb41d5c39d6a318cfd70906e32a4bde09ed16239126b9929e03c93954b441023e73fc49ecc8b13b8a4c9fbf272e15dc72f965492668942'),
(12,'nhahang2@gomeal.vn','Quản lý Sushi Góc Phố','MANAGER','0912345681','a8f1158a5b604cdef0a74ed06188e2ff:2338da7e972254cbecd9b95d0921e73c74dad6d188794524971ff79e0d5526fd4f7613c03f09b31ce35a837ed04ec106c97bbf7bc8831ca990460b73cafc44f6'),
(13,'nhahang3@gomeal.vn','Quản lý Phở Bắc Hà Nội','MANAGER','0912345688','75c9792fb2fb004c755023782fa330bd:4e208bbccfc86365266fb8bbdd2d04dc37d39dec03ddae878ae58bbb8ab33b81db7b167ccf4429f8582262838599af221f67a2ed14c20004341bfa83982cfd8f'),
(14,'nhahang4@gomeal.vn','Quản lý Napoli Pizza','MANAGER','0912345689','855a2c0be0a285332086237c5964ed4e:8d9eb8440f90c5bccf78cc0d631384afee34c6095fd02c5f1c8ffe13b2939bddc5e2d9be17ac1ad9252f6a48052e6a80ab4192baa19dbe4a692ccb4f816f0ab7'),
(15,'nhahang5@gomeal.vn','Quản lý Trà Sữa Mây','MANAGER','0912345690','086b5ad1e1859c8841781517b5d2761c:9a1209a705d5a53cdbd944d559b302fa1424ef95aa561eb306960c734d59925ff1e939b4fb4bbd8e0e58eb037a01c72af482d5fbbbf11227d46be589de2df5a3'),
(21,'taixe@gomeal.vn','Tài xế 1','DRIVER','0912345682','3bf3107378311c53153d25eae186e39a:c87f5be0645f85b4679c6fff7e416a7706c730e5adf880cb46202f66df4518041dd702863983506aed7ddf0eb90ccc8bab6e6490d089a797a4ec0200945b14f9'),
(22,'taixe2@gomeal.vn','Tài xế 2','DRIVER','0912345683','dd22b1786616842eb92246055e0344f9:c97a177ec61630ab402036f56805531f9cd2da2fca751259b6a900d2133846edc196e3c1d87b029cfe293cfccb58b9335157aece21db7a3b22602f50c3fbe780'),
(23,'taixe3@gomeal.vn','Tài xế 3','DRIVER','0912345684','18027efd45b2c9c2d439193a13fd2640:a519b58aee6401fe10dc1a8af592b1f178429d0a56d2991bd17a1770fff754d2ee20014b5418f2b7ea648837ae8184231d528aa8b870f102bf5a4a05158f4bd3'),
(24,'taixe4@gomeal.vn','Tài xế 4','DRIVER','0912345685','d58577ceb1f87f38b4664c7c9b9c198c:9f66938237d0378eac311ad24c14cd09d46d167ba1b377bb75c963e3790682705912fb8ffcbe0b63dad62f334377698f0027d66e514cf09bd9c67eaf6db65dc2'),
(25,'taixe5@gomeal.vn','Tài xế 5','DRIVER','0912345686','3e898aeccee8a15ad61bbb131d5488cc:9cbfac3efdc5af6b06c522efc0872d55dbbc536bea4431347790f102ed670f8ee4c905e32ed7536b48cab5948dd9cfa653ef2fe5f2db8d391e5d8952946c963d'),
(31,'admin@gomeal.vn','Quản trị viên','ADMIN','0912345687','c185210ffd2881d6a7cce745aeac5164:fb1055c4a8426fd5cbdc4c990d1bf2e9c240af6e504375b06b004319995ca62b42cf6085b857c56adc9fa2233b95af06441e8d4d6be89e6015018a238baafb6d');
INSERT INTO `restaurants` (`phone`,`id`,`manager_id`,`name`,`address`,`cuisine`,`lat`,`lng`,`status`,location) VALUES
('0283822001',1,11,'Hokkaido Sachi','25 Nguyễn Trãi, Quận 1','Nhật Bản',10.7705,106.6932,'ACTIVE',ST_GeomFromText('POINT(10.7705 106.6932)',4326)),
('0283822002',2,12,'Sushi Góc Phố','12 Pasteur, Quận 1','Nhật Bản',10.7765,106.7009,'ACTIVE',ST_GeomFromText('POINT(10.7765 106.7009)',4326)),
('0283822003',3,13,'Phở Bắc Hà Nội','48 Lý Tự Trọng, Quận 1','Việt Nam',10.7792,106.6985,'ACTIVE',ST_GeomFromText('POINT(10.7792 106.6985)',4326)),
('0283822004',4,14,'Napoli Pizza & Pasta','102 Hai Bà Trưng, Quận 1','Ý',10.7856,106.699,'ACTIVE',ST_GeomFromText('POINT(10.7856 106.699)',4326)),
('0283822005',5,15,'Trà Sữa Mây','210 Võ Văn Tần, Quận 3','Đồ uống & tráng miệng',10.7748,106.688,'ACTIVE',ST_GeomFromText('POINT(10.7748 106.688)',4326));
INSERT INTO `menu_items` (`category_id`,`description`,`ingredients`,`image_url`,`id`,`restaurant_id`,`name`,`price`,`available`) VALUES
('main','Hai miếng nigiri cá hồi tươi trên cơm giấm.','Cá hồi Na Uy, cơm giấm, wasabi','/media/demo/salmon_nigiri.jpg',1,1,'Nigiri cá hồi',50000,1),
('main','Cuộn 8 miếng, phủ trứng cá.','Thanh cua, bơ, dưa leo, trứng cá, cơm giấm, rong biển','/media/demo/california-roll.jpg',2,1,'California roll',80000,1),
('main','Set 12 miếng sushi tổng hợp.','Cá hồi, cá ngừ, tôm, trứng cuộn, cơm giấm','/media/demo/set-sushi-tong-hop.jpg',3,2,'Sushi set',90000,1),
('main','8 lát cá hồi cắt dày, ăn kèm củ cải bào.','Cá hồi Na Uy, củ cải trắng, tía tô, wasabi','/media/demo/sashimi-ca-hoi.jpg',4,1,'Sashimi cá hồi',120000,1),
('main','5 con tôm chiên giòn nhẹ, chấm sốt tentsuyu.','Tôm sú, bột tempura, sốt tentsuyu','/media/demo/tempura-tom.jpg',5,1,'Tempura tôm',79000,1),
('main','6 bánh xếp nhân thịt, áp chảo giòn đáy.','Thịt heo, bắp cải, hẹ, vỏ bánh, giấm tương','/media/demo/gyoza-chien.jpg',6,1,'Gyoza chiên',59000,1),
('main','Cơm giấm phủ cá sống và trứng cuộn.','Cá hồi, cá ngừ, tôm, trứng cuộn, cơm giấm','/media/demo/chirashi-don.jpg',7,1,'Chirashi don',139000,1),
('main','Hai miếng lươn nướng sốt kabayaki.','Lươn Nhật, sốt kabayaki, mè, cơm giấm','/media/demo/nigiri-luon-nuong.jpg',8,1,'Nigiri lươn nướng',69000,1),
('main','Hai miếng cá ngừ đỏ trên cơm giấm.','Cá ngừ đại dương, cơm giấm, wasabi','/media/demo/nigiri-ca-ngu.jpg',9,2,'Nigiri cá ngừ',50000,1),
('main','2 miếng gunkan trứng cá hồi ngâm tương.','Trứng cá hồi, rong biển, cơm giấm','/media/demo/gunkan_salmon.jpg',10,2,'Gunkan trứng cá hồi',65000,1),
('main','6 miếng cuộn dưa leo, hợp người ăn chay.','Dưa leo, mè, rong biển, cơm giấm','/media/demo/kappa-maki.jpg',11,2,'Kappa maki',55000,1),
('main','Nước dùng xương bò hầm 12 giờ, bánh phở tươi.','Bò tái, bò chín, bánh phở, hành, ngò gai, quế, hồi','/media/demo/pho-bo.jpg',12,3,'Phở bò tái chín',65000,1),
('main','Chả viên và thịt nướng than, nước chấm chua ngọt.','Thịt heo, bún, đu đủ ngâm, rau sống, nước mắm','/media/demo/bun-cha.jpg',13,3,'Bún chả Hà Nội',70000,1),
('main','Bánh mì giòn, thịt nướng, pa tê, đồ chua.','Bánh mì, thịt heo nướng, pa tê, dưa leo, đồ chua, ngò','/media/demo/banh-mi.jpg',14,3,'Bánh mì thịt nướng',35000,1),
('main','3 cuốn, chấm tương đậu phộng.','Tôm, thịt ba chỉ, bún, rau thơm, bánh tráng','/media/demo/goi-cuon.jpg',15,3,'Gỏi cuốn tôm thịt',40000,1),
('main','Phin Robusta, sữa đặc.','Cà phê Robusta, sữa đặc, đá','/media/demo/ca-phe-sua-da.jpg',16,3,'Cà phê sữa đá',29000,1),
('main','Đế mỏng 26 cm nướng lò, sốt cà chua và mozzarella.','Bột mì, sốt cà chua, mozzarella, húng quế','/media/demo/pizza-margherita.jpg',17,4,'Pizza Margherita',159000,1),
('main','Tôm, mực, nghêu trên đế mỏng 26 cm.','Tôm, mực, nghêu, mozzarella, sốt cà chua, ớt chuông','/media/demo/pizza-hai-san.jpg',18,4,'Pizza hải sản',199000,1),
('main','Sốt trứng và phô mai kiểu Roma.','Mì spaghetti, lòng đỏ trứng, pecorino, thịt heo xông khói, tiêu đen','/media/demo/spaghetti-carbonara.jpg',19,4,'Spaghetti carbonara',129000,1),
('main','Xà lách romaine, bánh mì nướng giòn, sốt Caesar.','Xà lách romaine, parmesan, bánh mì, sốt Caesar','/media/demo/salad-caesar.jpg',20,4,'Salad Caesar',89000,1),
('main','Bánh kem mascarpone vị cà phê.','Mascarpone, bánh ladyfinger, cà phê espresso, cacao','/media/demo/tiramisu.jpg',21,4,'Tiramisu',65000,1),
('main','Size M, trân châu nấu đường đen.','Hồng trà, sữa tươi, trân châu, đường đen','/media/demo/tra-sua-tran-chau.jpg',22,5,'Trà sữa trân châu đường đen',45000,1),
('main','Trà đen, đào ngâm, cam tươi và sả.','Trà đen, đào, cam, sả, đường','/media/demo/tra-dao-cam-sa.jpg',23,5,'Trà đào cam sả',49000,1),
('main','Matcha Uji pha sữa tươi.','Bột matcha, sữa tươi, đường','/media/demo/matcha-latte.jpg',24,5,'Matcha latte',55000,1),
('main','Flan trứng sữa, sốt caramel.','Trứng, sữa, đường caramel','/media/demo/banh-flan.jpg',25,5,'Bánh flan',25000,1),
('main','Bơ sáp dầm cùng sữa tươi, sữa đặc và đá.','Bơ sáp, sữa tươi, sữa đặc, đá','/media/demo/bo-dam-sua.jpg',26,5,'Bơ dầm sữa',45000,1);
INSERT INTO `menu_options` (`id`,`menu_item_id`,`name`,`surcharge`,`available`) VALUES
(1,1,'Thêm sốt',5000,1),
(2,2,'Thêm phô mai',10000,1),
(3,12,'Thêm thịt bò',20000,1),
(4,12,'Thêm trứng chần',8000,1),
(5,13,'Thêm chả',20000,1),
(6,17,'Thêm phô mai',25000,1),
(7,17,'Đế viền phô mai',35000,1),
(8,19,'Thêm thịt xông khói',20000,1),
(9,22,'Size L',8000,1),
(10,22,'Thêm trân châu',7000,1),
(11,24,'Thêm kem cheese',10000,1),
(12,4,'Thêm wasabi tươi',10000,1),
(13,7,'Thêm trứng cá hồi',30000,1);
INSERT INTO `drivers` (`lat`,`lng`,`location_at`,`id`,`user_id`,`status`,`locked`,`updated_at`) VALUES
(NULL,NULL,NULL,1,21,'OFFLINE',0,1793682076665),
(NULL,NULL,NULL,2,22,'OFFLINE',0,1793682076665),
(NULL,NULL,NULL,3,23,'OFFLINE',0,1793682076665),
(NULL,NULL,NULL,4,24,'OFFLINE',0,1793682076665),
(NULL,NULL,NULL,5,25,'OFFLINE',0,1793682076665);
INSERT INTO `vouchers` (`description`,`percent`,`amount`,`max_discount`,`min_subtotal`,`customer_id`,`expires_at`,`id`,`code`,`kind`,`active`,`created_at`) VALUES
('Miễn phí giao tối đa 30.000đ cho đơn từ 100.000đ',100,NULL,30000,100000,NULL,NULL,1,'FREESHIP','SHIPPING',1,1793682076665),
('Giảm 20% tiền món, tối đa 50.000đ, đơn từ 150.000đ',20,NULL,50000,150000,NULL,NULL,2,'GIAM20','ORDER',1,1793682076665),
('Giảm 30.000đ cho khách demo, đơn từ 60.000đ',NULL,30000,NULL,60000,1,NULL,3,'KHACHMOI','ORDER',1,1793682076665);
COMMIT;
