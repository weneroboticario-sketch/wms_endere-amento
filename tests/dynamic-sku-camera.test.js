import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
test('only intended dynamic barcode fields receive camera buttons',async()=>{
  const [camera,receipt,caixa,html]=await Promise.all([
    read('../src/dynamic-sku-camera.js'),read('../src/inbound-receipts-view.js'),
    read('../src/caixa-request-composer.js'),read('../index.html')
  ]);
  for(const attr of ['form[data-scan] input[data-code]','form[data-map] input[data-map-sku]','form[data-extra-form] input[name="code"]','.ca-quick-form input[data-camera-sku]']){
    assert.ok(camera.includes(attr),attr);
  }
  assert.match(receipt,/data-scan/);
  assert.match(receipt,/data-map-sku/);
  assert.match(receipt,/data-extra-form/); // extra form is rendered by inbound-receipts.js
  assert.match(caixa,/code\.dataset\.cameraSku = ""/);
  assert.match(html,/src="\/src\/dynamic-sku-camera\.js"/);
  assert.doesNotMatch(html,/src="\/src\/universal-barcode-camera\.js"/);
});
test('camera never submits operational actions or associates EAN as internal SKU',async()=>{
  const source=await read('../src/dynamic-sku-camera.js');
  assert.match(source,/getUserMedia\(/);
  assert.match(source,/scanner\.scan\(canvas\)/);
  assert.match(source,/setCustomValidity/);
  assert.match(source,/field\.dispatchEvent\(new Event\('input'/);
  assert.match(source,/field\.dispatchEvent\(new Event\('change'/);
  assert.doesNotMatch(source,/\.submit\(|\.requestSubmit\(|\.click\(\)/);
  assert.match(source,/MutationObserver/);
  assert.match(source,/field\.disabled\|\|field\.readOnly/);
});
