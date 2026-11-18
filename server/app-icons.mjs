import sharp from 'sharp';
import {readFileSync} from 'node:fs';
// Use the approved composite's original logo. No redrawing or generated replacement.
const source=new URL('../public/assets/approved-ui-v1.1.jpg',import.meta.url);
const icons=new Map();
export function appIcon(size){
  if(![180,192,512].includes(size))throw new Error('Unsupported icon size');
  if(!icons.has(size)){
    const output=sharp(readFileSync(source)).extract({left:44,top:2,width:218,height:88})
      .resize({width:Math.round(size*0.84),height:Math.round(size*0.84),fit:'contain',background:'#ffffff'})
      .extend({top:Math.floor((size-Math.round(size*0.84))/2),bottom:Math.ceil((size-Math.round(size*0.84))/2),left:Math.floor((size-Math.round(size*0.84))/2),right:Math.ceil((size-Math.round(size*0.84))/2),background:'#ffffff'})
      .png().toBuffer();
    icons.set(size,output);output.catch(()=>icons.delete(size));
  }
  return icons.get(size);
}
