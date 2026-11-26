// Background jobs for design-backed videos: render a version, render a fresh video, or a narrated script video.
// Every step is traced on jobs.progress. A failed job keeps its finished artefacts in the cache, so "Try again" resumes.
import fs from 'node:fs';import path from 'node:path';
import {q,tx,id,ROOT,audit} from '../db/index.mjs';
import {resolveClient} from '../clients/tree.mjs';
import {createProgress} from '../runtime/progress.mjs';
import {stableStringify,validateDesign} from './design.mjs';
import {loadDesign,designVersion,clientIdsOf,videoFileOf} from './store.mjs';
import {renderDesign,routeVideo,CACHE} from './pipeline.mjs';

/** True when this job should use the design pipeline (everything except an explicit Claude-film request). */
export function usesDesignPipeline(job,asset){
 if(job.type==='video-design')return true;
 if(routeVideo({payload:job.payload}).route==='claude-film')return false;
 if(job.type==='render')return asset?.data?.type==='video'&&job.payload?.operation!=='clean-media';
 if(job.type==='voiceover')return job.payload?.flow==='script-voice-video';
 return false;
}

async function fileAbs(fileId,clientIds){if(!fileId)return null;const r=(await q('SELECT storage_path FROM files WHERE id=$1 AND client_id=ANY($2::uuid[])',[fileId,clientIds])).rows[0];if(!r)return null;const root=path.resolve(ROOT,'.local');const abs=path.resolve(root,r.storage_path);return abs.startsWith(root+path.sep)&&fs.existsSync(abs)?{abs,id:fileId}:null;}

/** Store a design the system produced (e.g. beats timed to new narration) as a new version and make it head. */
async function systemVersion(assetId,base,design,note,userId){
 return tx(async c=>{const v=(await c.query('SELECT coalesce(max(version),0)+1 v FROM video_design_versions WHERE asset_id=$1',[assetId])).rows[0].v;
  await c.query('INSERT INTO video_design_versions(id,asset_id,version,parent,design,patch,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),assetId,v,base,design,JSON.stringify([]),note,userId||null]);
  await c.query('UPDATE video_designs SET head=$2,updated_at=now() WHERE asset_id=$1',[assetId,v]);return v;});
}

export async function runVideoDesignJob(job){
 const progress=createProgress(p=>q('UPDATE jobs SET progress=$2,updated_at=now() WHERE id=$1',[job.id,p]));
 const user={id:job.created_by};
 try{
  const asset=(await q("SELECT * FROM records WHERE id=$1 AND client_id=$2 AND kind='Asset'",[job.payload.asset_id,job.client_id])).rows[0];
  if(!asset||!['draft','changes_requested'].includes(asset.status))throw new Error('This video is missing or approved. Approved work can’t be re-rendered; make a new version.');
  const client=await resolveClient(job.client_id);const clientIds=await clientIdsOf(client.id);
  const loaded=await loadDesign(asset,client,user,job.payload.design_template?.data);
  if(!loaded.design)throw new Error(loaded.read_only||'This video has no editable design.');
  let version=Number(job.payload.version)||loaded.head;
  let design=version===loaded.head?loaded.design:(await designVersion(asset.id,version))?.design;
  if(!design)throw new Error(`Design version ${version} does not exist`);
  if(job.type==='render'&&job.payload.composer==='codex'&&!design.meta?.codex_design_run_id){
   const {chooseCodexDesign}=await import('../design/codex-visual.mjs');
   const plan=await chooseCodexDesign({client,user,asset,payload:job.payload,design});
   design={...design,theme:{...design.theme,type:{...design.theme.type,align:plan.align},motion:{...design.theme.motion,preset:plan.motion}},layout:{...design.layout,text_position:plan.position},meta:{...design.meta,codex_design_run_id:plan.run_id}};
   if(job.payload.artwork_file_id){
    const [first,...rest]=design.beats;
    design.beats=[{...first,style:{...first.style,background:{kind:'image',file_id:job.payload.artwork_file_id,dim:0.58},ink:design.brand.palette[0]||design.theme.ink}},...rest];
   }
   if(validateDesign(design).length)throw new Error('Codex design did not pass video validation');
   version=await systemVersion(asset.id,version,design,'Designed with ChatGPT (Codex CLI)',user.id);
  }
  const route=routeVideo({design,payload:job.payload});progress.keep('route',route);progress.event({text:'Route: '+route.route+' ('+route.reason+')'});
  // Paid generation: saved as a version straight away, so a later failure never pays for the same footage twice.
  if(route.route==='generative'){const {generateMedia}=await import('./generative.mjs');design=await generateMedia({design,client,clientIds,user,progress});version=await systemVersion(asset.id,version,design,'Generated footage',user.id);}
  // Narration: new speech for a narrated script video; otherwise the asset's existing voice (cached) or the original video's audio.
  let voice=null,audioFile=null,fitAudio=false;
  if(job.type==='voiceover'){voice={text:job.payload.script,voiceId:job.payload.voice_id,clientName:job.payload.client_name||client.name};fitAudio=true;}
  else if(design.audio?.voice?.text&&design.audio.voice.voice_id)voice={text:design.audio.voice.text,voiceId:design.audio.voice.voice_id,clientName:client.name};
  else if(design.audio?.source_file_id||job.payload.audio_file_id)audioFile=await fileAbs(job.payload.audio_file_id||design.audio.source_file_id,clientIds);
  const outDir=path.join(ROOT,'.local/renders',asset.id,'design-v'+version+'-'+Date.now().toString(36));
  const r=await renderDesign({design,clientIds,outDir,voice,audioFile,progress,fitAudio});
  // When the beats were re-timed to new narration, keep that as the editable design (audio is now part of it).
  if(job.type==='voiceover'){const timed={...r.design,audio:{...r.design.audio,voice:{text:voice.text,voice_id:voice.voiceId},timing:'proportional'}};
   if(stableStringify(timed)!==stableStringify(design))version=await systemVersion(asset.id,version,timed,'Timed to the narration',user.id);}
  const name=job.type==='voiceover'?(asset.title+'.mp4').slice(0,200):'reel.mp4';
  const fid=id();const size=fs.statSync(r.path).size;
  await tx(async c=>{
   await c.query('INSERT INTO files(id,client_id,name,mime,size,storage_path,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[fid,job.client_id,name,'video/mp4',size,path.relative(path.join(ROOT,'.local'),r.path),job.created_by]);
   const files=[{id:fid,name,mime:'video/mp4'}];
   const fresh=(await c.query('SELECT data FROM records WHERE id=$1 FOR UPDATE',[asset.id])).rows[0].data;
   await c.query('UPDATE records SET data=$2,updated_at=now() WHERE id=$1',[asset.id,{...fresh,files,render_status:'completed',render_error:null,render_failed_step:null,
    render_engine:'EXORA video design (HTML + HyperFrames, local)'+(r.audio?' + narration':''),dimensions:[design.width,design.height],target_seconds:Math.round(r.seconds),
    ...(design.meta?.codex_design_run_id?{composer:'codex',design_run_id:design.meta.codex_design_run_id}:{}),video_design:{version,route,trace:r.trace,cache:r.cache},...(job.type==='voiceover'?{voiceover:{...(fresh.voiceover||{}),voice_id:voice.voiceId,narration_seconds:r.audio?.seconds||null}}:{})}]);
   await c.query('UPDATE video_design_versions SET rendered_file_id=$3 WHERE asset_id=$1 AND version=$2',[asset.id,version,fid]);
   await c.query("UPDATE jobs SET status='completed',result=$2,updated_at=now() WHERE id=$1",[job.id,{files,version,route,trace:r.trace,cache:r.cache}]);
   await audit(c,user,job.client_id,'video-design:rendered',asset.id,{version,file_id:fid,seconds:r.seconds,ms:r.trace.total_ms});
  });
  saveThroughput(r);
  return {file_id:fid,version,trace:r.trace};
 }catch(e){
  const step=e.step?` (step: ${e.step})`:'';
  throw new Error(String(e.message||e).slice(0,400)+step+'. Try again continues from the last finished step.');
 }finally{await progress.flush();}
}

// Measured render speed, used for the ETA shown while a video renders (read by core/video/estimate.mjs).
function saveThroughput(r){try{const s=r.trace.steps.find(x=>x.key==='beats');if(!s||!r.cache.beats_rendered)return;const frames=r.seconds*30*(r.cache.beats_rendered/(r.cache.beats_rendered+r.cache.beats_reused));fs.mkdirSync(CACHE,{recursive:true});fs.writeFileSync(path.join(CACHE,'throughput.json'),JSON.stringify({frames_per_second:+(frames/(s.ms/1000)).toFixed(1),at:new Date().toISOString()}));}catch{}}
