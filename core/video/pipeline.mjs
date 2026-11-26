// Render a VideoDesign to MP4 without a model: per-beat HyperFrames renders in parallel, cached by content hash,
// stitched with a stream copy, then the cached narration is muxed in. A retry reuses every finished artefact.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import os from 'node:os';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {ROOT,q} from '../db/index.mjs';
import {stableStringify,totalSeconds,validateDesign} from './design.mjs';
import {designToHtml,RENDERER_VERSION} from './render-html.mjs';
const exec=promisify(execFile);

export const CACHE=path.join(ROOT,'.local/cache/video');
const HF=path.join(ROOT,'node_modules/hyperframes/bin/hyperframes.mjs');
const FONT_DIR=path.join(ROOT,'exora/fonts');
const sha=v=>crypto.createHash('sha256').update(typeof v==='string'?v:stableStringify(v)).digest('hex');
const ffmpeg=()=>{
 const bundled=path.join(ROOT,'.local/tools/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe');
 return process.env.FFMPEG_BIN||(process.platform==='win32'&&fs.existsSync(bundled)?bundled:'ffmpeg');
};
const hfVersion=(()=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,'node_modules/hyperframes/package.json'),'utf8')).version;}catch{return '0';}})();

// ---------- router ----------
/** Decide how a video is produced. Logged on the job so the decision is auditable. */
export function routeVideo({design,payload={}}={}){
 if(payload.generation_provider!=='codex'&&!['codex','template'].includes(payload.composer)&&(payload.composer==='claude-film'||process.env.EXORA_VIDEO_COMPOSER==='claude-film'))return {route:'claude-film',reason:'Claude-designed film explicitly requested (slow, model-heavy)'};
 const pending=(design?.media||[]).filter(m=>m.kind!=='upload'&&m.status!=='ready');
 if(pending.length)return {route:'generative',reason:`${pending.length} generated footage layer(s) need a generative model before the HTML render`};
 return {route:'html-local',reason:'Typographic / kinetic-text video: deterministic HTML render, no model call'};
}

// ---------- step tracing ----------
/** Records the start, end and outcome of every step so latency can be measured, not guessed. */
export function tracer(progress){
 const steps=[];const t0=Date.now();
 return {steps,
  async step(key,label,fn,{reusedIf}={}){const s={key,label,started_ms:Date.now()-t0};steps.push(s);progress?.start?.(key);
   try{const out=await fn();s.ms=Date.now()-t0-s.started_ms;s.status='done';if(reusedIf?.(out)){s.reused=true;progress?.reuse?.(key,label);}else progress?.finish?.(key,out?.summary);return out;}
   catch(e){s.ms=Date.now()-t0-s.started_ms;s.status='failed';s.error=String(e.message).slice(0,300);progress?.fail?.(key,e.message);e.step=key;throw e;}},
  total:()=>Date.now()-t0};
}

// ---------- concurrency ----------
async function pool(items,limit,fn){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i],i);}}));return out;}
// Each HyperFrames worker is a Chrome process (~300 MB). The budget is bounded by the container's memory limit, not just CPUs.
export function memoryLimitBytes(){for(const f of ['/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory/memory.limit_in_bytes']){try{const v=Number(fs.readFileSync(f,'utf8').trim());if(v>0&&v<os.totalmem())return v;}catch{}}return os.totalmem();}
export function renderBudget({cpus=Number(process.env.EXORA_RENDER_CPUS)||os.cpus().length,memory=memoryLimitBytes()}={}){
 const chromes=Math.max(1,Math.min(Math.max(1,cpus-1),Math.floor((memory-700*2**20)/(320*2**20)),Number(process.env.EXORA_RENDER_CHROMES)||24));
 const perBeat=chromes>=8?4:chromes>=4?2:1;
 return {perBeat,parallel:Math.max(1,Math.min(6,Math.floor(chromes/perBeat))),chromes};
}

// ---------- inputs ----------
export function fontsFor(design){
 const cat=JSON.parse(fs.readFileSync(path.join(FONT_DIR,'catalog.json'),'utf8')).fonts;
 const ids=[...new Set([design.theme.fonts.display.id,design.theme.fonts.body.id])];
 return cat.filter(f=>ids.includes(f.id)).map(f=>({id:f.id,family:f.family,faces:f.faces.map(x=>({file:x.file,style:x.style,weight:x.weight}))}));
}
export function fileIdsIn(design){const ids=new Set();const bg=b=>{if(b&&['image','video'].includes(b.kind)&&b.file_id)ids.add(b.file_id);};bg(design.theme.background);for(const b of design.beats)bg(b.style?.background);if(design.layout?.logo?.file_id&&design.layout.logo.position!=='none')ids.add(design.layout.logo.file_id);return [...ids];}
/** Uploaded files the design references, scoped to the client (and its parents). */
export async function resolveFiles(design,clientIds){
 const ids=fileIdsIn(design);if(!ids.length)return {};
 const rows=(await q('SELECT id,storage_path,size FROM files WHERE id=ANY($1::uuid[]) AND client_id=ANY($2::uuid[])',[ids,clientIds])).rows;
 const root=path.resolve(ROOT,'.local');const out={};
 for(const r of rows){const abs=path.resolve(root,r.storage_path);if(abs.startsWith(root+path.sep)&&fs.existsSync(abs))out[r.id]={abs,ext:path.extname(abs)||'.bin',size:r.size};}
 const missing=ids.filter(x=>!out[x]);if(missing.length)throw new Error(`A file used in this design is no longer available (${missing.length}). Pick another background or logo.`);
 return out;
}

// ---------- beats ----------
/** Cache key for one beat's picture: everything that can change its pixels, and nothing else. */
export function beatKey(design,i,files={}){
 const b=design.beats[i];const used=fileIdsIn({...design,beats:[b]}).map(id=>[id,files[id]?.size||0]);
 return sha({r:RENDERER_VERSION,hf:hfVersion,q:process.env.EXORA_VIDEO_QUALITY||'looks',f:[design.format,design.width,design.height,design.fps],theme:design.theme,layout:design.layout,beat:b,last:i===design.beats.length-1,used});
}
async function renderBeat(design,i,{files,fonts,perBeat,env}){
 const key=beatKey(design,i,files);const out=path.join(CACHE,'beats',key+'.mp4');
 if(fs.existsSync(out)&&fs.statSync(out).size>1000)return {path:out,cached:true,key};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vd-beat-'));
 try{
  fs.mkdirSync(path.join(dir,'assets'),{recursive:true});
  fs.copyFileSync(path.join(ROOT,'node_modules/gsap/dist/gsap.min.js'),path.join(dir,'assets/gsap.min.js'));
  for(const f of fonts){fs.mkdirSync(path.join(dir,'fonts',f.id),{recursive:true});for(const x of f.faces)fs.copyFileSync(path.join(FONT_DIR,f.id,x.file),path.join(dir,'fonts',f.id,x.file));}
  for(const [id,f] of Object.entries(files))fs.copyFileSync(f.abs,path.join(dir,'assets',id+f.ext));
  fs.writeFileSync(path.join(dir,'index.html'),designToHtml(design,{mode:'render',only:i,fonts,fileUrl:id=>`assets/${id}${files[id]?.ext||''}`}));
  fs.mkdirSync(path.dirname(out),{recursive:true});const tmp=out+'.'+process.pid+'.part.mp4';
  try{await exec(process.execPath,[HF,'render',dir,'--quality',process.env.EXORA_VIDEO_QUALITY||'looks','--fps',String(design.fps||30),'--workers',String(perBeat),'--quiet','-o',tmp],{env,timeout:600000,maxBuffer:20000000});}
  catch(e){fs.rmSync(tmp,{force:true});const tail=String(e.stderr||e.stdout||e.message).split('\n').filter(l=>l.trim()&&!/^\[(INFO|SystemMemory)/.test(l)).slice(-4).join(' ');throw new Error(`Beat ${i+1} did not render: ${tail.slice(0,300)}`);}
  fs.renameSync(tmp,out);return {path:out,cached:false,key};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}

// ---------- audio ----------
/** Narration cached per (text, voice). Direct ElevenLabs API when a key is set (no model tokens); otherwise the MCP relay. */
export async function ensureVoice({text,voiceId,clientName}){
 const key=sha({text:String(text).trim(),voiceId});const out=path.join(CACHE,'voice',key+'.mp3');
 if(fs.existsSync(out)&&fs.statSync(out).size>800)return {path:out,cached:true,key};
 fs.mkdirSync(path.dirname(out),{recursive:true});const tmp=out+'.part';fs.rmSync(tmp,{force:true});
 const el=await import('../runtime/elevenlabs.mjs');
 const direct=await el.synthesizeToFile({text,voiceId,outputPath:tmp});
 if(!direct){const r=await el.generateSpeech({text,voiceId,clientName});await el.downloadSpeech(r.audioUrl,tmp);}
 fs.renameSync(tmp,out);return {path:out,cached:false,key};
}
/** The audio track of an existing video, cached per file. Lets an old narrated video be re-cut without new speech. */
export async function audioFromFile(abs,fileId){
 const st=fs.statSync(abs);const out=path.join(CACHE,'audio',sha({fileId,size:st.size})+'.m4a');
 if(fs.existsSync(out))return {path:out,cached:true};
 fs.mkdirSync(path.dirname(out),{recursive:true});
 try{await exec(ffmpeg(),['-y','-v','error','-i',abs,'-vn','-c:a','aac','-b:a','192k',out+'.part.m4a'],{timeout:120000});fs.renameSync(out+'.part.m4a',out);return {path:out,cached:false};}
 catch{fs.rmSync(out+'.part.m4a',{force:true});return null;}
}
export async function mediaSeconds(file){const probe=process.env.FFPROBE_BIN||'ffprobe';const r=await exec(probe,['-v','error','-show_entries','format=duration','-of','csv=p=0',file],{timeout:30000});return Number(r.stdout.trim());}

/** Fit the beats to the narration length, keeping their relative pacing. */
export function fitToSeconds(design,seconds){
 const total=totalSeconds(design);if(!(seconds>0)||Math.abs(total-seconds)<0.05)return design;
 const k=seconds/total;return {...design,beats:design.beats.map(b=>({...b,duration:Math.max(0.5,+(b.duration*k).toFixed(2))}))};
}

// ---------- the DAG ----------
/**
 * renderDesign: fonts+inputs ∥ narration → beats (parallel, cached) → stitch (stream copy) → mux (cached audio).
 * @returns {path, seconds, design, trace:{steps,total_ms}, cache:{beats_reused,beats_rendered,voice_reused}}
 */
export async function renderDesign({design,clientIds,outDir,voice=null,audioFile=null,progress=null,fitAudio=false}){
 const problems=validateDesign(design);if(problems.length)throw new Error('The design is not valid: '+problems.slice(0,3).join(' · '));
 const T=tracer(progress);const {perBeat,parallel}=renderBudget();
 const encoder=ffmpeg();
 const env={...process.env,...(path.isAbsolute(encoder)?{PATH:path.dirname(encoder)+path.delimiter+(process.env.Path||process.env.PATH||'')}:{}),HYPERFRAMES_NO_TELEMETRY:'1',DO_NOT_TRACK:'1',HYPERFRAMES_CONFIG_DIR:path.join(ROOT,'.local/hyperframes'),...(process.env.CHROME_BIN?{HYPERFRAMES_BROWSER_PATH:process.env.CHROME_BIN}:{})};
 progress?.plan?.([{key:'inputs',label:'Fonts and files'},{key:'voice',label:'Narration'},{key:'beats',label:`Render ${design.beats.length} beats`},{key:'stitch',label:'Join beats'},{key:'mux',label:'Add sound'}]);
 // Independent: inputs and narration run at the same time.
 const [inputs,audio]=await Promise.all([
  T.step('inputs','Fonts and files',async()=>({fonts:fontsFor(design),files:await resolveFiles(design,clientIds)})),
  T.step('voice','Narration',async()=>{
   if(voice?.text&&voice?.voiceId){const v=await ensureVoice(voice);return {...v,seconds:await mediaSeconds(v.path)};}
   if(audioFile){const a=await audioFromFile(audioFile.abs,audioFile.id);return a?{...a,seconds:await mediaSeconds(a.path)}:null;}
   return null;},{reusedIf:a=>a?.cached}),
 ]);
 let d=design;if(fitAudio&&audio?.seconds)d=fitToSeconds(design,audio.seconds+0.4);
 // Whole frames per beat, so the stitched video's length is exactly the sum of the beats.
 const fps=d.fps||30;d={...d,beats:d.beats.map(b=>({...b,duration:Math.max(0.5,Math.round(b.duration*fps)/fps)}))};
 const beats=await T.step('beats',`Render ${d.beats.length} beats`,async()=>{
  const r=await pool(d.beats.map((_,i)=>i),parallel,async i=>{const x=await renderBeat(d,i,{...inputs,perBeat,env});progress?.event?.({text:`Beat ${i+1}/${d.beats.length} ${x.cached?'reused':'rendered'}`});return x;});
  return {list:r,summary:`${r.filter(x=>x.cached).length} reused, ${r.filter(x=>!x.cached).length} rendered`};},{reusedIf:r=>r.list.every(x=>x.cached)});
 fs.mkdirSync(outDir,{recursive:true});
 const silent=path.join(outDir,'reel-silent.mp4');
 await T.step('stitch','Join beats',async()=>{
  const list=path.join(outDir,'beats.txt');fs.writeFileSync(list,beats.list.map(b=>`file '${b.path.replace(/'/g,"'\\''")}'`).join('\n'));
  await exec(ffmpeg(),['-y','-v','error','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',silent],{timeout:300000});fs.rmSync(list,{force:true});});
 const output=path.join(outDir,'reel.mp4');const seconds=totalSeconds(d);
 await T.step('mux','Add sound',async()=>{
  if(!audio){fs.renameSync(silent,output);return;}
  // Picture is stream-copied; the narration is padded or cut to the picture length. No re-synthesis.
  await exec(ffmpeg(),['-y','-v','error','-i',silent,'-i',audio.path,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-af','apad','-t',String(seconds),'-movflags','+faststart',output],{timeout:300000});
  fs.rmSync(silent,{force:true});});
 return {path:output,seconds,design:d,trace:{steps:T.steps,total_ms:T.total(),budget:{perBeat,parallel}},cache:{beats_reused:beats.list.filter(b=>b.cached).length,beats_rendered:beats.list.filter(b=>!b.cached).length,voice_reused:!!audio?.cached},audio:audio?{seconds:audio.seconds,cached:!!audio.cached}:null};
}
