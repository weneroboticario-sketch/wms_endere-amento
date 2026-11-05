import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const migration = await readFile(new URL("../supabase/migrations/20261105202255_wms_inbound_receipts.sql", import.meta.url), "utf8");
const key = "35261108575189000152550010000001231000001234";
export function inboundXml({ destination = "08575189000152", products = null, invoiceKey = key } = {}) {
  const prod = (line, code, q, unit = "UN", tq = q, tu = unit) => `<det nItem="${line}"><prod><cProd>${code}</cProd><cEAN>7891234567890</cEAN><xProd>Produto ${code}</xProd><uCom>${unit}</uCom><qCom>${q}</qCom><cEANTrib>7891234567891</cEANTrib><uTrib>${tu}</uTrib><qTrib>${tq}</qTrib></prod></det>`;
  return `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${invoiceKey}"><ide><mod>55</mod><nNF>123</nNF><serie>1</serie><dhEmi>2026-11-05T10:00:00-04:00</dhEmi></ide><emit><CNPJ>18325344000489</CNPJ><xNome>Origem VDAR</xNome></emit><dest><CNPJ>${destination}</CNPJ><xNome>Destino VDCG</xNome></dest>${products ?? prod(1,"01314",4)+prod(2,"FORN-2",3,"CX",72,"UN")}</infNFe></NFe></nfeProc>`;
}
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create schema private; create schema auth; grant usage on schema private,auth to authenticated;
    create function auth.uid() returns text language sql as $$ select nullif(current_setting('test.actor',true),'') $$;
    create table wms_warehouses(code text primary key); insert into wms_warehouses values('VDCG'),('VDAR'),('VDCO'),('VDSI');
    create table wms_users(id text primary key,name text,role text,active boolean default true,archived boolean default false,allowed_warehouse_codes text,default_warehouse_code text,warehouse_code text);
    insert into wms_users(id,name,role,default_warehouse_code) values('adm','Administrador','ADMINISTRADOR','VDCG'),('sup','Supervisor','SUPERVISOR','VDCG'),('op','Operador','OPERADOR','VDCG'),('op2','Outro','OPERADOR','VDCG'),('foreign','Outro estoque','OPERADOR','VDAR'),('cash','Caixa','CAIXA','VDCG'),('att','Atendente','ATENDENTE','VDCG'),('inactive','Inativo','OPERADOR','VDCG'),('unknown','Sem perfil',null,'VDCG'); update wms_users set active=false where id='inactive';
    create function private.current_wms_profile_id() returns text language sql stable security definer set search_path='' as $$ select id from public.wms_users where id=auth.uid() and active and not archived $$;
    create function private.current_wms_role() returns text language sql stable security definer set search_path='' as $$ select role from public.wms_users where id=private.current_wms_profile_id() $$;
    create function private.can_access_warehouse(code text) returns boolean language sql stable security definer set search_path='' as $$ select coalesce(exists(select 1 from public.wms_users where id=private.current_wms_profile_id() and default_warehouse_code=$1),false) $$;
    create table wms_products(sku text primary key,product_name text); insert into wms_products values('01314','Produto interno');
    create table wms_transfers(id text primary key,status text); insert into wms_transfers values('outbound','FINALIZADA');
    create table wms_stock(sku text primary key,quantity numeric); insert into wms_stock values('01314',50);
    create table wms_bindings(sku text,location text); insert into wms_bindings values('01314','R01');`);
  await db.exec(migration);
  await db.exec(await readFile(new URL("../supabase/migrations/20261105210637_wms_inbound_xml_line_compatibility.sql",import.meta.url),"utf8"));
  return db;
}
async function login(db, name) { await db.exec("reset role"); await db.query("select set_config('test.actor',$1,false)", [name]); await db.exec("set role authenticated"); }
const importXml = async (db, xml = inboundXml(), warehouse = "VDCG") => (await db.query("select import_wms_inbound($1,$2,$3) id", [warehouse, xml, crypto.randomUUID()])).rows[0].id;
async function act(db, id, action, data = {}, version = null, actionId = crypto.randomUUID()) {
  if (version === null) version = (await db.query("select version from wms_inbound_receipts where id=$1", [id])).rows[0]?.version ?? 0;
  return (await db.query("select act_wms_inbound($1,$2,$3,$4,$5) version", [id, action, data, version, actionId])).rows[0].version;
}
const lines = async (db, id) => (await db.query("select * from wms_inbound_receipt_items where receipt_id=$1 order by line_number", [id])).rows;
async function started(db) {
  await login(db,"sup"); const id = await importXml(db); await act(db,id,"ASSIGN",{user_id:"op"});
  await login(db,"op"); await act(db,id,"START"); return id;
}
test("inbound XML is parsed on server, preserves invoice codes and units, blocks recipient, duplicates and malformed documents", async () => {
  const db = await fixture(); try {
    await login(db,"sup"); const id = await importXml(db);
    assert.equal(await importXml(db),id);
    const rows = await lines(db,id); assert.equal(rows.length,2); assert.equal(rows[0].supplier_code,"01314"); assert.equal(rows[0].internal_sku,null);
    assert.equal(rows[1].expected_qty,"3"); assert.equal(rows[1].tributary_qty,"72"); assert.equal(rows[1].commercial_unit,"CX");
    await assert.rejects(importXml(db,inboundXml({destination:"00138798002348"})),/Destinatário/);
    await assert.rejects(importXml(db,"<xml>"),/invalid XML|XML/);
    await assert.rejects(importXml(db,'<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><x/>'),/entidades/);
    await assert.rejects(importXml(db,inboundXml({products:"",invoiceKey:key.slice(0,-2)+"35"})),/sem produtos/);
    await assert.rejects(importXml(db,inboundXml({invoiceKey:key.slice(0,-2)+"36"}).replace('<qTrib>4</qTrib>','<qTrib>8</qTrib>')),/incompatível/);
    await assert.rejects(importXml(db,inboundXml(),"VDAR"),/permissão/);
    assert.equal((await db.query("select count(*)::int n from wms_inbound_receipts")).rows[0].n,1);
    await db.exec("reset role"); await db.exec(migration); // additive migration is rerunnable
  } finally { await db.close(); }
});
test("assignment, RLS and direct mutation permissions enforce roles, warehouse and designated operator", async () => {
  const db = await fixture(); try {
    await login(db,"adm"); const id = await importXml(db);
    await assert.rejects(act(db,id,"ASSIGN",{user_id:"foreign"}),/mesmo estoque/);
    await assert.rejects(act(db,id,"ASSIGN",{user_id:"cash"}),/mesmo estoque/);
    await assert.rejects(act(db,id,"ASSIGN",{user_id:"inactive"}),/mesmo estoque/);
    await act(db,id,"ASSIGN",{user_id:"op"});
    for (const name of ["op2","cash","att","foreign","inactive","unknown",""]) {
      await login(db,name); assert.equal((await db.query("select * from wms_inbound_receipts")).rows.length,0,name);
      assert.equal((await lines(db,id)).length,0,name);
      assert.equal((await db.query("select * from wms_inbound_receipt_events")).rows.length,0,name);
      await assert.rejects(act(db,id,"START"),/autorizado/);
      await assert.rejects(importXml(db),/permissão/);
    }
    await login(db,"op"); assert.equal((await lines(db,id)).length,2);
    await assert.rejects(act(db,id,"ASSIGN",{user_id:"op2"}),/gestor/);
    await assert.rejects(db.exec("update wms_inbound_receipt_items set counted_qty=999"),/permission denied/);
    await assert.rejects(db.exec("delete from wms_inbound_receipts"),/permission denied/);
    await assert.rejects(db.exec("update wms_inbound_destinations set cnpj='00000000000000'"),/permission denied/);
    await login(db,"sup"); await assert.rejects(act(db,id,"START"),/conferente/);
    await db.exec("reset role; set role anon"); await assert.rejects(importXml(db),/permission denied/);
  } finally { await db.close(); }
});
test("counts resume, convert commercial/tributary units, retain events, reject duplicate or stale actions", async () => {
  const db = await fixture(); try {
    const id = await started(db), [first,second] = await lines(db,id);
    const data = {item_id:first.id,quantity:1,mode:"ADD",unit:"UN",observation:"Bipagem"}, key = crypto.randomUUID();
    const version = await act(db,id,"COUNT",data,2,key);
    assert.equal(await act(db,id,"COUNT",data,2,key),version);
    await assert.rejects(act(db,id,"COUNT",{...data,quantity:2},2,key),/outra ação/);
    await assert.rejects(act(db,id,"COUNT",data,2),/outro colaborador/);
    await act(db,id,"COUNT",data); assert.equal((await lines(db,id))[0].counted_qty,"2.000000");
    await login(db,"op"); await act(db,id,"COUNT",{item_id:second.id,quantity:24,mode:"ADD",unit:"UN"});
    assert.equal((await lines(db,id))[1].counted_qty,"1.000000");
    await assert.rejects(act(db,id,"COUNT",{...data,unit:"KG"}),/incompatível/);
    await assert.rejects(act(db,id,"COUNT",{...data,quantity:-1}),/inválida/);
    await assert.rejects(act(db,id,"COUNT",{...data,quantity:"NaN"}),/inválida/);
    await act(db,id,"MAP",{item_id:first.id,sku:"01314"}); assert.equal((await lines(db,id))[0].internal_sku,"01314");
    await assert.rejects(act(db,id,"MAP",{item_id:first.id,sku:"FORN-2"}),/não cadastrado/);
    await login(db,"op2"); await assert.rejects(act(db,id,"COUNT",data),/autorizado/);
  } finally { await db.close(); }
});
test("finalization requires all lines and explicit divergence confirmation, keeps history and never modifies stock or outbound", async () => {
  const db = await fixture(); try {
    const id = await started(db), [first,second] = await lines(db,id);
    await assert.rejects(act(db,id,"FINISH",{confirm_divergences:true}),/pendentes/);
    await act(db,id,"COUNT",{item_id:first.id,quantity:2,mode:"SET",unit:"UN",observation:"Faltaram duas"});
    await act(db,id,"COUNT",{item_id:second.id,quantity:4,mode:"SET",unit:"CX",observation:"Caixa extra"});
    await act(db,id,"EXTRA",{code:"09999",description:"Fora da nota",quantity:1,unit:"UN",observation:"Não previsto"});
    const extra=(await lines(db,id))[2]; await act(db,id,"COUNT",{item_id:extra.id,quantity:2,mode:"ADD",unit:"UN"});
    assert.equal((await lines(db,id))[2].counted_qty,"3.000000");
    await assert.rejects(act(db,id,"FINISH"),/explicitamente/);
    const actionId = crypto.randomUUID(), v = (await db.query("select version from wms_inbound_receipts where id=$1",[id])).rows[0].version;
    const done = await act(db,id,"FINISH",{confirm_divergences:true},v,actionId);
    assert.equal(await act(db,id,"FINISH",{confirm_divergences:true},v,actionId),done);
    await assert.rejects(act(db,id,"FINISH",{confirm_divergences:true}),/já concluído/);
    await assert.rejects(act(db,id,"COUNT",{item_id:first.id,quantity:4,mode:"SET",unit:"UN"}),/já concluído/);
    const r = (await db.query("select * from wms_inbound_receipts where id=$1",[id])).rows[0]; assert.equal(r.status,"CONCLUIDO_DIVERGENTE"); assert.equal(r.finished_by,"op");
    await assert.rejects(act(db,id,"VALIDATE"),/validação/);
    await login(db,"sup"); await act(db,id,"VALIDATE");
    assert.equal((await lines(db,id)).length,3); assert.equal((await db.query("select * from wms_inbound_receipt_events where receipt_id=$1",[id])).rows.length,9);
    await db.exec("reset role"); assert.deepEqual((await db.query("select * from wms_stock")).rows,[{sku:"01314",quantity:"50"}]);
    assert.deepEqual((await db.query("select * from wms_transfers")).rows,[{id:"outbound",status:"FINALIZADA"}]); assert.deepEqual((await db.query("select * from wms_bindings")).rows,[{sku:"01314",location:"R01"}]);
  } finally { await db.close(); }
});
test("correct receipt closes without divergence and different warehouses remain isolated", async () => {
  const db = await fixture(); try {
    const id = await started(db);
    for (const item of await lines(db,id)) await act(db,id,"COUNT",{item_id:item.id,quantity:item.expected_qty,unit:item.commercial_unit,mode:"SET"});
    await act(db,id,"FINISH"); assert.equal((await db.query("select status from wms_inbound_receipts where id=$1",[id])).rows[0].status,"CONCLUIDO_CORRETO");
    await login(db,"foreign"); assert.equal((await lines(db,id)).length,0);
  } finally { await db.close(); }
});
test("unit scans do not accumulate rounding errors and simultaneous stale updates cannot double count", async () => {
  const db=await fixture();try{
    const id=await started(db),[first,second]=await lines(db,id);
    const version=(await db.query("select version from wms_inbound_receipts where id=$1",[id])).rows[0].version;
    const results=await Promise.allSettled([act(db,id,"COUNT",{item_id:first.id,quantity:1,unit:"UN",mode:"ADD"},version),act(db,id,"COUNT",{item_id:first.id,quantity:1,unit:"UN",mode:"ADD"},version)]);
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal((await lines(db,id))[0].counted_qty,"1.000000");
    for(let scan=0;scan<72;scan++) await act(db,id,"COUNT",{item_id:second.id,quantity:1,unit:"UN",mode:"ADD"});
    assert.equal((await lines(db,id))[1].counted_qty,"3.000000");
    await act(db,id,"COUNT",{item_id:second.id,quantity:2,unit:"CX",mode:"SET"});
    await act(db,id,"COUNT",{item_id:second.id,quantity:24,unit:"UN",mode:"ADD"});
    assert.equal((await lines(db,id))[1].counted_qty,"3.000000");
  }finally{await db.close();}
});
test("XML imports nItem as element or attribute and reports invalid numbering without raw integer errors",async()=>{
  const db=await fixture();try{
    await login(db,"sup");
    const quantities=[15,15,10,10,10,8,5,5];
    const products=quantities.map((q,n)=>`<det><nItem>${n+1}</nItem><prod><cProd>0${n+1314}</cProd><xProd>Produto ${n+1}</xProd><qCom>${q}.0000</qCom><uCom>UND</uCom><qTrib>${q}.0000</qTrib><uTrib>UND</uTrib></prod></det>`).join("");
    const xml=inboundXml({products});const id=await importXml(db,xml);const rows=await lines(db,id);
    assert.equal(rows.length,8);assert.equal(rows.reduce((sum,i)=>sum+Number(i.expected_qty),0),78);assert.equal(rows[0].supplier_code,"01314");
    assert.equal(await importXml(db,xml),id);
    for(const [index,variant] of ['<det><prod/>','<det nItem="abc"><prod/>','<det nItem="1"><nItem>2</nItem><prod/>','<det nItem="999999999999999999999"><prod/>'].entries()){
      await assert.rejects(importXml(db,inboundXml({invoiceKey:key.slice(0,-2)+String(40+index),products:variant+'</det>'})),/Número de item/);
    }
  }finally{await db.close();}
});
