// Bổ sung dữ liệu demo của migration 002 (SĐT nhà hàng, ảnh/thành phần món, voucher mẫu) vào CSDL đã seed trước đó.
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
        for(const row of await fixture.rows('vouchers')) {
            if(await store.find('vouchers',{code:row.code})) continue;
            if(row.customer_id && !(await store.user(row.customer_id))) continue;
            const {id,...values}=row;
            await store.insert('vouchers',values);
        }
    });
    console.log(JSON.stringify({database:store.config.database,vouchers:(await store.rows('vouchers')).map((v)=>v.code)}));
} finally {await store.close();}
