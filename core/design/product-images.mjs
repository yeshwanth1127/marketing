// Product photography for studio campaign posts: which of the client's uploaded images may be used as the hero, and what each one is.
// Only real uploads are offered. Brand guides, logos, diagrams and earlier renders are never treated as product photos.
import fs from 'node:fs';import path from 'node:path';
import {ROOT,q} from '../db/index.mjs';

// File names that say "this is a photo of the product". An explicit list on the asset (product_image_file_ids) always wins.
export const PRODUCT_NAME=/product|look|lookbook|garment|shirt|tee|polo|hoodie|jean|denim|jacket|blazer|coat|kurta|saree|dress|outfit|campaign|studio|rail|hung|flat.?lay|model|shoot|sku|pdp|collection|catalog/i;
// Finished creatives (ads, posters, social posts) carry their own text and layout, so they are never a hero photo either.
const NOT_PRODUCT=/logo|brand|guide|banner|hero|mermaid|diagram|screenshot|template|reference|moodboard|favicon|icon|render|image-\d|video-\d|(?:^|[\s_.-])ads?(?:[\s_.-]|$)|ad.?design|social.?media|poster|flyer|creative|mock.?up|story|thumbnail|cover|post/i;
const MAX_BYTES=15*1024*1024;

/** Width, height and whether the file has an alpha channel, from the header bytes. null when the format is not recognised. */
export function imageInfo(buf){
 if(buf.length>24&&buf.readUInt32BE(0)===0x89504e47){
  const width=buf.readUInt32BE(16),height=buf.readUInt32BE(20),colorType=buf[25];let trns=false;
  for(let p=8;p+8<=buf.length;){const len=buf.readUInt32BE(p),type=buf.toString('latin1',p+4,p+8);if(type==='tRNS')trns=true;if(type==='IDAT'||type==='IEND')break;p+=12+len;}
  return {type:'png',width,height,alpha:colorType===4||colorType===6||trns};
 }
 if(buf.length>4&&buf[0]===0xff&&buf[1]===0xd8){
  for(let p=2;p+9<buf.length;){if(buf[p]!==0xff){p++;continue;}const m=buf[p+1];
   if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m))return {type:'jpeg',width:buf.readUInt16BE(p+7),height:buf.readUInt16BE(p+5),alpha:false};
   if(m===0xd8||(m>=0xd0&&m<=0xd7)||m===0x01){p+=2;continue;}p+=2+buf.readUInt16BE(p+2);}
  return null;
 }
 if(buf.length>30&&buf.toString('latin1',0,4)==='RIFF'&&buf.toString('latin1',8,12)==='WEBP'){
  const fmt=buf.toString('latin1',12,16);
  if(fmt==='VP8X')return {type:'webp',width:1+buf.readUIntLE(24,3),height:1+buf.readUIntLE(27,3),alpha:!!(buf[20]&0x10)};
  return {type:'webp',width:0,height:0,alpha:false};
 }
 return null;
}

const safe=n=>String(n||'image').replace(/[^\w.-]+/g,'_').slice(-48);

/**
 * Candidate product photos for a post, newest first, at most `limit`.
 * Each: {id,name,abs,file,type,width,height,alpha}. `file` is the path inside the designer's folder (assets/01-name.png).
 */
export async function productImagesFor(client,asset,{limit=6,exclude=[]}={}){
 const skip=new Set(exclude.filter(Boolean).map(n=>String(n).toLowerCase()));
 const chain=(client.chain||[]).map(n=>n.id);const ids=chain.length?chain:[client.id];
 const explicit=Array.isArray(asset?.data?.product_image_file_ids)?asset.data.product_image_file_ids.filter(x=>/^[0-9a-f-]{36}$/i.test(String(x))):[];
 const rows=(await q("SELECT id,name,mime,storage_path FROM files WHERE client_id=ANY($1) AND mime IN ('image/png','image/jpeg','image/webp') AND storage_path LIKE 'uploads/%' ORDER BY created_at DESC LIMIT 60",[ids])).rows;
 const root=path.resolve(ROOT,'.local');
 const pick=rows.filter(r=>explicit.length?explicit.includes(r.id):PRODUCT_NAME.test(r.name)&&!NOT_PRODUCT.test(r.name)&&!skip.has(String(r.name).toLowerCase()));
 const out=[];const seen=new Set();
 for(const r of pick){
  if(out.length>=limit)break;
  const abs=path.resolve(root,r.storage_path);
  if(!abs.startsWith(root+path.sep)||!fs.existsSync(abs)||fs.statSync(abs).size>MAX_BYTES)continue;
  const info=imageInfo(fs.readFileSync(abs));if(!info)continue;
  const key=r.name+':'+fs.statSync(abs).size;if(seen.has(key))continue;seen.add(key);
  out.push({id:r.id,name:r.name,abs,file:`assets/${String(out.length+1).padStart(2,'0')}-${safe(r.name)}`,...info});
 }
 return out;
}

/** The manifest the designer reads. It says what each file is; the designer still opens each one to look at it. */
export const manifestOf=images=>images.map(i=>({file:i.file,name:i.name,width:i.width,height:i.height,aspect:i.height?+(i.width/i.height).toFixed(2):null,has_alpha_channel:i.alpha,
 use:i.alpha?'may be a transparent cutout: open it and check, then use it as "cutout"':'a photo: use it as "photo" (full bleed)'}));
