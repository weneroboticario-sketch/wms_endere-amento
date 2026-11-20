import {validGtin} from './sku-photo-domain.js';

/** Use the authenticated warehouse registry; never infer a SKU from an EAN substring. */
export async function resolveTransferScanSku(raw,{items=[],client,warehouse,isSameSku}){
 const code=String(raw??'').trim();
 if(!code)return '';
 const numeric=/^\d+$/.test(code);
 const existing=numeric&&items.some(item=>isSameSku(item.sku,code));
 const shortGtin=code.length===8&&validGtin(code)&&!existing;
 const longerBarcode=numeric&&code.length>8;
 if(!shortGtin&&!longerBarcode)return code;
 if(!validGtin(code))throw new Error('Código de barras inválido. Confira o EAN e tente novamente.');
 if(!client?.rpc||!warehouse)throw new Error('Não foi possível validar o EAN no estoque atual.');
 const response=await client.rpc('lookup_wms_sku_photo',{p_warehouse:warehouse,p_code:code,p_kind:'GTIN'});
 if(response.error)throw response.error;
 if(!Array.isArray(response.data)||response.data.length===0)
   throw new Error('EAN sem vínculo validado neste estoque. Cadastre o código na Consulta de SKU ou digite o SKU curto.');
 if(response.data.length!==1)throw new Error('EAN associado a mais de um SKU. Solicite revisão antes de bipar.');
 const sku=String(response.data[0]?.sku||'').trim();
 if(!sku||!items.some(item=>isSameSku(item.sku,sku)))
   throw new Error('EAN válido, mas o produto não consta nesta transferência. Confira o SKU antes de registrar um item extra.');
 return sku;
}
