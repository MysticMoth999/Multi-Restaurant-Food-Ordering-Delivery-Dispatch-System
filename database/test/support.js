import {TABLES} from '../src/mysql-store.js';
export const testDatabase=process.env.TEST_DB_NAME ?? 'gomeal_m3_test';
export async function reset(store) {
    if(!store.config.database.endsWith('_test')) throw new Error('Refuse reset outside a *_test schema');
    const connection=await store.pool.getConnection();
    try {
        await connection.query('SET FOREIGN_KEY_CHECKS=0');
        for(const name of [...TABLES].reverse()) await connection.query(`TRUNCATE TABLE \`${name}\``);
    } finally {await connection.query('SET FOREIGN_KEY_CHECKS=1');connection.release();}
}
