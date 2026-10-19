create table public.wms_transfer_invoices (
  transfer_id text primary key references public.wms_transfers(id),
  warehouse_code text not null,
  invoice_number text not null default '',
  invoice_key text not null default '',
  destination_cnpj text not null default '',
  file_name text not null check (length(file_name) between 1 and 255),
  xml_content text not null check (octet_length(xml_content) between 1 and 5242880),
  previous_status text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  created_by_name text not null default ''
);
alter table public.wms_transfer_invoices enable row level security;
revoke all on public.wms_transfer_invoices from public, anon, authenticated;
grant select, insert on public.wms_transfer_invoices to authenticated;
create policy transfer_invoice_read on public.wms_transfer_invoices for select to authenticated
  using (private.can_access_warehouse(warehouse_code));
create policy transfer_invoice_insert on public.wms_transfer_invoices for insert to authenticated
  with check (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR']) and private.can_access_warehouse(warehouse_code) and created_by = auth.uid());

create function private.register_transfer_invoice() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  transfer_row public.wms_transfers%rowtype;
  parsed xml;
  expected_cnpj text;
begin
  if auth.uid() is null or not private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR']) then
    raise exception 'Sem permissao para registrar NF.' using errcode = '42501';
  end if;
  select * into transfer_row from public.wms_transfers where id = new.transfer_id for update;
  if not found or coalesce(transfer_row.is_deleted,false) or not private.can_access_warehouse(transfer_row.warehouse_code) then
    raise exception 'Transferencia nao encontrada no estoque autorizado.' using errcode = '42501';
  end if;
  if transfer_row.status not in ('PRONTA_PARA_NOTA','PRONTA_PARA_NOTA_COM_DIVERGENCIA','CONCLUIDA_SEM_DIVERGENCIA','CONCLUIDA_COM_DIVERGENCIA','FINALIZADA_PARA_ANALISE','FINALIZADA') then
    raise exception 'Conclua a separacao e a montagem antes de registrar a NF.';
  end if;
  if new.xml_content ~* '<!DOCTYPE|<!ENTITY' then raise exception 'XML com entidades externas nao permitido.'; end if;
  parsed := xmlparse(document new.xml_content);
  if cardinality(xpath('//*[local-name()="infNFe"]', parsed)) <> 1 then raise exception 'XML deve conter uma unica NF-e.'; end if;
  new.invoice_number := (xpath('string(//*[local-name()="infNFe"]/*[local-name()="ide"]/*[local-name()="nNF"])',parsed))[1]::text;
  new.invoice_key := regexp_replace((xpath('string(//*[local-name()="infNFe"]/@Id)',parsed))[1]::text,'^NFe','');
  new.destination_cnpj := (xpath('string(//*[local-name()="infNFe"]/*[local-name()="dest"]/*[local-name()="CNPJ"])',parsed))[1]::text;
  if new.invoice_number !~ '^\d{1,9}$' or new.invoice_key !~ '^\d{44}$' then raise exception 'Numero ou chave da NF-e invalido.'; end if;
  expected_cnpj := regexp_replace(coalesce(nullif(transfer_row.destino_cnpj,''),transfer_row.estabelecimento_cnpj,''),'\D','','g');
  if expected_cnpj <> '' and expected_cnpj <> new.destination_cnpj then raise exception 'Destinatario da NF difere da transferencia.'; end if;
  new.warehouse_code := transfer_row.warehouse_code;
  new.previous_status := transfer_row.status;
  new.created_by := auth.uid();
  new.created_at := now();
  select name into new.created_by_name from public.wms_users where auth_user_id = auth.uid() and active and not coalesce(archived,false) limit 1;
  if new.created_by_name is null then raise exception 'Perfil ativo nao encontrado.'; end if;
  update public.wms_transfers set status = 'FINALIZADA', updated_at = now(),
    last_action_at = now(), last_action_label = 'NF ' || new.invoice_number || ' registrada' where id = new.transfer_id;
  return new;
end;
$$;
revoke all on function private.register_transfer_invoice() from public;
create trigger register_transfer_invoice before insert on public.wms_transfer_invoices
  for each row execute function private.register_transfer_invoice();

create function private.guard_invoiced_transfer() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status <> 'FINALIZADA' and exists (
    select 1 from public.wms_transfer_invoices where transfer_id = old.id
  ) then raise exception 'Transferencia com NF registrada nao pode ser reaberta.'; end if;
  return new;
end;
$$;
revoke all on function private.guard_invoiced_transfer() from public;
create trigger guard_invoiced_transfer before update of status on public.wms_transfers
  for each row execute function private.guard_invoiced_transfer();
notify pgrst, 'reload schema';

