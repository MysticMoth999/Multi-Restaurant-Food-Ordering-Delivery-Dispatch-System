import mysql from 'mysql2/promise';
import {writeFileSync,appendFileSync} from 'node:fs';
import {MemoryStore} from '@gomeal/backend/src/adapters/memory-store.js';
import {seedData} from '@gomeal/backend/scripts/demo-fixtures.js';
import {MysqlStore,TABLES} from '../src/mysql-store.js';

async function exportSql(store,name) {
    const path=new URL(`../sql/${name}`,import.meta.url);
    writeFileSync(path,'-- Synthetic GoMeal data. Apply schema.sql first; target business tables must be empty.\nSET NAMES utf8mb4;\nSTART TRANSACTION;\n');
    for(const table of TABLES.filter((name)=>name!=='sessions')) {
        const rows=await store.rows(table);
        if(!rows.length)continue;
        const columns=Object.keys(rows[0]);
        const isRestaurant=table==='restaurants';
        for(let offset=0;offset<rows.length;offset+=250) {
            const tuples=rows.slice(offset,offset+250).map((row)=>{
                const values=columns.map((column)=>mysql.escape(row[column]));
                if(isRestaurant)values.push(`ST_GeomFromText(${mysql.escape(`POINT(${row.lat} ${row.lng===-180?180:row.lng})`)},4326)`);
                return `(${values.join(',')})`;
            });
            appendFileSync(path,`INSERT INTO \`${table}\` (${columns.map((c)=>`\`${c}\``).join(',')}${isRestaurant?',location':''}) VALUES\n${tuples.join(',\n')};\n`);
        }
    }
    appendFileSync(path,'COMMIT;\n');
    console.log(`Exported ${name}; bearer sessions excluded.`);
}
const demo=new MemoryStore();
await seedData(demo,process.env.DEMO_PASSWORD ?? 'demo12345');
await exportSql(demo,'seed_demo.sql');
if(process.argv.includes('--load')) {
    const load=await MysqlStore.open({database:process.env.LOAD_DB_NAME ?? 'gomeal_m3_load'});
    try {
        if((await load.query('SELECT count(*) AS n FROM orders'))[0].n!==10000)throw new Error('Seed the load dataset first');
        await exportSql(load,'seed_load.sql');
    } finally {await load.close();}
}
