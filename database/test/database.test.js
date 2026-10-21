import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {MysqlStore,TABLES} from '../src/mysql-store.js';
import {createSystem} from '@gomeal/backend/src/app.js';
import {fixture,requestBody,createOrder,readyOrder,online} from '@gomeal/backend/test/helpers.js';

import {testDatabase,reset} from './support.js';
async function database(t,options={}) {
    const store=await MysqlStore.open({database:testDatabase});
    t.after(()=>store.close());
    await reset(store);
    return fixture({store,...options});
}
const code=(expected)=>(error)=>error.code===expected;
const snapshot=async(store)=>Object.fromEntries(await Promise.all(TABLES.map(async(name)=>[name,await store.rows(name)])));
async function peers(t,s,count) {
    return Promise.all(Array.from({length:count},async()=>{
        const store=await MysqlStore.open({database:testDatabase,connectionLimit:1});
        t.after(()=>store.close());
        return createSystem({store,clock:s.clock});
    }));
}

test('MySQL contract and DTO parity, unique email/key, coordinates, integer money, FK, SQL binding, CAS',async(t)=>{
    const s=await database(t),memory=await fixture();t.after(()=>memory.store.close());
    const body=await requestBody(s,{requestKey:'parity'});
    assert.deepEqual(await s.orders.create(await s.user(1),body),await memory.orders.create(await memory.user(1),body));
    const user=await s.user(1);user.name='mutated';assert.notEqual((await s.user(1)).name,user.name);
    assert.equal(await s.store.find('users',{id:999}),undefined);
    assert.equal(await s.store.orderView(999),null);
    assert.equal((await s.store.driver(21)).id,1);
    await assert.rejects(()=>s.store.insert('users',{...user,id:999,email:'KHACH@GOMEAL.VN'}),code('CONFLICT'));
    await assert.rejects(async()=>s.store.insert('orders',{...await s.store.order(1),id:999}),code('CONFLICT'));
    await assert.rejects(()=>s.store.update('restaurants',{id:1},{lat:null}),code('VALIDATION'));
    for(const price of [1.5,-1,Number.MAX_SAFE_INTEGER+1]) await assert.rejects(()=>s.store.update('menu_items',{id:1},{price}),code('VALIDATION'));
    await assert.rejects(()=>s.store.insert('sessions',{user_id:999,token_hash:'x',expires_at:1}),code('VALIDATION'));
    await assert.rejects(()=>s.store.remove('users',{}));
    await assert.rejects(()=>s.store.update('users',{}, {name:'x'}));
    await assert.rejects(()=>s.store.rows('users; DROP TABLE users'));
    await assert.rejects(()=>s.store.rows('users',{'id OR 1=1':1}));
    assert.equal(await s.store.find('users',{email:"' OR 1=1 --"}),undefined);
    assert.equal(await s.store.update('users',{id:999},{name:'x'}),0);
    await assert.rejects(()=>s.store.update('orders',{id:1,version:999},{version:1000}),code('CONFLICT'));
    const [point]=await s.store.query('SELECT ST_Latitude(location) lat,ST_Longitude(location) lng FROM restaurants WHERE id=1');
    assert.ok(Math.abs(point.lat-10.7705)<1e-10 && Math.abs(point.lng-106.6932)<1e-10);
});

test('transaction connection isolation, async callbacks, nested savepoints and partial unique constraints',async(t)=>{
    const s=await database(t),before=await snapshot(s.store);
    await assert.rejects(()=>s.store.transaction(async()=>{
        assert.equal(s.store.inTransaction,true);
        await s.store.update('users',{id:1},{name:'outer'});
        await assert.rejects(()=>s.store.transaction(async()=>{
            await s.store.update('users',{id:1},{name:'inner'});throw new Error('inner');
        }));
        assert.equal((await s.user(1)).name,'outer');throw new Error('outer');
    }));
    assert.deepEqual(await snapshot(s.store),before);
    assert.equal(s.store.inTransaction,false);
    await online(s,2);const one=await readyOrder(s),two=await readyOrder(s);
    await s.dispatch.tick();
    const offers=await s.store.rows('driver_offers',{status:'PENDING'});
    assert.equal(offers.length,2);
    await assert.rejects(()=>s.store.insert('driver_offers',{...offers[0],id:999,driver_id:2}),code('CONFLICT'));
    await assert.rejects(()=>s.store.insert('driver_offers',{...offers[0],id:998,order_id:two.id}),code('CONFLICT'));
    await s.dispatch.respond(await s.user(21),offers.find(o=>o.driver_id===1).id,true);
    await assert.rejects(()=>s.store.update('orders',{id:two.id},{driver_id:1,status:'DRIVER_ASSIGNED'}),code('CONFLICT'));
    assert.equal((await s.store.order(one.id)).driver_id,1);
});

test('NFR-02: 20 injected creation failures roll back every business table on MySQL',async(t)=>{
    let inject;
    const s=await database(t,{fault:(point)=>{if(point===inject)throw new Error('Injected '+point);}});
    const before=await snapshot(s.store),cases=[];
    for(const point of ['afterOrder','afterItem','afterHistory','afterPayment','beforeCommit'])
        for(const method of ['COD','MOCK_WALLET','MOCK_CARD']) cases.push({point,method});
    for(let i=0;i<5;i++)cases.push({point:'mockFailed',method:i%2?'MOCK_CARD':'MOCK_WALLET'});
    const other=await MysqlStore.open({database:testDatabase});t.after(()=>other.close());
    for(const scenario of cases) {
        inject=scenario.point;s.payment.result=inject==='mockFailed'?'FAILED':'SUCCESS';
        await assert.rejects(()=>createOrder(s,{paymentMethod:scenario.method}));
        assert.deepEqual(await snapshot(s.store),before);
        assert.deepEqual(await snapshot(other),before);
        scenario.pass=true;
    }
    writeFileSync(new URL('../docs/NFR-02-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),engine:'MySQL 8 InnoDB',passed:20,total:20,cases},null,2)+'\n');
});

test('assignment, refund, completion atomicity and completion replay on MySQL',async(t)=>{
    let inject;
    const s=await database(t,{fault:(point)=>{if(point===inject)throw new Error(point);}});
    await online(s,2);let order=await readyOrder(s);await s.dispatch.tick();
    const offer=await s.store.find('driver_offers',{status:'PENDING'});
    for(const point of ['afterDriverBusy','afterAssignmentHistory']){
        inject=point;const before=await snapshot(s.store);
        await assert.rejects(async()=>s.dispatch.respond(await s.user(21),offer.id,true));
        assert.deepEqual(await snapshot(s.store),before);
    }
    inject=null;order=(await s.dispatch.respond(await s.user(21),offer.id,true)).order;
    for(const targetStatus of ['PICKED_UP','DELIVERING'])order=await s.orders.transition(await s.user(21),order.id,{targetStatus,expectedVersion:order.version});
    for(const point of ['afterCompletionPayment','afterTransitionHistory']){
        inject=point;const before=await snapshot(s.store);
        await assert.rejects(async()=>s.orders.transition(await s.user(21),order.id,{targetStatus:'DELIVERED',expectedVersion:order.version,codCollected:true}));
        assert.deepEqual(await snapshot(s.store),before);
    }
    inject=null;const done=await s.orders.transition(await s.user(21),order.id,{targetStatus:'DELIVERED',expectedVersion:order.version,codCollected:true});
    assert.deepEqual(await s.orders.transition(await s.user(21),order.id,{targetStatus:'DELIVERED'}),done);
    order=await createOrder(s,{paymentMethod:'MOCK_CARD'});
    for(const point of ['afterCancellationPayment','afterCancellationHistory']){
        inject=point;const before=await snapshot(s.store);
        await assert.rejects(async()=>s.orders.cancel(await s.user(1),order.id,{expectedVersion:order.version}));
        assert.deepEqual(await snapshot(s.store),before);
    }
    inject=null;await s.orders.cancel(await s.user(1),order.id,{expectedVersion:order.version});
    assert.equal((await s.store.find('payments',{order_id:order.id})).status,'REFUNDED');
});

test('independent MySQL connections: simultaneous requestKey, changed payload, version and two-driver accept',async(t)=>{
    const s=await database(t),p=await peers(t,s,2),body=await requestBody(s,{requestKey:'concurrent-key'});
    let results=await Promise.all(p.map(async(peer)=>peer.orders.create(await peer.store.user(1),body)));
    assert.equal(results.filter(r=>r.replayed).length,1);
    assert.equal((await s.store.rows('orders')).length,1);
    results=await Promise.allSettled(p.map(async(peer,i)=>peer.orders.create(await peer.store.user(1),{...body,deliveryAddress:i?'Khác':body.deliveryAddress})));
    assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='CONFLICT').length,1);
    const order=await s.store.order(1);
    results=await Promise.allSettled(p.map(peer=>peer.store.update('orders',{id:1,version:order.version},{version:order.version+1})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.reason?.code==='CONFLICT').length,1);
    await online(s,2);await readyOrder(s,await s.store.orderView(1));await s.dispatch.tick();
    const offer=await s.store.find('driver_offers',{status:'PENDING'});
    results=await Promise.allSettled(p.map(async(peer,i)=>peer.dispatch.respond(await peer.store.user(21+i),offer.id,true)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await s.store.order(1)).driver_id,1);
});

test('NFR-06: 100 rounds x 20 orders/5 drivers, concurrent double/late accepts and automatic queue recovery', {timeout:300000},async(t)=>{
    const s=await database(t),p=await peers(t,s,10);
    for(let round=0;round<100;round++){
        await online(s,5);const ids=[];
        for(let n=0;n<20;n++)ids.push((await readyOrder(s)).id);
        await Promise.all([p[0].dispatch.tick(),p[1].dispatch.tick()]);
        let offers=await s.store.rows('driver_offers',{status:'PENDING'});assert.equal(offers.length,5);
        s.advance(60000);
        let results=await Promise.allSettled(offers.map(async(o,i)=>p[i].dispatch.respond(await p[i].store.user(20+o.driver_id),o.id,true)));
        assert.ok(results.every(r=>r.status==='rejected'&&r.reason.code==='CONFLICT'));
        await s.dispatch.tick();offers=await s.store.rows('driver_offers',{status:'PENDING'});assert.equal(offers.length,5);
        const actions=offers.flatMap(o=>[o,o]);
        results=await Promise.allSettled(actions.map(async(o,i)=>p[i].dispatch.respond(await p[i].store.user(20+o.driver_id),o.id,true)));
        assert.equal(results.filter(r=>r.status==='fulfilled').length,5);
        assert.equal(results.filter(r=>r.reason?.code==='CONFLICT').length,5);
        assert.equal((await s.store.rows('orders',{status:'DRIVER_ASSIGNED'})).length,5);
        assert.equal((await s.store.rows('orders',{status:'READY_FOR_PICKUP'})).length,15);
        let order=await s.store.orderView(offers[0].order_id);const user=await s.user(20+offers[0].driver_id);
        for(const targetStatus of ['PICKED_UP','DELIVERING','DELIVERED'])order=await s.orders.transition(user,order.id,{targetStatus,expectedVersion:order.version,codCollected:true});
        await s.dispatch.tick();const next=await s.store.find('driver_offers',{driver_id:offers[0].driver_id,status:'PENDING'});assert.ok(next&&ids.includes(next.order_id));
        await s.dispatch.respond(user,next.id,true);
        let remaining=20;
        while(remaining){
            for(let current of await s.store.rows('orders',{status:'DRIVER_ASSIGNED'})){
                const driver=await s.user(20+current.driver_id);
                for(const targetStatus of ['PICKED_UP','DELIVERING','DELIVERED'])current=await s.orders.transition(driver,current.id,{targetStatus,expectedVersion:current.version,codCollected:true});
            }
            await s.dispatch.tick();
            for(const o of await s.store.rows('driver_offers',{status:'PENDING'}))await s.dispatch.respond(await s.user(20+o.driver_id),o.id,true);
            remaining=(await s.store.query("SELECT count(*) n FROM orders WHERE status<>'DELIVERED'"))[0].n;
            if(remaining&&!await s.store.find('orders',{status:'DRIVER_ASSIGNED'})){
                s.advance(30000);await online(s,5);await s.dispatch.tick();
                for(const o of await s.store.rows('driver_offers',{status:'PENDING'}))await s.dispatch.respond(await s.user(20+o.driver_id),o.id,true);
            }
        }
    }
    writeFileSync(new URL('../docs/NFR-06-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),engine:'MySQL 8 InnoDB',rounds:100,ordersPerRound:20,drivers:5,independentPeerPools:10,duplicateAccepts:500,expiredAccepts:500,passed:100,resumedWithoutManualRepair:true,clock:'Controlled monotonically increasing clock'},null,2)+'\n');
});

test('indexed location, nearest-driver tie/eligibility and SQL pagination',async(t)=>{
    const s=await database(t),memory=await fixture();t.after(()=>memory.store.close());
    for(const query of [{},{q:'HOKKAIDO'},{lat:10.7705,lng:106.6932},{lat:10.7705,lng:106.6932,page:2}]){
        const actual=await s.catalog.list(query),expected=await memory.catalog.list(query);
        assert.equal(actual.total,expected.total);assert.deepEqual(actual.items.map(r=>r.id),expected.items.map(r=>r.id));
        actual.items.forEach((r,i)=>{if(r.distanceKm!==undefined)assert.ok(Math.abs(r.distanceKm-expected.items[i].distanceKm)<1e-8);});
    }
    await online(s,5);const order=await readyOrder(s);
    await s.store.update('drivers',{id:1},{location_at:s.clock()-120001});
    await s.store.update('drivers',{id:2},{locked:1});
    await s.store.update('drivers',{id:4},{lat:10.7708,updated_at:s.clock()-10});
    const nearest=await s.store.nearestDriver(order,await s.store.restaurant(1),s.clock());
    // Driver 3 and 4 share a location; older timestamp wins.
    assert.equal(nearest.id,4);
    await s.dispatch.tick();assert.equal((await s.store.find('driver_offers',{status:'PENDING'})).driver_id,4);
    const offer=await s.store.find('driver_offers',{status:'PENDING'});await s.dispatch.respond(await s.user(24),offer.id,false);await s.dispatch.tick();
    assert.equal((await s.store.find('driver_offers',{status:'PENDING'})).driver_id,3);
    assert.equal((await s.orders.mine(await s.user(1),1)).items.length,1);
    const indexes=await s.store.query('SHOW INDEX FROM restaurants');assert.ok(indexes.some(r=>r.Index_type==='SPATIAL'));
    const plan=await s.store.query("EXPLAIN SELECT id FROM restaurants FORCE INDEX(ix_restaurant_location) WHERE MBRIntersects(location,ST_GeomFromText('POLYGON((10.7 106.6,10.7 106.8,10.9 106.8,10.9 106.6,10.7 106.6))',4326))");
    assert.equal(plan[0].key,'ix_restaurant_location');
});
