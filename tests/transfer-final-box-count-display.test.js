import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('supervisor conference progress shows final boxes from persisted transfer',async()=>{
 const script=await readFile(new URL('../script.js',import.meta.url),'utf8');
 const start=script.indexOf('function renderAdminTransferProgress(');
 const end=script.indexOf('function renderTransferFinalReport(',start);
 assert.ok(start>=0&&end>start);
 const progress=script.slice(start,end);
 assert.match(progress,/summaryChip\("Caixas finais", isFinalTransferStatus\(transfer.status\) \? formatQty\(Number\(transfer.totalBoxes \|\| 0\)\)/);
 assert.match(script,/totalBoxes: Number\(row.total_caixas \|\| row.final_box_count \|\| row.total_boxes \|\| 0\)/);
});
test('outbound packing audit and PDF summary show the saved final box count',async()=>{
 const view=await readFile(new URL('../src/transfer-packing-view.js',import.meta.url),'utf8');
 assert.match(view,/\['Caixas finais',Number\(t.totalBoxes \?\? t.finalBoxCount \?\? 0\)\]/);
 assert.match(view,/el\('transferFinalReportSummary'\)\.innerHTML/);
 assert.match(view,/const exportHtml=/);
});
