// Back-fill a VideoDesign for every existing video asset (best-effort from the stored beat sheet / on-screen text / script).
// Assets that cannot be rebuilt are recorded as read-only with the reason; their MP4 is untouched.
// Idempotent: assets that already have a design are skipped. Usage: node scripts/backfill-video-designs.mjs [--dry-run]
import {q,pool,ensureSchema} from '../core/db/index.mjs';
import {resolveClient} from '../core/clients/tree.mjs';
import {designFromAsset} from '../core/video/design.mjs';
import {brandForDesign,loadDesign,videoFileOf} from '../core/video/store.mjs';

const dry=process.argv.includes('--dry-run');
await ensureSchema();
const rows=(await q("SELECT r.* FROM records r LEFT JOIN video_designs v ON v.asset_id=r.id WHERE r.kind='Asset' AND r.data->>'type'='video' AND v.asset_id IS NULL ORDER BY r.created_at")).rows;
let ok=0,ro=0;const brands=new Map();
for(const asset of rows){
 const client=await resolveClient(asset.client_id);
 if(dry){if(!brands.has(client.id))brands.set(client.id,await brandForDesign(client));const r=designFromAsset(asset,{brand:brands.get(client.id),client,sourceFileId:videoFileOf(asset)?.id||null});
  if(r.design){ok++;console.log('editable ',asset.id,r.design.beats.length+' beats',`(${r.design.meta.source})`);}else{ro++;console.log('read-only',asset.id,r.read_only);}continue;}
 const r=await loadDesign(asset,client,{id:asset.created_by});
 if(r.design){ok++;console.log('editable ',asset.id,r.design.beats.length+' beats');}else{ro++;console.log('read-only',asset.id,r.read_only);}
}
console.log(`${dry?'[dry run] ':''}${rows.length} video(s) without a design: ${ok} editable, ${ro} read-only.`);
await pool.end();
