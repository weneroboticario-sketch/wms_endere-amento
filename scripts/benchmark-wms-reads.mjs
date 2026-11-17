import { createReferenceCache } from '../src/reference-cache.js';
import { readIncrementalPages } from '../src/incremental-pages.js';

// Deterministic local workload, not a production latency/egress measurement.
const products = Array.from({length:32878}, (_, i) => ({sku:String(i).padStart(5,'0'),product_name:'Produto de teste '+i}));
let calls=0;
async function catalog() {
  const rows=[];
  for(let offset=0;;offset+=1000){calls++;const page=products.slice(offset,offset+1000);rows.push(...page);if(page.length<1000)return rows;}
}
for(let i=0;i<4;i++)await catalog();
const before=calls;calls=0;
const cache=createReferenceCache();
for(let i=0;i<4;i++)await cache.read('fixture:OPERADOR:VDCG',catalog);
const after=calls;
const changes=Array.from({length:1501},(_,i)=>({id:String(i).padStart(5,'0'),updated_at:'2026-11-16T10:00:00Z'}));
let pages=0;
const actual=await readIncrementalPages(async(cursor,size)=>{pages++;return changes.filter(row=>!cursor||row.id>cursor.id).slice(0,size);});
console.log(JSON.stringify({kind:'synthetic-local',catalog:{products:products.length,sequentialReads:4,beforeRequests:before,afterRequests:after,reductionPercent:100*(before-after)/before},incremental:{sameTimestampRows:changes.length,beforeReturned:changes.slice(0,500).length,afterReturned:actual.length,pages}},null,2));
