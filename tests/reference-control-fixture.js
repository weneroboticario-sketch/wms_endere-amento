import { createWmsSupabaseClient } from "./global-dashboard-fixture.js";

export function createReferenceFixture(){
  const client=createWmsSupabaseClient(),rpc=client.rpc;
  client.rpc=async(name,args)=>{
    const response=await rpc(name,args);
    if(name!=="wms_global_dashboard"||response.error)return response;
    if(args.p_section==="tasks_summary")response.data.summary=response.data.summary.map(row=>({...row,status:"EM_ANDAMENTO"}));
    if(args.p_section==="tasks"&&args.p_filters.mode==="running")response.data.rows=response.data.rows.map(row=>({...row,status:"EM_ANDAMENTO"}));
    if(args.p_section==="captacao")response.data.rows=response.data.rows.map((row,index)=>({...row,status:index===0?"FAILED":row.status}));
    if(window.globalFixture.zero&&args.p_section.endsWith("_summary")&&response.data.summary)response.data.summary=response.data.summary.map(row=>({...row,open:0,total:0,overdue:0,finished_today:0,started_today:0,created_today:0}));
    if(window.globalFixture.zero&&args.p_section==="tasks")response.data.rows=[];
    return response;
  };
  return client;
}
