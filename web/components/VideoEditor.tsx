'use client';
// Edit tab for a generated video. The design JSON is the source of truth: every control produces JSON Patch ops,
// the preview renders those ops instantly in the browser (same HTML as the server render), and only "Save" / "Render"
// talk to the server. Visual edits never call a model; "Describe a change" makes one small-model call that returns ops.
import ProductImageInput from './ProductImageInput';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,Loader2,Undo2,Redo2,RotateCcw,Play,Pause,Sparkles,Lock,Unlock,Save,Wand2} from 'lucide-react';
import {applyPatch,validateDesign,beatStarts,totalSeconds,applyRail,MOTIONS,CORNERS} from '../../core/video/design.mjs';
import {designToHtml} from '../../core/video/render-html.mjs';

async function call(path:string,body?:any){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d;}
const get=(o:any,p:string)=>p.split('/').slice(1).reduce((x:any,k)=>x==null?undefined:x[k],o);
const TABS=['Background','Text','Font','Style','Layout','Timing'] as const;

export default function VideoEditor({record,canEdit,onRendered}:{record:any,canEdit:boolean,onRendered?:()=>void}){
 const [srv,setSrv]=useState<any>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(''),[pending,setPending]=useState<any[]>([]);
 const [tab,setTab]=useState<typeof TABS[number]>('Background'),[beat,setBeat]=useState(0),[word,setWord]=useState<number|null>(null);
 const [ideas,setIdeas]=useState<any[]>([]),[ask,setAsk]=useState(''),[note,setNote]=useState(''),[paused,setPaused]=useState(false);
 const [concepts,setConcepts]=useState<any>(null);
 const frame=useRef<HTMLIFrameElement>(null);const q=`client=${record.client_id}&asset=${record.id}`;
 async function load(){try{const d=await call('video-design?'+q);setSrv(d);setErr('');if(d.design)call('video-design/variants?'+q).then(v=>setIdeas(v.variants)).catch(()=>{});}catch(e:any){setErr(e.message);}}
 useEffect(()=>{load();},[record.id]);
 // Poll while a render is queued or running, then refresh the asset.
 const job=srv?.job;const working=job&&['queued','running'].includes(job.status);
 useEffect(()=>{if(!working)return;const t=setInterval(async()=>{const d=await call('video-design?'+q).catch(()=>null);if(!d)return;setSrv(d);if(!['queued','running'].includes(d.job?.status)){clearInterval(t);onRendered?.();}},2000);return()=>clearInterval(t);},[working]);

 const base=srv?.design;
 const draft=useMemo(()=>{if(!base||!pending.length)return base;try{return applyPatch(base,pending);}catch{return base;}},[base,pending]);
 const problems=useMemo(()=>draft?validateDesign(draft):[],[draft]);
 const locked=!!draft?.brand?.locked;
 const fonts=srv?.fonts||[];
 const html=useMemo(()=>{if(!draft)return '';const used=[draft.theme.fonts.display.id,draft.theme.fonts.body.id];
  return designToHtml(draft,{mode:'preview',fonts:fonts.filter((f:any)=>used.includes(f.id)),fontUrl:(id:string,f:string)=>`/api/design-fonts/${id}/${f}`,fileUrl:(id:string)=>`/api/files/${id}`,gsapSrc:'/api/video-design/gsap.js'});},[draft,fonts]);
 const [shown,setShown]=useState('');useEffect(()=>{const t=setTimeout(()=>setShown(html),120);return()=>clearTimeout(t);},[html]);
 const seekBeat=(i:number)=>{setBeat(i);setWord(null);if(draft)frame.current?.contentWindow?.postMessage({seek:beatStarts(draft)[i]+0.05},'*');};

 /** One control change = one op. A later change to the same path replaces the earlier pending op (patch stays minimal). */
 function set(path:string,value:any){if(!draft)return;
  // Empty choice = remove the override. A missing parent (e.g. a word with no style yet) is created in the same single op.
  if(value===''||value===undefined){if(get(draft,path)!==undefined)setPending(p=>[...p.filter(o=>o.path!==path),{op:'remove',path}]);return;}
  const keys=path.split('/').slice(1);let at=keys.length;for(let i=1;i<=keys.length;i++)if(get(draft,'/'+keys.slice(0,i).join('/'))===undefined){at=i;break;}
  let opPath=path,opValue=value,op=get(draft,path)===undefined?'add':'replace';
  if(at<keys.length){opPath='/'+keys.slice(0,at).join('/');opValue=keys.slice(at).reduceRight((v:any,k)=>({[k]:v}),value);op='add';}
  setPending(p=>{const kept=p.filter(o=>o.path!==opPath&&!o.path.startsWith(opPath+'/'));return [...kept,{op,path:opPath,value:opValue}];});}
 function addOps(ops:any[]){setPending(p=>[...p.filter(o=>!ops.some(n=>n.path===o.path)),...ops]);}
 async function save(){if(!pending.length)return srv.head;setBusy('save');try{const r=await call('video-design/patch',{client_id:record.client_id,asset_id:record.id,base:srv.head,ops:pending,note:note||undefined});setPending([]);setNote('');await load();return r.version;}catch(e:any){setErr(e.message);return null;}finally{setBusy('');}}
 async function render(){setBusy('render');try{const v=await save();if(v===null)return;const r=await call('video-design/apply',{client_id:record.client_id,asset_id:record.id,version:v});setErr('');await load();if(r.estimate_seconds)setNote('');}catch(e:any){setErr(e.message);}finally{setBusy('');}}
 async function head(action:string){setBusy(action);try{await call('video-design/'+action,{client_id:record.client_id,asset_id:record.id});setPending([]);await load();}catch(e:any){setErr(e.message);}finally{setBusy('');}}
 async function interpret(e:any){e.preventDefault();if(!ask.trim())return;setBusy('ask');try{const r=await call('video-design/interpret',{client_id:record.client_id,asset_id:record.id,text:ask});if(r.ops.length){addOps(r.ops);setNote(ask.slice(0,120));setAsk('');}setErr(r.note&&!r.ops.length?r.note:'');}catch(e:any){setErr(e.message);}finally{setBusy('');}}
 async function retry(){setBusy('retry');try{await call('video-design/retry',{client_id:record.client_id,job_id:job.id});await load();}catch(e:any){setErr(e.message);}finally{setBusy('');}}

 if(err&&!srv)return <div className="notice danger-notice"><AlertCircle size={18}/><div><b>The editor could not open.</b><p>{err}</p></div></div>;
 if(!srv)return <p className="muted"><Loader2 className="spin" size={14}/> Opening the editor…</p>;
 if(!base)return <div className="notice"><b>This video can’t be edited.</b><p>{srv.read_only}</p></div>;
 const editable=canEdit&&srv.editable;const b=draft.beats[beat]||draft.beats[0];const bi=draft.beats.indexOf(b);
 const palette:string[]=draft.brand.palette;
 const Colour=({path,value}:{path:string,value:string})=><div className="vd-swatches">{palette.map(c=><button type="button" key={c} title={c} className={'vd-swatch'+(String(value).toLowerCase()===c?' on':'')} style={{background:c}} onClick={()=>set(path,c)} disabled={!editable}/>)}{!locked&&<input type="color" value={value||'#000000'} onChange={e=>set(path,e.target.value)} disabled={!editable}/>}</div>;
 const Num=({label,path,min,max,step=1}:any)=><label className="field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={get(draft,path)??''} onChange={e=>e.target.value!==''&&set(path,Number(e.target.value))} disabled={!editable}/></label>;
 const Sel=({label,path,options}:any)=><label className="field"><span>{label}</span><select value={get(draft,path)??''} onChange={e=>set(path,e.target.value)} disabled={!editable}>{options.map((o:any)=><option key={o[0]??o} value={o[0]??o}>{o[1]??o}</option>)}</select></label>;
 const fontChoices=fonts.filter((f:any)=>!locked||draft.brand.fonts.includes(f.id));
 const availablePlan=concepts||(draft.layout.rail?.concepts?draft.layout.rail:null);
 const bg=draft.theme.background;const media=srv.media||[];
 const stages=job?.progress?.stages||[];

 return <div className="vd-editor">
  <div className="notice compact"><AlertCircle size={16}/><span><b>AI-generated draft:</b> Verify claims and sources before approval.</span></div>
  <div className="vd-grid">
   <div className="vd-stage">
    <div className="vd-frame" style={{width:270,height:270*draft.height/draft.width}}>{shown&&<iframe ref={frame} title="Live preview" srcDoc={shown} width={draft.width} height={draft.height} style={{transform:`scale(${270/draft.width})`}} scrolling="no"/>}</div>
    <div className="vd-transport"><button type="button" className="button" onClick={()=>{setPaused(!paused);frame.current?.contentWindow?.postMessage({pause:!paused},'*');}}>{paused?<Play size={14}/>:<Pause size={14}/>}</button><small>{totalSeconds(draft).toFixed(1)}s · {draft.beats.length} beats · live preview</small></div>
    <div className="vd-beats">{draft.beats.map((x:any,i:number)=><button type="button" key={x.id} className={'vd-beat'+(i===bi?' on':'')} onClick={()=>seekBeat(i)} style={{flexGrow:x.duration}} title={x.text.map((w:any)=>w.text).join(' ')}>{x.label||i+1}</button>)}</div>
   </div>
   <div className="vd-panels">
    <details open={!!draft.layout.rail||undefined}><summary>Cover and main visual</summary>
     <button className="button" disabled={!!busy||!editable} onClick={async()=>{setBusy('concepts');try{setConcepts(await call('video-design/concepts',{client_id:record.client_id,asset_id:record.id}));}catch(e:any){setErr(e.message)}finally{setBusy('')}}}>{busy==='concepts'?'Planning…':'Generate 3 concepts'}</button>
     {availablePlan?.concepts.map((c:any,i:number)=><button className="button" key={i} disabled={!editable} title={c.scenes.join(' → ')} onClick={()=>{const next=applyRail(draft,availablePlan,i,{seconds:totalSeconds(draft),brand:draft.layout.rail?.brand||'',file_id:draft.layout.rail?.file_id});addOps(['layout','theme','beats'].map(k=>({op:'replace',path:'/'+k,value:next[k]})));setBeat(0);setConcepts(null)}}>{c.name}</button>)}
     {draft.layout.rail&&<><label className="field">Cover caption<input disabled={!editable} value={draft.layout.rail.caption} maxLength={120} onChange={e=>set('/layout/rail/caption',e.target.value||' ')}/></label>{draft.layout.rail.captions?.map((s:string)=><button disabled={!editable} type="button" className="button" key={s} onClick={()=>set('/layout/rail/caption',s)}>{s}</button>)}
     <label className="field">Product image across all scenes<select disabled={!editable} value={draft.layout.rail.file_id||''} onChange={e=>set('/layout/rail/file_id',e.target.value||null)}><option value="">Generated artwork</option>{media.filter((x:any)=>/^image\/(png|jpeg|webp)$/.test(x.mime)).map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
     <ProductImageInput disabled={!editable||!!busy} onUpload={async file=>{const form=new FormData();form.set('client_id',record.client_id);form.set('file',file);const r=await fetch('/api/upload',{method:'POST',body:form});const x=await r.json();if(!r.ok)throw Error(x.error);setSrv((v:any)=>({...v,media:[x,...v.media]}));set('/layout/rail/file_id',x.id)}}/>
     {draft.layout.rail.style&&<details><summary>Product layout and motion</summary>{([['laneWidth','Product column %',35,62,1],['visualScale','Product scale',0.5,1.4,.05],['rotation','Rotation',-30,30,1],['periodSeconds','Seconds per pass',2,8,.25]] as const).map(([k,label,min,max,step])=><label className="field" key={k}>{label}<input disabled={!editable} type="range" min={min} max={max} step={step} value={draft.layout.rail.style[k]} onChange={e=>set('/layout/rail/style/'+k,Number(e.target.value))}/></label>)}<a download="style.json" href={'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(draft.layout.rail.style,null,2))}>Export style JSON</a></details>}
     <a className="button" download="reel-project.json" href={'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(draft,null,2))}>Export project JSON</a>
     {record.data.files?.filter((f:any)=>f.name==='cover.png').map((f:any)=><a className="button" key={f.id} href={'/api/files/'+f.id+'?download'}>Download rendered cover</a>)}</>}
    </details>
    <div className="vd-tabs">{TABS.map(t=><button type="button" key={t} className={t===tab?'on':''} onClick={()=>setTab(t)}>{t}</button>)}
     <button type="button" className="vd-lock" title={locked?'Colours and fonts are limited to the brand kit':'Off-brand colours and fonts are allowed'} disabled={!editable} onClick={()=>set('/brand/locked',!locked)}>{locked?<Lock size={13}/>:<Unlock size={13}/>}{locked?'On-brand':'Off-brand unlocked'}</button></div>
    {tab==='Background'&&<div className="vd-panel">
     <label className="field"><span>Type</span><select value={bg.kind} disabled={!editable} onChange={e=>{const k=e.target.value,c=bg.color||bg.from||palette[0];set('/theme/background',k==='solid'?{kind:'solid',color:c}:k==='gradient'?{kind:'gradient',from:c,to:palette.find(x=>x!==c)||c,angle:160}:{kind:k,color:c,dim:0.35,file_id:media.find((m:any)=>k==='video'?m.mime==='video/mp4':m.mime.startsWith('image/'))?.id||''});}}>{[['solid','Solid colour'],['gradient','Gradient'],['image','Image'],['video','Video']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
     {bg.kind==='solid'&&<label className="field"><span>Colour</span><Colour path="/theme/background/color" value={bg.color}/></label>}
     {bg.kind==='gradient'&&<><label className="field"><span>From</span><Colour path="/theme/background/from" value={bg.from}/></label><label className="field"><span>To</span><Colour path="/theme/background/to" value={bg.to}/></label><Num label="Angle" path="/theme/background/angle" min={0} max={360}/></>}
     {(bg.kind==='image'||bg.kind==='video')&&<><label className="field"><span>File</span><select value={bg.file_id||''} onChange={e=>set('/theme/background/file_id',e.target.value)} disabled={!editable}><option value="">Choose an upload…</option>{media.filter((m:any)=>bg.kind==='video'?m.mime==='video/mp4':m.mime.startsWith('image/')).map((m:any)=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><Num label="Darken (0 to 0.85)" path="/theme/background/dim" min={0} max={0.85} step={0.05}/></>}
     <label className="field"><span>Beat {bi+1} only</span><div className="vd-swatches">{palette.map(c=><button type="button" key={c} title={c} className={'vd-swatch'+(b.style?.background?.color===c?' on':'')} style={{background:c}} disabled={!editable} onClick={()=>set(`/beats/${bi}/style/background`,{kind:'solid',color:c})}/>)}</div></label>
     {b.style?.background&&<button type="button" className="button" disabled={!editable} onClick={()=>addOps([{op:'remove',path:`/beats/${bi}/style/background`}])}>Use the video background for this beat</button>}
    </div>}
    {tab==='Text'&&<div className="vd-panel">
     <label className="field"><span>Text colour (all beats)</span><Colour path="/theme/ink" value={draft.theme.ink}/></label>
     <label className="field"><span>Accent (emphasis, locale tag)</span><Colour path="/theme/accent" value={draft.theme.accent}/></label>
     <label className="field"><span>Beat {bi+1} text colour</span><Colour path={`/beats/${bi}/style/ink`} value={b.style?.ink||draft.theme.ink}/></label>
     <div className="field"><span>Pick a word in beat {bi+1}</span><div className="vd-words">{b.text.map((w:any,i:number)=><button type="button" key={i} className={(i===word?'on ':'')+(w.style?.italic?'it':'')} style={{color:w.style?.color}} onClick={()=>setWord(i)}>{w.text}</button>)}</div></div>
     {word!==null&&b.text[word]&&<div className="vd-wordstyle">
      {(['italic','bold','underline'] as const).map(k=><label key={k} className="check"><input type="checkbox" checked={!!b.text[word].style?.[k]} disabled={!editable} onChange={e=>set(`/beats/${bi}/text/${word}/style`,{...(b.text[word].style||{}),[k]:e.target.checked})}/>{k}</label>)}
      <Colour path={`/beats/${bi}/text/${word}/style/color`} value={b.text[word].style?.color}/>
      {b.text[word].style&&<button type="button" className="button" disabled={!editable} onClick={()=>addOps([{op:'remove',path:`/beats/${bi}/text/${word}/style`}])}>Plain</button>}
     </div>}
    </div>}
    {tab==='Font'&&<div className="vd-panel">
     <Sel label="Headline font" path="/theme/fonts/display/id" options={fontChoices.map((f:any)=>[f.id,f.family])}/>
     <Sel label="Body font" path="/theme/fonts/body/id" options={fontChoices.map((f:any)=>[f.id,f.family])}/>
     <div className="form-grid"><Num label="Weight" path="/theme/fonts/display/weight" min={100} max={900} step={100}/><Num label="Size (px, max)" path="/theme/type/size" min={32} max={220} step={2}/>
     <Num label="Letter spacing (em)" path="/theme/type/letter_spacing" min={-0.1} max={0.3} step={0.01}/><Num label="Line height" path="/theme/type/line_height" min={0.8} max={2} step={0.02}/></div>
     <div className="form-grid"><Sel label="Alignment" path="/theme/type/align" options={[['left','Left'],['center','Centre'],['right','Right']]}/><Sel label="Case" path="/theme/type/case" options={[['none','As written'],['upper','UPPERCASE']]}/></div>
    </div>}
    {tab==='Style'&&<div className="vd-panel">
     <Sel label="Animation (all beats)" path="/theme/motion/preset" options={MOTIONS.map(m=>[m,{fade:'Fade',typewriter:'Typewriter',words:'Word by word',slide:'Slide',scale:'Scale',none:'None'}[m]])}/>
     <Num label="Speed" path="/theme/motion/speed" min={0.25} max={3} step={0.25}/>
     <Sel label={`Beat ${bi+1} animation`} path={`/beats/${bi}/style/motion`} options={[['','Same as video'],...MOTIONS.map(m=>[m,m])]}/>
    </div>}
    {tab==='Layout'&&<div className="vd-panel">
     <div className="form-grid"><Sel label="Text position" path="/layout/text_position" options={[['top','Top'],['center','Middle'],['bottom','Bottom']]}/><Num label="Safe area (share of width)" path="/theme/safe_area" min={0.03} max={0.2} step={0.01}/></div>
     <div className="form-grid"><Sel label="Logo" path="/layout/logo/position" options={CORNERS.map(c=>[c,c.replace('-',' ')])}/><Num label="Logo height (px)" path="/layout/logo/size" min={24} max={240}/></div>
     <label className="field"><span>Locale tag</span><input value={draft.layout.locale_tag?.text||''} maxLength={40} disabled={!editable} onChange={e=>set('/layout/locale_tag/text',e.target.value.toUpperCase())}/></label>
     <div className="form-grid"><Sel label="Tag position" path="/layout/locale_tag/position" options={CORNERS.map(c=>[c,c.replace('-',' ')])}/><label className="check"><input type="checkbox" checked={!!draft.layout.locale_tag?.visible} disabled={!editable} onChange={e=>set('/layout/locale_tag/visible',e.target.checked)}/>Show tag</label></div>
     <div className="form-grid"><label className="check"><input type="checkbox" checked={!!draft.layout.caption_bar?.visible} disabled={!editable} onChange={e=>set('/layout/caption_bar/visible',e.target.checked)}/>Caption bar</label><Sel label="Caption style" path="/layout/caption_bar/style" options={[['plain','Plain'],['bar','Bar']]}/><Sel label="Caption position" path="/layout/caption_bar/position" options={[['bottom','Bottom'],['top','Top']]}/></div>
    </div>}
    {tab==='Timing'&&<div className="vd-panel">
     <p className="form-note">Re-pacing keeps the narration as it is: the sound is reused, not made again.{srv.design.audio?.voice||srv.design.audio?.source_file_id?' The sound is padded or cut to the new length.':''}</p>
     {draft.beats.map((x:any,i:number)=><label key={x.id} className="vd-timing"><span>{x.label||'Beat '+(i+1)}</span><small>{x.text.map((w:any)=>w.text).join(' ').slice(0,60)}</small><input type="number" min={0.5} max={60} step={0.1} value={x.duration} disabled={!editable} onChange={e=>e.target.value&&set(`/beats/${i}/duration`,Math.round(Number(e.target.value)*10)/10)}/>s</label>)}
    </div>}
    <form className="vd-ask" onSubmit={interpret}><Wand2 size={15}/><input value={ask} onChange={e=>setAsk(e.target.value)} placeholder="Describe a change, e.g. make the word polo italic in red" disabled={!editable||busy==='ask'} maxLength={500}/><button className="button" disabled={!editable||!ask.trim()||!!busy}>{busy==='ask'?<Loader2 className="spin" size={14}/>:'Suggest'}</button></form>
   </div>
  </div>
  {ideas.length>0&&<div className="vd-ideas"><span><Sparkles size={14}/> Design ideas</span>{ideas.map(v=><button type="button" key={v.id} disabled={!editable} title="Preview this look; Save to keep it" onClick={()=>addOps(v.ops)}><i style={{background:v.swatch.bg,color:v.swatch.ink,borderColor:v.swatch.accent}}>Aa</i>{v.name}</button>)}</div>}
  {problems.length>0&&<div className="check-result warning"><AlertCircle size={16}/>{problems[0]}</div>}
  {err&&<div className="check-result error"><AlertCircle size={16}/>{err}</div>}
  {job?.status==='failed'&&<div className="notice danger-notice"><AlertCircle size={18}/><div><b>The last render did not finish.</b><p>{job.error}</p><button type="button" className="button" disabled={!!busy} onClick={retry}>Retry from the last good step</button></div></div>}
  {working&&<div className="notice compact"><Loader2 className="spin" size={15}/><span>Rendering{srv.estimate_seconds?` (about ${srv.estimate_seconds}s)`:''}: {stages.map((s:any)=>`${s.label} ${s.status==='done'?(s.reused?'✓ reused':'✓'):s.status==='running'?'…':''}`).join(' · ')||'waiting for the worker'}</span></div>}
  <div className="vd-actions">
   <button type="button" className="button" disabled={!editable||!srv.can_undo||!!busy||pending.length>0} onClick={()=>head('undo')}><Undo2 size={14}/>Undo</button>
   <button type="button" className="button" disabled={!editable||!srv.can_redo||!!busy||pending.length>0} onClick={()=>head('redo')}><Redo2 size={14}/>Redo</button>
   <button type="button" className="button" disabled={!editable||srv.head===1||!!busy} onClick={()=>head('revert')}><RotateCcw size={14}/>Revert to original</button>
   <span className="vd-version">Version {srv.head}{pending.length?` + ${pending.length} unsaved change${pending.length>1?'s':''}`:''}</span>
   {pending.length>0&&<button type="button" className="button" disabled={!!busy} onClick={()=>setPending([])}>Discard</button>}
   <button type="button" className="button" disabled={!editable||!pending.length||problems.length>0||!!busy} onClick={save}><Save size={14}/>Save</button>
   <button type="button" className="button primary" disabled={!editable||problems.length>0||!!busy||working} onClick={render}>{busy==='render'?<Loader2 className="spin" size={14}/>:<Play size={14}/>}Apply and render</button>
  </div>
  {!srv.editable&&<p className="form-note">Approved work can’t be edited. Make a new version of the asset to change it.</p>}
 </div>;
}
