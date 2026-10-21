-- CP Alamo only. Additive public identity; canonical integration codes stay unchanged.
alter table public.wms_transfers
  add column public_number bigint generated always as identity;
alter table public.wms_transfers
  add constraint wms_transfers_public_number_unique unique (public_number);

create function public.wms_protect_transfer_public_number()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.public_number is distinct from old.public_number then
    raise exception 'O codigo publico da transferencia e permanente.';
  end if;
  return new;
end;
$$;
create trigger protect_transfer_public_number
before update of public_number on public.wms_transfers
for each row execute function public.wms_protect_transfer_public_number();
