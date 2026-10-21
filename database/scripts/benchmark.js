// HTTP load generator: one process for API and one for clients (see benchmark-client.js).
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MysqlStore } from '../src/mysql-store.js';
import { seedLoad } from './database.js';
import { createSystem,createApp } from '@gomeal/backend/src/app.js';

const store=await MysqlStore.open({database:process.env.LOAD_DB_NAME ?? 'gomeal_m3_load'});
if (!await store.find('users',{})) await seedLoad(store);
for (const [name,expected] of [['restaurants',100],['menu_items',2000],['orders',10000]]) {
    if ((await store.query(`SELECT count(*) AS n FROM ${name}`))[0].n!==expected) throw new Error(`Wrong load dataset: ${name}`);
}
const system=createSystem({store});
const clients=await Promise.all(Array.from({length:100},async (_,i) => ({
    token:(await system.auth.login({email:`load${1000+i}@gomeal.vn`,password:'demo12345'})).token,
    orderId:i+1,
})));
const server=createApp(system).listen(0,'127.0.0.1');
await new Promise((resolve) => server.once('listening',resolve));
const worker=setInterval(system.tick,30000);
const [mysqlMetadata]=await store.query('SELECT VERSION() AS version, @@innodb_flush_log_at_trx_commit AS flushLogAtCommit, @@sync_binlog AS syncBinlog, @@log_bin AS binaryLog');
console.log('Benchmark ready: 100 VUs, 120s warm-up + 600s measurement by default.');
const child=fork(fileURLToPath(new URL('./benchmark-client.js',import.meta.url)),[],{stdio:['ignore','inherit','inherit','ipc']});
child.send({base:`http://127.0.0.1:${server.address().port}/api`,clients,database:store.config.database,
    backend:{engine:'MySQL InnoDB',...mysqlMetadata,poolSize:store.config.connectionLimit,dispatchIntervalMs:30000}});
const code=await new Promise((resolve) => child.once('exit',resolve));
clearInterval(worker);
server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
await store.close();
process.exitCode=code ?? 1;
