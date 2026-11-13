-- Isolated inbound counts: never writes inventory or outbound transfer tables.
create table if not exists public.wms_inbound_destinations (
  warehouse_code text primary key references public.wms_warehouses(code),
  cnpj text not null check(cnpj ~ '^[0-9]{14}$'), source text not null
);
-- Confirmed by CNPJ-LOJAS.xlsx supplied by the user, 2026-11-05.
insert into public.wms_inbound_destinations values
 ('VDCG','08575189000152','CNPJ-LOJAS.xlsx'),('VDAR','18325344000489','CNPJ-LOJAS.xlsx'),
 ('VDCO','08575189000233','CNPJ-LOJAS.xlsx'),('VDSI','00138798002348','CNPJ-LOJAS.xlsx')
on conflict(warehouse_code) do nothing;

create table if not exists public.wms_inbound_receipts (
 id uuid primary key default gen_random_uuid(), warehouse_code text not null references public.wms_inbound_destinations(warehouse_code),
 invoice_key text not null check(invoice_key ~ '^[0-9]{44}$'), invoice_number text not null, series text not null,
 issued_at timestamptz not null, source_cnpj text not null, source_name text not null,
 destination_cnpj text not null, destination_name text not null, xml_content text not null,
 status text not null default 'AGUARDANDO' check(status in ('AGUARDANDO','EM_CONFERENCIA','CONCLUIDO_CORRETO','CONCLUIDO_DIVERGENTE')),
 assigned_to text references public.wms_users(id), assigned_name text,
 created_by text not null references public.wms_users(id), created_at timestamptz not null default now(),
 started_at timestamptz, finished_at timestamptz, finished_by text references public.wms_users(id),
 finished_name text, validated_at timestamptz, validated_by text references public.wms_users(id),
 version integer not null default 0, unique(warehouse_code,invoice_key)
);
create table if not exists public.wms_inbound_receipt_items (
 id uuid primary key default gen_random_uuid(), receipt_id uuid not null references public.wms_inbound_receipts(id),
 line_number integer not null, supplier_code text not null, description text not null,
 ean text, tributary_ean text, commercial_unit text not null, expected_qty numeric not null check(expected_qty>=0 and expected_qty<1000000000),
 tributary_unit text not null, tributary_qty numeric not null check(tributary_qty>0 and tributary_qty<1000000000),
 internal_sku text, internal_description text, suggested_sku text, suggested_description text,
 counted_qty numeric check(counted_qty>=0 and counted_qty<1000000000),
 counted_commercial numeric not null default 0, counted_tributary numeric not null default 0,
 is_extra boolean not null default false, observation text not null default '',
 counted_by text references public.wms_users(id), counted_name text, counted_at timestamptz,
 unique(receipt_id,line_number)
);
create table if not exists public.wms_inbound_receipt_events (
 id bigint generated always as identity primary key, receipt_id uuid not null references public.wms_inbound_receipts(id),
 action_id uuid not null, actor_id text not null references public.wms_users(id), actor_name text not null,
 action text not null, request_data jsonb not null, result_data jsonb not null default '{}',
 created_at timestamptz not null default now(), unique(receipt_id,action_id)
);
create index if not exists wms_inbound_scope on public.wms_inbound_receipts(warehouse_code,status,created_at desc);
create index if not exists wms_inbound_assigned on public.wms_inbound_receipts(assigned_to,warehouse_code);
create index if not exists wms_inbound_items_parent on public.wms_inbound_receipt_items(receipt_id);

create or replace function private.can_read_wms_inbound(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wms_inbound_receipts r where r.id=p_id
  and private.can_access_warehouse(r.warehouse_code)
  and (private.current_wms_role() in ('ADMINISTRADOR','SUPERVISOR')
    or (private.current_wms_role()='OPERADOR' and r.assigned_to=private.current_wms_profile_id())))
$$;
revoke all on function private.can_read_wms_inbound(uuid) from public,anon;
grant execute on function private.can_read_wms_inbound(uuid) to authenticated;
alter table public.wms_inbound_destinations enable row level security;
alter table public.wms_inbound_receipts enable row level security;
alter table public.wms_inbound_receipt_items enable row level security;
alter table public.wms_inbound_receipt_events enable row level security;
revoke all on public.wms_inbound_destinations,public.wms_inbound_receipts,public.wms_inbound_receipt_items,public.wms_inbound_receipt_events from public,anon,authenticated;
grant select on public.wms_inbound_destinations,public.wms_inbound_receipts,public.wms_inbound_receipt_items,public.wms_inbound_receipt_events to authenticated;
drop policy if exists inbound_destination_read on public.wms_inbound_destinations;
create policy inbound_destination_read on public.wms_inbound_destinations for select to authenticated
 using(private.can_access_warehouse(warehouse_code) and private.current_wms_role() in ('ADMINISTRADOR','SUPERVISOR','OPERADOR'));
drop policy if exists inbound_receipt_read on public.wms_inbound_receipts;
create policy inbound_receipt_read on public.wms_inbound_receipts for select to authenticated using(private.can_read_wms_inbound(id));
drop policy if exists inbound_item_read on public.wms_inbound_receipt_items;
create policy inbound_item_read on public.wms_inbound_receipt_items for select to authenticated using(private.can_read_wms_inbound(receipt_id));
drop policy if exists inbound_event_read on public.wms_inbound_receipt_events;
create policy inbound_event_read on public.wms_inbound_receipt_events for select to authenticated using(private.can_read_wms_inbound(receipt_id));

create or replace function private.inbound_xml_text(doc xml,path text) returns text
language sql immutable set search_path='' as $$ select coalesce((xpath('string('||path||')',doc))[1]::text,'') $$;
revoke all on function private.inbound_xml_text(xml,text) from public,anon,authenticated;

create or replace function private.import_wms_inbound(p_warehouse text,p_xml text,p_action_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 actor text:=private.current_wms_profile_id(); actor_name text; doc xml; info xml; part xml; product xml;
 key text; dest text; receipt uuid; n integer:=0; q numeric; qt numeric; u text; ut text; line integer;
begin
 if actor is null or not coalesce(private.current_wms_role() in ('ADMINISTRADOR','SUPERVISOR'),false)
 or not private.can_access_warehouse(p_warehouse) then raise exception 'Sem permissão para importar neste estoque.'; end if;
 if p_action_id is null or p_xml is null or octet_length(p_xml)>5242880 or p_xml ~* '<!DOCTYPE|<!ENTITY' then raise exception 'XML inválido: limite 5 MB, sem entidades externas.'; end if;
 doc:=xmlparse(document p_xml);
 if cardinality(xpath('//*[local-name()="infNFe"]',doc))<>1 then raise exception 'O XML deve conter exatamente uma NF-e.'; end if;
 info:=(xpath('//*[local-name()="infNFe"]',doc))[1];
 key:=replace(private.inbound_xml_text(info,'/*/@Id'),'NFe','');
 if key !~ '^[0-9]{44}$' or private.inbound_xml_text(info,'/*/*[local-name()="ide"]/*[local-name()="mod"]')<>'55' then raise exception 'Identificação de NF-e inválida.'; end if;
 dest:=private.inbound_xml_text(info,'/*/*[local-name()="dest"]/*[local-name()="CNPJ"]');
 if private.inbound_xml_text(info,'/*/*[local-name()="ide"]/*[local-name()="nNF"]') !~ '^[0-9]{1,9}$'
 or private.inbound_xml_text(info,'/*/*[local-name()="ide"]/*[local-name()="serie"]') !~ '^[0-9]{1,3}$'
 or private.inbound_xml_text(info,'/*/*[local-name()="emit"]/*[local-name()="CNPJ"]') !~ '^[0-9]{14}$'
 or private.inbound_xml_text(info,'/*/*[local-name()="emit"]/*[local-name()="xNome"]')=''
 or private.inbound_xml_text(info,'/*/*[local-name()="dest"]/*[local-name()="xNome"]')='' then raise exception 'Dados obrigatórios da NF-e ausentes ou inválidos.'; end if;
 if not exists(select 1 from public.wms_inbound_destinations d where d.warehouse_code=p_warehouse and d.cnpj=dest) then
 raise exception 'Destinatário da NF-e não corresponde ao estoque ativo autorizado.'; end if;
 -- Serializes import retries before the unique key is inspected.
 perform pg_advisory_xact_lock(hashtextextended(p_warehouse||key,0));
 select id into receipt from public.wms_inbound_receipts where warehouse_code=p_warehouse and invoice_key=key;
 if receipt is not null then return receipt; end if;
 select name into actor_name from public.wms_users where id=actor;
 insert into public.wms_inbound_receipts(warehouse_code,invoice_key,invoice_number,series,issued_at,source_cnpj,source_name,destination_cnpj,destination_name,xml_content,created_by)
 values(p_warehouse,key,private.inbound_xml_text(info,'/*/*[local-name()="ide"]/*[local-name()="nNF"]'),
 private.inbound_xml_text(info,'/*/*[local-name()="ide"]/*[local-name()="serie"]'),
 private.inbound_xml_text(info,'/*/*[local-name()="ide"]/*[local-name()="dhEmi"]')::timestamptz,
 private.inbound_xml_text(info,'/*/*[local-name()="emit"]/*[local-name()="CNPJ"]'),
 private.inbound_xml_text(info,'/*/*[local-name()="emit"]/*[local-name()="xNome"]'),dest,
 private.inbound_xml_text(info,'/*/*[local-name()="dest"]/*[local-name()="xNome"]'),p_xml,actor) returning id into receipt;
 foreach part in array xpath('/*/*[local-name()="det"]',info) loop
  n:=n+1; if n>5000 then raise exception 'XML excede 5000 itens.'; end if;
  product:=(xpath('/*/*[local-name()="prod"]',part))[1];
  if product is null then raise exception 'Produto ausente no XML.'; end if;
  line:=private.inbound_xml_text(part,'/*/@nItem')::integer;
  if line is null or line<=0 or private.inbound_xml_text(product,'/*/*[local-name()="cProd"]')='' or private.inbound_xml_text(product,'/*/*[local-name()="xProd"]')='' then raise exception 'Código, descrição ou linha inválidos no XML.'; end if;
  q:=private.inbound_xml_text(product,'/*/*[local-name()="qCom"]')::numeric;
  qt:=private.inbound_xml_text(product,'/*/*[local-name()="qTrib"]')::numeric;
  u:=upper(private.inbound_xml_text(product,'/*/*[local-name()="uCom"]'));
  ut:=upper(private.inbound_xml_text(product,'/*/*[local-name()="uTrib"]'));
  if q<=0 or qt<=0 or q::text in ('NaN','Infinity','-Infinity') or qt::text in ('NaN','Infinity','-Infinity') or u='' or ut='' or (u=ut and q<>qt) then raise exception 'Quantidade ou unidade incompatível no item %.',line; end if;
  insert into public.wms_inbound_receipt_items(receipt_id,line_number,supplier_code,description,ean,tributary_ean,commercial_unit,expected_qty,tributary_unit,tributary_qty)
  values(receipt,line,private.inbound_xml_text(product,'/*/*[local-name()="cProd"]'),private.inbound_xml_text(product,'/*/*[local-name()="xProd"]'),
   private.inbound_xml_text(product,'/*/*[local-name()="cEAN"]'),private.inbound_xml_text(product,'/*/*[local-name()="cEANTrib"]'),u,q,ut,qt);
 end loop;
 if n=0 then raise exception 'XML sem produtos.'; end if;
 -- Suggestions are explicit candidates, never an automatic supplier-to-SKU binding.
 update public.wms_inbound_receipt_items i set suggested_sku=p.sku,suggested_description=p.product_name
 from public.wms_products p where i.receipt_id=receipt and i.supplier_code=p.sku;
 insert into public.wms_inbound_receipt_events(receipt_id,action_id,actor_id,actor_name,action,request_data,result_data)
 values(receipt,p_action_id,actor,actor_name,'IMPORT','{}',jsonb_build_object('items',n));
 return receipt;
end $$;
revoke all on function private.import_wms_inbound(text,text,uuid) from public,anon;
grant execute on function private.import_wms_inbound(text,text,uuid) to authenticated;
create or replace function public.import_wms_inbound(p_warehouse text,p_xml text,p_action_id uuid) returns uuid
language sql security invoker set search_path='' as $$ select private.import_wms_inbound(p_warehouse,p_xml,p_action_id) $$;
revoke all on function public.import_wms_inbound(text,text,uuid) from public,anon;
grant execute on function public.import_wms_inbound(text,text,uuid) to authenticated;

create or replace function private.act_wms_inbound(p_id uuid,p_action text,p_data jsonb,p_version integer,p_action_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare r public.wms_inbound_receipts; i public.wms_inbound_receipt_items; prior public.wms_inbound_receipt_events;
 actor text:=private.current_wms_profile_id(); actor_name text; manager boolean; worker public.wms_users;
 commercial numeric; tributary numeric;
 sku public.wms_products; quantity numeric; diff_count integer; before_qty numeric; product_count integer;
begin
 if actor is null or not private.can_read_wms_inbound(p_id) then raise exception 'Recebimento não autorizado.'; end if;
 if p_action_id is null or p_data is null then raise exception 'Ação inválida.'; end if;
 select * into r from public.wms_inbound_receipts where id=p_id for update;
 select * into prior from public.wms_inbound_receipt_events where receipt_id=p_id and action_id=p_action_id;
 if found then
  if prior.actor_id<>actor or prior.action<>p_action or prior.request_data<>p_data then raise exception 'Identificador reutilizado com outra ação.'; end if;
  return (prior.result_data->>'version')::integer;
 end if;
 if r.version is distinct from p_version then raise exception 'Recebimento alterado por outro colaborador. Atualize antes de continuar.'; end if;
 manager:=private.current_wms_role() in ('ADMINISTRADOR','SUPERVISOR');
 select name into actor_name from public.wms_users where id=actor;
 if r.status like 'CONCLUIDO_%' and p_action<>'VALIDATE' then raise exception 'Recebimento já concluído.'; end if;
 if p_action='ASSIGN' then
  if not manager or r.status<>'AGUARDANDO' then raise exception 'Atribuição permitida somente antes de iniciar, por gestor.'; end if;
  select * into worker from public.wms_users where id=p_data->>'user_id' and active and not coalesce(archived,false) and role='OPERADOR';
  if worker.id is null or not (r.warehouse_code=any(regexp_split_to_array(upper(coalesce(nullif(worker.allowed_warehouse_codes,''),worker.default_warehouse_code,worker.warehouse_code,'')),'[,;\s]+'))) then raise exception 'Conferente deve ser operador autorizado no mesmo estoque.'; end if;
  update public.wms_inbound_receipts set assigned_to=worker.id,assigned_name=worker.name where id=p_id;
 elsif p_action='VALIDATE' then
  if not manager or r.status not like 'CONCLUIDO_%' or r.validated_at is not null then raise exception 'Resultado indisponível para validação.'; end if;
  update public.wms_inbound_receipts set validated_at=now(),validated_by=actor where id=p_id;
 else
  if r.assigned_to is distinct from actor then raise exception 'Somente o conferente atribuído pode executar a contagem.'; end if;
  if p_action='START' then
   if r.status<>'AGUARDANDO' then raise exception 'Conferência já iniciada.'; end if;
   update public.wms_inbound_receipts set status='EM_CONFERENCIA',started_at=now() where id=p_id;
  else
   if r.status<>'EM_CONFERENCIA' then raise exception 'Inicie a conferência antes de lançar quantidades.'; end if;
   if p_action in ('COUNT','MAP') then
    select * into i from public.wms_inbound_receipt_items where receipt_id=p_id and id=(p_data->>'item_id')::uuid;
    if i.id is null then raise exception 'Item não pertence ao recebimento.'; end if;
    if p_action='MAP' then
     select p.* into sku from public.wms_products p where p.sku=p_data->>'sku';
     if not found and coalesce(p_data->>'sku','') ~ '^[0-9]+$' then
      select count(*) into product_count from public.wms_products p where p.sku ~ '^[0-9]+$' and ltrim(p.sku,'0')=ltrim(p_data->>'sku','0');
      if product_count=1 then select p.* into sku from public.wms_products p where p.sku ~ '^[0-9]+$' and ltrim(p.sku,'0')=ltrim(p_data->>'sku','0'); end if;
     end if;
     if sku.sku is null then raise exception 'SKU não cadastrado no WMS ou correspondência ambígua.'; end if;
     update public.wms_inbound_receipt_items set internal_sku=sku.sku,internal_description=sku.product_name where id=i.id;
    else
     quantity:=(p_data->>'quantity')::numeric;
     if quantity is null or quantity<0 or quantity>=1000000000 or quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantidade inválida.'; end if;
     if p_data->>'mode' not in ('ADD','SET') or p_data->>'mode' is null then raise exception 'Modo de contagem inválido.'; end if;
     before_qty:=i.counted_qty;
     commercial:=case when p_data->>'mode'='SET' then 0 else i.counted_commercial end;
     tributary:=case when p_data->>'mode'='SET' then 0 else i.counted_tributary end;
     if p_data->>'unit'=i.tributary_unit and i.tributary_unit<>i.commercial_unit then tributary:=tributary+quantity;
     elsif p_data->>'unit'=i.commercial_unit then commercial:=commercial+quantity;
     else raise exception 'Unidade incompatível com o XML.'; end if;
     -- Retain the two exact counters: repeated 1/24 scans must not accumulate rounding errors.
     quantity:=commercial+case when tributary=0 then 0 else tributary*i.expected_qty/i.tributary_qty end;
     update public.wms_inbound_receipt_items set counted_qty=round(quantity,6),counted_commercial=commercial,counted_tributary=tributary,counted_by=actor,counted_name=actor_name,counted_at=now(),observation=left(coalesce(p_data->>'observation',''),500) where id=i.id returning * into i;
    end if;
   elsif p_action='EXTRA' then
    quantity:=(p_data->>'quantity')::numeric;
    if quantity is null or quantity<=0 or quantity>=1000000000 or quantity::text in ('NaN','Infinity','-Infinity') or coalesce(trim(p_data->>'unit'),'')='' or coalesce(trim(p_data->>'code'),'')='' or coalesce(trim(p_data->>'description'),'')='' then raise exception 'Informe produto, descrição, unidade e quantidade válidos.'; end if;
    select count(*) into product_count from public.wms_inbound_receipt_items where receipt_id=p_id;
    if product_count>=6000 then raise exception 'Limite de itens atingido.'; end if;
    insert into public.wms_inbound_receipt_items(receipt_id,line_number,supplier_code,description,commercial_unit,expected_qty,tributary_unit,tributary_qty,counted_qty,counted_commercial,is_extra,counted_by,counted_name,counted_at,observation)
    select p_id,coalesce(max(line_number),0)+1,left(p_data->>'code',100),left(p_data->>'description',300),upper(p_data->>'unit'),0,upper(p_data->>'unit'),quantity,quantity,quantity,true,actor,actor_name,now(),left(coalesce(p_data->>'observation',''),500)
    from public.wms_inbound_receipt_items where receipt_id=p_id returning * into i;
   elsif p_action='FINISH' then
    if exists(select 1 from public.wms_inbound_receipt_items where receipt_id=p_id and counted_qty is null) then raise exception 'Existem produtos pendentes. Confira inclusive os recebidos com quantidade zero.'; end if;
    select count(*) into diff_count from public.wms_inbound_receipt_items where receipt_id=p_id and (is_extra or counted_qty<>expected_qty);
    if diff_count>0 and coalesce(p_data->>'confirm_divergences','false')<>'true' then raise exception 'Confirme explicitamente a conclusão com divergências.'; end if;
    update public.wms_inbound_receipts set status=case when diff_count=0 then 'CONCLUIDO_CORRETO' else 'CONCLUIDO_DIVERGENTE' end,finished_at=now(),finished_by=actor,finished_name=actor_name where id=p_id;
   else raise exception 'Ação desconhecida.';
   end if;
  end if;
 end if;
 update public.wms_inbound_receipts set version=version+1 where id=p_id returning version into p_version;
 insert into public.wms_inbound_receipt_events(receipt_id,action_id,actor_id,actor_name,action,request_data,result_data)
 values(p_id,p_action_id,actor,actor_name,p_action,p_data,jsonb_build_object('version',p_version,'before_qty',before_qty,
 'item_id',i.id,'expected_qty',i.expected_qty,'counted_qty',i.counted_qty,'difference',i.counted_qty-i.expected_qty,'unit',i.commercial_unit));
 return p_version;
end $$;
revoke all on function private.act_wms_inbound(uuid,text,jsonb,integer,uuid) from public,anon;
grant execute on function private.act_wms_inbound(uuid,text,jsonb,integer,uuid) to authenticated;
create or replace function public.act_wms_inbound(p_id uuid,p_action text,p_data jsonb,p_version integer,p_action_id uuid) returns integer
language sql security invoker set search_path='' as $$ select private.act_wms_inbound(p_id,p_action,p_data,p_version,p_action_id) $$;
revoke all on function public.act_wms_inbound(uuid,text,jsonb,integer,uuid) from public,anon;
grant execute on function public.act_wms_inbound(uuid,text,jsonb,integer,uuid) to authenticated;
