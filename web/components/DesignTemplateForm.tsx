'use client';
import React,{useEffect,useState} from 'react';
import {Loader2,Palette,Plus,Sparkles,Upload,X} from 'lucide-react';

async function api(path:string,body?:any){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error||'Request failed'),{status:r.status});return d;}
function Field({label,children,help}:any){return <label className="field"><span>{label}</span>{children}{help?<small>{help}</small>:null}</label>}

export default function DesignTemplateForm({clientId,template,files=[],brand,onUpload,busy,onSubmit}:any){
 const d=template?.data||{};
 const editing=!!template?.id;
 const [step,setStep]=useState<'ask'|'edit'>(editing?'edit':'ask');
 const [cat,setCat]=useState<any>(null);
 const [generating,setGenerating]=useState(false);
 const [error,setError]=useState('');
 const [note,setNote]=useState('');
 const [ask,setAsk]=useState({title:template?.title||'',vibe:'',audience:'',reference_image_file_id:d.reference_image_file_id||'',use_brand_colors:true,multicolour:true});
 const [f,set]=useState<any>({
  title:template?.title||'',
  reference_image_file_id:d.reference_image_file_id||'',
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
 const change=(k:string,v:any)=>set((x:any)=>({...x,[k]:v}));
 const images=files.filter((x:any)=>/^image\/(png|jpeg|webp)$/.test(x.mime));
 const font=(id:string)=>cat?.fonts?.find((x:any)=>x.id===id);
 const support=f.colors.support||[];
 const palette=[f.colors.paper,f.colors.ink,f.colors.accent,...support].filter(Boolean);

 useEffect(()=>{api('design-catalog?client='+clientId).then((x:any)=>{setCat(x);set((old:any)=>({...old,fonts:{heading:old.fonts.heading||x.profile?.type?.display?.font||x.fonts[0]?.id||'',body:old.fonts.body||x.profile?.type?.body?.font||x.fonts[0]?.id||''}}));}).catch((e:any)=>setError(e.message));},[clientId]);

 const applyDraft=(draft:any)=>{
  set({
   title:draft.title||ask.title,
   reference_image_file_id:draft.data?.reference_image_file_id||ask.reference_image_file_id||'',
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
  setNote(draft.meta?.note||'Draft ready — edit anything, then save.');
  setStep('edit');
 };

 const generate=async(e?:any)=>{e?.preventDefault();setError('');setGenerating(true);try{
  const draft=await api('action',{client_id:clientId,action:'propose-design-template',title:ask.title,vibe:ask.vibe,audience:ask.audience,reference_image_file_id:ask.reference_image_file_id||null,use_brand_colors:ask.use_brand_colors,multicolour:ask.multicolour});
  applyDraft(draft);
 }catch(err:any){setError(err.message||'Could not draft the theme');}
 finally{setGenerating(false);}};

 const setSupport=(i:number,hex:string)=>change('colors',{...f.colors,support:support.map((c:string,idx:number)=>idx===i?hex:c)});
 const addSupport=()=>{if(support.length>=6)return;change('colors',{...f.colors,support:[...support,'#41ef34']});};
 const removeSupport=(i:number)=>change('colors',{...f.colors,support:support.filter((_:string,idx:number)=>idx!==i)});

 const save=(e:any)=>{e.preventDefault();onSubmit({kind:'DesignTemplate',id:template?.id,title:f.title,data:{direction:f.direction,rules:f.rules,avoid:f.avoid,is_default:f.is_default,mode:f.mode,reference_image_file_id:f.reference_image_file_id||null,colors:{paper:f.colors.paper,ink:f.colors.ink,accent:f.colors.accent,support:f.colors.support||[]},fonts:f.fonts}});};

 if(step==='ask')return <form className="form-body design-template-form" onSubmit={generate}>
  <p className="form-note">Answer a few prompts. EXORA drafts a multicolour theme from your logo hues — light background, dark text, several accents — then you edit and save.</p>
  <Field label="Working title"><input maxLength={300} value={ask.title} onChange={e=>setAsk({...ask,title:e.target.value})} placeholder="e.g. SunKidz multicolour"/></Field>
  <Field label="What should this theme feel like?" help="Mood, audience, lighting, or use cases. A short sentence is enough."><textarea required rows={3} maxLength={500} value={ask.vibe} onChange={e=>setAsk({...ask,vibe:e.target.value})} placeholder="e.g. Playful multicolour kids brand — bright letter colours, soft cream paper, friendly type"/></Field>
  <Field label="Who is it mainly for? (optional)"><input maxLength={500} value={ask.audience} onChange={e=>setAsk({...ask,audience:e.target.value})} placeholder="e.g. Parents of school-age kids in Bengaluru"/></Field>
  <Field label="Style reference image (optional)" help="Guides mood and pulls multiple accent colours. Claude will not copy its subject or text."><div className="template-reference-picker"><select value={ask.reference_image_file_id} onChange={e=>setAsk({...ask,reference_image_file_id:e.target.value})}><option value="">No reference image</option>{images.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select><label className="button"><Upload size={15}/>Upload image<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={async e=>{const input=e.currentTarget;const file=input.files?.[0];if(!file)return;const uploaded=await onUpload?.(file);if(uploaded?.id)setAsk(a=>({...a,reference_image_file_id:uploaded.id}));input.value=''}}/></label></div></Field>
  <label className="check-label"><input type="checkbox" checked={ask.multicolour} onChange={e=>setAsk({...ask,multicolour:e.target.checked})}/>Multicolour theme (light paper + many accent hues from the logo)</label>
  <label className="check-label"><input type="checkbox" checked={ask.use_brand_colors} onChange={e=>setAsk({...ask,use_brand_colors:e.target.checked})}/>Fall back to brand kit colours if the image has no strong hues</label>
  {error&&<p className="form-error">{error}</p>}
  <div className="modal-actions"><button type="button" className="button" disabled={busy||generating} onClick={()=>setStep('edit')}>Skip — fill by hand</button><button className="button primary" disabled={busy||generating||!ask.vibe.trim()||!cat}>{generating?<Loader2 size={16} className="spin"/>:<Sparkles size={16}/>}{generating?'Drafting theme…':'Generate draft'}</button></div>
 </form>;

 return <form className="form-body design-template-form" onSubmit={save}>
  {!editing&&<div className="action-row" style={{marginBottom:8}}><button type="button" className="button" disabled={busy||generating} onClick={()=>setStep('ask')}>Ask again</button><button type="button" className="button" disabled={busy||generating||!ask.vibe.trim()} onClick={()=>generate()}>{generating?<Loader2 size={14} className="spin"/>:<Sparkles size={14}/>}Regenerate draft</button></div>}
  {note&&<p className="form-note">{note}</p>}
  <Field label="Template name"><input required maxLength={300} value={f.title} onChange={e=>change('title',e.target.value)} placeholder="e.g. SunKidz multicolour"/></Field>
  <Field label="Style reference image" help="Upload or choose an image that shows the visual feel to reuse across photos and videos. It guides style only; Claude won’t copy its subject or text."><div className="template-reference-picker"><select value={f.reference_image_file_id} onChange={e=>change('reference_image_file_id',e.target.value)}><option value="">No reference image</option>{images.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select><label className="button"><Upload size={15}/>Upload image<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={async e=>{const input=e.currentTarget;const file=input.files?.[0];if(!file)return;const uploaded=await onUpload?.(file);if(uploaded?.id)change('reference_image_file_id',uploaded.id);input.value=''}}/></label></div></Field>
  <div className="form-grid"><Field label="Heading font"><select value={f.fonts.heading} onChange={e=>change('fonts',{...f.fonts,heading:e.target.value})}>{(cat?.fonts||[]).map((x:any)=><option key={x.id} value={x.id}>{x.family}</option>)}</select></Field><Field label="Body font"><select value={f.fonts.body} onChange={e=>change('fonts',{...f.fonts,body:e.target.value})}>{(cat?.fonts||[]).map((x:any)=><option key={x.id} value={x.id}>{x.family}</option>)}</select></Field></div>
  <label className="check-label"><input type="checkbox" checked={f.mode==='multicolour'} onChange={e=>change('mode',e.target.checked?'multicolour':'classic')}/>Multicolour theme — light background, dark text, rotate accent hues</label>
  <div className="form-grid three">{[['paper','Background'],['ink','Text'],['accent','Primary accent']].map(([key,label])=><Field key={key} label={label}><div className="colour-input"><input type="color" value={f.colors[key]} onChange={e=>change('colors',{...f.colors,[key]:e.target.value})}/><input value={f.colors[key]} onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&change('colors',{...f.colors,[key]:e.target.value})}/></div></Field>)}</div>
  <div className="field"><span>Support accents {f.mode==='multicolour'?'(multicolour palette)':'(optional)'}</span>
   <div className="support-colour-row">{support.map((c:string,i:number)=><div className="colour-input support-swatch" key={i}><input type="color" value={c} onChange={e=>setSupport(i,e.target.value)}/><input value={c} onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&setSupport(i,e.target.value)}/><button type="button" className="icon-button" aria-label="Remove colour" onClick={()=>removeSupport(i)}><X size={14}/></button></div>)}
   {support.length<6&&<button type="button" className="button" onClick={addSupport}><Plus size={14}/>Add colour</button>}</div>
   <small>Extra logo hues for stickers, underlines, CTAs and frame accents — not full-page backgrounds.</small>
  </div>
  <div className="palette-strip template-palette">{palette.map((c:string,i:number)=><div key={c+i} style={{background:c}}><span>{c}</span></div>)}</div>
  <section className="template-preview"><span className="eyebrow">LIVE THEME PREVIEW</span><div className="theme-preview-layout">{f.reference_image_file_id&&<img src={'/api/files/'+f.reference_image_file_id} alt="Selected visual style reference"/>}<article style={{background:f.colors.paper,color:f.colors.ink}}><span style={{color:f.colors.accent}}>THE VISUAL MOOD</span><h2 style={{fontFamily:font(f.fonts.heading)?.family||'serif'}}>Your next story, in this style</h2><p style={{fontFamily:font(f.fonts.body)?.family||'sans-serif'}}>Light paper, dark type, and multiple accents so the logo’s colours stay lively without washing the frame.</p><div className="preview-accent-row">{[f.colors.accent,...support].filter(Boolean).slice(0,5).map((c:string)=><i key={c} style={{background:c}}/>)}</div><b style={{background:f.colors.accent,color:f.colors.ink}}>EXPLORE MORE</b></article></div></section>
  <label className="check-label"><input type="checkbox" checked={f.is_default} onChange={e=>change('is_default',e.target.checked)}/>Use this as the default visual theme</label>
  <Field label="Visual direction" help="Describe the recurring mood, imagery, lighting, texture and overall feel."><textarea required rows={3} maxLength={3000} value={f.direction} onChange={e=>change('direction',e.target.value)} placeholder="e.g. Multicolour kids brand on cream paper…"/></Field>
  <div className="form-grid"><Field label="Always include"><textarea rows={3} maxLength={3000} value={f.rules} onChange={e=>change('rules',e.target.value)} placeholder="Light backgrounds, rotate accent colours…"/></Field><Field label="Avoid"><textarea rows={3} maxLength={1500} value={f.avoid} onChange={e=>change('avoid',e.target.value)} placeholder="Full-bleed saturated fills…"/></Field></div>
  {error&&<p className="form-error">{error}</p>}
  <p className="form-note">This is a reusable visual theme. The format and size are chosen separately when making each post or video.</p>
  <div className="modal-actions"><button className="button primary" disabled={busy||!f.direction.trim()||!cat}><Palette size={16}/>Save visual theme</button></div>
 </form>;
}
