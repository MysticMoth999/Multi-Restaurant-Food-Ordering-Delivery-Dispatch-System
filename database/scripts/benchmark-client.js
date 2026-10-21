import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
import { cpus,totalmem,platform,release } from 'node:os';
import { fileURLToPath } from 'node:url';

process.once('message',async ({base,clients,database,backend}) => {
    const warmup=Number(process.env.WARMUP_SECONDS ?? 120);
    const duration=Number(process.env.MEASURE_SECONDS ?? 600);
    const vus=Number(process.env.VUS ?? 100);
    if (![warmup,duration,vus].every(Number.isFinite) || warmup<0 || duration<=0 || vus<1 || vus>100 || !Number.isInteger(vus)) throw new Error('Invalid benchmark settings');
    const started=Date.now(), measureStart=performance.now()+warmup*1000, end=measureStart+duration*1000;
    const stats=Object.fromEntries(['restaurants','menu','order'].map((key)=>[key,{times:[],errors:0}]));
    await Promise.all(clients.slice(0,vus).map(async (client,i) => {
        // Mỗi VU tìm quanh một ô khác nhau của lưới nhà hàng tải.
        const lat=(10.7705+((i%10)-5)*0.03).toFixed(4), lng=(106.6932+(Math.floor(i/10)-5)*0.03).toFixed(4);
        const routes=[['restaurants',`/restaurants?lat=${lat}&lng=${lng}`],
            ['menu',`/restaurants/${i+1}/menu`],['order',`/orders/${client.orderId}`]];
        let n=0;
        while (performance.now()<end) {
            const [key,path]=routes[n++%routes.length];
            const before=performance.now(), measured=before>=measureStart;
            let failed=false;
            try {
                const response=await fetch(base+path,{headers:{Authorization:`Bearer ${client.token}`},signal:AbortSignal.timeout(10000)});
                const body=await response.json();
                failed=!response.ok || !body.data;
            } catch { failed=true; }
            if (measured) { stats[key].times.push(performance.now()-before); if (failed) stats[key].errors++; }
            await sleep(1000);
        }
    }));
    const result={date:new Date(started).toISOString(),timezone:'Asia/Bangkok',node:process.version,
        machine:{os:`${platform()} ${release()}`,cpu:cpus()[0].model,logicalCpus:cpus().length,ramGB:totalmem()/2**30},
        database,backend,warmupSeconds:warmup,measureSeconds:duration,vus,dataset:{restaurants:100,menuItems:2000,orders:10000},
        officialScenario:warmup===120 && duration===600 && vus===100,endpoints:{}};
    for (const [key,{times,errors}] of Object.entries(stats)) {
        times.sort((a,b)=>a-b);
        result.endpoints[key]={requests:times.length,errors,errorRate:errors/(times.length||1),
            p95Ms:times[Math.max(0,Math.ceil(times.length*0.95)-1)] ?? null,rps:times.length/duration};
    }
    result.pass=Object.values(result.endpoints).every((s)=>s.requests>0 && s.p95Ms<=500 && s.errorRate<=0.01);
    const output=process.env.BENCHMARK_OUTPUT ?? fileURLToPath(new URL('../docs/NFR-01-results.json',import.meta.url));
    writeFileSync(output,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
    process.disconnect();
    process.exitCode=result.pass ? 0 : 1;
});
