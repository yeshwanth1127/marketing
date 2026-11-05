'use client';
import React,{useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Loader2,Paperclip,Send,Upload,X} from 'lucide-react';

const KIND:any={BrandKit:'Brand',Strategy:'Strategy',Campaign:'Plan',Idea:'Idea',Asset:'Content',Approval:'Review',Post:'Post',Ad:'Ad',Metric:'Number',Report:'Report',Learning:'Lesson',Task:'Task',Client:'Client',Job:'Job',File:'File',Receipt:'Receipt'};

type Action={id:string;label:string;tool:string;args?:Record<string,unknown>;message?:string;needsUpload?:boolean};

export default function AgentChat({clientId,clientName,onOpen}:{clientId:string;clientName:string;onOpen:(card:any)=>void}){
 const [messages,setMessages]=useState<any[]>([]);
 const [pending,setPending]=useState<any>(null);
 const [slot,setSlot]=useState<any>(null);
 const [text,setText]=useState('');
 const [busy,setBusy]=useState(false);
 const [files,setFiles]=useState<any[]>([]);
 const [note,setNote]=useState('');
 const scroller=useRef<HTMLDivElement>(null);
 const fileInput=useRef<HTMLInputElement>(null);
 const load=async()=>{
  const r=await fetch('/api/agent/thread?client='+encodeURIComponent(clientId));
  const d=await r.json();
  if(!r.ok)throw new Error(d.error||'Could not load the thread');
  setMessages(d.messages||[]);
  setPending(d.pending||null);
  setSlot(d.slot||null);
 };
 useEffect(()=>{setNote('');load().catch((e:any)=>setNote(e.message));},[clientId]);
 useEffect(()=>{scroller.current?.scrollTo({top:scroller.current.scrollHeight});},[messages,busy,pending,files]);
 const lastAsk=messages.filter(m=>m.role==='assistant').slice(-1)[0]?.data?.ask;
 const needsBrandFiles=slot?.tool==='set_brand_kit'||lastAsk==='file_ids';
 const cards=messages.flatMap(m=>m.data?.cards||[]).filter((c:any,i:number,all:any[])=>c?.id&&all.findIndex(x=>x.id===c.id)===i).slice(-12);
 async function attach(file:File){
  setBusy(true);setNote('');
  try{
   const form=new FormData();form.set('client_id',clientId);form.set('file',file);
   const r=await fetch('/api/upload',{method:'POST',body:form});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||'Upload failed');
   setFiles(list=>[...list,{id:d.id,name:d.name}].slice(-10));
  }catch(e:any){setNote(e.message);}
  finally{setBusy(false);}
 }
 async function attachMany(list:FileList|null){
  if(!list?.length)return;
  for(const f of Array.from(list).slice(0,10-files.length))await attach(f);
 }
 async function turn(body:{message?:string;confirm?:boolean;tool?:string;tool_args?:Record<string,unknown>}){
  setBusy(true);setNote('');
  const file_ids=files.map(f=>f.id);
  const message=body.message||'';
  if(message)setMessages(list=>[...list,{id:'local-'+Date.now(),role:'user',body:message}]);
  setText('');
  try{
   const r=await fetch('/api/agent/turn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:clientId,message,confirm:body.confirm,file_ids,tool:body.tool,tool_args:body.tool_args})});
   if(!(r.headers.get('content-type')||'').includes('text/event-stream')){const d=await r.json();throw new Error(d.error||'The turn failed');}
   const reader=r.body!.getReader();const dec=new TextDecoder();let buf='';
   while(true){const {done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});const parts=buf.split('\n\n');buf=parts.pop()||'';
    for(const block of parts){const event=block.match(/event: (.+)/)?.[1];const raw=block.match(/data: (.+)/)?.[1];if(event==='error'&&raw)setNote(JSON.parse(raw).error||'');}}
   await load();
   setFiles([]);
  }catch(e:any){setNote(e.message||'The turn failed');}
  finally{setBusy(false);}
 }
 const runBrandKit=()=>{if(!files.length){setNote('Upload at least one brand file first.');fileInput.current?.click();return;}turn({message:'Build brand kit from these files',tool:'set_brand_kit',tool_args:{}});};
 const runAction=(action:Action)=>{
  if(action.needsUpload){fileInput.current?.click();return;}
  if(action.tool==='set_brand_kit'&&lastAsk==='file_ids'){runBrandKit();return;}
  turn({message:action.message||action.label,tool:action.tool,tool_args:action.args||{}});
 };
 return <div className="agent-layout">
  <section className="agent-chat panel">
   <div className="panel-title"><div><h2>Assistant</h2><span className="subtle">Pinned to {clientName}. I read what is saved, say what is next, then you tap an action.</span></div></div>
   <div className="agent-log" ref={scroller}>
    {!messages.length&&<p className="agent-empty">Ask what is left to onboard, what is waiting for review, or why a number moved. Use the buttons to run the next step.</p>}
    {messages.map(m=><div className={`agent-bubble ${m.role}`} key={m.id}>
     <p>{m.body}</p>
     {m.role==='assistant'&&m.data?.ask==='file_ids'&&<div className="agent-upload-inline"><label className="button primary"><Upload size={15}/>Upload brand files<input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.ppt,.pptx,.txt,.csv" hidden multiple disabled={busy} onChange={e=>{attachMany(e.target.files);e.target.value='';}}/></label><span className="muted">PNG, PDF, PowerPoint, text, or CSV — up to 10 files.</span></div>}
     {m.role==='assistant'&&Array.isArray(m.data?.actions)&&m.data.actions.length>0&&<div className="agent-actions">{m.data.actions.map((a:Action)=><button key={a.id+'-'+a.label} className={a.needsUpload||a.tool==='set_brand_kit'&&m.data?.ask==='file_ids'?'button primary':'button'} disabled={busy||(a.tool==='set_brand_kit'&&m.data?.ask==='file_ids'&&!files.length&&!a.needsUpload)} onClick={()=>runAction(a)}>{a.needsUpload?'Upload brand files':a.tool==='set_brand_kit'&&m.data?.ask==='file_ids'?`Build brand kit${files.length?' ('+files.length+' attached)':''}`:a.label}</button>)}</div>}
    </div>)}
    {busy&&<div className="agent-bubble assistant"><Loader2 className="spin" size={16}/></div>}
   </div>
   {pending&&<div className="agent-confirm"><span>This will be saved only if you confirm.</span><div><button className="button" disabled={busy} onClick={()=>turn({message:'',confirm:false})}>Cancel</button><button className="button primary" disabled={busy} onClick={()=>turn({message:'',confirm:true})}>Save it</button></div></div>}
   {needsBrandFiles&&<div className="agent-upload-banner"><div><b>Brand files</b><p className="muted">Upload a logo, PDF, deck, or text guide. They stay on this client for every step.</p></div><label className="button primary"><Upload size={15}/>Choose files<input type="file" hidden multiple disabled={busy} onChange={e=>{attachMany(e.target.files);e.target.value='';}}/></label>{files.length>0&&<button className="button primary" disabled={busy} onClick={runBrandKit}>Build brand kit ({files.length})</button>}</div>}
   {!!files.length&&<div className="agent-files">{files.map(f=><span key={f.id}>{f.name}<button aria-label={'Remove '+f.name} onClick={()=>setFiles(list=>list.filter(x=>x.id!==f.id))}><X size={12}/></button></span>)}</div>}
   {note&&<p className="form-error">{note}</p>}
   <form className="agent-compose" onSubmit={e=>{e.preventDefault();if(!busy&&(text.trim()||files.length))turn({message:text.trim()|| (files.length?'Use the attached brand files':'')});}}>
    <label className="icon-button" aria-label="Attach a file"><Paperclip size={16}/><input type="file" hidden multiple disabled={busy} onChange={e=>{attachMany(e.target.files);e.target.value='';}}/></label>
    <input aria-label="Message" value={text} placeholder={needsBrandFiles?'Upload files above, or message…':'Message about '+clientName} onChange={e=>setText(e.target.value)} disabled={busy}/>
    <button className="button primary" disabled={busy||(!text.trim()&&!files.length)} aria-label="Send"><Send size={15}/></button>
   </form>
  </section>
  <aside className="agent-side panel">
   <div className="panel-title"><h2>Made here</h2></div>
   {cards.length?cards.map((c:any)=><button className="agent-card" key={c.id} onClick={()=>onOpen(c)}><span className="eyebrow">{KIND[c.kind]||c.kind}</span><b>{c.title||'Item'}</b><small>{c.status?String(c.status).replaceAll('_',' '):''}</small><span className="text-button">Open <ArrowUpRight size={13}/></span></button>):<p className="muted">Cards for drafts, reviews, and saved items show up here.</p>}
  </aside>
 </div>;
}
