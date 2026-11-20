import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
test("unique pending index blocks same requester + SKU + qty while preserving separate collaborators",async()=>{
 const db=new PGlite();
 try {
  await db.exec("create table wms_replenishment_requests(id text primary key,warehouse_code text,codigo_material text,solicitado_por_id text,quantidade_solicitada numeric,quantidade_atendida numeric default 0,responsavel_id text,status text,is_deleted boolean default false,archived boolean default false);");
  const source=await readFile(new URL("../supabase/migrations/20261120161500_wms_replenishment_dedup_20261120.sql",import.meta.url),"utf8");
  await db.exec(source.slice(source.indexOf("create unique index if not exists ")));
  const insert=(id,warehouse,sku,owner,qty,status="PENDENTE")=>db.exec("insert into wms_replenishment_requests(id,warehouse_code,codigo_material,solicitado_por_id,quantidade_solicitada,status) values ('"+id+"','"+warehouse+"','"+sku+"','"+owner+"',"+qty+",'"+status+"')");
  await insert("original","VDCG","51213","evandro",9);
  await assert.rejects(insert("duplicate","VDCG","051213","evandro",9),/duplicate|unique/i);
  await insert("other-owner","VDCG","51213","joao",9);
  await insert("other-qty","VDCG","51213","evandro",4);
  await insert("other-warehouse","VDAR","51213","evandro",9);
  await insert("finished","VDCG","51213","evandro",9,"CONCLUIDO");
  await db.exec("update wms_replenishment_requests set status='CANCELADO' where id='original'");
  await insert("new-after-cancellation","VDCG","51213","evandro",9);
 } finally { await db.close(); }
});
