import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveTransferScanSku} from '../src/transfer-scan-resolver.js';
import {validGtin} from '../src/sku-photo-domain.js';
const same=(a,b)=>String(a).replace(/^0+/,'')===String(b).replace(/^0+/,'');
const items=[{sku:'89678'},{sku:'01314'}],gtin='7891033896783';
test('SKU short and leading zeros avoid EAN network requests',async()=>{
 let calls=0;const client={rpc:async()=>{calls++;return {data:[]};}};
 assert.equal(await resolveTransferScanSku('01314',{items,client,warehouse:'VDCG',isSameSku:same}),'01314');
 assert.equal(calls,0);
});
test('validated warehouse EAN resolves the matching transfer SKU',async()=>{
 assert.equal(validGtin(gtin),true);
 const calls=[];const sku=await resolveTransferScanSku(gtin,{items,client:{rpc:async(name,args)=>{calls.push({name,args});return {data:[{sku:'89678'}]};}},warehouse:'VDCG',isSameSku:same});
 assert.equal(sku,'89678');
 assert.equal(calls[0].name,'lookup_wms_sku_photo');
 assert.equal(calls[0].args.p_warehouse,'VDCG');
 assert.equal(calls[0].args.p_code,gtin);
});
test('unlinked, invalid, ambiguous and foreign SKU GTIN never invent a match',async()=>{
 const client=data=>({rpc:async()=>({data})}),base={items,warehouse:'VDCG',isSameSku:same};
 await assert.rejects(resolveTransferScanSku(gtin,{...base,client:client([])}),/sem vínculo/);
 await assert.rejects(resolveTransferScanSku(gtin,{...base,client:client([{sku:'89678'},{sku:'01314'}])}),/mais de um SKU/);
 await assert.rejects(resolveTransferScanSku(gtin,{...base,client:client([{sku:'99999'}])}),/não consta nesta transferência/);
 await assert.rejects(resolveTransferScanSku('7891033896784',{...base,client:client([{sku:'89678'}])}),/inválido/);
});
test('transfer camera opens in one tap without uploading files and guards simultaneous requests',async()=>{
 const [camera,script]=await Promise.all([readFile(new URL('../src/transfer-barcode-camera.js',import.meta.url),'utf8'),readFile(new URL('../script.js',import.meta.url),'utf8')]);
 assert.match(camera,/dialog\.showModal\(\);\s*void start\(\);/);
 assert.match(camera,/getUserMedia\(/);
 assert.match(camera,/scanner\.scan\(canvas\)/);
 assert.doesNotMatch(camera,/data-gallery|input type="file"/);
 assert.match(script,/openTransferBarcodeScanner\(/);
 assert.match(script,/transferState\.scanProcessing/);
 assert.match(script,/resolveTransferScanSku\(rawInput/);
});
