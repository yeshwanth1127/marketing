import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT,q,insert,audit,fail} from '../db/index.mjs';
import {validData} from '../api.mjs';
import {catalog as fontCatalog,rolesFromPalette} from '../design/brand-profile.mjs';
import {openrouterChat,openrouterKey,openrouterModel,parseModelJson} from '../agent/openrouter.mjs';

const exec=promisify(execFile);
// Last-resort neutrals only when the file had no readable pixels. Never EXORA's own greens.
const FALLBACK_COLORS=['#f7f4ef','#16181d','#c45c26'];
const TEXT_MIMES=new Set(['text/plain','text/csv','application/csv']);
const PRESENTATION_MIMES=new Set(['application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']);
const DOCUMENT_MIMES=new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

export function extractedProfile(client,result){
 const lib=fontCatalog().fonts;
 const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
 const match=n=>lib.find(f=>norm(n).includes(norm(f.family)))?.id;
 const found=(result.fonts||[]).map(match).filter(Boolean);
 const display=found.find(id=>lib.find(f=>f.id===id)?.role!=='mono');
 const body=found.find(id=>id!==display&&lib.find(f=>f.id===id)?.role==='sans');
 return {
  name:client.brand_name||client.name,
  wordmark:client.brand_name||client.name,
  colors:rolesFromPalette(result.colors||[]),
  type:{...(display?{display:{font:display}}:{}),...(body?{body:{font:body}}:{})},
  note:'Matched from uploaded brand files.',
 };
}

async function extractWithPython(filePath,mime){
 const python=process.env.PYTHON_BIN||'python3';
 const r=await exec(python,[path.join(ROOT,'scripts/extract-brand.py'),filePath,mime],{timeout:45000,maxBuffer:200000});
 return JSON.parse(r.stdout);
}

function readAsText(filePath){
 try{return fs.readFileSync(filePath,'utf8').slice(0,30000);}catch{return '';}
}

export async function extractOneFile(client,row){
 const full=path.join(ROOT,'.local',row.storage_path);
 if(!full.startsWith(path.join(ROOT,'.local')+path.sep)||!fs.existsSync(full))fail('File not found',404);
 let colors=[],fonts=[],text='';
 if(row.mime.startsWith('image/')||row.mime==='application/pdf'||PRESENTATION_MIMES.has(row.mime)||DOCUMENT_MIMES.has(row.mime)){
  const raw=await extractWithPython(full,row.mime);
  colors=raw.colors||[];fonts=raw.fonts||[];text=String(raw.text||'');
 }else if(TEXT_MIMES.has(row.mime)||row.mime.startsWith('text/')){
  text=readAsText(full);
  colors=[...text.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(m=>m[0]);
 }else{
  text=readAsText(full);
 }
 return {file_id:row.id,name:row.name,mime:row.mime,colors,fonts,text:text.slice(0,18000),logo_file_id:row.mime.startsWith('image/')?row.id:null};
}

function mergeParts(parts){
 const colors=[],fonts=[],texts=[];
 let logo=null;
 for(const p of parts){
  for(const c of p.colors||[])if(!colors.includes(c))colors.push(c);
  for(const f of p.fonts||[])if(!fonts.includes(f))fonts.push(f);
  if(p.text)texts.push(`--- ${p.name} ---\n${p.text}`);
  if(!logo&&p.logo_file_id)logo=p.logo_file_id;
 }
 return {colors:colors.slice(0,12),fonts:fonts.slice(0,10),text:texts.join('\n\n').slice(0,40000),logo_file_id:logo,source_file_ids:parts.map(p=>p.file_id),source_names:parts.map(p=>p.name)};
}

function uniqueHexes(colors){
 return [...new Set((colors||[]).map(c=>String(c).toLowerCase()))].filter(c=>/^#[0-9a-f]{6}$/.test(c));
}
function channelLum(hex){
 const n=parseInt(hex.slice(1),16);
 const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};
 return 0.2126*f((n>>16)&255)+0.7152*f((n>>8)&255)+0.0722*f(n&255);
}
function channelSat(hex){
 const n=parseInt(hex.slice(1),16),r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255;
 const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;
 return mx===mn?0:(mx-mn)/(1-Math.abs(2*l-1));
}
// Keep only hexes that came from the file (or the marketer's grade). Never mix in EXORA greens.
export function completePalette(colors){
 const out=uniqueHexes(colors);
 if(!out.length)return FALLBACK_COLORS.slice();
 const paper=[...out].sort((a,b)=>channelLum(a)-channelLum(b)).at(-1);
 const ink=[...out].sort((a,b)=>channelLum(a)-channelLum(b))[0];
 const accent=[...out].sort((a,b)=>channelSat(b)-channelSat(a))[0];
 const ordered=[paper,ink,accent].filter((c,i,a)=>c&&a.indexOf(c)===i);
 for(const c of out)if(!ordered.includes(c))ordered.push(c);
 return ordered.slice(0,8);
}
export function gradePalette(colors){
 const out=uniqueHexes(colors);
 return out.length?out.slice(0,8):FALLBACK_COLORS.slice();
}

async function fieldsFromText(client,merged){
 const empty={voice:'',audience:'',disclaimers:'',banned_words:[],preferred_words:[],sample_content:[]};
 if(!merged.text.trim())return empty;
 if(!openrouterKey())return empty;
 try{
  const raw=await openrouterChat({
   model:openrouterModel('talk'),
   prompt:`Extract brand-kit fields ONLY if they appear explicitly in the source text. Do not invent anything.
Return JSON only with keys: voice, audience, disclaimers, banned_words (array), preferred_words (array), sample_content (array of strings).
Use empty string or empty array when not stated.
Client: ${client.name}
Source:
${merged.text.slice(0,12000)}`,
   timeoutMs:35000,
  });
  const parsed=parseModelJson(raw);
  return {
   voice:String(parsed.voice||'').slice(0,2000),
   audience:String(parsed.audience||'').slice(0,2000),
   disclaimers:String(parsed.disclaimers||'').slice(0,2000),
   banned_words:Array.isArray(parsed.banned_words)?parsed.banned_words.map(s=>String(s).trim()).filter(Boolean).slice(0,40):[],
   preferred_words:Array.isArray(parsed.preferred_words)?parsed.preferred_words.map(s=>String(s).trim()).filter(Boolean).slice(0,40):[],
   sample_content:Array.isArray(parsed.sample_content)?parsed.sample_content.map(s=>String(s).trim()).filter(Boolean).slice(0,20):[],
  };
 }catch{return empty;}
}

export async function buildBrandKitFromFiles(client,fileIds){
 const ids=[...new Set((fileIds||[]).filter(id=>/^[0-9a-f-]{36}$/i.test(String(id))))];
 if(!ids.length)fail('Attach at least one brand file');
 const rows=(await q('SELECT * FROM files WHERE client_id=$1 AND id=ANY($2)',[client.id,ids])).rows;
 if(rows.length!==ids.length)fail('One or more files were not found on this client');
 const parts=[];
 for(const row of rows)parts.push(await extractOneFile(client,row));
 const merged=mergeParts(parts);
 const colors=completePalette(merged.colors);
 const profile=extractedProfile(client,{colors,fonts:merged.fonts,text:merged.text});
 const language=await fieldsFromText(client,merged);
 const data=validData('BrandKit',{
  colors,
  font:merged.fonts[0]||'Arial',
  voice:language.voice||'Review the uploaded sources and define how this brand should sound.',
  audience:language.audience||'',
  banned_words:language.banned_words||[],
  disclaimers:language.disclaimers||'',
  preferred_words:language.preferred_words||[],
  sample_content:language.sample_content||[],
  profile,
  logo_file_id:merged.logo_file_id||null,
  fonts_found:merged.fonts,
  extracted_colors:merged.colors,
  extracted_text:merged.text.slice(0,4000),
  source_file_ids:merged.source_file_ids,
  source_names:merged.source_names,
  extraction_note:merged.colors.length?'Colours taken from the uploaded files. Grade them if you need a shift.':'No strong colours were readable in the files — paper, ink and accent were inferred. Replace them from the card.',
  provider:'brand_files',
 });
 return {data,files:rows.map(r=>({id:r.id,name:r.name,mime:r.mime})),summary:summarizeBrandKit(data)};
}

export function summarizeBrandKit(data){
 const lines=[
  'Colours: '+data.colors.join(', '),
  'Fonts: '+(data.fonts_found?.join(', ')||data.font),
  data.voice?'Voice: '+data.voice.slice(0,240):'Voice: (not stated in files — add in a follow-up message)',
  data.audience?'Audience: '+data.audience.slice(0,200):'',
  data.banned_words?.length?'Banned: '+data.banned_words.join(', '):'',
 ].filter(Boolean);
 return lines.join('\n');
}

export async function upsertBrandKit(c,user,client,data){
 const own=(await c.query("SELECT * FROM records WHERE client_id=$1 AND kind='BrandKit' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[client.id])).rows[0];
 const title=client.name+' brand';
 if(own){
  const row=(await c.query('UPDATE records SET title=$2,data=$3,updated_at=now() WHERE id=$1 RETURNING *',[own.id,title,data])).rows[0];
  await audit(c,user,client.id,'edit:BrandKit',own.id);
  return row;
 }
 return insert(c,user,client.id,'BrandKit',title,data);
}
