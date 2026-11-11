import {MultiFormatReader,RGBLuminanceSource,BinaryBitmap,HybridBinarizer,DecodeHintType,BarcodeFormat} from '@zxing/library';
globalThis.onmessage=event=>{
 const {pixels,width,height}=event.data,rgba=new Uint8ClampedArray(pixels),gray=new Uint8ClampedArray(width*height);
 for(let i=0,j=0;i<gray.length;i++,j+=4)gray[i]=(rgba[j]+2*rgba[j+1]+rgba[j+2])/4;
 const hints=new Map([[DecodeHintType.TRY_HARDER,true],[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_A,BarcodeFormat.CODE_128,BarcodeFormat.CODE_39,BarcodeFormat.ITF]]]);
 const results=[],seen=new Set(),regions=[[0,0,width,height],[0,0,Math.ceil(width/2),height],[Math.floor(width/2),0,Math.ceil(width/2),height],[0,0,width,Math.ceil(height/2)],[0,Math.floor(height/2),width,Math.ceil(height/2)]];
 try{for(const [x,y,w,h] of regions){const source=new RGBLuminanceSource(gray,width,height).crop(x,y,w,h);const reader=new MultiFormatReader();try{const result=reader.decode(new BinaryBitmap(new HybridBinarizer(source)),hints),code=result.getText(),format=BarcodeFormat[result.getBarcodeFormat()];if(!seen.has(format+code)){seen.add(format+code);results.push({code,format});}}catch{}finally{reader.reset();}}
  globalThis.postMessage({results});
 }catch(error){globalThis.postMessage({results,error:error.message});}
};
