import mysql from 'mysql2/promise';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync,readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DomainError } from '@gomeal/backend/src/domain/errors.js';
import { orderView } from '@gomeal/backend/src/adapters/order-view.js';
import { LOCATION_MAX_AGE_MS } from '@gomeal/backend/src/domain/constants.js';

// Thứ tự theo khóa ngoại (bảng cha trước) để xuất seed SQL nhập lại được.
export const TABLES=['users','sessions','restaurants','menu_items','menu_options','drivers','vouchers','orders',
    'order_items','payments','order_history','driver_offers','dispatch_skips','carts','activity',
    'voucher_redemptions','notifications','settings'];
const DECIMAL_FIELDS=['lat','lng','distance_km','delivery_lat','delivery_lng'];
const q=(name)=>`\`${name}\``;
export function connectionConfig(overrides={}) {
    return {host:process.env.DB_HOST ?? '127.0.0.1',port:Number(process.env.DB_PORT ?? 3306),
        user:process.env.DB_USER ?? 'gomeal',password:process.env.DB_PASSWORD ?? '',
        database:process.env.DB_NAME ?? 'gomeal_m3',connectionLimit:Number(process.env.DB_POOL_SIZE ?? 20),
        charset:'utf8mb4',supportBigNumbers:true,bigNumberStrings:false,jsonStrings:true,
        multipleStatements:false,...overrides};
}
export class MysqlStore {
    constructor(config={}) {
        this.config=connectionConfig(config);
        this.pool=mysql.createPool(this.config);
        this.context=new AsyncLocalStorage();
    }
    static async open(config={}) {
        const store=new MysqlStore(config);
        try {await store.migrate(); await store.loadColumns(); return store;}
        catch(error) {await store.close(); throw error;}
    }
    get inTransaction() {return Boolean(this.context.getStore());}
    async loadColumns() {
        this.columns=new Map();
        for (const name of TABLES) {
            const [rows]=await this.pool.query(`SHOW COLUMNS FROM ${q(name)}`);
            this.columns.set(name,new Set(rows.filter((c)=>!c.Extra.includes('GENERATED') && c.Field!=='location').map((c)=>c.Field)));
        }
    }
    async migrate() {
        const connection=await this.pool.getConnection();
        const lock=`gomeal_migrations_${this.config.database}`;
        try {
            const [[result]]=await connection.query('SELECT GET_LOCK(?,30) AS locked',[lock]);
            if (result.locked!==1) throw new DomainError('CONFLICT','Không lấy được khóa migration.');
            await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations
                (name VARCHAR(128) PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at BIGINT NOT NULL)
                ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
            const directory=new URL('../sql/',import.meta.url);
            for (const name of ['schema.sql',...readdirSync(directory).filter((n)=>/^\d+.*\.sql$/.test(n)).sort()]) {
                const source=readFileSync(new URL(name,directory),'utf8');
                // Cùng nội dung nhưng khác kiểu xuống dòng (CRLF/LF tùy máy checkout) vẫn coi là một migration.
                const variants=[source.replace(/\r\n/g,'\n'),source.replace(/\r?\n/g,'\r\n')].map((text)=>createHash('sha256').update(text).digest('hex'));
                const checksum=variants[0];
                const [[existing]]=await connection.execute('SELECT checksum FROM schema_migrations WHERE name=?',[name]);
                if(existing) {
                    if(!variants.includes(existing.checksum)) throw new Error(`Applied migration changed: ${name}`);
                    continue;
                }
                // Schema uses single-statement SET triggers; no DELIMITER or procedures.
                for (const statement of source.replace(/^\s*--.*$/gm,'').split(';').map((s)=>s.trim()).filter(Boolean)) {
                    const trigger=statement.match(/^CREATE TRIGGER\s+(\w+)/i);
                    if(trigger) {
                        const [[found]]=await connection.execute('SELECT 1 AS n FROM information_schema.triggers WHERE trigger_schema=? AND trigger_name=?',[this.config.database,trigger[1]]);
                        if(found) continue;
                    }
                    await connection.query(statement);
                }
                await connection.execute('INSERT INTO schema_migrations VALUES (?,?,?)',[name,checksum,Date.now()]);
            }
        } finally {await connection.query('SELECT RELEASE_LOCK(?)',[lock]); connection.release();}
    }
    translate(error) {
        if(error instanceof DomainError) return error;
        if([1062,1213,1205,3572].includes(error.errno)) {
            const result=new DomainError('CONFLICT','Dữ liệu đã thay đổi hoặc đang được xử lý. Hãy tải lại.');
            result.retryable=[1062,1213,1205].includes(error.errno);
            return result;
        }
        if([1048,1264,1265,1366,1406,1451,1452,3819,4025].includes(error.errno)) return new DomainError('VALIDATION','Dữ liệu vi phạm ràng buộc CSDL.');
        return error;
    }
    async query(sql,args=[]) {
        try {
            const connection=this.context.getStore()?.connection ?? this.pool;
            const [rows]=await connection.execute(sql,args);
            return rows;
        } catch(error) {throw this.translate(error);}
    }
    fields(name,values) {
        const columns=this.columns.get(name);
        if(!columns) throw new Error(`Unknown collection: ${name}`);
        for(const [key,value] of Object.entries(values)) {
            if(!columns.has(key) || value===undefined) throw new Error(`Invalid field: ${name}.${key}`);
            if(typeof value==='number' && (!Number.isFinite(value) ||
                (!DECIMAL_FIELDS.includes(key) && !Number.isSafeInteger(value))))
                throw new DomainError('VALIDATION',`Giá trị số không hợp lệ: ${key}`);
        }
        return Object.keys(values);
    }
    condition(name,where,required=false) {
        const keys=this.fields(name,where);
        if(required && !keys.length) throw new Error('Mutation requires a condition');
        return keys.length ? ` WHERE ${keys.map((key)=>`${q(key)} <=> ?`).join(' AND ')}` : '';
    }
    select(name) {return [...this.columns.get(name)].map(q).join(',');}
    async rows(name,where={}) {
        const clause=this.condition(name,where);
        return (await this.query(`SELECT ${this.select(name)} FROM ${q(name)}${clause} ORDER BY id${this.inTransaction ? ' FOR UPDATE' : ''}`,Object.values(where))).map((r)=>({...r}));
    }
    async find(name,where) {
        const clause=this.condition(name,where);
        const [row]=await this.query(`SELECT ${this.select(name)} FROM ${q(name)}${clause} ORDER BY id LIMIT 1${this.inTransaction ? ' FOR UPDATE' : ''}`,Object.values(where));
        return row ? {...row} : undefined;
    }
    async insert(name,values) {
        const keys=this.fields(name,values);
        if(!keys.length) throw new Error('Insert requires values');
        // BEFORE INSERT also derives location; the explicit expression satisfies NOT NULL in strict mode.
        const location=name==='restaurants';
        const result=await this.query(`INSERT INTO ${q(name)} (${keys.map(q)}${location ? ',location' : ''})
            VALUES (${keys.map(()=>'?')}${location ? ",ST_GeomFromText(?,4326)" : ''})`,
            [...Object.values(values),...(location ? [`POINT(${values.lat} ${values.lng===-180 ? 180 : values.lng})`] : [])]);
        return result.insertId;
    }
    async update(name,where,values) {
        const clause=this.condition(name,where,true), keys=this.fields(name,values);
        if(!keys.length) throw new Error('Update requires values');
        const result=await this.query(`UPDATE ${q(name)} SET ${keys.map((key)=>`${q(key)}=?`)}${clause}`,[...Object.values(values),...Object.values(where)]);
        if('version' in where && result.affectedRows===0) throw new DomainError('CONFLICT','Đơn đã thay đổi.');
        return result.affectedRows;
    }
    async remove(name,where) {
        const clause=this.condition(name,where,true);
        return (await this.query(`DELETE FROM ${q(name)}${clause}`,Object.values(where))).affectedRows;
    }
    async transaction(action) {
        const parent=this.context.getStore();
        if(parent) {
            const point=`nested_${++parent.depth}`;
            await parent.connection.query(`SAVEPOINT ${point}`);
            try {const value=await action();await parent.connection.query(`RELEASE SAVEPOINT ${point}`);return value;}
            catch(error) {await parent.connection.query(`ROLLBACK TO SAVEPOINT ${point}`);await parent.connection.query(`RELEASE SAVEPOINT ${point}`);throw error;}
        }
        // Bounded retry handles deadlocks and a concurrent insert winning an idempotency key.
        for(let attempt=0;attempt<4;attempt++) {
            const connection=await this.pool.getConnection();
            try {
                await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
                await connection.beginTransaction();
                const value=await this.context.run({connection,depth:0},action);
                await connection.commit(); return value;
            } catch(error) {
                await connection.rollback();
                // query() maps codes; preserve raw retryability through a cause below.
                if(attempt<3 && (error.retryable || [1062,1213,1205].includes(error.errno))) continue;
                throw this.translate(error);
            } finally {connection.release();}
        }
    }
    user(id) {return this.find('users',{id});}
    restaurant(id) {return this.find('restaurants',{id});}
    driver(userId) {return this.find('drivers',{user_id:userId});}
    order(id) {return this.find('orders',{id});}
    offer(id) {return this.find('driver_offers',{id});}
    history(orderId,status,actorId,at) {return this.insert('order_history',{order_id:orderId,status,actor_id:actorId,at});}
    activity(actorId,message,at) {return this.insert('activity',{actor_id:actorId,text:message,at});}
    orderView(id) {return orderView(this,id);}
    async close() {if(!this.closed) {this.closed=true;await this.pool.end();}}
    async restaurantPage({point,search,page}) {
        const distance=point ? 'ST_Distance_Sphere(location,ST_GeomFromText(?,4326),6371000)/1000' : 'NULL';
        const args=point ? [`POINT(${point.lat} ${point.lng===-180 ? 180 : point.lng})`] : [];
        // Spatial MBR prefilter; at poles/date line latitude/longitude ranges provide a safe fallback.
        let geo='';
        if(point) {
            const delta=5/6371*180/Math.PI;
            const minLat=Math.max(-90,point.lat-delta),maxLat=Math.min(90,point.lat+delta);
            const lngDelta=Math.asin(Math.min(1,Math.sin(5/6371)/Math.cos(point.lat*Math.PI/180)))*180/Math.PI;
            const minLng=point.lng-lngDelta,maxLng=point.lng+lngDelta;
            if(minLat>-90 && maxLat<90 && minLng>-180 && maxLng<180) {
                geo=' AND MBRIntersects(location,ST_GeomFromText(?,4326))';
                args.push(`POLYGON((${minLat} ${minLng},${minLat} ${maxLng},${maxLat} ${maxLng},${maxLat} ${minLng},${minLat} ${minLng}))`);
            } else {geo=' AND lat BETWEEN ? AND ?';args.push(minLat,maxLat);}
        }
        const sql=`SELECT ${this.select('restaurants')},${distance} AS distance_km FROM restaurants
            WHERE status='ACTIVE'${geo} AND LOCATE(?,name)>0`;
        args.push(search);
        const filtered=`SELECT * FROM (${sql}) candidates${point ? ' WHERE distance_km<=5' : ''}`;
        const [{n:total}]=await this.query(`SELECT count(*) AS n FROM (${filtered}) counted`,args);
        const items=await this.query(`${filtered} ORDER BY ${point ? 'distance_km,' : ''}id LIMIT 20 OFFSET ?`,[...args,(page-1)*20]);
        return {items,total};
    }
    async nearestDriver(order,restaurant,at) {
        const [row]=await this.query(`SELECT d.*,ST_Distance_Sphere(
            ST_GeomFromText(CONCAT('POINT(',d.lat,' ',IF(d.lng=-180,180,d.lng),')'),4326),
            ST_GeomFromText(?,4326),6371000)/1000 AS distanceKm FROM drivers d
            WHERE d.status='AVAILABLE' AND d.locked=0 AND d.location_at BETWEEN ? AND ?
            AND NOT EXISTS(SELECT 1 FROM driver_offers f WHERE f.pending_driver_id=d.id)
            AND NOT EXISTS(SELECT 1 FROM dispatch_skips s WHERE s.order_id=? AND s.driver_id=d.id)
            ORDER BY distanceKm,d.updated_at,d.id LIMIT 1`,
            [`POINT(${restaurant.lat} ${restaurant.lng===-180 ? 180 : restaurant.lng})`,at-LOCATION_MAX_AGE_MS,at,order.id]);
        return row;
    }
    async purgeSessions(now) {
        return (await this.query('DELETE FROM sessions WHERE expires_at<=?',[now])).affectedRows;
    }
    async customerOrders(customerId,page) {
        const ids=await this.query('SELECT id FROM orders WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?',[customerId,(page-1)*20]);
        const [{n:total}]=await this.query('SELECT count(*) AS n FROM orders WHERE customer_id=?',[customerId]);
        return {items:await Promise.all(ids.map((row)=>this.orderView(row.id))),total,page,pageSize:20};
    }
}
