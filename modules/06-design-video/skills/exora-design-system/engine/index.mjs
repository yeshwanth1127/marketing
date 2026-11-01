// EXORA design engine. compose() turns a layout + slots + brand profile into one HTML document per frame.
import {LAYOUTS} from './layouts/index.mjs';import {context,document,CANVAS} from './frame.mjs';import {normalize,audit,css,tones,rolesFromPalette} from './profile.mjs';
export {LAYOUTS,CANVAS,normalize,audit,css,tones,rolesFromPalette};
export function compose({layout,slots={},profile,catalog,format='portrait',fontBase='fonts',logoBase='',series=''}){
 const L=LAYOUTS[layout];if(!L)throw new Error(`Unknown layout "${layout}". Use one of: ${Object.keys(LAYOUTS).join(', ')}`);
 const frames=L.frames(slots,format);
 return frames.map((frame,index)=>document({layout:L,frame,ctx:context(profile,catalog,{format,fontBase,logoBase,index,total:frames.length,series:series||slots.series||''})}));
}
export const describe=()=>Object.values(LAYOUTS).map(l=>({id:l.id,name:l.name,purpose:l.purpose,default_tone:l.tone,slots:l.slots}));
