import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('camera button is available to the main barcode entry points',async()=>{
 const [camera,html]=await Promise.all([read('../src/universal-barcode-camera.js'),read('../index.html')]);
 for(const id of ['dashboardSkuQuickInput','skuInput','locationInput','replenishmentSkuInput']){
  assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(camera,new RegExp("'"+id+"'"));
 }
 assert.match(html,/src="\/src\/universal-barcode-camera\.js"/);
});
test('existing specialized scanners remain separate',async()=>{
 const camera=await read('../src/universal-barcode-camera.js');
 assert.match(camera,/specialExisting=new Set\(\['skuSearchInput','shelfSearchInput','transferScanInput'\]\)/);
});
test('camera reads live video without file upload and does not submit a form or change inventory itself',async()=>{
 const camera=await read('../src/universal-barcode-camera.js');
 assert.match(camera,/getUserMedia\(/);
 assert.match(camera,/scanner\.scan\(canvas\)/);
 assert.match(camera,/field\.dispatchEvent\(new Event\('input'/);
 assert.match(camera,/field\.dispatchEvent\(new Event\('change'/);
 assert.doesNotMatch(camera,/\.submit\(|\.requestSubmit\(|type="file"|toBlob\(/);
 assert.match(camera,/MutationObserver/);
 assert.match(camera,/field\.disabled\|\|field\.readOnly/);
});
