const selected = new URL(window.location.href).searchParams.get("test-user") || "admin";
const role = {admin:"ADMINISTRADOR",tnogueira:"ADMINISTRADOR",other:"ADMINISTRADOR",operator:"OPERADOR",supervisor:"SUPERVISOR",attendant:"ATENDENTE"}[selected];
const now = new Date().toISOString();
const warehouses = [{code:"DOURADOS",name:"CP Dourados",active:true},{code:"14177",name:"VDTLS_LOJA",active:true},{code:"22796",name:"VDDRD",active:true},{code:"11965",name:"RIBAS",active:true}].map(w=>({...w,id:"warehouse-"+w.code.toLowerCase()}));
const user={id:selected,username:selected,name:selected==="admin"?"Wener Mendes Martins":selected==="tnogueira"?"Tácito":selected,role,active:true,archived:false,default_warehouse_code:["admin","tnogueira","other"].includes(selected)?"DOURADOS":"14177",auth_user_id:"auth-"+selected,is_global_admin:["admin","tnogueira"].includes(selected),available_for_tasks:true,allowed_warehouse_codes:"DOURADOS,14177,22796,11965"};
const summary = status => warehouses.filter(w=>w.code!=="DOURADOS").map((w,i)=>({warehouse_code:w.code,status,kind:"REPOSICAO",priority:"ALTA",total:i+1,open:i+1,overdue:0,stalled:0,divergence:0,unassigned:0,inactive_responsible:0,blocked:0,last_activity:now,created_today:1,finished_today:0,started_today:1}));
const operational = Array.from({length:35},(_,i)=>({id:"record-"+i,code:"TAR-"+i,warehouse_code:["14177","22796","11965"][i%3],status:"PENDENTE",kind:"REPOSICAO",priority:"ALTA",title:"Produto de demonstração "+i,sku:"00178",quantity:5,responsible_name:"Operador",responsible_id:"worker",requester:"Solicitante",created_at:now,updated_at:now,detail:{skus:3,separated:4,notes:"Registro de teste"}}));
const team = {rows:warehouses.filter(w=>w.code!=="DOURADOS").map(w=>({warehouse_code:w.code,total:5,active:5,available:3,busy:2,unavailable:0,operators:3,supervisors:1,attendants:1})),users:[{id:"worker",name:"Operador",warehouse_code:"14177",active:true,role:"OPERADOR",available:true,last_login_at:now}]};
const batches = warehouses.filter(w=>w.code!=="DOURADOS").map(w=>({warehouse_code:w.code,id:"batch-"+w.code,status:"COMPLETED",created_at:now,finished_at:now,last_completed_at:now,file_name:"MaterialLinhaSeparacao.xlsx",total_rows:32373,imported_rows:32373,inserted_rows:150,updated_rows:80,unchanged_rows:32143,error_rows:0,duration_seconds:45}));
window.globalFixture={calls:[],events:[],defaults:user.default_warehouse_code};
function query(table) {
  const clauses=[];
  const q={};
  for(const method of ["select","eq","neq","in","order","limit","range","gte","lt","is","not","or","update","insert","upsert","delete","single","maybeSingle"]){q[method]=(...args)=>{clauses.push([method,...args]);return q;};}
  q.then=(resolve,reject)=>{
    window.globalFixture.calls.push({table,clauses});
    let data=table==="wms_warehouses"?warehouses:table==="wms_users"?[user]:[];
    for(const [method,key,value] of clauses){if(method==="eq")data=data.filter(r=>r[key]===value);if(method==="neq")data=data.filter(r=>r[key]!==value);}
    return Promise.resolve({data,error:null,count:data.length}).then(resolve,reject);
  };
  return q;
}
const session={user:{id:user.auth_user_id},access_token:"fixture"};
const client={from:query,auth:{getSession:async()=>({data:{session}}),refreshSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null}),getUser:async()=>({data:{user:session.user}})},functions:{invoke:async()=>({data:{ok:true}})},removeChannel:()=>{},channel:()=>{
  const channel={on:(type,filter,callback)=>{window.globalFixture.events.push({type,filter,callback});return channel;},subscribe:callback=>{callback?.("SUBSCRIBED");return channel;}};return channel;
},rpc:async(name,args)=>{
  window.globalFixture.calls.push({rpc:name,args});
  if(name!=="wms_global_dashboard")return {data:[],error:null};
  const section=args.p_section,filters=args.p_filters;
  if(window.globalFixture.failSection===section)return {data:null,error:{message:"Fixture unavailable"}};
  const match=rows=>rows.filter(r=>!filters.warehouse||r.warehouse_code===filters.warehouse);
  if(section==="executive")return {data:{queue:match(warehouses.filter(w=>w.code!=="DOURADOS").map(w=>({warehouse_code:w.code,minutes_0_15:1,minutes_15_30:2,minutes_30_60:1,minutes_60_plus:3,oldest_at:new Date(Date.now()-7200000).toISOString()}))),trends:[{day:now.slice(0,10),domain:"replenishment",created:6,finished:4}],attention:{replenishment:match(operational).slice(0,10),tasks:[],transfers:[]}},error:null};
  if(section.endsWith("_summary"))return {data:{summary:match(summary(section==="transfers_summary"?"EM_SEPARACAO":"PENDENTE"))},error:null};
  if(section==="team")return {data:{rows:match(team.rows),users:team.users},error:null};
  if(section==="users")return {data:{rows:team.users,total:1},error:null};
  if(section==="captacao")return {data:{rows:match(batches)},error:null};
  if(section==="imports"||section==="imports_period")return {data:{rows:match(batches.map(b=>({...b,status:"COMPLETED",source_type:"CAPTACAO",total:1,today:1,average_seconds:45,duration_samples:1})))},error:null};
  if(section==="activity")return {data:{rows:match(operational).slice(0,20)},error:null};
  if(section==="transfer_items")return {data:{rows:[{id:"item",sku:"00178",descricao:"Perfume",quantidade_solicitada:5,quantidade_separada:4,quantidade_lacrada:4}],total:1},error:null};
  if(section==="alerts")return {data:{rows:[],total:0},error:null};
  const rows=match(operational).filter(r=>!filters.query||r.title.toLowerCase().includes(filters.query.toLowerCase()));
  return {data:{rows:rows.slice(args.p_offset,args.p_offset+args.p_limit),has_more:rows.length>args.p_offset+args.p_limit},error:null};
}};
export function createWmsSupabaseClient(){return client;}
