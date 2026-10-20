begin;

-- The existing warehouse-scoped batch RPC owns allocation and request stamping.
-- Store the first XLSX once; subsequent downloads return these exact bytes.
create table public.wms_replenishment_export_files (
  batch_id text primary key references public.wms_replenishment_export_batches(id),
  xlsx_base64 text not null check (length(xlsx_base64) between 8 and 14000000),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);
alter table public.wms_replenishment_export_files enable row level security;
grant select on public.wms_replenishment_export_files to authenticated;
create policy replenishment_export_file_read on public.wms_replenishment_export_files
for select to authenticated using (
  (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']))
  and exists (
    select 1 from public.wms_replenishment_export_batches b
    where b.id = batch_id
      and b.warehouse_code = any((select private.current_wms_allowed_warehouses())::text[])
  )
);

alter table public.wms_replenishment_export_batches
  add column vd_posted_at timestamptz,
  add column vd_posted_by uuid;

create function public.save_wms_replenishment_export_file(p_batch_id text, p_xlsx_base64 text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_batch public.wms_replenishment_export_batches;
  v_file text;
begin
  select * into v_batch from public.wms_replenishment_export_batches where id = p_batch_id for update;
  if not found or auth.uid() is null
     or not private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR'])
     or not (v_batch.warehouse_code = any(private.current_wms_allowed_warehouses())) then
    raise exception 'Lote nao autorizado.' using errcode = '42501';
  end if;
  select xlsx_base64 into v_file from public.wms_replenishment_export_files where batch_id = p_batch_id;
  if found then return v_file; end if;
  if p_xlsx_base64 is null or length(p_xlsx_base64) not between 8 and 14000000
     or p_xlsx_base64 !~ '^UEsDB[A-Za-z0-9+/=]+$' then
    raise exception 'Arquivo XLSX invalido.' using errcode = '22023';
  end if;
  perform pg_catalog.decode(p_xlsx_base64, 'base64');
  insert into public.wms_replenishment_export_files(batch_id, xlsx_base64)
    values (p_batch_id, p_xlsx_base64);
  return p_xlsx_base64;
end;
$$;

create function public.confirm_wms_replenishment_vd_posting(p_batch_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_batch public.wms_replenishment_export_batches;
begin
  select * into v_batch from public.wms_replenishment_export_batches where id = p_batch_id for update;
  if not found or auth.uid() is null
     or not private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR'])
     or not (v_batch.warehouse_code = any(private.current_wms_allowed_warehouses())) then
    raise exception 'Lote nao autorizado.' using errcode = '42501';
  end if;
  if not exists(select 1 from public.wms_replenishment_export_files where batch_id = p_batch_id) then
    raise exception 'Salve o arquivo do lote antes de confirmar o lancamento.' using errcode = '23514';
  end if;
  update public.wms_replenishment_export_batches
    set vd_posted_at = now(), vd_posted_by = auth.uid()
    where id = p_batch_id and vd_posted_at is null;
end;
$$;
revoke all on function public.save_wms_replenishment_export_file(text,text) from public, anon;
revoke all on function public.confirm_wms_replenishment_vd_posting(text) from public, anon;
grant execute on function public.save_wms_replenishment_export_file(text,text) to authenticated;
grant execute on function public.confirm_wms_replenishment_vd_posting(text) to authenticated;
notify pgrst, 'reload schema';
commit;
