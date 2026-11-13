import test from 'node:test';import assert from 'node:assert/strict';
import {cycleState,validateDates,mapPrintedPage,pageRange,extractMagazineCodes,groupPageItems,supplySituation,cycleMetrics,validateExtracted,validatePdfFile} from '../src/magazines-domain.js';
test('cycles follow Cuiaba date including year changes, and printed pages use explicit mapping',()=>{
 const cycle={starts_on:'2027-01-01',ends_on:'2027-01-31'};
 assert.equal(cycleState(cycle,new Date('2027-01-01T02:00:00Z')).status,'PROGRAMADO');assert.equal(cycleState(cycle,new Date('2027-01-01T04:00:00Z')).status,'ATIVO');assert.equal(cycleState(cycle,new Date('2027-02-01T04:00:00Z')).status,'ENCERRADO');
 assert.equal(cycleState(null).status,'RASCUNHO');assert.equal(mapPrintedPage(3,3,1),1);assert.equal(mapPrintedPage(96,3,1),94);assert.equal(mapPrintedPage(1,3,1),null);assert.throws(()=>validateDates('2027-02-30','2027-03-01'));assert.throws(()=>pageRange(100,94));assert.throws(()=>pageRange(1,100));
});
test('dynamic layouts retain zeroes, product/refill/combo identity and occurrence order without inventing missing codes',()=>{
 const spans=[{text:'Cod. 01314',box:[.1,.2,.2,.03]},{text:'Refil Cod. 48061',box:[.65,.5,.25,.03]},{text:'Combo Cod. 99999',box:[.1,.75,.3,.03]},{text:'R$ 129,90 100ml 50%',box:[.7,.85,.2,.03]}];
 for(const shift of [0,.02]){const rows=extractMagazineCodes(spans.map(s=>({...s,box:[s.box[0],s.box[1]-shift,s.box[2],s.box[3]]})));assert.deepEqual(rows.map(r=>r.sku),['01314','48061','99999']);assert.deepEqual(rows.map(r=>r.kind),['PRODUTO','REFIL','COMBO']);}
 const rows=validateExtracted(extractMagazineCodes(spans),new Map([['1314',{sku:'01314',name:'Oficial'}]]));assert.equal(rows[0].status,'VALIDADO');assert.equal(rows[1].status,'NAO_ENCONTRADO');assert.equal(rows[1].sku,'48061');
 assert.deepEqual(extractMagazineCodes([{text:'Creme sem código legível',box:[.1,.1,.5,.1]}]),[]);
});
test('kits near individual products are ambiguous rather than automatically assigned to components',()=>{
 const rows=extractMagazineCodes([{text:'KIT PROMOCIONAL',box:[.2,.2,.25,.03]},{text:'Cod. 48060',box:[.2,.24,.2,.03]}]);assert.equal(rows[0].kind,'INDEFINIDO');assert.equal(rows[0].status,'REVISAR');
});
test('repeated occurrences group within a consultation but retain pages and do not double count metrics',()=>{
 const rows=[{sku:'01314',printed_number:94,status:'VALIDADO'},{sku:'1314',printed_number:95,status:'VALIDADO'},{sku:'48060',printed_number:95,status:'REVISAR'}];const groups=groupPageItems(rows);assert.equal(groups.length,2);assert.deepEqual(groups[0].pages,[94,95]);assert.equal(groups[0].occurrences.length,2);assert.equal(groups[1].eligible,false);
 const metrics=cycleMetrics([{sku:'01314',stock:{storeFound:true,storeAvailable:0,captureFound:true,captureAvailable:5,location:'R01'}},{sku:'1314',stock:{storeFound:true,storeAvailable:0,captureFound:true,captureAvailable:5,location:'R01'}}]);assert.equal(metrics.products,1);assert.equal(metrics.storeZero,1);
});
test('balances distinguish missing, zero, negative, stale and errors; no minimum is invented',()=>{
 assert.match(supplySituation({storeFound:false,captureFound:false}).labels.join(' '),/SEM INFORMAÇÃO/);
 const s={storeFound:true,storeAvailable:0,captureFound:true,captureAvailable:5,location:'R01',stale:true,pending:[{id:'existing'}]};assert.equal(supplySituation(s).suggested,null);assert.equal(supplySituation(s,3).suggested,3);assert.equal(supplySituation(s).highlight,true);
 assert.match(supplySituation({...s,storeAvailable:-1}).labels.join(' '),/NEGATIVO/);assert.equal(supplySituation({error:'offline'}).eligible,false);assert.equal(cycleMetrics([{sku:'1',stock:{error:'offline'}}]).unlocated,0);
});
test('only actual PDF signatures and allowed sizes pass preliminary validation',async()=>{
 const file={name:'revista.pdf',type:'application/pdf',size:20,slice:()=>({arrayBuffer:async()=>new TextEncoder().encode('%PDF-1.7 fake test').buffer})};await validatePdfFile(file);
 await assert.rejects(validatePdfFile({...file,name:'revista.png'}),/somente/);await assert.rejects(validatePdfFile({...file,size:30*1024*1024}),/25 MB/);await assert.rejects(validatePdfFile({...file,slice:()=>({arrayBuffer:async()=>new TextEncoder().encode('not a PDF').buffer})}),/assinatura/);
});
