// Versioned storage for VideoDesign documents: lazy backfill, JSON-Patch edits, undo/redo, revert.
import {q,tx,id,ROOT} from '../db/index.mjs';
import {brandFor,chainOf} from '../clients/tree.mjs';
import {brandWithTheme,profileFor} from '../design/brand-profile.mjs';
import {applyPatch,validateDesign,designFromAsset,changedBeats} from './design.mjs';
import fs from 'node:fs';import path from 'node:path';

const EDITABLE_STATUS=['draft','changes_requested'];
const httpError=(msg,status=400)=>Object.assign(new Error(msg),{status});

/** Palette, fonts and logo from the brand kit: the only colours and fonts a locked design may use. */
export async function brandForDesign(client,theme){
 const kit=(await brandFor(client)).data||{};const p=profileFor(brandWithTheme(kit,theme),client);const c=p.colors||{};
 const palette=[...new Set([c.paper,c.ink,c.accent,...(c.support||[]),c.muted,c.surface,...(kit.colors||[])].filter(v=>/^#[0-9a-f]{6}$/i.test(String(v||''))).map(v=>v.toLowerCase()))];
 const display=p.type?.display?.font,body=p.type?.body?.font;
 return {palette:[c.paper,c.ink,c.accent].filter(Boolean).map(v=>v.toLowerCase()).concat(palette).filter((v,i,a)=>a.indexOf(v)===i),fonts:{display,body},font_ids:[display,body,p.type?.label?.font].filter(Boolean),logo_file_id:kit.logo_file_id||null};
}

/** The asset's current video MP4 file (for re-using its narration when re-cutting an older video). */
export function videoFileOf(asset){return (asset.data?.files||[]).find(f=>f.mime==='video/mp4')||null;}

/** Current design for a video asset. Creates version 1 from the asset the first time (best-effort backfill). */
export async function loadDesign(asset,client,user,theme){
 if(asset.kind!=='Asset'||asset.data?.type!=='video')throw httpError('Only videos have an editable design',404);
 let row=(await q('SELECT * FROM video_designs WHERE asset_id=$1',[asset.id])).rows[0];
 if(!row){
  const brand=await brandForDesign(client,theme);const file=videoFileOf(asset);
  const built=designFromAsset(asset,{brand,client,sourceFileId:file?.id||null});
  await tx(async c=>{
   await c.query('INSERT INTO video_designs(asset_id,client_id,head,read_only) VALUES($1,$2,1,$3) ON CONFLICT(asset_id) DO NOTHING',[asset.id,asset.client_id,built.read_only||null]);
   if(built.design)await c.query('INSERT INTO video_design_versions(id,asset_id,version,parent,design,note,rendered_file_id,created_by) VALUES($1,$2,1,NULL,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[id(),asset.id,built.design,'Rebuilt from the original video',file?.id||null,user?.id||null]);
  });
  row=(await q('SELECT * FROM video_designs WHERE asset_id=$1',[asset.id])).rows[0];
 }
 const versions=(await q('SELECT version,parent,note,patch,rendered_file_id,created_at FROM video_design_versions WHERE asset_id=$1 ORDER BY version',[asset.id])).rows;
 if(row.read_only||!versions.length)return {read_only:row.read_only||'This video cannot be edited.',head:0,versions:[],design:null};
 const head=(await q('SELECT design FROM video_design_versions WHERE asset_id=$1 AND version=$2',[asset.id,row.head])).rows[0];
 const max=Math.max(...versions.map(v=>v.version));
 return {design:head.design,head:row.head,versions:versions.map(v=>({version:v.version,parent:v.parent,note:v.note,ops:Array.isArray(v.patch)?v.patch.length:0,rendered:!!v.rendered_file_id,created_at:v.created_at})),
  can_undo:!!versions.find(v=>v.version===row.head)?.parent,can_redo:versions.some(v=>v.parent===row.head),latest:max,read_only:null,
  editable:EDITABLE_STATUS.includes(asset.status)};
}

function assertEditable(asset){if(!EDITABLE_STATUS.includes(asset.status))throw httpError('Approved work can’t be edited. Make a new version of the asset to change it.',409);}

/** Apply a JSON Patch to the head version and store the result as a new version. base must be the current head. */
export async function patchDesign({asset,user,base,ops,note}){
 assertEditable(asset);
 return tx(async c=>{
  const row=(await c.query('SELECT * FROM video_designs WHERE asset_id=$1 FOR UPDATE',[asset.id])).rows[0];
  if(!row||row.read_only)throw httpError(row?.read_only||'Open the editor first',409);
  if(Number(base)!==row.head)throw httpError('This video was changed somewhere else. Reload the editor and try again.',409);
  const cur=(await c.query('SELECT design FROM video_design_versions WHERE asset_id=$1 AND version=$2',[asset.id,row.head])).rows[0].design;
  let next;try{next=applyPatch(cur,ops);}catch(e){throw httpError(e.message);}
  const fontIds=JSON.parse(fs.readFileSync(path.join(ROOT,'exora/fonts/catalog.json'),'utf8')).fonts.map(f=>f.id);
  const problems=validateDesign(next,{fontIds});if(problems.length)throw httpError(problems.slice(0,4).join(' · '),422);
  const version=(await c.query('SELECT coalesce(max(version),0)+1 v FROM video_design_versions WHERE asset_id=$1',[asset.id])).rows[0].v;
  await c.query('INSERT INTO video_design_versions(id,asset_id,version,parent,design,patch,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),asset.id,version,row.head,next,JSON.stringify(ops),String(note||'').slice(0,200)||null,user?.id||null]);
  await c.query('UPDATE video_designs SET head=$2,updated_at=now() WHERE asset_id=$1',[asset.id,version]);
  return {version,design:next,changed_beats:changedBeats(cur,next)};
 });
}

/** Move head: undo (to parent), redo (to the newest child), revert (a new version equal to the original). */
export async function moveHead({asset,user,action}){
 assertEditable(asset);
 return tx(async c=>{
  const row=(await c.query('SELECT * FROM video_designs WHERE asset_id=$1 FOR UPDATE',[asset.id])).rows[0];if(!row||row.read_only)throw httpError('Nothing to change',409);
  const cur=(await c.query('SELECT version,parent FROM video_design_versions WHERE asset_id=$1 AND version=$2',[asset.id,row.head])).rows[0];
  let target;
  if(action==='undo'){if(!cur.parent)throw httpError('Nothing to undo',409);target=cur.parent;}
  else if(action==='redo'){const child=(await c.query('SELECT version FROM video_design_versions WHERE asset_id=$1 AND parent=$2 ORDER BY version DESC LIMIT 1',[asset.id,row.head])).rows[0];if(!child)throw httpError('Nothing to redo',409);target=child.version;}
  else if(action==='revert'){
   const orig=(await c.query('SELECT design FROM video_design_versions WHERE asset_id=$1 AND version=1',[asset.id])).rows[0];
   target=(await c.query('SELECT coalesce(max(version),0)+1 v FROM video_design_versions WHERE asset_id=$1',[asset.id])).rows[0].v;
   await c.query('INSERT INTO video_design_versions(id,asset_id,version,parent,design,patch,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),asset.id,target,row.head,orig.design,JSON.stringify([]),'Reverted to the original',user?.id||null]);
  }else throw httpError('Unknown action');
  await c.query('UPDATE video_designs SET head=$2,updated_at=now() WHERE asset_id=$1',[asset.id,target]);
  return {head:target};
 });
}

export async function designVersion(assetId,version){return (await q('SELECT * FROM video_design_versions WHERE asset_id=$1 AND version=$2',[assetId,version])).rows[0]||null;}
export async function clientIdsOf(clientId){return (await chainOf(clientId)).map(n=>n.id);}
