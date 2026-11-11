/**
 * Read-only projection for shelf contents. Inventory totals are only exposed
 * if a CAPTACAO stock position explicitly reports an available quantity.
 */
export function uniqueShelfProducts(bindings){
  const seen=new Set(),result=[];
  for(const binding of bindings||[]){
    const sku=String(binding?.sku??'').trim();
    if(!sku||seen.has(sku))continue;
    seen.add(sku);
    result.push(binding);
  }
  return result;
}

export function shelfAvailableBySku(stockPositions){
  const totals=Object.create(null);
  for(const row of stockPositions||[]){
    const sku=String(row?.codigo_material??'').trim();
    if(!sku||row?.total_disponivel==null||String(row.total_disponivel).trim()==='')continue;
    const quantity=Number(row.total_disponivel);
    if(!Number.isFinite(quantity))continue;
    totals[sku]=(totals[sku]??0)+quantity;
  }
  return totals;
}

export function formatShelfQuantity(quantities,sku){
  const code=String(sku??'').trim();
  if(!Object.hasOwn(quantities||{},code))return 'Não informado';
  return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(quantities[code]);
}
