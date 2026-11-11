import JsBarcode from 'jsbarcode';
import {installHtmlSecurity} from '../src/utils.js';
import {openSkuPhotoLookup} from '../src/sku-photo-lookup.js';

installHtmlSecurity();
let unit='VDCG',controller,fixture='sku';
const catalog=[{sku:'01314',product_name:'Produto sintético 01314'},{sku:'48060',product_name:'Produto sintético 48060'}];
const deniedButton=document.createElement('button');deniedButton.dataset.fixture='denied';deniedButton.textContent='Simular permissão negada';document.querySelector('.button-row').append(deniedButton);
const controls=[...document.querySelectorAll('[data-fixture],#changeUnit')],toolbar=document.querySelector('.button-row');
const videoCanvas=document.createElement('canvas');videoCanvas.width=960;videoCanvas.height=540;
const videoCtx=videoCanvas.getContext('2d');
const barcode=document.createElement('canvas');
let currentBarcode=null;
function paintFixture(){
  try{
    JsBarcode(barcode,fixture==='ean'?'4006381333931':fixture==='unknown'?'5901234123457':'01314',{
      format:fixture==='ean'||fixture==='unknown'?'EAN13':'CODE128',
      width:4,height:145,margin:30,displayValue:false
    });
    currentBarcode=barcode;
  }catch{currentBarcode=null;}
}
function draw(){
  videoCtx.fillStyle='white';videoCtx.fillRect(0,0,videoCanvas.width,videoCanvas.height);
  if(currentBarcode){
    videoCtx.save();
    if(fixture==='blur')videoCtx.filter='blur(24px)';
    videoCtx.drawImage(currentBarcode,(videoCanvas.width-currentBarcode.width)/2,(videoCanvas.height-currentBarcode.height)/2);
    videoCtx.restore();
  }
  window.requestAnimationFrame(draw);
}
paintFixture();
draw();
const mediaDevices={getUserMedia:async()=>{if(fixture==='denied'){const error=new Error('Permissão recusada no teste');error.name='NotAllowedError';throw error;}return videoCanvas.captureStream(15);}};
document.querySelector('#openPhoto').onclick=()=>{
  controller?.close();
  controller=openSkuPhotoLookup({
    user:()=>({id:'synthetic'}),warehouse:()=>unit,canUse:()=>true,
    client:()=>({rpc:async(_name,request)=>({data:request.p_kind==='GTIN'&&request.p_code==='4006381333931'?[catalog[0]]:catalog.filter(product=>product.sku.replace(/^0+/,'')===request.p_code.replace(/^0+/,'')),error:null})}),
    mediaDevices,
    closed:()=>toolbar.append(...controls),
    onSku:async sku=>{document.querySelector('#queryResult').textContent='Consulta existente chamada: SKU '+sku+' · estoque '+unit;}
  });
  document.querySelector('.sku-photo-dialog').append(...controls);
};
document.querySelector('#changeUnit').onclick=()=>{
  unit=unit==='VDCG'?'VDAR':'VDCG';
  document.querySelector('#testScope').textContent=unit;
};
for(const button of document.querySelectorAll('[data-fixture]')){
  button.onclick=()=>{fixture=button.dataset.fixture;paintFixture();};
}
