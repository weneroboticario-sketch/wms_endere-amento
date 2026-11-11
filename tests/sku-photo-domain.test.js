import test from 'node:test';import assert from 'node:assert/strict';
import {barcodeCandidate,textSkuCandidates,validGtin,resolvePhotoCandidates,uniquePhotoCandidates,validatePhotoFile} from '../src/sku-photo-domain.js';
test('printed SKU keeps zeroes; lot, expiry, price and size are excluded even across lines',()=>{
 const lines=['SKU: 01314','LOTE: 48060','VAL 11/2027','400 ml','R$ 48060','LOTE','48061','48062'].map(text=>({text,confidence:95}));
 assert.deepEqual(textSkuCandidates(lines).map(r=>r.code),['01314','48062']);
 assert.equal(textSkuCandidates([{text:'SKU 01314',confidence:20}]).length,0);
 assert.equal(textSkuCandidates([{text:'SKU O1314',confidence:99}]).length,0);
});
test('GTIN is checked and classified separately; no numeric substring becomes an internal SKU',()=>{
 assert.equal(validGtin('4006381333931'),true);assert.equal(validGtin('036000291452'),true);assert.equal(validGtin('4006381333932'),false);
 assert.equal(barcodeCandidate('4006381333931','EAN_13').kind,'GTIN');assert.equal(barcodeCandidate('4006381333932','EAN_13').kind,'INVALID');
 assert.equal(barcodeCandidate('01314','CODE_128').code,'01314');assert.equal(barcodeCandidate('ABC123','CODE_128'),null);
 assert.equal(barcodeCandidate('01234565','UPC_E').kind,'UNSUPPORTED');
});
test('one validated SKU queries automatically; several candidates, unknowns and failed validation never invent a result',async()=>{
 const lookup=async c=>c.kind==='SKU'&&['01314','48060'].includes(c.code)?[{sku:c.code,product_name:'Produto '+c.code}]:[];
 const one=await resolvePhotoCandidates([{code:'01314',kind:'SKU',source:'OCR'}],lookup);assert.equal(one.auto.sku,'01314');
 const many=await resolvePhotoCandidates([{code:'01314',kind:'SKU'},{code:'48060',kind:'SKU'}],lookup);assert.equal(many.products.length,2);assert.equal(many.auto,null);
 const unknown=await resolvePhotoCandidates([{code:'99999',kind:'SKU'},{code:'4006381333931',kind:'GTIN'}],lookup);assert.equal(unknown.products.length,0);assert.equal(unknown.unknown.length,2);
 const failed=await resolvePhotoCandidates([{code:'01314',kind:'SKU'},{code:'48060',kind:'SKU'}],async c=>{if(c.code==='48060')throw Error('network');return lookup(c);});assert.equal(failed.auto,null);assert.equal(failed.errors.length,1);
 const truncated=await resolvePhotoCandidates([{code:'01314',kind:'SKU'}],lookup,()=>true,{truncated:true});assert.equal(truncated.auto,null);
});
test('an explicit GTIN mapping is used only after lookup and a changed warehouse discards pending results',async()=>{
 const result=await resolvePhotoCandidates([{code:'4006381333931',kind:'GTIN',source:'BARCODE'}],async()=>[{sku:'01314',product_name:'Produto real'}]);assert.equal(result.auto.sku,'01314');
 let current=true;await assert.rejects(resolvePhotoCandidates([{code:'01314',kind:'SKU'}],async()=>{current=false;return [{sku:'01314',product_name:'Produto'}];},()=>current),/estoque mudou/);
 assert.equal(uniquePhotoCandidates(Array.from({length:30},(_,i)=>({code:String(i+10000),kind:'SKU'}))).truncated,true);
});
test('invalid and oversized photos are rejected without uploading',()=>{
 assert.throws(()=>validatePhotoFile({type:'application/pdf',size:10}));assert.throws(()=>validatePhotoFile({type:'image/jpeg',size:20*1024*1024}));assert.doesNotThrow(()=>validatePhotoFile({type:'image/png',size:100}));
});
