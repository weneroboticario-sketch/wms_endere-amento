-- Verified local XLSX: Materiais_Reposicao_VDCG_inicio_2026-10-10.xlsx
-- SHA256 4586163FBA50885C50624AE0438AC94DF2B770420F6B6D7E7BD4950EF2EA05FF
-- Ten exact request IDs, matching the file's ten materials and 60 units.
begin;
select set_config('request.jwt.claim.sub','3d7be96c-459a-4453-a7d8-db650b188d1f',true);
set local role authenticated;
do $$
declare
  v_batch text := 'legacy-vdcg-20261010-001448';
  v_requests jsonb;
  v_ids text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('replenishment-export:VDCG', 0));
  if exists (select 1 from public.wms_replenishment_export_batches where id=v_batch) then return; end if;
  with expected(id,sku,qty) as (values
    ('rep-1c09af51-065f-4d07-ba8b-07c3dcf89beb','85899',10),
    ('rep-5de1c536-8c7c-4c15-ac26-ff4e30966a6d','48062',1),
    ('rep-85c9b7dc-e11d-4254-9373-ac8630dab782','49909',5),
    ('rep-9db61b71-58c1-42cf-9f41-a72e2efc4939','51746',15),
    ('rep-a37d5a91-cf69-4de3-94ea-4eb96cd83221','53196',2),
    ('rep-af5a46d9-c4de-4cb0-905d-50dacecdcd7f','86875',5),
    ('rep-bc210215-2e29-4e36-b4aa-59658e241d7b','53447',1),
    ('rep-d0111a1c-2317-4af2-bb23-a3d2cd5ffd60','87557',10),
    ('rep-da41d003-b7e7-409d-b555-55e42fb0c0f9','86396',1),
    ('rep-f076bc14-5f60-421e-b20b-a1e9df880ffd','58120',10)
  ), matched as (
    select r.* from public.wms_replenishment_requests r join expected e
      on r.id=e.id and r.codigo_material=e.sku and r.quantidade_atendida=e.qty
    where r.warehouse_code='VDCG' and r.status in ('CONCLUIDO','ENTREGUE_NA_LOJA')
      and coalesce(r.is_deleted,false)=false and r.export_batch_id is null
      and r.finished_at <= '2026-10-10T00:14:48Z'::timestamptz
    for update of r
  ) select jsonb_agg(jsonb_build_object('id',id,'warehouse_code',warehouse_code,
      'codigo_material',codigo_material,'quantidade_atendida',quantidade_atendida,
      'status',status,'finished_at',finished_at,'updated_at',updated_at) order by id),
    array_agg(id) into v_requests,v_ids from matched;
  if coalesce(array_length(v_ids,1),0) <> 10 then
    raise exception 'Legacy file no longer matches all ten requests; no orders marked.';
  end if;
  insert into public.wms_replenishment_export_batches(id,warehouse_code,created_at,created_by,requests)
  values(v_batch,'VDCG','2026-10-10T00:14:48Z','3d7be96c-459a-4453-a7d8-db650b188d1f',v_requests);
  update public.wms_replenishment_requests set export_batch_id=v_batch,exported_at='2026-10-10T00:14:48Z'
    where id=any(v_ids) and warehouse_code='VDCG';
end $$;
commit;
select count(*) as reconciled_requests,sum(quantidade_atendida) as attended_units
from public.wms_replenishment_requests where export_batch_id='legacy-vdcg-20261010-001448';
