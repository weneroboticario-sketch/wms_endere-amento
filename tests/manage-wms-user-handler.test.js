import test from 'node:test';
import assert from 'node:assert/strict';
import {createUserManagementHandler} from '../supabase/functions/manage-wms-user/handler.ts';
function fixture(profile={role:'SUPERVISOR',active:true,archived:false,allowed_warehouse_codes:'VDCG',id:'supervisor'}){
  const calls=[];let valid=true;
  const client={auth:{async getUser(token){calls.push(['getUser',token]);return valid?{data:{user:{id:'identity'}}}:{data:{user:null},error:{message:'invalid'}};},admin:{async createUser(payload){calls.push(['create-identity',payload.email]);return {data:{user:{id:'synthetic-identity'}}};},async updateUserById(){calls.push(['password-write']);return {};}}},from(table){return {select(){return this;},eq(){return this;},async maybeSingle(){return table==='wms_users'&&calls.filter(call=>call[0]==='profile').length===0?(calls.push(['profile']),{data:profile}):{data:{id:'target',auth_user_id:'target-auth',role:'OPERADOR',default_warehouse_code:'VDAR'}};},async insert(row){calls.push(['profile-insert',row]);return {};},async update(){calls.push(['profile-write']);return {};}};}};
  const handler=createUserManagementHandler({createClient:()=>client,env:()=> 'synthetic-only'});
  return {calls,invalid(){valid=false;},request:async(body={},authorization='Bearer synthetic-session')=>handler(new globalThis.Request('https://example.test/manage-wms-user',{method:'POST',headers:authorization?{Authorization:authorization}:{},body:JSON.stringify(body)}))};
}
test('management handler rejects missing, malformed, invalid and expired tokens before any data write',async()=>{
  for(const header of ['', 'Basic secret', 'Bearer ', 'Bearer one two']){const f=fixture();const response=await f.request({},header);assert.equal(response.status,401);assert.equal(f.calls.length,0);}
  for(const token of ['synthetic-invalid-secret','synthetic-expired-secret']){const f=fixture();f.invalid();const response=await f.request({},'Bearer '+token);assert.equal(response.status,401);assert.ok(!JSON.stringify(await response.json()).includes(token));assert.equal(f.calls.filter(call=>call[0].endsWith('write')).length,0);}
});
test('inactive and archived profiles cannot administer users; Caixa and Operador cannot create or reset users',async()=>{
  for(const profile of [{role:'ADMINISTRADOR',active:false},{role:'SUPERVISOR',active:true,archived:true}]){const f=fixture(profile);assert.equal((await f.request({action:'reset-password',temporaryPassword:'synthetic123',userId:'target'})).status,403);}
  for(const role of ['CAIXA','OPERADOR','ATENDENTE']){
    for(const action of ['create-user','reset-password']){const f=fixture({role,active:true,id:'caller'});const response=await f.request({action,temporaryPassword:'synthetic123',userId:'target',profile:{role:'OPERADOR',default_warehouse_code:'VDCG'}});assert.equal(response.status,403);assert.ok(!f.calls.some(call=>call[0].endsWith('write')));}
  }
});
test('supervisor cannot reset a user of another warehouse and global admin authorization still reaches the existing action',async()=>{
  const f=fixture();assert.equal((await f.request({action:'reset-password',temporaryPassword:'synthetic123',userId:'target'})).status,403);assert.ok(!f.calls.some(call=>call[0].endsWith('write')));
  const admin=fixture({role:'ADMINISTRADOR',is_global_admin:true,active:true,archived:false,id:'admin'});
  assert.equal((await admin.request({action:'create-user',temporaryPassword:'short',profile:{role:'OPERADOR',default_warehouse_code:'VDAR'}})).status,400);assert.ok(!admin.calls.some(call=>call[0].endsWith('write')));
});
test('legitimate supervisor creation preserves store isolation and global admin creation preserves its authorized warehouse',async()=>{
  for(const profile of [{role:'SUPERVISOR',active:true,id:'supervisor',allowed_warehouse_codes:'VDCG'},{role:'ADMINISTRADOR',is_global_admin:true,active:true,id:'admin'}]){
    const f=fixture(profile),warehouse=profile.role==='SUPERVISOR'?'VDCG':'VDAR';
    const response=await f.request({action:'create-user',temporaryPassword:'synthetic-password',profile:{id:'synthetic-caixa',name:'Usuário fictício',role:'CAIXA',default_warehouse_code:warehouse,auth_email:'synthetic@example.test',allowed_warehouse_codes:'VDCG,VDAR',is_global_admin:true}});
    assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
    const row=f.calls.find(call=>call[0]==='profile-insert')[1];assert.equal(row.role,'CAIXA');assert.equal(row.is_global_admin,false);assert.equal(row.available_for_tasks,false);assert.equal(row.default_warehouse_code,warehouse);
    if(profile.role==='SUPERVISOR')assert.equal(row.allowed_warehouse_codes,'VDCG');
  }
});
