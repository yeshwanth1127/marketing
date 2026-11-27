'use client';
import React,{useEffect,useRef,useState} from 'react';

// Remove connected, near-uniform edge colour. Keep transparent cutouts intact.
function clearBackdrop(image:ImageData){
 const {data,width,height}=image;
 if([0,width-1,(height-1)*width,width*height-1].some(i=>data[i*4+3]<32))return;
 const seeds=[0,width-1,(height-1)*width,width*height-1];
 const colours=seeds.map(n=>Array.from(data.slice(n*4,n*4+3)));
 const seen=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=0;
 function visit(i:number){if(seen[i])return;seen[i]=1;const p=i*4;
  if(!colours.some(c=>Math.max(...c.map((v,k)=>Math.abs(v-data[p+k])))<=30))return;
  data[p+3]=0;queue[tail++]=i;
 }
 for(const i of seeds)visit(i);
 while(head<tail){const i=queue[head++];if(i%width)visit(i-1);if(i%width<width-1)visit(i+1);if(i>=width)visit(i-width);if(i+width<seen.length)visit(i+width);}
}

export default function ProductImageInput({disabled,onUpload}:{disabled:boolean,onUpload:(file:File)=>Promise<void>}){
 const [source,setSource]=useState<File|null>(null),[remove,setRemove]=useState(true),[restore,setRestore]=useState(false),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null),original=useRef<ImageData|null>(null);
 function choose(file?:File){if(!file||disabled)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setErr('Choose PNG, JPEG or WebP.');return}setReady(false);setSource(file);setErr('');setRemove(true)}
 useEffect(()=>{if(!source)return;let active=true;const url=URL.createObjectURL(source),img=new Image();img.onload=()=>{
  const el=canvas.current;if(!active||!el)return;const ratio=Math.min(1,1200/Math.max(img.width,img.height));el.width=Math.max(1,Math.round(img.width*ratio));el.height=Math.max(1,Math.round(img.height*ratio));const ctx=el.getContext('2d')!;ctx.drawImage(img,0,0,el.width,el.height);original.current=ctx.getImageData(0,0,el.width,el.height);
  if(remove){const pixels=ctx.getImageData(0,0,el.width,el.height);clearBackdrop(pixels);ctx.putImageData(pixels,0,0)}setReady(true);
 };img.onerror=()=>setErr('This image could not be decoded.');img.src=url;return()=>{active=false;URL.revokeObjectURL(url)}},[source,remove]);
 function brush(e:React.PointerEvent<HTMLCanvasElement>){if(!e.buttons||disabled)return;const el=e.currentTarget,ctx=el.getContext('2d')!,b=el.getBoundingClientRect(),x=(e.clientX-b.left)*el.width/b.width,y=(e.clientY-b.top)*el.height/b.height,r=Math.ceil(el.width*.025);
  if(restore&&original.current)ctx.putImageData(original.current,0,0,Math.floor(x-r),Math.floor(y-r),2*r,2*r);
  else{ctx.save();ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore()}
 }
 async function apply(useOriginal:boolean){if(!source||!canvas.current)return;setBusy(true);try{let file=source;if(!useOriginal){const el=canvas.current;const blob=await new Promise<Blob|null>(done=>el.toBlob(done,'image/png'));if(!blob)throw Error('Could not export the cutout.');file=new File([blob],source.name.replace(/\.[^.]*$/,'')+'-cutout.png',{type:'image/png'})}await onUpload(file);setSource(null)}catch(e:any){setErr(e.message)}finally{setBusy(false)}}
 return <div tabIndex={0} onPaste={e=>{const f=e.clipboardData.files[0];if(f){e.preventDefault();choose(f)}}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();choose(e.dataTransfer.files[0])}}>
 <label className="field">Replace product image<input type="file" disabled={disabled||busy} accept="image/png,image/jpeg,image/webp" onChange={e=>{choose(e.target.files?.[0]);e.target.value=''}}/></label>
 <small>Drop or paste an image here to prepare a cutout.</small>
 {source&&<div><canvas aria-label="Refine product cutout" ref={canvas} style={{width:'100%',maxHeight:300,objectFit:'contain',maxWidth:300,height:'auto',touchAction:'none',background:'#ddd'}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);brush(e)}} onPointerMove={brush}/>
 <label><input type="checkbox" checked={remove} onChange={e=>{setReady(false);setRemove(e.target.checked)}}/>Remove edge background</label>
 <label><input type="checkbox" checked={restore} onChange={e=>setRestore(e.target.checked)}/>Restore brush</label>
 <button type="button" className="button" disabled={busy||disabled||!ready} onClick={()=>apply(false)}>Use cutout</button><button type="button" className="button" disabled={busy||disabled} onClick={()=>apply(true)}>Use original</button></div>}{err&&<p role="alert">{err}</p>}</div>
}
