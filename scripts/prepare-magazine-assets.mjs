import {mkdir,copyFile,readdir,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),target=path.join(root,'public/magazine-assets');
await mkdir(path.join(target,'core'),{recursive:true});await mkdir(path.join(target,'lang'),{recursive:true});
await copyFile(path.join(root,'node_modules/tesseract.js/dist/worker.min.js'),path.join(target,'worker.min.js'));
for(const name of await readdir(path.join(root,'node_modules/tesseract.js-core'))){if(/-lstm\.wasm(?:\.js)?$/.test(name))await copyFile(path.join(root,'node_modules/tesseract.js-core',name),path.join(target,'core',name));}
await copyFile(path.join(root,'node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz'),path.join(target,'lang/por.traineddata.gz'));
for(const name of ['wasm','standard_fonts','cmaps'])await cp(path.join(root,'node_modules/pdfjs-dist',name),path.join(target,'pdf',name),{recursive:true});
console.log('Recursos locais de PDF/OCR preparados; nenhum serviço de IA é utilizado.');
