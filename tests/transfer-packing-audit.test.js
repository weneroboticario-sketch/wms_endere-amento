import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePacking,packingAuditReport,packingAuditExport} from '../src/transfer-packing-audit.js';
const item=(changes={})=>({id:'i',sku:'01314',requestedQty:4,separatedQty:4,packedQty:4,unit:'UN',...changes});
function event(type,before,after,revision,changes={}){return {id:String(revision),item_id:'i',audit_version:1,event_type:type,quantity:after-before,quantity_before:before,quantity_after:after,quantity_method:type==='LEITURA_UNITARIA'?'UNITARIA':'MANUAL',code_method:'MODO_SCANNER',created_at:`2026-11-09T12:00:0${revision}Z`,payload:{revision_before:revision-1,revision_after:revision,code_reads:type==='LEITURA_UNITARIA'||type==='LEITURA_SKU'?1:0},...changes};}
test('four unitary operations are four units; one code read plus manual four is not',()=>{
 const unitary=reconcilePacking(item({packingRevision:4}),[1,2,3,4].map(i=>event('LEITURA_UNITARIA',i-1,i,i)));
 assert.equal(unitary.unitary,4);assert.equal(unitary.manual,0);assert.equal(unitary.codeReads,4);assert.equal(unitary.traceable,true);
 const manual=reconcilePacking(item({packingRevision:2}),[event('LEITURA_SKU',0,0,1,{quantity_method:'SEM_QUANTIDADE'}),event('QUANTIDADE_MANUAL',0,4,2)]);
 assert.equal(manual.unitary,0);assert.equal(manual.manual,4);assert.equal(manual.codeReads,1);assert.equal(manual.status,'OK — MANUAL');
});
test('correction preserves signed adjustment and reconciles net quantities without double counting',()=>{
 const r=reconcilePacking(item({packedQty:3,packingRevision:2}),[event('QUANTIDADE_MANUAL',0,4,1),event('AJUSTE_QUANTIDADE',4,3,2,{quantity_method:'AJUSTE'})]);
 assert.equal(r.manual,3);assert.equal(r.adjustments,-1);assert.equal(r.packed,3);assert.equal(r.missing,1);assert.equal(r.excess,0);
 assert.equal(reconcilePacking(item({packedQty:5}),[]).excess,1);
});
test('historical HYPE remains 24 untracked, with no invented scans despite stale sent fields',()=>{
 const rows=[['49878',4],['51173',4],['53386',2],['59845',4],['72052',8],['94200',2]].map(([sku,qty])=>item({id:sku,sku,requestedQty:qty,separatedQty:qty,packedQty:qty,sentQty:0,difference:-qty}));
 const r=packingAuditReport(rows,[]);assert.equal(r.totals.packed,24);assert.equal(r.totals.untracked,24);assert.equal(r.totals.unitary,0);assert.equal(r.totals.codeReads,0);assert.equal(r.traceable,false);
 assert.match(r.label,/HISTÓRICO DE ENTRADA INDISPONÍVEL/);assert.equal(packingAuditExport({code:'HYPE'},r).history.length,0);
});
test('CX conversions respect 3 x 24, mixed actual units, and unknown conversions never mix CX with UN',()=>{
 const box=item({quantityType:'CAIXA',unit:'CX',requestedQty:3,packedQty:3,separatedQty:3,unitsPerBox:24});
 assert.equal(reconcilePacking(box).packed,72);assert.equal(reconcilePacking(box).difference,0);
 assert.equal(reconcilePacking({...box,packedUnits:70}).missing,2);
 const unknown=reconcilePacking({...box,unitsPerBox:0});assert.equal(unknown.expected,null);assert.equal(unknown.difference,null);assert.equal(unknown.unit,'CX');
 const report=packingAuditReport([item(),{...box,unitsPerBox:0}],[]);assert.equal(report.totals.packed,null);assert.equal(report.totals.expected,null);
});
test('extra, missing audit, invalid event chain and false unitary claims cannot be marked correct',()=>{
 assert.equal(reconcilePacking(item({isExtra:true})).status,'ITEM EXTRA');
 assert.equal(reconcilePacking(item({packingRevision:1}),[]).status,'REGISTRO INCOMPLETO');
 assert.equal(reconcilePacking(item(),[event('QUANTIDADE_MANUAL',0,3,1)]).broken,true);
 assert.equal(reconcilePacking(item(),[event('LEITURA_UNITARIA',0,4,1)]).broken,true);
});
