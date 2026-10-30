-- Isolated additive migration. No messages or operational rows are modified.
create table if not exists public.wms_caixa_message_reads (
 request_id uuid not null references public.wms_caixa_requests(id) on delete cascade,
 user_id uuid not null,
 last_message_id bigint not null check (last_message_id>0),
 read_at timestamptz not null default now(),
 primary key(request_id,user_id)
);
alter table public.wms_caixa_message_reads enable row level security;
revoke all on public.wms_caixa_message_reads from public,anon,authenticated;
grant select on public.wms_caixa_message_reads to authenticated;
drop policy if exists caixa_reads_self on public.wms_caixa_message_reads;
create policy caixa_reads_self on public.wms_caixa_message_reads for select to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.wms_caixa_requests r where r.id=request_id and private.can_access_wms_caixa_chat(r.id,r.warehouse_code)));

create or replace function private.mark_wms_caixa_read(request_key uuid,message_key bigint) returns text
language plpgsql security definer set search_path='' as $$
declare code text; marker bigint;
begin
 if auth.uid() is null or private.current_wms_profile_id() is null then raise exception using errcode='42501',message='Sessão inválida.'; end if;
 select warehouse_code into code from public.wms_caixa_requests where id=request_key;
 if private.can_access_wms_caixa_chat(request_key,code) is distinct from true then raise exception using errcode='42501',message='Conversa não autorizada.'; end if;
 if not exists(select 1 from public.wms_caixa_request_messages where id=message_key and request_id=request_key) then raise exception 'Mensagem não pertence à conversa.'; end if;
 insert into public.wms_caixa_message_reads(request_id,user_id,last_message_id)
 values(request_key,auth.uid(),message_key)
 on conflict(request_id,user_id) do update set last_message_id=greatest(wms_caixa_message_reads.last_message_id,excluded.last_message_id),read_at=case when excluded.last_message_id>wms_caixa_message_reads.last_message_id then now() else wms_caixa_message_reads.read_at end
 returning last_message_id into marker;
 return marker::text;
end $$;
revoke all on function private.mark_wms_caixa_read(uuid,bigint) from public,anon,authenticated;
grant execute on function private.mark_wms_caixa_read(uuid,bigint) to authenticated;
create or replace function public.mark_wms_caixa_read(request_key uuid,message_key bigint) returns text
language sql security invoker set search_path='' as $$ select private.mark_wms_caixa_read(request_key,message_key); $$;
revoke all on function public.mark_wms_caixa_read(uuid,bigint) from public,anon,authenticated;
grant execute on function public.mark_wms_caixa_read(uuid,bigint) to authenticated;

create or replace function public.list_wms_caixa_unread(code text)
returns table(request_id uuid,unread_count bigint,last_read_id text)
language sql stable security invoker set search_path='' as $$
 select r.id,count(m.id),coalesce(receipt.last_message_id::text,'0')
 from public.wms_caixa_requests r
 left join public.wms_caixa_message_reads receipt on receipt.request_id=r.id and receipt.user_id=(select auth.uid())
 left join public.wms_caixa_request_messages m on m.request_id=r.id
  and m.sender_id<>(select private.current_wms_profile_id())
  and m.id>coalesce(receipt.last_message_id,0)
  and m.created_at>coalesce((select max(e.created_at) from public.wms_caixa_request_events e where e.request_id=r.id and e.event_type='CONFIRM'),'-infinity'::timestamptz)
 where r.warehouse_code=code and r.confirmed_at is null
  and r.status not in ('CONCLUIDO','CANCELADO','ENTREGUE_NA_LOJA','SEM_ESTOQUE')
  and private.can_access_wms_caixa_chat(r.id,r.warehouse_code)
  and (r.requested_by=(select private.current_wms_profile_id())
   or (r.kind='ADJUSTMENT' and r.claimed_by=(select private.current_wms_profile_id()))
   or (r.kind='PRODUCT' and exists(select 1 from public.wms_replenishment_requests p where p.id=r.replenishment_id and p.warehouse_code=r.warehouse_code and coalesce(nullif(p.responsavel_id,''),nullif(p.claimed_by_id,''))=(select private.current_wms_profile_id()))))
 group by r.id,receipt.last_message_id;
$$;
revoke all on function public.list_wms_caixa_unread(text) from public,anon,authenticated;
grant execute on function public.list_wms_caixa_unread(text) to authenticated;
