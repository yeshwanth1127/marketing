'use client';
import React,{useEffect,useRef,useState} from 'react';
import {AlertCircle,AudioLines,Check,Loader2,MessageCircle,Mic,Play,Upload} from 'lucide-react';

const FLOWS=[
 {id:'script-voice-video',title:'Script → voice → video',when:'You have writing. EXORA speaks it, then makes a reel around the narration.'},
 {id:'script-video-voice',title:'Script → video → voice',when:'A rendered video draft already exists. Add narration on top.'},
 {id:'upload-voice',title:'Uploaded video → voice',when:'You have an MP4 from a shoot. The original file stays unchanged.'},
];

function Field({label,children,help}:any){return <label className="field"><span>{label}</span>{children}{help?<small>{help}</small>:null}</label>}

export function VoicePicker({voices=[],value,onChange,clientId,heard,onHeard,disabled}:any){
 const audio=useRef<HTMLAudioElement|null>(null);
 const [playing,setPlaying]=useState(''),[loading,setLoading]=useState(''),[error,setError]=useState('');
 const stop=()=>{audio.current?.pause();if(audio.current)audio.current.src='';setPlaying('');};
 const play=async(voice:any)=>{
  if(disabled)return;
  if(playing===voice.voice_id){stop();return;}
  stop();setError('');setLoading(voice.voice_id);
  try{
   const r=await fetch('/api/voiceover/preview?voice='+encodeURIComponent(voice.voice_id)+'&client='+encodeURIComponent(clientId));
   if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Sample could not play');}
   const url=URL.createObjectURL(await r.blob());
   const el=new Audio(url);audio.current=el;
   el.onended=()=>{URL.revokeObjectURL(url);setPlaying('');};
   el.onerror=()=>{URL.revokeObjectURL(url);setPlaying('');setError('Sample could not play');};
   await el.play();setPlaying(voice.voice_id);onHeard?.(voice.voice_id);onChange(voice.voice_id);
  }catch(e:any){setPlaying('');setError(e.message||'Sample could not play');}
  finally{setLoading('');}
 };
 useEffect(()=>()=>stop(),[]);
 if(!voices.length)return <p className="form-note">Four voice types will appear here.</p>;
 return <><div className="voice-grid">{voices.map((v:any)=>{const selected=value===v.voice_id,listened=heard?.has(v.voice_id),cached=!!v.cached;return <article key={v.voice_id} className={'voice-card'+(selected?' chosen':'')}><button type="button" className="voice-card-main" disabled={disabled} onClick={()=>onChange(v.voice_id)}><span className="voice-mark"><Mic size={16}/></span><span><b>{v.name}</b><small>{v.gender} · {v.use}{cached?' · saved locally':''}</small></span>{selected&&<Check size={16}/>}</button><button type="button" className={'button'+(playing===v.voice_id?' primary':'')} disabled={disabled||!!loading} onClick={()=>play(v)}>{loading===v.voice_id?<Loader2 size={14} className="spin"/>:<Play size={14}/>}{playing===v.voice_id?'Playing':'Listen'}{listened||cached?' ✓':''}</button></article>;})}</div>{error&&<div className="check-result error"><AlertCircle size={16}/>{error}</div>}<p className="form-note">Samples are stored under .local/voice-previews. First listen downloads from ElevenLabs if missing; later listens play the local file.</p></>;
}

export function VoicePage({client,assets,files,canEdit,busy,jobs,onUpload,onNarrate,onSaveVoice,onInstallSamples,onOpen}:any){
 const preferred=client?.settings?.voice?.voice_id||'';
 const [voices,setVoices]=useState<any[]>([]),[value,setValue]=useState(preferred),[heard,setHeard]=useState<Set<string>>(new Set()),[error,setError]=useState(''),[loading,setLoading]=useState(true),[installing,setInstalling]=useState(false);
 const narrated=(assets||[]).filter((a:any)=>a.data?.voiceover);
 const loadVoices=()=>fetch('/api/voiceover/voices?client='+encodeURIComponent(client.id)).then(r=>r.json()).then(d=>{setVoices(d.voices||[]);if(!preferred&&d.preferred?.voice_id)setValue(d.preferred.voice_id);return d;});
 useEffect(()=>{let live=true;loadVoices().catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false};},[client.id]);
 const save=()=>{if(!value)return;onSaveVoice(value,voices.find((v:any)=>v.voice_id===value)?.name);};
 const missing=voices.filter((v:any)=>!v.cached).length;
 const install=async()=>{if(!onInstallSamples)return;setInstalling(true);setError('');try{const out=await onInstallSamples();await loadVoices();if(out&&out.ok===false)setError((out.results||[]).filter((r:any)=>r.error).map((r:any)=>r.name+': '+r.error).join(' · ')||'Some samples failed');}catch(e:any){setError(e.message||'Could not install samples');}finally{setInstalling(false);}};
 return <div className="voice-page">
  <section className="panel"><div className="panel-title"><div><span className="eyebrow">ELEVENLABS</span><h2>Choose a voice for {client.name}</h2></div><div className="action-row">{canEdit&&missing>0&&<button className="button" disabled={busy||installing} onClick={install}>{installing?<Loader2 size={14} className="spin"/>:null}{installing?'Installing samples…':`Install ${missing} sample${missing===1?'':'s'}`}</button>}{canEdit&&<button className="button primary" disabled={busy||!value||value===preferred} onClick={save}>Save as default</button>}</div></div>
  <p className="muted">Listen to a sample before you narrate. The saved voice is used for all three flows on this workspace, including Design & video.</p>
  {loading?<p className="form-note">Loading voices…</p>:<VoicePicker voices={voices} value={value} clientId={client.id} heard={heard} onHeard={(id:string)=>setHeard(s=>new Set(s).add(id))} onChange={setValue} disabled={!canEdit||busy||installing}/>}
  {error&&<div className="check-result error"><AlertCircle size={16}/>{error}</div>}
  {preferred&&<p className="form-note">Default now: {client.settings.voice?.name||preferred}. Listen, then save to change it.</p>}
 </section>
  <section className="panel section"><div className="panel-title"><div><span className="eyebrow">THREE FLOWS</span><h2>Add narration</h2></div></div>
  <p className="muted">Pick the path that matches what you already have. You will listen again in the next step before EXORA generates speech.</p>
  <div className="voice-flow-grid">{FLOWS.map(flow=><button type="button" className="voice-flow-card" key={flow.id} disabled={!canEdit||busy||!value} onClick={()=>onNarrate({flow:flow.id,voice_id:value})}><AudioLines size={18}/><b>{flow.title}</b><small>{flow.when}</small></button>)}</div>
 </section>
  <section className="panel section"><div className="panel-title"><h2>Narrated drafts</h2><span className="subtle">{narrated.length} here</span></div>
  {narrated.length?narrated.map((r:any)=><button type="button" className="file-row strategy-row" key={r.id} onClick={()=>onOpen(r)}><span className="level-chip">{FLOWS.find(f=>f.id===r.data.voiceover?.flow)?.title||'Voice'}</span><div><b>{r.title}</b><small>{r.data.voiceover?.voice_id||'ElevenLabs'} · {r.data.render_status||r.status}</small></div></button>):<p className="muted">Finished narration shows here after a flow completes.</p>}
  {!!jobs?.length&&<p className="form-note">{jobs.filter((j:any)=>['queued','running'].includes(j.status)).length} narration job(s) working.</p>}
 </section>
 </div>;
}

export function VoiceoverForm({clientId,assets,files,busy,onUpload,onSubmit,defaultFlow='script-voice-video',defaultVoice='',defaultScriptId='',defaultVideoFileId='',defaultVideoAssetId=''}:any){
 const scripts=assets.filter((a:any)=>a.data?.type==='copy');
 const videos=assets.filter((a:any)=>a.data?.type==='video'&&a.data?.render_status==='completed'&&a.data?.files?.some((f:any)=>f.mime==='video/mp4'));
 const uploads=files.filter((f:any)=>f.mime==='video/mp4');
 const [f,set]=useState<any>({flow:defaultFlow,slot_date:'',asset_id:defaultScriptId,video_asset_id:defaultVideoAssetId,video_file_id:defaultVideoFileId,script_id:defaultScriptId,script:'',voice_id:defaultVoice,keep_original_audio:true});
 const [voices,setVoices]=useState<any[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[heard,setHeard]=useState<Set<string>>(new Set());
 useEffect(()=>{let live=true;fetch('/api/voiceover/voices?client='+encodeURIComponent(clientId)).then(r=>r.json()).then(d=>{if(!live)return;setVoices(d.voices||[]);set(prev=>({...prev,voice_id:prev.voice_id||d.preferred?.voice_id||''}));}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false};},[clientId]);
 const dated=scripts.filter((a:any)=>!f.slot_date||a.data.slot_date===f.slot_date);
 const chosen=scripts.find((a:any)=>a.id===f.script_id);
 const listened=heard.has(f.voice_id);
 const ready=!!f.voice_id&&listened&&(f.flow==='upload-voice'?!!f.video_file_id&&!!(f.script||f.script_id):!!(f.script_id||f.asset_id)&&!!f.slot_date&&(f.flow!=='script-video-voice'||!!f.video_asset_id));
 const submit=(e:any)=>{e.preventDefault();if(!listened){setError('Listen to the sample before generating narration.');return;}const source=chosen||scripts.find((a:any)=>a.id===f.asset_id);onSubmit({...f,asset_id:source?.id||f.asset_id,script:source?undefined:f.script,script_id:source?.id||undefined});};
 return <form className="form-body voiceover-form" onSubmit={submit}>
  <div className="voice-flow-grid compact">{FLOWS.map(flow=><button type="button" key={flow.id} className={'voice-flow-card'+(f.flow===flow.id?' chosen':'')} onClick={()=>set({...f,flow:flow.id,asset_id:f.flow===flow.id?f.asset_id:'',script_id:f.flow===flow.id?f.script_id:'',video_asset_id:'',video_file_id:''})}><b>{flow.title}</b><small>{flow.when}</small></button>)}</div>
  <div className="panel-title" style={{marginTop:8}}><h3>Voice</h3><span className="subtle">Listen, then generate</span></div>
  {loading?<p className="form-note">Loading voices…</p>:<VoicePicker voices={voices} value={f.voice_id} clientId={clientId} heard={heard} onHeard={(id:string)=>setHeard(s=>new Set(s).add(id))} onChange={(voice_id:string)=>set({...f,voice_id})} disabled={busy}/>}
  {!listened&&f.voice_id&&<p className="form-note">Play the sample for this voice before creating the narrated draft.</p>}
  <div className="form-grid">{f.flow!=='upload-voice'&&<Field label="Planned date"><input type="date" required value={f.slot_date} onChange={e=>set({...f,slot_date:e.target.value,asset_id:'',script_id:''})}/></Field>}</div>
  {error&&<div className="check-result error"><AlertCircle size={16}/>{error}</div>}
  {(f.flow!=='upload-voice'||!f.script)&&<Field label="Script for this date"><select value={f.script_id||f.asset_id} onChange={e=>set({...f,script_id:e.target.value,asset_id:e.target.value})}><option value="">Choose a script</option>{dated.map((a:any)=><option key={a.id} value={a.id}>{a.title}</option>)}</select></Field>}
  {f.flow==='upload-voice'&&<><Field label="Uploaded video"><select required value={f.video_file_id} onChange={e=>set({...f,video_file_id:e.target.value})}><option value="">Choose an uploaded MP4</option>{uploads.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><label className="button"><Upload size={15}/>Upload an MP4<input hidden type="file" accept="video/mp4" onChange={async e=>{const el=e.currentTarget,file=el.files?.[0];if(file){const row=await onUpload(file);if(row?.id)set({...f,video_file_id:row.id});}el.value='';}}/></label><Field label="Narration script (optional if a script is selected)"><textarea rows={5} maxLength={12000} value={f.script} onChange={e=>set({...f,script:e.target.value})} placeholder="Choose dated writing above, or type a script for this footage."/></Field></>}
  {f.flow==='script-video-voice'&&<Field label="Completed video draft"><select required value={f.video_asset_id} onChange={e=>set({...f,video_asset_id:e.target.value})}><option value="">Choose a rendered video</option>{videos.map((a:any)=><option key={a.id} value={a.id}>{a.title} · {a.data.slot_date||'undated'}</option>)}</select></Field>}
  <Field label="Original video sound"><select value={f.keep_original_audio?'mix':'replace'} onChange={e=>set({...f,keep_original_audio:e.target.value==='mix'})}><option value="mix">Keep at lower volume under narration</option><option value="replace">Replace with narration</option></select></Field>
  <p className="form-note">The uploaded source stays unchanged. The narrated result is saved as a draft for preview and Review. If narration runs longer than the video, the job fails so you can shorten the script.</p>
  <div className="modal-actions"><button className="button primary" disabled={busy||loading||!ready}><MessageCircle size={16}/>Create narrated draft</button></div>
 </form>;
}
