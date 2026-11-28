'use client';
import {useEffect,useRef,useState} from 'react';
import ProductImageInput from './ProductImageInput';

const initial={zoom:1,x:0,y:0,rotation:0,fill:false};
type PictureFile={id:string;name:string;mime:string};

export default function PictureEditor({record,onSaved}:{record:any;onSaved:()=>void}){
 const source:PictureFile=record.data.files.find((f:PictureFile)=>/^image\/(png|jpeg|webp)$/.test(f.mime));
 const [replacement,replace]=useState<File|null>(null);
 const [photo,setPhoto]=useState<HTMLImageElement|null>(null);
 const [size,setSize]=useState<{width:number;height:number}|null>(null);
 const [view,setView]=useState(initial);
 const [saving,setSaving]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  let active=true;const img=new Image();
  img.onload=()=>{if(active)setSize({width:img.naturalWidth,height:img.naturalHeight})};
  img.onerror=()=>{if(active)setError('Could not load the original picture.')};
  img.src='/api/files/'+source.id;
  return()=>{active=false};
 },[source.id]);
 useEffect(()=>{
  let active=true;const img=new Image(),url=replacement?URL.createObjectURL(replacement):'/api/files/'+source.id;
  setPhoto(null);
  img.onload=()=>{if(active)setPhoto(img)};
  img.onerror=()=>{if(active)setError('Could not open this picture.')};
  img.src=url;return()=>{active=false;if(replacement)URL.revokeObjectURL(url)};
 },[replacement,source.id]);
 useEffect(()=>{
  if(!canvas.current||!size||!photo)return;
  const c=canvas.current;c.width=size.width;c.height=size.height;
  const ctx=c.getContext('2d');if(!ctx)return;
  const ratio=(view.fill?Math.max:Math.min)(c.width/photo.naturalWidth,c.height/photo.naturalHeight)*view.zoom;
  const w=photo.naturalWidth*ratio,h=photo.naturalHeight*ratio;
  ctx.translate(c.width*(.5+view.x/100),c.height*(.5+view.y/100));ctx.rotate(view.rotation*Math.PI/180);
  ctx.drawImage(photo,-w/2,-h/2,w,h);
 },[photo,size,view]);
 async function save(){
  if(!canvas.current||!photo||!size||saving||saved)return;
  setSaving(true);setError('');
  try{
   const png=await new Promise<Blob|null>(resolve=>canvas.current!.toBlob(resolve,'image/png'));
   if(!png)throw Error('Could not encode the picture.');
   const form=new FormData();form.set('client_id',record.client_id);form.set('file',png,'edited-picture.png');
   const upload=await fetch('/api/upload',{method:'POST',body:form}),file=await upload.json();
   if(!upload.ok)throw Error(file.error);
   const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save-picture-version',client_id:record.client_id,id:record.id,source_file_id:source.id,file_id:file.id})});
   const result=await response.json();if(!response.ok)throw Error(result.error);
   setSaved(true);onSaved();
  }catch(e:any){setError(e.message)}finally{setSaving(false)}
 }
 function adjust(next:typeof initial){setSaved(false);setView(next)}
 return <div className="vd-editor"><div className="picture-draft-grid"><canvas ref={canvas} className="picture-draft-preview" aria-label="Picture preview"/>
 <aside className="vd-pictures" aria-label="Picture editor"><h3>Edit picture</h3>
 <ProductImageInput disabled={saving} onUpload={async file=>{setError('');setSaved(false);replace(file)}}/>
 <label className="field">Picture fit<select disabled={saving} value={view.fill?'crop':'fit'} onChange={e=>adjust({...view,fill:e.target.value==='crop'})}><option value="fit">Fit whole picture</option><option value="crop">Crop to fill</option></select></label>
 {([['zoom','Scale',.5,3,.05],['x','Horizontal position',-50,50,1],['y','Vertical position',-50,50,1],['rotation','Rotation',-180,180,1]] as const).map(([key,label,min,max,step])=><label className="field" key={key}>{label}<input type="range" disabled={saving} min={min} max={max} step={step} value={view[key]} onChange={e=>adjust({...view,[key]:Number(e.target.value)})}/></label>)}
 <button type="button" className="button" disabled={saving} onClick={()=>{replace(null);adjust(initial)}}>Restore original</button>
 <button type="button" className="button primary" disabled={saving||saved||!size||!photo} onClick={save}>{saving?'Saving…':'Save new draft'}</button>
 {saved&&<p role="status">Saved as a new picture draft.</p>}{error&&<p role="alert">{error}</p>}
 </aside></div></div>;
}
