import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {invokeUserAdministration} from "../src/auth.js";

test("trusted backend can register profiles without private schema access; scoped roles stay blocked",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role authenticated;create role service_role bypassrls;create schema private;
   create function private.current_wms_role() returns text language sql security definer as $$select current_setting('test.role',true)$$;
   revoke all on function private.current_wms_role() from public;grant usage on schema private to authenticated;
   grant execute on function private.current_wms_role() to authenticated;
   create table public.wms_users(id text primary key,name text,role text);
   alter table public.wms_users enable row level security;
   grant select,insert,update,delete on public.wms_users to service_role,authenticated;
   create policy client_access on public.wms_users to authenticated using(true) with check(true);
   create function private.wms_scoped_profile_no_physical_write() returns trigger language plpgsql security invoker set search_path='' as $$begin
    if private.current_wms_role() in ('GERENTE','FINANCEIRO') then raise exception 'Perfil de consulta sem permissao operacional.' using errcode='42501';end if;
    if tg_op='DELETE' then return old;else return new;end if;end$$;
   create trigger scoped_profiles_physical_guard before insert or update or delete on public.wms_users for each row execute function private.wms_scoped_profile_no_physical_write();
   set role service_role;`);
  await assert.rejects(db.exec("insert into public.wms_users values('new','New','OPERADOR')"),/permission denied for schema private/);
  await db.exec("reset role");
  await db.exec(await readFile(new URL("../supabase/migrations/20261017120712_restore_service_profile_guard.sql",import.meta.url),"utf8"));
  await db.exec("set role service_role;insert into public.wms_users values('new','New','OPERADOR');update public.wms_users set name='Updated' where id='new'");
  assert.equal((await db.query("select name from public.wms_users where id='new'")).rows[0].name,"Updated");
  await db.exec("delete from public.wms_users where id='new';set role authenticated");
  for(const role of ["GERENTE","FINANCEIRO"]){
   await db.query("select set_config('test.role',$1,false)",[role]);
   await assert.rejects(db.exec("insert into public.wms_users values('forged','Forbidden','ADMINISTRADOR')"),/sem permissao operacional/);
  }
  await db.exec("select set_config('test.role','ADMINISTRADOR',false);insert into public.wms_users values('allowed','Allowed','OPERADOR')");
 } finally {await db.close();}
});

test("user administration shows server rejection and preserves its response body",async()=>{
 const response=new globalThis.Response(JSON.stringify({ok:false,error:"Este email ja esta vinculado a outro usuario."}),{status:409});
 const error=new Error("Edge Function returned a non-2xx status code");error.context=response;
 const client={functions:{invoke:async()=>({data:null,error})}};
 await assert.rejects(invokeUserAdministration(client,{action:"create-user"}),/email ja esta vinculado/);
 assert.equal((await response.json()).ok,false);
 const invalid=new Error("Gateway failed");invalid.context=new globalThis.Response("<html>Unavailable</html>",{status:502});
 await assert.rejects(invokeUserAdministration({functions:{invoke:async()=>({error:invalid})}},{}),e=>e===invalid);
 assert.equal((await invokeUserAdministration({functions:{invoke:async()=>({data:{ok:true,userId:"one"},error:null})}},{})).userId,"one");
});
