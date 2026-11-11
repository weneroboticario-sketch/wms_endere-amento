import JsBarcode from 'jsbarcode';import {installHtmlSecurity} from '../src/utils.js';import {openSkuPhotoLookup} from '../src/sku-photo-lookup.js';
installHtmlSecurity();let unit='VDCG',controller;const catalog=[{sku:'01314',product_name:'Produto sintético 01314'},{sku:'48060',product_name:'Produto sintético 48060'}];
const controls=[...document.querySelectorAll('[data-fixture],#changeUnit')],toolbar=document.querySelector('.button-row');
document.querySelector('#openPhoto').onclick=()=>{controller?.close();controller=openSkuPhotoLookup({user:()=>({id:'synthetic'}),warehouse:()=>unit,canUse:()=>true,client:()=>({rpc:async(name,r)=>({data:r.p_kind==='GTIN'&&r.p_code==='4006381333931'?[catalog[0]]:catalog.filter(p=>p.sku.replace(/^0+/,'')===r.p_code.replace(/^0+/,'')),error:null})}),mediaDevices:{getUserMedia:async()=>{const error=new Error('Permissão recusada no teste');error.name='NotAllowedError';throw error;}},closed:()=>toolbar.append(...controls),onSku:async sku=>{document.querySelector('#queryResult').textContent=`Consulta existente chamada: SKU ${sku} · estoque ${unit}`;}});document.querySelector('.sku-photo-dialog').append(...controls);};
document.querySelector('#changeUnit').onclick=()=>{unit=unit==='VDCG'?'VDAR':'VDCG';document.querySelector('#testScope').textContent=unit;};
for(const button of document.querySelectorAll('[data-fixture]'))button.onclick=()=>{
 const input=document.querySelector('[data-gallery]');if(!input){window.alert('Abra o leitor primeiro.');return;}
 const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=650;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,650);ctx.fillStyle='black';ctx.font='64px Arial';
 if(button.dataset.fixture==='barcode')JsBarcode(canvas,'01314',{format:'CODE128',width:4,height:160,margin:40,displayValue:false});
 else if(button.dataset.fixture==='blur'){ctx.filter='blur(20px)';ctx.fillText('SKU 01314',100,200);ctx.filter='none';}
 else{ctx.fillText('SKU: 01314',100,150);ctx.font='42px Arial';ctx.fillText('LOTE: 48060',100,260);ctx.fillText('VAL: 11/2027',100,340);ctx.fillText('400 ml',100,420);if(button.dataset.fixture==='multiple'){ctx.font='64px Arial';ctx.fillText('SKU: 48060',100,550);}}
 canvas.toBlob(blob=>{const transfer=new window.DataTransfer();transfer.items.add(new window.File([blob],'etiqueta-sintetica.png',{type:'image/png'}));input.files=transfer.files;input.dispatchEvent(new window.Event('change',{bubbles:true}));canvas.width=canvas.height=1;},'image/png');
};
