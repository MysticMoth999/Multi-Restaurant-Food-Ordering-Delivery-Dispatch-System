import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import mysql from 'mysql2/promise';
import {MysqlStore,connectionConfig} from '../src/mysql-store.js';
import {reset} from '../test/support.js';
import {createSystem} from '@gomeal/backend/src/app.js';
const database=process.env.SEED_VERIFY_DB ?? 'gomeal_m2_test';
if(!database.endsWith('_test'))throw new Error('SQL seed verification requires a dedicated *_test schema');
const store=await MysqlStore.open({database});
// Only trusted, repository-generated seed SQL is allowed on this multi-statement connection.
const connection=await mysql.createConnection(connectionConfig({database,multipleStatements:true}));
const results=[];
try {
    for(const [file,expected] of [['seed_demo.sql',{restaurants:2,menu_items:3,orders:0}],
        ['seed_load.sql',{restaurants:100,menu_items:2000,orders:10000}]]) {
        await reset(store);
        await connection.query(readFileSync(new URL(`../sql/${file}`,import.meta.url),'utf8'));
        const counts={};
        for(const table of Object.keys(expected)) {
            counts[table]=(await store.query(`SELECT count(*) n FROM ${table}`))[0].n;
            assert.equal(counts[table],expected[table]);
        }
        const system=createSystem({store});
        assert.ok((await system.auth.login({email:'khach@gomeal.vn',password:'demo12345'})).token);
        if(file==='seed_load.sql') {
            const order=await store.orderView(1);
            assert.equal(order.history.length,8);assert.equal(order.lines.length,1);
            assert.equal(order.total,order.subtotal+order.deliveryFee);
        }
        results.push({file,counts,login:true,pass:true});
    }
    writeFileSync(new URL('../docs/SEED-VERIFICATION.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),engine:'MySQL 8 InnoDB',results},null,2)+'\n');
    console.log(JSON.stringify(results));
} finally {
    await connection.rollback();await connection.end();await reset(store);await store.close();
}
