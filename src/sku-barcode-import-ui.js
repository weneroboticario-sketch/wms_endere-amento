import {parseBarcodeLinksCsv} from './sku-barcode-links.js';
import {escapeHtml as e} from './utils.js';

/** Admin-only CSV importer; no photograph or gallery support. */
export function mountBarcodeCsvImport(container,{client,warehouse,canEdit}){
  if(!canEdit())return;
  container.innerHTML=[
    '<details class="sku-barcode-csv"><summary>Importar vínculos EAN → SKU por CSV</summary>',
    '<p>Arquivo de texto CSV: <code>EAN;SKU</code>. Até 200 linhas por importação.</p>',
    '<div data-csv-file-mount></div>',
    '<div data-csv-message role="status" aria-live="polite"></div>',
    '<button type="button" data-csv-confirm class="secondary-button" disabled>Confirmar importação</button>',
    '</details>'
  ].join('');
  const $=selector=>container.querySelector(selector);
  const file=document.createElement('input');
  file.type='file';
  file.accept='.csv,text/csv';
  file.setAttribute('aria-label','Selecionar planilha CSV de vínculos EAN e SKU');
  $('[data-csv-file-mount]').append(file);
  const message=$('[data-csv-message]'),button=$('[data-csv-confirm]');
  let preview=null,busy=false;
  const show=html=>{message.innerHTML=html;};
  file.addEventListener('change',async()=>{
    preview=null;button.disabled=true;
    if(!canEdit())return;
    const selected=file.files?.[0];
    if(!selected)return;
    if(selected.size>500000){show('<p>Arquivo acima do limite de 500 KB.</p>');return;}
    try{
      const text=await selected.text();
      if(!canEdit())return;
      preview=parseBarcodeLinksCsv(text,{maxRows:200});
      const rows=preview.rows||[],errors=preview.errors||[];
      show('<p><strong>'+rows.length+'</strong> vínculos válidos, <strong>'+errors.length+'</strong> linhas rejeitadas.</p>'+
        '<p>Exemplos: '+rows.slice(0,5).map(row=>e(row.ean)+' → '+e(row.sku)).join('; ')+'</p>'+
        (errors.length?'<p>Erros: '+errors.slice(0,7).map(row=>'linha '+row.line+': '+e(row.message)).join('; ')+'</p>':''));
      button.disabled=!rows.length;
    }catch(error){show('<p>'+e(error.message)+'</p>');}
  });
  button.addEventListener('click',async()=>{
    if(busy||!canEdit()||!preview?.rows?.length)return;
    const rows=preview.rows.slice();
    if(!window.confirm('Cadastrar '+rows.length+' vínculos válidos no estoque '+warehouse+'? Os códigos conflitantes serão rejeitados.'))return;
    busy=true;button.disabled=true;file.disabled=true;
    let saved=0;const errors=[];
    try{
      for(const [index,row] of rows.entries()){
        if(!canEdit()){errors.push('Operação interrompida: usuário ou estoque mudou.');break;}
        show('<p>Importando '+(index+1)+' de '+rows.length+'…</p>');
        const response=await client().rpc('register_wms_sku_barcode',{
          p_warehouse:warehouse,p_ean:row.ean,p_sku:row.sku,p_source:'CSV'
        });
        if(response.error)errors.push('linha '+row.line+': '+response.error.message);
        else saved++;
      }
      show('<p><strong>'+saved+'</strong> vínculos confirmados. <strong>'+errors.length+'</strong> erros.</p>'+
        (errors.length?'<p>'+errors.slice(0,12).map(e).join('; ')+'</p>':''));
      preview=null;
    }catch(error){show('<p>Importação interrompida: '+e(error.message)+'. Vínculos anteriores permaneceram gravados.</p>');}
    finally{busy=false;file.disabled=false;button.disabled=true;file.value='';}
  });
}
