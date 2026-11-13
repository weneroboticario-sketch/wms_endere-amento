-- Accept nItem attribute and element without changing inventory or existing receipts.
create or replace function private.import_wms_inbound(p_warehouse text,p_xml text,p_action_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 actor text:=private.current_wms_profile_id(); actor_name text; doc xml; info xml; part xml; product xml;
 key text; dest text; receipt uuid; n integer:=0; q numeric; qt numeric; u text; ut text; line integer; attribute_line text; child_line text;
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
  attribute_line:=nullif(trim(private.inbound_xml_text(part,'/*/@nItem')),'');
  child_line:=nullif(trim(private.inbound_xml_text(part,'/*/*[local-name()="nItem"]')),'');
  if attribute_line is not null and child_line is not null and attribute_line<>child_line then raise exception 'Número de item conflitante no XML.'; end if;
  if coalesce(attribute_line,child_line,'') !~ '^[0-9]{1,9}$' then raise exception 'Número de item ausente ou inválido no XML.'; end if;
  line:=coalesce(attribute_line,child_line)::integer;
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
