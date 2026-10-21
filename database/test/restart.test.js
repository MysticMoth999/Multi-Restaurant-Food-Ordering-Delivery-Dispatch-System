import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath,pathToFileURL } from 'node:url';
import {MysqlStore} from '../src/mysql-store.js';
import {testDatabase,reset} from './support.js';

test('actual HTTP server restart preserves orders, carts, session, snapshots; process death rolls back uncommitted writes', {timeout:30000}, async (t)=>{
    const clean=await MysqlStore.open({database:testDatabase});await reset(clean);await clean.close();
    const reservation=createServer();
    await new Promise((resolve)=>reservation.listen(0,'127.0.0.1',resolve));
    const port=reservation.address().port;
    await new Promise((resolve)=>reservation.close(resolve));
    let child;
    const stop=async ()=>{
        if (child && child.exitCode===null && child.signalCode===null) {
            const exited=new Promise((resolve)=>child.once('exit',resolve));
            child.kill(); await exited;
        }
        child=null;
    };
    t.after(async ()=>{await stop();});
    const start=async ()=>{
        child=spawn(process.execPath,[fileURLToPath(import.meta.resolve('@gomeal/backend/src/server.js'))],{
            env:{...process.env,PORT:String(port),DB_NAME:testDatabase,STORE:'mysql',SEED_DEMO:'true',DEMO_PASSWORD:'demo12345'},
            stdio:['ignore','pipe','pipe'],
        });
        await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(new Error('Server startup timeout')),10000);
            child.stdout.once('data',()=>{clearTimeout(timer); resolve();});
            child.once('exit',(code)=>{clearTimeout(timer); reject(new Error('Startup exited '+code));});
            child.once('error',reject);
        });
    };
    const call=async (method,url,body,token)=>{
        const response=await fetch(`http://127.0.0.1:${port}/api${url}`,{
            method,headers:{'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {})},
            ...(body ? {body:JSON.stringify(body)} : {}),
        });
        assert.equal(response.status,200);
        return (await response.json()).data;
    };
    await start();
    const {token}=await call('POST','/auth/login',{email:'khach@gomeal.vn',password:'demo12345'});
    const items=[{menuItemId:1,quantity:2,selectedOptionIds:[1]}];
    await call('POST','/cart/items',{restaurantId:1,item:items[0]},token);
    const deliveryLocation={lat:10.78,lng:106.7};
    const quote=await call('POST','/cart/quote',{restaurantId:1,items,deliveryLocation});
    const body={restaurantId:1,items,deliveryAddress:'18 Lê Văn Sỹ',deliveryLocation,paymentMethod:'COD',requestKey:'restart-key',quoteFingerprint:quote.quoteFingerprint};
    const created=await call('POST','/orders',body,token);
    await stop();
    // Crash with an open write transaction. Committed business data must survive.
    const adapter=fileURLToPath(new URL('../src/mysql-store.js',import.meta.url));
    const script=`import {MysqlStore} from ${JSON.stringify(pathToFileURL(adapter).href)};
        const s=await MysqlStore.open(); await s.transaction(async()=>{await s.update('users',{id:1},{name:'uncommitted'});process.exit(23);});`;
    const crashed=spawn(process.execPath,['--input-type=module','-e',script],{env:{...process.env,DB_NAME:testDatabase},stdio:'ignore'});
    assert.equal(await new Promise((resolve)=>crashed.once('exit',resolve)),23);
    await start();
    const saved=await call('GET',`/orders/${created.order.id}`,null,token);
    assert.deepEqual(saved.order,created.order);
    const cart=await call('GET','/cart',null,token);
    assert.deepEqual(cart,{restaurantId:1,items});
    const replay=await call('POST','/orders',body,token);
    assert.equal(replay.replayed,true);
    assert.deepEqual(replay.order,created.order);
    await stop();
    const store=await MysqlStore.open({database:testDatabase});
    try {
        assert.notEqual((await store.user(1)).name,'uncommitted');
        assert.equal((await store.rows('orders')).length,1);
        assert.equal((await store.rows('users')).length,11);
        assert.equal((await store.query('SELECT count(*) n FROM order_items i LEFT JOIN orders o ON o.id=i.order_id WHERE o.id IS NULL'))[0].n,0);
        assert.equal((await store.pool.query('CHECK TABLE orders'))[0][0].Msg_text,'OK');
    } finally {await store.close();}
});
