import {MultiFormatReader,RGBLuminanceSource,BinaryBitmap,HybridBinarizer,DecodeHintType,BarcodeFormat} from '@zxing/library';

// Local, single-worker decoder. Prefer a quick centre/full-frame pass; run
// expensive TRY_HARDER/cropped search only periodically if earlier frames fail.
const formats=[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_A,BarcodeFormat.CODE_128,BarcodeFormat.CODE_39,BarcodeFormat.ITF];
const quickHints=new Map([[DecodeHintType.POSSIBLE_FORMATS,formats]]);
const detailedHints=new Map([[DecodeHintType.TRY_HARDER,true],[DecodeHintType.POSSIBLE_FORMATS,formats]]);
const reader=new MultiFormatReader();

function attempt(source,x,y,width,height,hints){
  try{
    const bitmap=new BinaryBitmap(new HybridBinarizer(source.crop(x,y,width,height)));
    const match=reader.decode(bitmap,hints);
    return {code:match.getText(),format:BarcodeFormat[match.getBarcodeFormat()]};
  }catch{return null;}
  finally{reader.reset();}
}

globalThis.onmessage=event=>{
  const {pixels,width,height,deepScan=false}=event.data;
  try{
    const rgba=new Uint8ClampedArray(pixels),gray=new Uint8ClampedArray(width*height);
    for(let i=0,j=0;i<gray.length;i++,j+=4)gray[i]=(rgba[j]+2*rgba[j+1]+rgba[j+2])/4;
    const source=new RGBLuminanceSource(gray,width,height);
    const cw=Math.max(1,Math.round(width*.82)),ch=Math.max(1,Math.round(height*.68));
    const cx=Math.floor((width-cw)/2),cy=Math.floor((height-ch)/2);
    const center=attempt(source,cx,cy,cw,ch,quickHints);
    if(center){globalThis.postMessage({results:[center]});return;}
    const full=attempt(source,0,0,width,height,quickHints);
    if(full){globalThis.postMessage({results:[full]});return;}
    if(deepScan){
      const leftWidth=Math.ceil(width/2),rightX=Math.floor(width/2);
      const topHeight=Math.ceil(height/2),bottomY=Math.floor(height/2);
      const regions=[
        [0,0,width,height],
        [0,0,leftWidth,height],
        [rightX,0,width-rightX,height],
        [0,0,width,topHeight],
        [0,bottomY,width,height-bottomY]
      ];
      for(const [x,y,w,h] of regions){
        const result=attempt(source,x,y,w,h,detailedHints);
        if(result){globalThis.postMessage({results:[result]});return;}
      }
    }
    globalThis.postMessage({results:[]});
  }catch(error){globalThis.postMessage({results:[],error:error.message});}
};
