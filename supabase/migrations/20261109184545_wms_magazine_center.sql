-- Private catalogue only. No stock, replenishment, transfer or auth rows changed.
create table public.wms_magazine_cycles(
 id uuid primary key,warehouse_code text not null,code text not null check(length(code) between 1 and 80),
 starts_on date not null,ends_on date not null,capacity integer not null default 3 check(capacity between 1 and 12),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by text not null,updated_by text not null,
 check(ends_on>=starts_on),unique(warehouse_code,code),unique(id,warehouse_code)
);
create table public.wms_magazines(
 id uuid primary key,warehouse_code text not null,cycle_id uuid,name text not null check(length(name) between 1 and 200),brand text not null default '',notes text not null default '',
 status text not null default 'DRAFT' check(status in ('DRAFT','PROCESSING','REVIEW','PARTIAL','PUBLISHED')),active_version uuid,revision integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by text not null,updated_by text not null,
 foreign key(cycle_id,warehouse_code) references public.wms_magazine_cycles(id,warehouse_code),unique(id,warehouse_code)
);
create table public.wms_magazine_versions(
 id uuid primary key,magazine_id uuid not null,warehouse_code text not null,version integer not null,original_name text not null,
 file_path text not null unique,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),byte_size bigint not null check(byte_size between 8 and 26214400),
 page_count integer not null check(page_count between 1 and 500),upload_state text not null default 'PENDING' check(upload_state in ('PENDING','READY')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by text not null,updated_by text not null,
 foreign key(magazine_id,warehouse_code) references public.wms_magazines(id,warehouse_code),unique(warehouse_code,sha256),unique(magazine_id,version),unique(id,warehouse_code)
);
create table public.wms_magazine_pages(
 id uuid primary key default gen_random_uuid(),version_id uuid not null,warehouse_code text not null,physical_number integer not null check(physical_number>0),printed_number integer check(printed_number>0),mapping_verified boolean not null default false,
 processing_status text not null default 'PENDING' check(processing_status in ('PENDING','PROCESSING','PROCESSED','ERROR')),
 review_status text not null default 'PENDENTE' check(review_status in ('PENDENTE','REVISADA')),required boolean not null default true,skip_reason text not null default '',
 error text not null default '',source text,revision integer not null default 0,lease_id uuid,lease_actor text,lease_until timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by text not null,updated_by text not null,
 foreign key(version_id,warehouse_code) references public.wms_magazine_versions(id,warehouse_code),unique(version_id,physical_number),unique(version_id,printed_number),unique(id,warehouse_code)
);
create table public.wms_magazine_items(
 id uuid primary key default gen_random_uuid(),page_id uuid not null,warehouse_code text not null,sku text not null check(sku~'^[0-9]{1,14}$'),extracted_description text not null default '',official_description text not null default '',catalog_sku text,
 kind text not null check(kind in ('PRODUTO','REFIL','KIT','COMBO','INDEFINIDO')),box jsonb,visual_order integer not null default 0,
 status text not null check(status in ('VALIDADO','NAO_ENCONTRADO','REVISAR')),reason text not null default '',reviewed boolean not null default false,source text not null default 'MANUAL',confidence numeric,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by text not null,updated_by text not null,
 foreign key(page_id,warehouse_code) references public.wms_magazine_pages(id,warehouse_code)
);
create table public.wms_magazine_events(
 id uuid primary key,warehouse_code text not null,actor_id text not null,action text not null,magazine_id uuid,payload jsonb not null,created_at timestamptz not null default clock_timestamp(),result jsonb not null
);
create index on public.wms_magazines(warehouse_code,cycle_id,status);
create index on public.wms_magazine_versions(magazine_id,version);
create index on public.wms_magazine_pages(warehouse_code,version_id,printed_number);
create index on public.wms_magazine_items(warehouse_code,sku,page_id);
create index on public.wms_magazine_items(page_id,visual_order);
create index on public.wms_magazine_events(warehouse_code,magazine_id,created_at);

create or replace function private.magazine_allowed(code text,manage boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_wms_profile_id() is not null and private.can_access_warehouse(code)
 and case when manage then private.current_wms_role()='ADMINISTRADOR' else private.current_wms_role() in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') end
$$;
create or replace function private.magazine_readable(magazine uuid,code text) returns boolean language sql stable security definer set search_path='' as $$
 select private.magazine_allowed(code) and exists(select 1 from public.wms_magazines m where m.id=magazine and m.warehouse_code=code and (private.magazine_allowed(code,true) or m.status in ('PUBLISHED','PARTIAL')))
$$;
create or replace function private.magazine_version_readable(version uuid,code text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wms_magazine_versions v join public.wms_magazines m on m.id=v.magazine_id where v.id=$1 and v.warehouse_code=$2 and private.magazine_readable(m.id,$2) and (private.magazine_allowed($2,true) or m.active_version=v.id))
$$;
do $$declare tab text;begin foreach tab in array array['wms_magazine_cycles','wms_magazines','wms_magazine_versions','wms_magazine_pages','wms_magazine_items','wms_magazine_events'] loop
 execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated',tab);execute format('grant select on public.%I to authenticated',tab);
end loop;end$$;
create policy magazine_cycles_read on public.wms_magazine_cycles for select to authenticated using(private.magazine_allowed(warehouse_code));
create policy magazines_read on public.wms_magazines for select to authenticated using(private.magazine_readable(id,warehouse_code));
create policy magazine_versions_read on public.wms_magazine_versions for select to authenticated using(private.magazine_version_readable(id,warehouse_code));
create policy magazine_pages_read on public.wms_magazine_pages for select to authenticated using(private.magazine_version_readable(version_id,warehouse_code));
create policy magazine_items_read on public.wms_magazine_items for select to authenticated using(exists(select 1 from public.wms_magazine_pages p where p.id=page_id and private.magazine_version_readable(p.version_id,warehouse_code)));
create policy magazine_events_read on public.wms_magazine_events for select to authenticated using(private.magazine_allowed(warehouse_code,true));
create or replace function private.magazine_event_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Auditoria de revistas é imutável.';end$$;
create trigger magazine_event_immutable before update or delete on public.wms_magazine_events for each row execute function private.magazine_event_immutable();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('wms-magazines','wms-magazines',false,26214400,array['application/pdf']) on conflict(id) do nothing;
create policy magazines_pdf_read on storage.objects for select to authenticated using(bucket_id='wms-magazines' and exists(select 1 from public.wms_magazine_versions v where v.file_path=storage.objects.name and private.magazine_version_readable(v.id,v.warehouse_code)));
create policy magazines_pdf_upload on storage.objects for insert to authenticated with check(bucket_id='wms-magazines' and exists(select 1 from public.wms_magazine_versions v join public.wms_magazines m on m.id=v.magazine_id where v.file_path=storage.objects.name and v.upload_state='PENDING' and m.active_version=v.id and private.magazine_allowed(v.warehouse_code,true)));
create policy magazines_pdf_boundary_read on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'wms-magazines' or exists(select 1 from public.wms_magazine_versions v where v.file_path=storage.objects.name and private.magazine_version_readable(v.id,v.warehouse_code)));
create policy magazines_pdf_boundary_insert on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'wms-magazines' or exists(select 1 from public.wms_magazine_versions v join public.wms_magazines m on m.id=v.magazine_id where v.file_path=storage.objects.name and v.upload_state='PENDING' and m.active_version=v.id and private.magazine_allowed(v.warehouse_code,true)));
create policy magazines_pdf_boundary_update on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'wms-magazines') with check(bucket_id<>'wms-magazines');
create policy magazines_pdf_boundary_delete on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'wms-magazines');
-- No UPDATE, DELETE or public URLs: replacements always get a new object/version.

create or replace function private.act_wms_magazine(p_warehouse text,p_id uuid,p_action text,p_data jsonb,p_revision integer,p_action_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor text:=private.current_wms_profile_id();m public.wms_magazines;v public.wms_magazine_versions;p public.wms_magazine_pages;c public.wms_magazine_cycles;prior public.wms_magazine_events;
 output jsonb;old_items jsonb;row_data jsonb;official record;item_id uuid;new_version uuid;file_hash text;size_bytes bigint;pages integer;count_rows integer;physical integer;printed integer;state text;item_status text;item_kind text;item_code text;item_box jsonb;lease uuid;reason text;ts timestamptz:=clock_timestamp();
begin
 if not coalesce(private.magazine_allowed(p_warehouse,true),false) then raise exception using errcode='42501',message='Gerenciamento de revistas não autorizado neste estoque.';end if;
 if p_action_id is null or p_id is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>1000000 then raise exception 'Ação inválida ou grande demais.';end if;
 perform pg_advisory_xact_lock(hashtext('wms-magazine-catalogue'));
 select * into prior from public.wms_magazine_events where id=p_action_id;
 if found then if prior.actor_id<>actor or prior.warehouse_code<>p_warehouse or prior.action<>p_action or prior.payload->'request' is distinct from p_data or prior.payload->>'target'<>p_id::text then raise exception 'Identificador reutilizado para outra operação.';end if;return prior.result;end if;
 if p_action='CYCLE' then
  if length(trim(coalesce(p_data->>'code','')))=0 then raise exception 'Informe o código do ciclo.';end if;
  insert into public.wms_magazine_cycles(id,warehouse_code,code,starts_on,ends_on,capacity,created_by,updated_by) values(p_id,p_warehouse,trim(p_data->>'code'),(p_data->>'starts_on')::date,(p_data->>'ends_on')::date,coalesce((p_data->>'capacity')::integer,3),actor,actor) returning * into c;
  output:=jsonb_build_object('cycle',to_jsonb(c));
 else
  if p_action='CREATE' then
   insert into public.wms_magazines(id,warehouse_code,name,created_by,updated_by) values(p_id,p_warehouse,left(coalesce(nullif(p_data->>'name',''),p_data->>'file_name'),200),actor,actor) returning * into m;
  else select * into m from public.wms_magazines where id=p_id and warehouse_code=p_warehouse for update;if not found then raise exception using errcode='42501',message='Revista não encontrada neste estoque.';end if;
  end if;
  if p_action not in ('CLAIM','SAVE_PAGE','PAGE_ERROR','RELEASE','PAGE_MAP','REVIEW_PAGE','EDIT_ITEMS') and p_action<>'CREATE' and p_revision is distinct from m.revision then raise exception using errcode='40001',message='Revista alterada. Atualize antes de repetir.';end if;
  select * into v from public.wms_magazine_versions where id=m.active_version;
  if p_action in ('CREATE','REPLACE') then
   if m.status in ('PUBLISHED','PARTIAL') then raise exception 'PDF publicado não pode ser substituído. Cadastre uma nova edição.';end if;
   file_hash:=lower(p_data->>'sha256');size_bytes:=(p_data->>'byte_size')::bigint;pages:=(p_data->>'page_count')::integer;new_version:=(p_data->>'version_id')::uuid;
   if coalesce(p_data->>'file_name','')!~*'\.pdf$' then raise exception 'Aceitamos somente PDF.';end if;
   if (select coalesce(sum(byte_size),0) from public.wms_magazine_versions)+size_bytes>209715200 then raise exception 'Cota conservadora de 200 MB do módulo atingida. Verifique o plano antes de ampliar.';end if;
   insert into public.wms_magazine_versions(id,magazine_id,warehouse_code,version,original_name,file_path,sha256,byte_size,page_count,created_by,updated_by)
   values(new_version,m.id,p_warehouse,(select coalesce(max(version),0)+1 from public.wms_magazine_versions where magazine_id=m.id),left(p_data->>'file_name',200),p_warehouse||'/'||m.id::text||'/'||new_version::text||'.pdf',file_hash,size_bytes,pages,actor,actor) returning * into v;
   update public.wms_magazines set active_version=v.id,status='DRAFT' where id=m.id;
  elsif p_action='CONFIRM_UPLOAD' then
   if v.id is null or not exists(select 1 from storage.objects o where o.bucket_id='wms-magazines' and o.name=v.file_path and (o.metadata->>'size')::bigint=v.byte_size and o.metadata->>'mimetype'='application/pdf') then raise exception 'Upload ainda não confirmado ou metadados do PDF divergentes.';end if;
   update public.wms_magazine_versions set upload_state='READY',updated_by=actor,updated_at=ts where id=v.id returning * into v;
   insert into public.wms_magazine_pages(version_id,warehouse_code,physical_number,created_by,updated_by) select v.id,p_warehouse,g,actor,actor from generate_series(1,v.page_count) g on conflict(version_id,physical_number) do nothing;
  elsif p_action='METADATA' then
   if m.status in ('PUBLISHED','PARTIAL') then raise exception 'Retire a publicação antes de alterar os metadados.';end if;
   select * into c from public.wms_magazine_cycles where id=(p_data->>'cycle_id')::uuid and warehouse_code=p_warehouse;if not found then raise exception 'Selecione um ciclo deste estoque.';end if;
   if (select count(*) from public.wms_magazines where cycle_id=c.id and id<>m.id)>=c.capacity then raise exception 'Limite de revistas deste ciclo atingido.';end if;
   if exists(select 1 from public.wms_magazines other join public.wms_magazine_cycles oc on oc.id=other.cycle_id where other.id<>m.id and other.warehouse_code=p_warehouse and other.cycle_id<>c.id and lower(trim(other.name))=lower(trim(p_data->>'name')) and lower(trim(other.brand))=lower(trim(p_data->>'brand')) and oc.starts_on<=c.ends_on and oc.ends_on>=c.starts_on) and (not coalesce((p_data->>'allow_overlap')::boolean,false) or trim(coalesce(p_data->>'reason',''))='') then raise exception 'Ciclos conflitantes da mesma revista. A exceção administrativa exige motivo explícito.';end if;
   update public.wms_magazines set cycle_id=c.id,name=trim(p_data->>'name'),brand=left(trim(coalesce(p_data->>'brand','')),120),notes=left(coalesce(p_data->>'notes',''),2000) where id=m.id;
  elsif p_action='UNPUBLISH' then update public.wms_magazines set status='REVIEW' where id=m.id;
  elsif p_action in ('PUBLISH','PARTIAL') then
   if m.cycle_id is null or trim(m.brand)='' or v.upload_state<>'READY' then raise exception 'Complete ciclo, marca e upload antes de publicar.';end if;
   if not exists(select 1 from public.wms_magazine_pages where version_id=v.id and processing_status='PROCESSED' and printed_number is not null and mapping_verified) then raise exception 'Nenhuma página processada e com numeração validada.';end if;
   if p_action='PUBLISH' and exists(select 1 from public.wms_magazine_pages where version_id=v.id and (review_status<>'REVISADA' or not mapping_verified or (required and processing_status<>'PROCESSED'))) then raise exception 'Todas as páginas exigidas precisam estar processadas, numeradas e revisadas.';end if;
   update public.wms_magazines set status=case when p_action='PUBLISH' then 'PUBLISHED' else 'PARTIAL' end where id=m.id;
  elsif p_action='MAP_OFFSET' then
   if m.status in ('PUBLISHED','PARTIAL') then raise exception 'Retire a publicação antes de alterar a numeração.';end if;
   if (p_data->>'first_physical')::integer not between 1 and v.page_count or (p_data->>'first_printed')::integer<1 then raise exception 'Deslocamento inválido.';end if;
   update public.wms_magazine_pages set printed_number=null where version_id=v.id;
   update public.wms_magazine_pages set printed_number=case when physical_number>=(p_data->>'first_physical')::integer then physical_number-(p_data->>'first_physical')::integer+(p_data->>'first_printed')::integer else null end,mapping_verified=coalesce((p_data->>'verified')::boolean,false),review_status='PENDENTE',revision=revision+1,updated_by=actor,updated_at=ts where version_id=v.id;
  elsif p_action in ('CLAIM','SAVE_PAGE','PAGE_ERROR','RELEASE','PAGE_MAP','REVIEW_PAGE','EDIT_ITEMS') then
   if m.status in ('PUBLISHED','PARTIAL') then raise exception 'Retire a publicação antes de alterar páginas.';end if;
   if v.upload_state<>'READY' or v.id is distinct from (p_data->>'version_id')::uuid then raise exception 'Versão do PDF mudou ou upload incompleto.';end if;
   physical:=(p_data->>'physical_number')::integer;select * into p from public.wms_magazine_pages where version_id=v.id and physical_number=physical for update;if not found then raise exception 'Página física inválida.';end if;
   if p_action='CLAIM' then
    lease:=(p_data->>'lease_id')::uuid;if lease is null then raise exception 'Identificador do processamento obrigatório.';end if;
    if p.lease_until>ts and p.lease_id is distinct from lease then raise exception using errcode='40001',message='Esta página está sendo processada em outra sessão. Aguarde ou cancele a sessão anterior.';end if;
    update public.wms_magazine_pages set processing_status='PROCESSING',review_status='PENDENTE',lease_id=lease,lease_actor=actor,lease_until=ts+interval '5 minutes',revision=revision+1,updated_by=actor,updated_at=ts where id=p.id returning * into p;
    update public.wms_magazines set status='PROCESSING' where id=m.id;
   elsif p_action in ('RELEASE','PAGE_ERROR') then
    if p.lease_actor is distinct from actor or p.lease_id is distinct from (p_data->>'lease_id')::uuid then raise exception 'Sessão de processamento não corresponde.';end if;
    update public.wms_magazine_pages set processing_status=case when p_action='PAGE_ERROR' then 'ERROR' else 'PENDING' end,review_status='PENDENTE',error=left(coalesce(p_data->>'error',''),600),lease_id=null,lease_until=null,revision=revision+1,updated_by=actor,updated_at=ts where id=p.id returning * into p;
    update public.wms_magazines set status='REVIEW' where id=m.id;
   else
    if p.revision is distinct from (p_data->>'page_revision')::integer then raise exception using errcode='40001',message='Página alterada. Atualize a revisão.';end if;
    if p_action='PAGE_MAP' then
     printed:=nullif(p_data->>'printed_number','')::integer;reason:=trim(coalesce(p_data->>'skip_reason',''));
     if printed is null and reason='' then raise exception 'Página sem numeração precisa de motivo (ex.: capa).';end if;
     update public.wms_magazine_pages set printed_number=printed,mapping_verified=true,required=printed is not null,skip_reason=reason,review_status='PENDENTE',revision=revision+1,updated_by=actor,updated_at=ts where id=p.id returning * into p;
    elsif p_action='REVIEW_PAGE' then
     if not p.mapping_verified or (p.required and p.processing_status<>'PROCESSED') or exists(select 1 from public.wms_magazine_items where page_id=p.id and status='REVISAR') then raise exception 'Confirme a numeração, processe e resolva os códigos duvidosos antes de revisar.';end if;
     if not coalesce((p_data->>'confirm_complete')::boolean,false) then raise exception 'Confirme que comparou todos os produtos com o original.';end if;
     update public.wms_magazine_items set reviewed=true,updated_by=actor,updated_at=ts where page_id=p.id;
     update public.wms_magazine_pages set review_status='REVISADA',revision=revision+1,updated_by=actor,updated_at=ts where id=p.id returning * into p;
    else
     if p_action='SAVE_PAGE' and (p.lease_id is distinct from (p_data->>'lease_id')::uuid or p.lease_actor is distinct from actor or p.lease_until<ts) then raise exception using errcode='40001',message='Sessão da página expirada. Retome o processamento.';end if;
     if jsonb_typeof(p_data->'items')<>'array' or jsonb_array_length(p_data->'items')>300 then raise exception 'Página deve conter até 300 ocorrências.';end if;
     select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into old_items from public.wms_magazine_items x where page_id=p.id;
     delete from public.wms_magazine_items where page_id=p.id;
     if (select count(*) from public.wms_magazine_items)+jsonb_array_length(p_data->'items')>100000 then raise exception 'Limite conservador do índice atingido. Verifique a capacidade do banco.';end if;
     for row_data in select value from jsonb_array_elements(p_data->'items') loop
      item_code:=trim(row_data->>'sku');item_kind:=row_data->>'kind';item_status:=coalesce(row_data->>'status','REVISAR');item_box:=nullif(row_data->'box','null'::jsonb);
      if item_box is not null and (jsonb_typeof(item_box)<>'array' or jsonb_array_length(item_box)<>4) then raise exception 'Região inválida.';end if;
      if item_box is not null and exists(select 1 from jsonb_array_elements_text(item_box) b where b::numeric<0 or b::numeric>1) then raise exception 'Região fora da página.';end if;
      select sku,product_name into official from public.wms_products where sku=item_code limit 1;
      if not found then select sku,product_name into official from public.wms_products where ltrim(sku,'0')=ltrim(item_code,'0') order by length(sku) desc limit 1;end if;
      if item_kind='INDEFINIDO' then item_status:='REVISAR';elsif official.sku is null then item_status:='NAO_ENCONTRADO';end if;
      insert into public.wms_magazine_items(page_id,warehouse_code,sku,extracted_description,official_description,catalog_sku,kind,box,visual_order,status,reason,reviewed,source,confidence,created_by,updated_by)
      values(p.id,p_warehouse,item_code,left(coalesce(row_data->>'extracted_description',''),400),coalesce(official.product_name,''),official.sku,item_kind,item_box,coalesce((row_data->>'visual_order')::integer,0),item_status,left(coalesce(row_data->>'reason',''),600),p_action='EDIT_ITEMS',left(coalesce(row_data->>'source','MANUAL'),20),(row_data->>'confidence')::numeric,actor,actor);
     end loop;
     update public.wms_magazine_pages set processing_status='PROCESSED',review_status='PENDENTE',error='',source=left(coalesce(p_data->>'source',source),20),lease_id=null,lease_until=null,revision=revision+1,updated_by=actor,updated_at=ts where id=p.id returning * into p;
     update public.wms_magazines set status='REVIEW' where id=m.id;
    end if;
   end if;
  else raise exception 'Ação de revista desconhecida.';
  end if;
  update public.wms_magazines set revision=revision+1,updated_at=ts,updated_by=actor where id=m.id returning * into m;
  output:=jsonb_build_object('magazine',to_jsonb(m),'version',to_jsonb(v),'page',case when p.id is not null then to_jsonb(p) else null end);
 end if;
 insert into public.wms_magazine_events(id,warehouse_code,actor_id,action,magazine_id,payload,result) values(p_action_id,p_warehouse,actor,p_action,case when m.id is not null then m.id else null end,jsonb_build_object('request',p_data,'target',p_id,'previous_items',old_items),output);
 return output;
end$$;
revoke all on function private.act_wms_magazine(text,uuid,text,jsonb,integer,uuid) from public,anon;
grant execute on function private.act_wms_magazine(text,uuid,text,jsonb,integer,uuid) to authenticated;
create function public.act_wms_magazine(p_warehouse text,p_id uuid,p_action text,p_data jsonb,p_revision integer,p_action_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.act_wms_magazine(p_warehouse,p_id,p_action,p_data,p_revision,p_action_id)$$;
revoke all on function public.act_wms_magazine(text,uuid,text,jsonb,integer,uuid) from public,anon;
grant execute on function public.act_wms_magazine(text,uuid,text,jsonb,integer,uuid) to authenticated;
