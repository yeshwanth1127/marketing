// HTTP surface of the video editor. Mounted from core/api.mjs for every route starting with "video-design".
//  GET  video-design?client=&asset=              current design, versions, fonts, media, render state
//  GET  video-design/variants?client=&asset=     deterministic design ideas (each one a patch)
//  GET  video-design/gsap.js                     animation runtime for the live preview
//  POST video-design/patch     {client_id,asset_id,base,ops,note}   -> new version (JSON Patch only)
//  POST video-design/apply     {client_id,asset_id,version?}        -> background render job
//  POST video-design/undo|redo|revert {client_id,asset_id}
//  POST video-design/interpret {client_id,asset_id,text}            -> ops from one small-model call (not saved)
//  POST video-design/retry     {client_id,job_id}                   -> re-queue a failed video job; finished steps are reused
import fs from 'node:fs';import path from 'node:path';
import {q,ROOT,id,fail,audit,pool} from '../db/index.mjs';
import {access,authorize} from '../auth/index.mjs';
import {loadDesign,patchDesign,moveHead,brandForDesign} from './store.mjs';
import {designVariants} from './design.mjs';
import {estimateSeconds} from './estimate.mjs';

const json=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function body(req){const t=await req.text();if(t.length>400000)fail('Request too large',413);try{return JSON.parse(t||'{}');}catch{fail('Invalid JSON');}}
async function assetFor(client,assetId){if(!/^[0-9a-f-]{36}$/i.test(String(assetId||'')))fail('Choose a video');const a=(await q("SELECT * FROM records WHERE id=$1 AND client_id=$2 AND kind='Asset'",[assetId,client.id])).rows[0];if(!a)fail('Video not found',404);return a;}
const catalog=()=>JSON.parse(fs.readFileSync(path.join(ROOT,'exora/fonts/catalog.json'),'utf8')).fonts;

export async function videoDesignHttp(req,url,route,user){
 if(route==='video-design/gsap.js'&&req.method==='GET')return new Response(fs.readFileSync(path.join(ROOT,'node_modules/gsap/dist/gsap.min.js')),{headers:{'Content-Type':'text/javascript','Cache-Control':'private, max-age=86400'}});
 if(req.method==='GET'){
  const client=await access(user,url.searchParams.get('client'));const asset=await assetFor(client,url.searchParams.get('asset'));
  const loaded=await loadDesign(asset,client,user);
  if(route==='video-design/variants'){if(!loaded.design)fail(loaded.read_only,409);return json({variants:designVariants(loaded.design,{n:Math.min(8,Number(url.searchParams.get('n'))||6)})});}
  if(route!=='video-design')fail('Not found',404);
  const fonts=catalog().map(f=>({id:f.id,family:f.family,role:f.role,faces:f.faces.map(x=>({file:x.file,style:x.style,weight:x.weight}))}));
  const media=(await q("SELECT id,name,mime FROM files WHERE client_id=$1 AND (mime LIKE 'image/%' OR mime='video/mp4') AND storage_path LIKE 'uploads/%' ORDER BY created_at DESC LIMIT 60",[client.id])).rows;
  const job=(await q("SELECT id,type,status,error,progress,created_at,updated_at FROM jobs WHERE client_id=$1 AND payload->>'asset_id'=$2 AND type IN ('video-design','render','voiceover') ORDER BY created_at DESC LIMIT 1",[client.id,asset.id])).rows[0]||null;
  return json({...loaded,fonts,media,job,estimate_seconds:loaded.design?estimateSeconds(loaded.design):null,brand:await brandForDesign(client)});
 }
 if(req.method!=='POST')fail('Not found',404);
 const b=await body(req);const client=await access(user,b.client_id);authorize(user);
 if(route==='video-design/retry'){
  const job=(await q("SELECT * FROM jobs WHERE id=$1 AND client_id=$2",[String(b.job_id||''),client.id])).rows[0];
  if(!job||!['render','voiceover','video-design'].includes(job.type))fail('Job not found',404);if(job.status!=='failed')fail('Only a failed job can be retried',409);
  await q("UPDATE jobs SET status='queued',error=NULL,locked_at=NULL,run_at=now(),updated_at=now() WHERE id=$1",[job.id]);
  await q("UPDATE records SET data=data||'{\"render_status\":\"queued\",\"render_error\":null}'::jsonb,updated_at=now() WHERE id=$1 AND status IN ('draft','changes_requested')",[job.payload.asset_id]);
  return json({job_id:job.id,status:'queued'});
 }
 const asset=await assetFor(client,b.asset_id);
 if(route==='video-design/patch'){const r=await patchDesign({asset,user,base:b.base,ops:b.ops,note:b.note});return json(r);}
 if(['video-design/undo','video-design/redo','video-design/revert'].includes(route)){const r=await moveHead({asset,user,action:route.split('/')[1]});return json(r);}
 if(route==='video-design/interpret'){
  const loaded=await loadDesign(asset,client,user);if(!loaded.design)fail(loaded.read_only,409);
  const {interpretEdit}=await import('./edit-intent.mjs');
  return json(await interpretEdit({design:loaded.design,request:b.text,fonts:loaded.design.brand.locked?loaded.design.brand.fonts:catalog().map(f=>f.id)}));
 }
 if(route==='video-design/apply'){
  const loaded=await loadDesign(asset,client,user);if(!loaded.design)fail(loaded.read_only,409);if(!loaded.editable)fail('Approved work can’t be re-rendered. Make a new version of the asset.',409);
  const version=Number(b.version)||loaded.head;
  const running=(await q("SELECT id FROM jobs WHERE client_id=$1 AND payload->>'asset_id'=$2 AND type='video-design' AND status IN ('queued','running')",[client.id,asset.id])).rows[0];
  if(running)return json({job_id:running.id,status:'already-queued'});
  const jid=id();const c=await pool.connect();
  try{await c.query('BEGIN');
   await c.query("INSERT INTO jobs(id,client_id,type,payload,created_by) VALUES($1,$2,'video-design',$3,$4)",[jid,client.id,{asset_id:asset.id,version},user.id]);
   await c.query("UPDATE records SET data=data||'{\"render_status\":\"queued\",\"render_error\":null}'::jsonb,updated_at=now() WHERE id=$1",[asset.id]);
   await audit(c,user,client.id,'video-design:apply',asset.id,{version});await c.query('COMMIT');}
  catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  return json({job_id:jid,status:'queued',estimate_seconds:estimateSeconds(loaded.design)});
 }
 fail('Not found',404);
}
