// Bổ sung dữ liệu demo của migration 002 (SĐT nhà hàng, ảnh/thành phần món, voucher mẫu) và các nhà hàng/món mẫu
// thêm sau (03/11/2026) vào CSDL đã seed trước đó.
// Chỉ cập nhật/chèn thêm, không xóa dữ liệu đang có. Chạy: node --env-file-if-exists=.env scripts/upgrade-demo.js
import { MysqlStore } from '../src/mysql-store.js';
import { MemoryStore } from '@gomeal/backend/src/adapters/memory-store.js';
import { seedData } from '@gomeal/backend/scripts/demo-fixtures.js';

const fixture=new MemoryStore();
await seedData(fixture,'unused');
const store=await MysqlStore.open();
try {
    await store.transaction(async()=>{
        for(const row of await fixture.rows('restaurants')) {
            if(await store.restaurant(row.id) && row.phone) await store.update('restaurants',{id:row.id,phone:null},{phone:row.phone});
        }
        for(const row of await fixture.rows('menu_items')) {
            const item=await store.find('menu_items',{id:row.id});
            if(item && item.name===row.name && !item.image_url) await store.update('menu_items',{id:row.id},{image_url:row.image_url,description:row.description,ingredients:row.ingredients});
        }
        // Nhà hàng, quản lý, món, option mới: nhận diện theo email/tên, để MySQL cấp id mới (id cũ có thể đã được món tự thêm dùng).
        const users=new Map(),restaurants=new Map(),items=new Map();
        for(const row of await fixture.rows('users')) {
            const found=await store.find('users',{email:row.email});
            if(found) {users.set(row.id,found.id);continue;}
            if(row.role!=='MANAGER')continue;
            const {id,...values}=row;
            users.set(id,await store.insert('users',values));
        }
        for(const row of await fixture.rows('restaurants')) {
            const found=await store.find('restaurants',{name:row.name});
            if(found) {restaurants.set(row.id,{id:found.id,added:false});continue;}
            if(!users.has(row.manager_id))continue;
            const {id,...values}=row;
            restaurants.set(id,{id:await store.insert('restaurants',{...values,manager_id:users.get(row.manager_id)}),added:true});
        }
        for(const row of await fixture.rows('menu_items')) {
            const owner=restaurants.get(row.restaurant_id);
            if(!owner)continue;
            const found=await store.find('menu_items',{restaurant_id:owner.id,name:row.name});
            if(found) {items.set(row.id,{id:found.id,added:false});continue;}
            const {id,...values}=row;
            items.set(id,{id:await store.insert('menu_items',{...values,restaurant_id:owner.id}),added:true});
        }
        for(const row of await fixture.rows('menu_options')) {
            const item=items.get(row.menu_item_id);
            if(!item || (!item.added && await store.find('menu_options',{menu_item_id:item.id,name:row.name})))continue;
            const {id,...values}=row;
            await store.insert('menu_options',{...values,menu_item_id:item.id});
        }
        for(const row of await fixture.rows('vouchers')) {
            if(await store.find('vouchers',{code:row.code})) continue;
            if(row.customer_id && !(await store.user(row.customer_id))) continue;
            const {id,...values}=row;
            await store.insert('vouchers',values);
        }
    });
    console.log(JSON.stringify({database:store.config.database,restaurants:(await store.rows('restaurants')).length,menuItems:(await store.rows('menu_items')).length,vouchers:(await store.rows('vouchers')).map((v)=>v.code)}));
} finally {await store.close();}
