import { pathToFileURL } from 'node:url';
import { MysqlStore } from '../src/mysql-store.js';
import { seedData } from '@gomeal/backend/scripts/demo-fixtures.js';

export async function seedLoad(store) {
    return store.transaction(async () => {
        await seedData(store);
        const password_hash=(await store.user(1)).password_hash;
        for (let id=1000; id<1100; id++) await store.insert('users', {
            id,email:`load${id}@gomeal.vn`,name:`Khách tải ${id}`,phone:'0912345678',role:'CUSTOMER',password_hash,
        });
        for (let id=3; id<=100; id++) await store.insert('restaurants', {
            id,manager_id:11,name:`Nhà hàng ${id}`,address:`${id} Nguyễn Trãi`,cuisine:'Việt Nam',
            // Lưới cách nhau 0,03° (~3,3 km) phủ khoảng 30 km, để mỗi vòng 5 km chỉ chứa vài nhà hàng và spatial index có tác dụng.
            lat:10.7705+((id%10)-5)*0.03,lng:106.6932+(Math.floor(id/10)-5)*0.03,status:'ACTIVE',
        });
        for (let restaurantId=1; restaurantId<=100; restaurantId++) {
            const count=(await store.rows('menu_items',{restaurant_id:restaurantId})).length;
            for (let n=count; n<20; n++) await store.insert('menu_items', {
                restaurant_id:restaurantId,name:`Món ${restaurantId}-${n+1}`,price:30000+n*1000,available:1,
                category_id:n%2 ? 'main' : 'side',description:'Dữ liệu tổng hợp kiểm thử tải',
            });
        }
        const at=1800000000000;
        for (let n=0; n<10000; n++) {
            const restaurant_id=n%100+1, customer_id=1000+n%100;
            const item=await store.find('menu_items',{restaurant_id});
            const id=await store.insert('orders', {
                customer_id,restaurant_id,driver_id:1,status:'DELIVERED',subtotal:item.price,delivery_fee:15000,
                total:item.price+15000,delivery_address:'18 Lê Văn Sỹ, Quận 3',contact_phone:'0912345678',
                payment_method:'COD',request_key:`load-${n}`,request_hash:`synthetic-${n}`,version:8,
                created_at:at+n,updated_at:at+n+700,
            });
            await store.insert('order_items', {order_id:id,menu_item_id:item.id,name:item.name,options_json:'[]',
                unit_price:item.price,quantity:1,line_total:item.price});
            await store.insert('payments',{order_id:id,amount:item.price+15000,status:'SUCCESS',transaction_id:null});
            const statuses=['PENDING','CONFIRMED','PREPARING','READY_FOR_PICKUP','DRIVER_ASSIGNED','PICKED_UP','DELIVERING','DELIVERED'];
            for(const [i,status] of statuses.entries()) await store.history(id,status,i===0 ? customer_id : i<4 ? (await store.restaurant(restaurant_id)).manager_id : 21,at+n+i*100);
            await store.update('orders',{id},{creation_response:JSON.stringify(await store.orderView(id))});
        }
        return {restaurants:100,menuItems:2000,orders:10000,customers:100};
    });
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
    const command=process.argv[2] ?? 'migrate';
    const store=await MysqlStore.open();
    try {
        if(command==='demo') await seedData(store,process.env.DEMO_PASSWORD ?? 'demo12345');
        else if(command==='load') await seedLoad(store);
        else if(command!=='migrate') throw new Error('Use migrate, demo or load');
        console.log(JSON.stringify({command,database:store.config.database,
            restaurants:(await store.rows('restaurants')).length,
            menuItems:(await store.rows('menu_items')).length,
            orders:(await store.query('SELECT count(*) AS n FROM orders'))[0].n}));
    } finally {await store.close();}
}
