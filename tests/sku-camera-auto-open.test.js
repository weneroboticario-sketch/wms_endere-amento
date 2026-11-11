import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Consulta de SKU starts the rear camera directly when Ler código opens',async()=>{
  const [ui,script]=await Promise.all([
    readFile(new URL('../src/sku-photo-lookup.js',import.meta.url),'utf8'),
    readFile(new URL('../script.js',import.meta.url),'utf8')
  ]);
  // Initial scanner request is issued after the dialog opens without waiting for a second tap.
  assert.match(ui,/dialog\.showModal\(\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*void startCamera\(\);\s*return \{close\};/);
  assert.match(ui,/async function startCamera\(\)/);
  assert.match(ui,/getUserMedia\(/);
  assert.match(ui,/facingMode:\{ideal:face\}/);
  assert.match(ui,/video\.play\(\)/);
  assert.match(ui,/NotAllowedError/);
  assert.match(ui,/data-start/);
  assert.match(ui,/data-stop/);
  // Statically importing the UI ensures mobile browsers receive a camera request
  // within the original click gesture rather than after an awaited dynamic import.
  assert.match(script,/import \{ openSkuPhotoLookup \} from "\.\/src\/sku-photo-lookup\.js";/);
  assert.doesNotMatch(script,/await import\("\.\/src\/sku-photo-lookup\.js"\)/);
  assert.match(script,/skuPhotoController = openSkuPhotoLookup\(\{/);
  assert.doesNotMatch(ui,/data-gallery|Fotografar no celular|Escolher da galeria/);
});
