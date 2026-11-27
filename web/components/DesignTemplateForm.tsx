'use client';
import React,{useEffect,useState} from 'react';
import {Loader2,Palette,Plus,Sparkles,Upload,X} from 'lucide-react';
import {EXACT_DIRECTION,referenceFidelity} from '../../core/design/reference-spec.mjs';

async function api(path:string,body?:any,signal?:AbortSignal){const r=await fetch('/api/'+path,{signal,method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error||'Request failed'),{status:r.status});return d;}
function Field({label,children,help}:any){return <label className="field"><span>{label}</span>{children}{help?<small>{help}</small>:null}</label>}

function FidelitySelect({value,onChange}:any){
 return <Field label="Reference fidelity"><select value={value} onChange={e=>onChange(e.target.value)}><option value="exact">Exact · preserve the reference design</option><option value="inspired">Inspired · use the reference as style guidance</option></select></Field>;
}

export default function DesignTemplateForm({clientId,template,files=[],brand,onUpload,busy,onSubmit}:any){
 const d=template?.data||{};
 const editing=!!template?.id;
 const [step,setStep]=useState<'ask'|'edit'>(editing?'edit':'ask');
 const [cat,setCat]=useState<any>(null);
 const [generating,setGenerating]=useState(false);
 const [error,setError]=useState('');
 const [note,setNote]=useState('');
 const [ask,setAsk]=useState({title:template?.title||'',vibe:'',audience:'',reference_image_file_id:d.reference_image_file_id||'',reference_fidelity:referenceFidelity(d),use_brand_colors:true,multicolour:true});
 const [f,set]=useState<any>({
  title:template?.title||'',
  reference_image_file_id:d.reference_image_file_id||'',
  reference_fidelity:referenceFidelity(d),
  fidelity_threshold:d.fidelity_threshold??85,
  direction:d.direction||'',
  rules:d.rules||'',
  avoid:d.avoid||'',
  is_default:!!d.is_default,
  mode:d.mode||((d.colors?.support||[]).length?'multicolour':'classic'),
  colors:{
   paper:d.colors?.paper||brand?.profile?.colors?.paper||'#fff8ef',
   ink:d.colors?.ink||brand?.profile?.colors?.ink||'#1a1a1a',
   accent:d.colors?.accent||brand?.profile?.colors?.accent||'#f0a202',
   support:Array.isArray(d.colors?.support)?d.colors.support:[],
  },
  fonts:{heading:d.fonts?.heading||brand?.profile?.type?.display?.font||'',body:d.fonts?.body||brand?.profile?.type?.body?.font||''},
 });
 const [specText,setSpecText]=useState(d.design_spec?JSON.stringify(d.design_spec,null,2):'');
 const [preview,setPreview]=useState('');
 const [previewBusy,setPreviewBusy]=useState(false);
 const [slotKind,setSlotKind]=useState('logo');
 const exact=f.reference_fidelity==='exact';
 const change=(k:string,v:any)=>{
  set((x:any)=>({...x,[k]:v,...(k==='reference_fidelity'&&v==='inspired'&&x.direction===EXACT_DIRECTION?{direction:''}:{})}));
  if(k==='colors'||k==='reference_fidelity')setPreview('');
 };
 const exactAsk=ask.reference_fidelity==='exact';
 const askReference=(id:string)=>setAsk(x=>({...x,reference_image_file_id:id,reference_fidelity:id?'exact':x.reference_fidelity}));
 const editReference=(id:string)=>{
  set(x=>({...x,reference_image_file_id:id,reference_fidelity:id?'exact':x.reference_fidelity}));
  setSpecText('');
  setPreview('');
 };
 const images=files.filter((x:any)=>/^image\/(png|jpeg|webp)$/.test(x.mime));
 const font=(id:string)=>cat?.fonts?.find((x:any)=>x.id===id);
 const support=f.colors.support||[];
 const palette=[f.colors.paper,f.colors.ink,f.colors.accent,...support].filter(Boolean);

 useEffect(()=>{api('design-catalog?client='+clientId).then((x:any)=>{setCat(x);set((old:any)=>({...old,fonts:{heading:old.fonts.heading||x.profile?.type?.display?.font||x.fonts[0]?.id||'',body:old.fonts.body||x.profile?.type?.body?.font||x.fonts[0]?.id||''}}));}).catch((e:any)=>setError(e.message));},[clientId]);

 const previewColors=JSON.stringify(f.colors);
 const previewReference=f.reference_image_file_id;
 useEffect(()=>{
  if(step!=='edit'||!exact||!previewReference||!specText)return;
  let spec;
  try{spec=JSON.parse(specText);}catch{return;}
  if(!spec?.slots?.length)return;
  const controller=new AbortController();
  const timer=setTimeout(()=>{
   setPreviewBusy(true);
   api('action',{client_id:clientId,action:'preview-design-template',data:{
    reference_fidelity:'exact',reference_image_file_id:previewReference,design_spec:spec,colors:JSON.parse(previewColors),
   }},controller.signal).then(result=>setPreview(result.image)).catch(err=>{
    if(!controller.signal.aborted)setError(err.message);
   }).finally(()=>{if(!controller.signal.aborted)setPreviewBusy(false);});
  },550);
  return ()=>{clearTimeout(timer);controller.abort();setPreviewBusy(false);};
 },[clientId,step,exact,previewReference,specText,previewColors]);

 const applyDraft=(draft:any)=>{
  set({
   title:draft.title||ask.title,
   reference_image_file_id:draft.data?.reference_image_file_id||ask.reference_image_file_id||'',
   reference_fidelity:draft.data?.reference_fidelity||'inspired',
   fidelity_threshold:draft.data?.fidelity_threshold??85,
   direction:draft.data?.direction||'',
   rules:draft.data?.rules||'',
   avoid:draft.data?.avoid||'',
   is_default:!!draft.data?.is_default,
   mode:draft.data?.mode||'classic',
   colors:{
    paper:draft.data?.colors?.paper||'#fff8ef',
    ink:draft.data?.colors?.ink||'#1a1a1a',
    accent:draft.data?.colors?.accent||'#f0a202',
    support:Array.isArray(draft.data?.colors?.support)?draft.data.colors.support:[],
   },
   fonts:{heading:draft.data?.fonts?.heading||'',body:draft.data?.fonts?.body||''},
  });
  setSpecText(draft.data?.design_spec?JSON.stringify(draft.data.design_spec,null,2):'');
  setPreview('');
  setNote(draft.meta?.note||'Draft ready — edit anything, then save.');
  setStep('edit');
 };

 const generate=async(e?:any)=>{e?.preventDefault();setError('');setGenerating(true);try{
  const draft=await api('action',{client_id:clientId,action:'propose-design-template',...ask,reference_image_file_id:ask.reference_image_file_id||null});
  applyDraft(draft);
 }catch(err:any){setError(err.message||'Could not draft the theme');}
 finally{setGenerating(false);}};

 const setSupport=(i:number,hex:string)=>change('colors',{...f.colors,support:support.map((c:string,idx:number)=>idx===i?hex:c)});
 const addSupport=()=>{if(support.length>=6)return;change('colors',{...f.colors,support:[...support,'#41ef34']});};
 const removeSupport=(i:number)=>change('colors',{...f.colors,support:support.filter((_:string,idx:number)=>idx!==i)});

 const readSpec=()=>specText.trim()?JSON.parse(specText):null;
 const themeData=()=>({...f,title:undefined,direction:exact?EXACT_DIRECTION:f.direction,reference_image_file_id:f.reference_image_file_id||null,design_spec:exact?readSpec():null});
 const save=(e:any)=>{
  e.preventDefault();
  setError('');
  try{onSubmit({kind:'DesignTemplate',id:template?.id,title:f.title,data:themeData()});}
  catch{setError('Enter valid JSON for the design spec.');}
 };
 const analyze=async()=>{
  setError('');setGenerating(true);setPreview('');
  try{
   const draft=await api('action',{client_id:clientId,action:'propose-design-template',title:f.title,reference_image_file_id:f.reference_image_file_id,reference_fidelity:'exact'});
   setSpecText(JSON.stringify(draft.data.design_spec,null,2));
   setNote(draft.meta.note);
  }catch(err:any){setError(err.message);}
  finally{setGenerating(false);}
 };
 const addSlot=()=>{
  try{
   const spec=readSpec();
   if(!Array.isArray(spec?.slots))throw new Error();
   setSpecText(JSON.stringify({...spec,slots:[...spec.slots,{kind:slotKind,x:10,y:10,width:25,height:10}]},null,2));
   setPreview('');
  }catch{setError('Analyze the reference or enter a valid design spec first.');}
 };

 const picker=(id:string,select:(id:string)=>void)=><Field label="Reference image">
  <div className="template-reference-picker">
   <select value={id} onChange={e=>select(e.target.value)}><option value="">No reference image</option>{images.map((file:any)=><option key={file.id} value={file.id}>{file.name}</option>)}</select>
   <label className="button"><Upload size={15}/>Upload image<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={async e=>{
    const input=e.currentTarget;
    const file=input.files?.[0];
    if(!file)return;
    try{const uploaded=await onUpload?.(file);if(uploaded?.id)select(uploaded.id);}
    finally{input.value='';}
   }}/></label>
  </div>
 </Field>;
 const warning=<p role="status" className="form-note">Attach a reference image to use Exact fidelity.</p>;

 if(step==='ask')return <form className="form-body design-template-form" onSubmit={generate}>
  <p className="form-note">Upload an example to reuse its design, or describe the visual style you want.</p>
  <Field label="Working title"><input maxLength={300} value={ask.title} onChange={e=>setAsk({...ask,title:e.target.value})} placeholder="e.g. Launch theme"/></Field>
  {picker(ask.reference_image_file_id,askReference)}
  <FidelitySelect value={ask.reference_fidelity} onChange={(v:string)=>setAsk(x=>({...x,reference_fidelity:v}))}/>
  {exactAsk&&!ask.reference_image_file_id&&warning}
  {!exactAsk&&<>
   <Field label="What should this theme feel like?"><textarea required rows={3} maxLength={500} value={ask.vibe} onChange={e=>setAsk({...ask,vibe:e.target.value})}/></Field>
   <Field label="Who is it mainly for? (optional)"><input maxLength={500} value={ask.audience} onChange={e=>setAsk({...ask,audience:e.target.value})}/></Field>
   <label className="check-label"><input type="checkbox" checked={ask.multicolour} onChange={e=>setAsk({...ask,multicolour:e.target.checked})}/>Multicolour theme</label>
   <label className="check-label"><input type="checkbox" checked={ask.use_brand_colors} onChange={e=>setAsk({...ask,use_brand_colors:e.target.checked})}/>Use brand colours when reference colours are unavailable</label>
  </>}
  {error&&<p className="form-error">{error}</p>}
  <div className="modal-actions">
   <button type="button" className="button" disabled={busy||generating} onClick={()=>{set((x:any)=>({...x,title:ask.title,reference_image_file_id:ask.reference_image_file_id,reference_fidelity:ask.reference_fidelity}));setStep('edit')}}>Fill by hand</button>
   <button className="button primary" disabled={busy||generating||!(exactAsk?ask.reference_image_file_id:ask.vibe.trim())||!cat}>{generating?<Loader2 size={16} className="spin"/>:<Sparkles size={16}/>} {generating?'Drafting theme…':'Generate draft'}</button>
  </div>
 </form>;

 return <form className="form-body design-template-form" onSubmit={save}>
  {!editing&&<button type="button" className="button" disabled={busy||generating} onClick={()=>setStep('ask')}>Back to draft options</button>}
  {note&&<p className="form-note">{note}</p>}
  <Field label="Template name"><input required maxLength={300} value={f.title} onChange={e=>change('title',e.target.value)}/></Field>
  {picker(f.reference_image_file_id,editReference)}
  <FidelitySelect value={f.reference_fidelity} onChange={(v:string)=>change('reference_fidelity',v)}/>
  {exact&&!f.reference_image_file_id&&warning}
  {!exact&&<>
   <div className="form-grid">{['heading','body'].map(kind=><Field key={kind} label={kind==='heading'?'Heading font':'Body font'}><select value={f.fonts[kind]} onChange={e=>change('fonts',{...f.fonts,[kind]:e.target.value})}>{(cat?.fonts||[]).map((item:any)=><option key={item.id} value={item.id}>{item.family}</option>)}</select></Field>)}</div>
   <label className="check-label"><input type="checkbox" checked={f.mode==='multicolour'} onChange={e=>change('mode',e.target.checked?'multicolour':'classic')}/>Multicolour theme</label>
  </>}
  {exact&&<p className="form-note">The design spec controls the reference’s typography and colours. The palette below applies to slots assigned a brand colour.</p>}
  <div className="form-grid three">{[['paper','Background'],['ink','Text'],['accent','Primary accent']].map(([key,label])=><Field key={key} label={label}><div className="colour-input"><input type="color" value={f.colors[key]} onChange={e=>change('colors',{...f.colors,[key]:e.target.value})}/><input value={f.colors[key]} onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&change('colors',{...f.colors,[key]:e.target.value})}/></div></Field>)}</div>
  {!exact&&<div className="field"><span>Support accents</span>
   <div className="support-colour-row">{support.map((c:string,i:number)=><div className="colour-input support-swatch" key={i}><input type="color" value={c} onChange={e=>setSupport(i,e.target.value)}/><input value={c} onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&setSupport(i,e.target.value)}/><button type="button" className="icon-button" aria-label="Remove colour" onClick={()=>removeSupport(i)}><X size={14}/></button></div>)}
   {support.length<6&&<button type="button" className="button" onClick={addSupport}><Plus size={14}/>Add colour</button>}</div>
  </div>}
  <div className="palette-strip template-palette">{(exact?palette.slice(0,3):palette).map((c:string,i:number)=><div key={c+i} style={{background:c}}><span>{c}</span></div>)}</div>
  {exact?<section className="template-preview">
   <h3>Reference vs Output</h3>
   {f.reference_image_file_id&&<div className="reference-comparison">
    <figure><figcaption>Reference</figcaption><img src={'/api/files/'+f.reference_image_file_id} alt="Uploaded reference"/></figure>
    <figure><figcaption>Live theme preview</figcaption>{preview?<img src={preview} alt="Exact output with sample brand copy"/>:<p className="form-note">{previewBusy?'Rendering preview…':'Analyze the reference and mark the content slots to preview the output.'}</p>}</figure>
   </div>}
   <div className="action-row">
    <button type="button" className="button" onClick={analyze} disabled={generating||previewBusy||!f.reference_image_file_id}>{generating?'Analyzing…':specText?'Analyze again':'Analyze reference'}</button>
   </div>
   <Field label="Minimum similarity (%)"><input type="number" min={0} max={100} value={f.fidelity_threshold} onChange={e=>change('fidelity_threshold',Number(e.target.value))}/></Field>
   <details className="reference-spec" open><summary>Design spec</summary>
    <div className="action-row"><select aria-label="New slot type" value={slotKind} onChange={e=>setSlotKind(e.target.value)}>{['headline','body','cta','brand','logo','subject'].map(kind=><option key={kind}>{kind}</option>)}</select><button type="button" className="button" disabled={!specText} onClick={addSlot}><Plus size={14}/>Add slot</button></div>
    <Field label="Design spec JSON" help="Positions, sizes, and crop are percentages. Keep decorative elements outside content slots. Set brand_color to paper, ink, or accent to use a brand colour."><textarea rows={12} spellCheck={false} value={specText} onChange={e=>{setSpecText(e.target.value);setPreview('')}}/></Field>
   </details>
  </section>:<section className="template-preview"><h3>Live theme preview</h3><div className="theme-preview-layout">{f.reference_image_file_id&&<figure><figcaption>Inspiration</figcaption><img src={'/api/files/'+f.reference_image_file_id} alt="Inspiration reference"/></figure>}<article style={{background:f.colors.paper,color:f.colors.ink}}><h2 style={{fontFamily:font(f.fonts.heading)?.family||'serif'}}>Your next story, in this style</h2><p style={{fontFamily:font(f.fonts.body)?.family||'sans-serif'}}>Preview of the theme’s colours and type.</p><div className="preview-accent-row">{[f.colors.accent,...support].filter(Boolean).slice(0,5).map((c:string,i:number)=><i key={i} style={{background:c}}/>)}</div><b style={{background:f.colors.accent,color:f.colors.ink}}>EXPLORE MORE</b></article></div></section>}
  <label className="check-label"><input type="checkbox" checked={f.is_default} onChange={e=>change('is_default',e.target.checked)}/>Use this as the default visual theme</label>
  <Field label="Visual direction"><textarea required rows={3} maxLength={3000} readOnly={exact} value={exact?EXACT_DIRECTION:f.direction} onChange={e=>change('direction',e.target.value)}/></Field>
  {!exact&&<div className="form-grid"><Field label="Always include"><textarea rows={3} maxLength={3000} value={f.rules} onChange={e=>change('rules',e.target.value)}/></Field><Field label="Avoid"><textarea rows={3} maxLength={1500} value={f.avoid} onChange={e=>change('avoid',e.target.value)}/></Field></div>}
  {error&&<p role="alert" className="form-error">{error}</p>}
  {exact&&<p className="form-note">Exact visuals use the reference canvas and aspect ratio.</p>}
  <div className="modal-actions"><button className="button primary" disabled={busy||generating||(!exact&&!f.direction.trim())||!cat}><Palette size={16}/>Save visual theme</button></div>
 </form>;
}
