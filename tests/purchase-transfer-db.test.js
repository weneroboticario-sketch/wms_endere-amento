import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {workflowDatabase} from "./purchases-workflow-db.test.js";

async function database() {
  const db=await workflowDatabase();await db.exec("reset role");
  const baseline=await readFile(new URL("../supabase/migrations/20260923000000_legacy_baseline.sql",import.meta.url),"utf8");
  for(const table of ["wms_stock_positions","wms_establishments"]) {
    await db.exec(baseline.match(new RegExp("create table if not exists public\\."+table+" \\([\\s\\S]+?\\);","i"))[0]);
  }
  for(const statement of baseline.match(/alter table public\.(wms_transfers|wms_transfer_items|wms_notifications|wms_establishments) add column if not exists[^;]+;/g)||[])await db.exec(statement);
  await db.exec(`alter table wms_stock_positions add column if not exists archived boolean default false;
    create or replace function private.current_wms_allowed_warehouses() returns text[] language sql as $$select string_to_array(coalesce(nullif(current_setting('test.warehouses',true),''),'A,B'),',')$$;
    insert into wms_users(id,name,username,role,default_warehouse_code,available_for_tasks) values('stock','Stock','stock','OPERADOR','A',true),('wrong','Wrong','wrong','OPERADOR','B',true);
    insert into wms_warehouses(id,code,name) values('c','C','Unauthorized');
    insert into wms_stock_positions(id,warehouse_code,source_type,codigo_material,nome_material,total_disponivel,codigo_endereco)
      values('one','A','CAPTACAO','01302','Product',50,'R01'),('zero','A','CAPTACAO','94137','Zero',0,'R02'),('dest','B','LOJA','01302','Product',2,'');
    create unique index test_transfer_idempotency on wms_transfers(warehouse_code,idempotency_key) where idempotency_key<>'';
    alter table wms_stock_positions enable row level security;
    create policy capture_read on wms_stock_positions for select to authenticated using(warehouse_code=any(private.current_wms_allowed_warehouses()));
    create policy capture_write on wms_stock_positions for update to authenticated using(private.current_wms_role()<>'COMPRAS' and warehouse_code=any(private.current_wms_allowed_warehouses()));
    grant select,insert,update,delete on all tables in schema public to authenticated;`);
  await db.exec(await readFile(new URL("../supabase/migrations/20261014032016_purchase_transfer_multi_sku.sql",import.meta.url),"utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261014034555_purchase_transfer_scoped_user_columns.sql",import.meta.url),"utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261014134729_purchase_origin_minimum.sql",import.meta.url),"utf8"));
  await db.exec("create policy wms_transfers_warehouse_insert on public.wms_transfers for insert to authenticated with check(false)");
  await db.exec(await readFile(new URL("../supabase/migrations/20261014141212_purchase_optional_responsible.sql",import.meta.url),"utf8"));
  await db.exec(`revoke select on public.wms_users from authenticated;
    do $$declare columns text;begin
      select string_agg(quote_ident(column_name),',') into columns from information_schema.columns
      where table_schema='public' and table_name='wms_users' and column_name<>'password_hash';
      execute 'grant select ('||columns||') on public.wms_users to authenticated';
    end$$;`);
  await db.exec("select set_config('test.role','COMPRAS',false);set role authenticated");return db;
}
const create=(db,items,key="test-action-001",origin="A",responsible="stock")=>db.query("select wms_create_purchase_transfer($1,'b',$2,'NORMAL','',$3,$4) result",[origin,responsible,JSON.stringify(items),key]);

test("unassigned purchase is pending, idempotent and can be delegated by supervisor",async()=>{
  const db=await database();try{
    await db.exec("reset role; drop policy transfer_scope on wms_transfers; create policy test_transfer_read on wms_transfers for select to authenticated using(warehouse_code=any(private.current_wms_allowed_warehouses())); create policy test_transfer_update on wms_transfers for update to authenticated using(private.has_wms_role(array['SUPERVISOR','ADMINISTRADOR']) and warehouse_code=any(private.current_wms_allowed_warehouses())); set role authenticated");
    const items=[{sku:"01302",requested_quantity:3,store_need_quantity:3}];
    const first=(await create(db,items,"unassigned-action","A","")).rows[0].result;
    const again=(await create(db,items,"unassigned-action","A",null)).rows[0].result;
    assert.equal(again.id,first.id);assert.equal(again.replayed,true);
    const row=(await db.query("select status,responsavel_id,requires_invoice from wms_transfers where id=$1",[first.id])).rows[0];
    assert.equal(row.status,"PENDENTE");assert.equal(row.responsavel_id,"");assert.equal(row.requires_invoice,true);
    assert.equal((await db.query("select user_id from wms_notifications where event_type='PURCHASE_TRANSFER_CREATED'")).rows[0].user_id,"");
    await assert.rejects(create(db,items,"invalid-selected","A","wrong"),/Responsavel/);
    await assert.rejects(create(db,[{sku:"01302",requested_quantity:51,store_need_quantity:51}],"excess-no-staff","A",""),/insuficiente/);
    await assert.rejects(db.query("insert into wms_transfers(id,warehouse_code,criado_por_id,status,request_origin,requires_invoice) values('bad','A','other','PENDENTE','COMPRAS',true)"),/row-level security/);
    await db.exec("select set_config('test.role','SUPERVISOR',false)");
    const assigned=await db.query("update wms_transfers set responsavel_id='stock',responsavel_nome='Stock',status='ATRIBUIDA' where id=$1 returning status",[first.id]);
    assert.equal(assigned.rows[0].status,"ATRIBUIDA");
    assert.equal(Number((await db.query("select total_disponivel from wms_stock_positions where id='one'")).rows[0].total_disponivel),50);
    assert.equal((await db.query("select count(*)::int n from wms_transfers")).rows[0].n,1);
  }finally{await db.close();}
});

test("minimum origin is inclusive, aggregated before pagination and read only",async()=>{
  const db=await database();try{
    await db.exec("reset role");
    for(let n=0;n<85;n++){
      const sku="MIN"+String(n).padStart(3,"0");
      await db.query("insert into wms_stock_positions(id,warehouse_code,source_type,codigo_material,total_disponivel) values($1,'B','LOJA',$2,0),($3,'A','CAPTACAO',$2,$4)",["d"+n,sku,"o"+n,n<40?19:20]);
    }
    await db.exec("insert into wms_stock_positions(id,warehouse_code,source_type,codigo_material,total_disponivel) values('extra','A','CAPTACAO','MIN040',1),('unknown','B','LOJA','UNKNOWN',0)");
    await db.exec("set role authenticated");
    const query=async(min,page=0)=>(await db.query("select wms_purchase_store_needs_by_origin('B','A','MIN','NEED','ZERO',3,$1,$2) result",[page,min])).rows[0].result;
    const first=await query(20),second=await query(20,1);
    assert.equal(first.total,45);assert.equal(first.rows.length,40);assert.equal(second.rows.length,5);
    assert.ok(first.rows.every(r=>Number(r.available)>=20 && Number(r.need)===3));
    assert.equal(Number(first.rows.find(r=>r.sku==="MIN040").available),21);
    assert.equal(new Set([...first.rows,...second.rows].map(r=>r.sku)).size,45);
    assert.equal((await query(19)).total,85);
    assert.equal((await query(21)).total,1);
    const all=(await db.query("select wms_purchase_store_needs_by_origin('B','A') result")).rows[0].result;
    const legacy=(await db.query("select wms_purchase_store_needs('B','A') result")).rows[0].result;
    assert.equal(all.total,legacy.total);
    const positive=(await db.query("select wms_purchase_store_needs_by_origin('B','A','','NEED','ZERO',3,0,1) result")).rows[0].result;
    assert.equal(positive.total,86);
    await assert.rejects(query(-1),/Parametros invalidos/);
    await assert.rejects(query(1.5),/Parametros invalidos/);
    await assert.rejects(db.query("select wms_purchase_store_needs_by_origin('B','C')"),/nao autorizada/);
    await assert.rejects(db.query("select wms_purchase_store_needs_by_origin('C','A')"),/nao autorizada/);
    assert.equal((await db.query("select count(*)::int n from wms_transfers")).rows[0].n,0);
    assert.equal(Number((await db.query("select total_disponivel from wms_stock_positions where id='one'")).rows[0].total_disponivel),50);
    await db.exec("select set_config('test.role','OPERADOR',false)");
    await assert.rejects(query(20),/nao autorizada/);
  }finally{await db.close();}
});
test("criacao atomica, retry idempotente, snapshot e nenhuma reserva",async()=>{
  const db=await database();try{
    const items=[{sku:"01302",requested_quantity:20,store_need_quantity:30}];
    const first=(await create(db,items)).rows[0].result,second=(await create(db,items)).rows[0].result;
    assert.equal(first.id,second.id);assert.equal(second.replayed,true);
    assert.equal((await db.query("select count(*)::int n from wms_transfers")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from wms_notifications where event_type='PURCHASE_TRANSFER_CREATED'")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from wms_transfer_events where event_type='CREATED_BY_PURCHASES'")).rows[0].n,1);
    const item=(await db.query("select sku,quantidade_solicitada,saldo_captacao_snapshot,quantidade_separada from wms_transfer_items")).rows[0];
    assert.equal(item.sku,"01302");assert.equal(Number(item.saldo_captacao_snapshot),50);assert.equal(Number(item.quantidade_separada),0);
    assert.equal(Number((await db.query("select total_disponivel from wms_stock_positions where id='one'")).rows[0].total_disponivel),50);
  }finally{await db.close();}
});
test("falha no item posterior reverte transferencia, itens, evento e notificacao",async()=>{
  const db=await database();try{
    await assert.rejects(create(db,[{sku:"01302",requested_quantity:20,store_need_quantity:30},{sku:"94137",requested_quantity:2,store_need_quantity:2}]),/insuficiente/);
    for(const table of ["wms_transfers","wms_transfer_items","wms_notifications","wms_transfer_events"])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
    await assert.rejects(create(db,[{sku:"01302",requested_quantity:0,store_need_quantity:2}]),/Quantidade invalida/);
    await assert.rejects(create(db,[{sku:"01302",requested_quantity:2,store_need_quantity:2}],"wrong-origin","C"),/Origem nao autorizada/);
    await assert.rejects(create(db,[{sku:"01302",requested_quantity:2,store_need_quantity:2}],"wrong-staff","A","wrong"),/Responsavel/);
  }finally{await db.close();}
});
test("necessidade usa destino LOJA e CAPTACAO apenas da origem autorizada",async()=>{
  const db=await database();try{
    const r=(await db.query("select wms_purchase_store_needs('B','A') result")).rows[0].result;
    assert.equal(r.rows[0].sku,"01302");assert.equal(Number(r.rows[0].store_available),2);assert.equal(Number(r.rows[0].available),50);
    await assert.rejects(db.query("select wms_purchase_store_needs('C','A')"),/nao autorizada/);
    await db.exec("select set_config('test.role','OPERADOR',false)");
    await assert.rejects(create(db,[{sku:"01302",requested_quantity:2,store_need_quantity:2}]),/Perfil nao autorizado/);
  }finally{await db.close();}
});
test("dez SKUs geram uma transferencia e dez itens, falha no quinto reverte tudo",async()=>{
  const db=await database();try{
    await db.exec("reset role");
    for(let n=0;n<10;n++)await db.query("insert into wms_stock_positions(id,warehouse_code,source_type,codigo_material,nome_material,total_disponivel) values($1,'A','CAPTACAO',$2,'Fixture',10)",["stock-"+n,"000"+n]);
    await db.exec("set role authenticated");
    const items=Array.from({length:10},(_,n)=>({sku:"000"+n,requested_quantity:4,store_need_quantity:4}));
    const bad=items.map(i=>({...i}));bad[4].requested_quantity=11;
    await assert.rejects(create(db,bad,"ten-items-fail"),/insuficiente/);
    assert.equal((await db.query("select count(*)::int n from wms_transfers")).rows[0].n,0);
    await create(db,items,"ten-items-good");
    assert.equal((await db.query("select count(*)::int n from wms_transfers")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from wms_transfer_items")).rows[0].n,10);
    assert.equal(Number((await db.query("select total_expected_quantity from wms_transfers")).rows[0].total_expected_quantity),40);
  }finally{await db.close();}
});
