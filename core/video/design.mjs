// VideoDesign: the single source of truth for a generated video. The MP4 is derived from it.
// Pure and browser-safe (no node imports): the editor uses the same code for live preview as the worker uses to render.

export const SCHEMA_ID='exora.video-design/1';
export const MOTIONS=['fade','typewriter','words','slide','scale','none'];
export const CORNERS=['top-left','top-right','bottom-left','bottom-right','top-center','bottom-center','none'];
export const ALIGNS=['left','center','right'];
export const TEXT_POSITIONS=['top','center','bottom'];
export const BACKGROUNDS=['solid','gradient','image','video'];
export const SIZES={reel:[1080,1920],portrait:[1080,1350],square:[1080,1080],landscape:[1920,1080]};
const HEX=/^#[0-9a-f]{6}$/i;

/** JSON Schema (draft 2020-12) for VideoDesign. validateDesign() enforces the same rules without a dependency. */
export const VIDEO_DESIGN_JSON_SCHEMA={
 $schema:'https://json-schema.org/draft/2020-12/schema',$id:SCHEMA_ID,title:'VideoDesign',type:'object',
 required:['schema','format','width','height','fps','theme','layout','beats','audio','brand','meta'],additionalProperties:false,
 $defs:{
  hex:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},
  span:{type:'object',required:['text'],additionalProperties:false,properties:{text:{type:'string',minLength:1,maxLength:80},style:{type:'object',additionalProperties:false,properties:{italic:{type:'boolean'},bold:{type:'boolean'},underline:{type:'boolean'},color:{$ref:'#/$defs/hex'}}}}},
  background:{type:'object',required:['kind'],additionalProperties:false,properties:{kind:{enum:BACKGROUNDS},color:{$ref:'#/$defs/hex'},from:{$ref:'#/$defs/hex'},to:{$ref:'#/$defs/hex'},angle:{type:'number',minimum:0,maximum:360},file_id:{type:'string',format:'uuid'},dim:{type:'number',minimum:0,maximum:0.85}}},
  font:{type:'object',required:['id'],additionalProperties:false,properties:{id:{type:'string',pattern:'^[a-z0-9-]+$'},weight:{type:'integer',minimum:100,maximum:900}}},
  corner:{enum:CORNERS}
 },
 properties:{
  schema:{const:SCHEMA_ID},asset_id:{type:'string'},format:{enum:Object.keys(SIZES)},width:{type:'integer'},height:{type:'integer'},fps:{enum:[24,25,30,60]},
  theme:{type:'object',required:['background','ink','accent','fonts','type','motion','safe_area'],additionalProperties:false,properties:{
   background:{$ref:'#/$defs/background'},ink:{$ref:'#/$defs/hex'},accent:{$ref:'#/$defs/hex'},
   fonts:{type:'object',required:['display','body'],additionalProperties:false,properties:{display:{$ref:'#/$defs/font'},body:{$ref:'#/$defs/font'}}},
   type:{type:'object',additionalProperties:false,properties:{size:{type:'number',minimum:32,maximum:220},sub_size:{type:'number',minimum:20,maximum:120},letter_spacing:{type:'number',minimum:-0.1,maximum:0.3},line_height:{type:'number',minimum:0.8,maximum:2},align:{enum:ALIGNS},case:{enum:['none','upper']}}},
   motion:{type:'object',additionalProperties:false,properties:{preset:{enum:MOTIONS},speed:{type:'number',minimum:0.25,maximum:3}}},
   safe_area:{type:'number',minimum:0.03,maximum:0.2}}},
  layout:{type:'object',additionalProperties:false,properties:{
   text_position:{enum:TEXT_POSITIONS},
   logo:{type:'object',additionalProperties:false,properties:{position:{$ref:'#/$defs/corner'},file_id:{type:['string','null']},size:{type:'number',minimum:24,maximum:240}}},
   locale_tag:{type:'object',additionalProperties:false,properties:{text:{type:'string',maxLength:40},position:{$ref:'#/$defs/corner'},visible:{type:'boolean'}}},
   caption_bar:{type:'object',additionalProperties:false,properties:{visible:{type:'boolean'},position:{enum:['top','bottom']},style:{enum:['plain','bar']}}}}},
  beats:{type:'array',minItems:1,maxItems:24,items:{type:'object',required:['id','duration','text'],additionalProperties:false,properties:{
   id:{type:'string',pattern:'^[\\w-]{1,24}$'},label:{type:'string',maxLength:24},duration:{type:'number',minimum:0.5,maximum:60},
   text:{type:'array',minItems:1,maxItems:60,items:{$ref:'#/$defs/span'}},sub:{type:'array',maxItems:40,items:{$ref:'#/$defs/span'}},caption:{type:'string',maxLength:600},
   style:{type:'object',additionalProperties:false,properties:{background:{$ref:'#/$defs/background'},ink:{$ref:'#/$defs/hex'},align:{enum:ALIGNS},motion:{enum:MOTIONS}}}}}},
  audio:{type:'object',additionalProperties:false,properties:{voice:{type:['object','null']},source_file_id:{type:['string','null']},timing:{enum:['proportional','beats']}}},
  media:{type:'array',items:{type:'object',required:['id','kind','beat_id'],properties:{id:{type:'string'},kind:{enum:['generated_video','generated_image','upload']},beat_id:{type:'string'},prompt:{type:'string',maxLength:1000},file_id:{type:['string','null']},status:{enum:['pending','ready','failed']}}}},
  brand:{type:'object',required:['palette','fonts','locked'],additionalProperties:false,properties:{palette:{type:'array',items:{$ref:'#/$defs/hex'}},fonts:{type:'array',items:{type:'string'}},locked:{type:'boolean'}}},
  meta:{type:'object'}
 }
};

// ---------- small helpers ----------
export const clone=v=>JSON.parse(JSON.stringify(v));
/** Deterministic JSON (sorted keys) for hashing: the same design always produces the same cache key. */
export function stableStringify(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stableStringify).join(',')+']';return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stableStringify(v[k])).join(',')+'}';}
export const totalSeconds=d=>+d.beats.reduce((a,b)=>a+Number(b.duration||0),0).toFixed(2);
export const beatStarts=d=>{let t=0;return d.beats.map(b=>{const s=+t.toFixed(3);t+=Number(b.duration);return s;});};
export const spansText=spans=>(spans||[]).map(s=>s.text).join(' ');
/** "Don't wear a *polo*" -> word spans, with *x* marking emphasis (italic). */
export function textToSpans(text){
 const out=[];for(const raw of String(text||'').replace(/\s+/g,' ').trim().split(' ')){if(!raw)continue;const em=/^\*.+\*[^\w]*$/.test(raw)||/^\*[^*]+\*$/.test(raw);const t=raw.replace(/\*/g,'');if(!t)continue;out.push(em?{text:t.slice(0,80),style:{italic:true}}:{text:t.slice(0,80)});}
 return out.slice(0,60);
}

function lum(hex){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];}
export function contrast(a,b){if(!HEX.test(a)||!HEX.test(b))return 1;const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+0.05)/(y+0.05);}
const bgColor=bg=>bg?.kind==='gradient'?bg.from:bg?.color;

// ---------- validation ----------
/** Returns a list of problems ([] = valid). Brand lock: colours and fonts must come from the brand kit. */
export function validateDesign(d,{fontIds=null}={}){
 const e=[];const isHex=v=>HEX.test(String(v||''));
 if(!d||typeof d!=='object')return ['Design must be an object'];
 if(d.schema!==SCHEMA_ID)e.push('Unknown design schema');
 if(!SIZES[d.format])e.push('Unknown format');
 const t=d.theme||{};
 const bg=(b,where)=>{if(!b||!BACKGROUNDS.includes(b.kind)){e.push(where+': unknown background');return;}
  if(b.kind==='solid'&&!isHex(b.color))e.push(where+': background colour must be #rrggbb');
  if(b.kind==='gradient'&&(!isHex(b.from)||!isHex(b.to)))e.push(where+': gradient needs two #rrggbb colours');
  if((b.kind==='image'||b.kind==='video')&&!/^[0-9a-f-]{36}$/i.test(String(b.file_id||'')))e.push(where+': choose an uploaded file');
  if(b.dim!==undefined&&!(b.dim>=0&&b.dim<=0.85))e.push(where+': dim must be 0 to 0.85');};
 bg(t.background,'Background');
 if(!isHex(t.ink))e.push('Text colour must be #rrggbb');if(!isHex(t.accent))e.push('Accent colour must be #rrggbb');
 for(const k of ['display','body']){const f=t.fonts?.[k];if(!f||!/^[a-z0-9-]+$/.test(String(f.id||'')))e.push(`${k} font is missing`);else if(fontIds&&!fontIds.includes(f.id))e.push(`Unknown font "${f.id}"`);if(f?.weight!==undefined&&!(Number.isInteger(f.weight)&&f.weight>=100&&f.weight<=900))e.push(`${k} weight must be 100-900`);}
 const ty=t.type||{};const rng=(v,a,b,label)=>{if(v!==undefined&&!(typeof v==='number'&&v>=a&&v<=b))e.push(`${label} must be ${a} to ${b}`);};
 rng(ty.size,32,220,'Text size');rng(ty.sub_size,20,120,'Support text size');rng(ty.letter_spacing,-0.1,0.3,'Letter spacing');rng(ty.line_height,0.8,2,'Line height');rng(t.safe_area,0.03,0.2,'Safe area');rng(t.motion?.speed,0.25,3,'Animation speed');
 if(ty.align&&!ALIGNS.includes(ty.align))e.push('Unknown alignment');if(t.motion?.preset&&!MOTIONS.includes(t.motion.preset))e.push('Unknown animation');
 const L=d.layout||{};
 for(const [k,v] of [['logo',L.logo?.position],['locale tag',L.locale_tag?.position]])if(v!==undefined&&!CORNERS.includes(v))e.push(`Unknown ${k} position`);
 if(L.locale_tag?.text!==undefined&&String(L.locale_tag.text).length>40)e.push('Locale tag is too long');
 if(L.text_position&&!TEXT_POSITIONS.includes(L.text_position))e.push('Unknown text position');
 if(!Array.isArray(d.beats)||!d.beats.length)e.push('A video needs at least one beat');
 const ids=new Set();
 for(const [i,b] of (d.beats||[]).entries()){const w=`Beat ${i+1}`;
  if(!/^[\w-]{1,24}$/.test(String(b.id||'')))e.push(w+': bad id');else if(ids.has(b.id))e.push(w+': duplicate id');ids.add(b.id);
  if(!(typeof b.duration==='number'&&b.duration>=0.5&&b.duration<=60))e.push(w+': duration must be 0.5 to 60 seconds');
  if(!Array.isArray(b.text)||!b.text.length)e.push(w+': needs text');
  for(const s of [...(b.text||[]),...(b.sub||[])]){if(!s||typeof s.text!=='string'||!s.text.trim()||s.text.length>80)e.push(w+': each word must be 1-80 characters');if(s?.style?.color&&!isHex(s.style.color))e.push(w+': word colour must be #rrggbb');}
  if(b.style?.background)bg(b.style.background,w);if(b.style?.ink&&!isHex(b.style.ink))e.push(w+': text colour must be #rrggbb');
  if(b.style?.motion&&!MOTIONS.includes(b.style.motion))e.push(w+': unknown animation');}
 if(totalSeconds(d)>180)e.push('Video is longer than 3 minutes');
 if(d.brand?.locked)e.push(...brandViolations(d));
 return e;
}

/** Colours and fonts outside the brand kit. Empty when the design stays on-brand. */
export function brandViolations(d){
 const pal=new Set((d.brand?.palette||[]).map(c=>c.toLowerCase()));const fonts=new Set(d.brand?.fonts||[]);const out=[];
 const col=(c,where)=>{if(c&&!pal.has(String(c).toLowerCase()))out.push(`${where} ${c} is not in the brand palette. Pick a brand colour or unlock off-brand.`);};
 const bg=(b,w)=>{if(!b)return;if(b.kind==='solid')col(b.color,w+' background');if(b.kind==='gradient'){col(b.from,w+' gradient');col(b.to,w+' gradient');}};
 bg(d.theme?.background,'The');col(d.theme?.ink,'Text colour');col(d.theme?.accent,'Accent colour');
 for(const [i,b] of (d.beats||[]).entries()){bg(b.style?.background,`Beat ${i+1}`);col(b.style?.ink,`Beat ${i+1} text colour`);for(const s of [...(b.text||[]),...(b.sub||[])])col(s.style?.color,`Beat ${i+1} word colour`);}
 if(fonts.size)for(const k of ['display','body']){const id=d.theme?.fonts?.[k]?.id;if(id&&!fonts.has(id))out.push(`Font "${id}" is not a brand font. Pick a brand font or unlock off-brand.`);}
 return out;
}

// ---------- JSON Patch (RFC 6902: add, remove, replace, test) ----------
// Only these subtrees are editable. Audio, brand palette, metadata and identity are not.
const EDITABLE=/^\/(theme|layout|beats|media|brand\/locked)(\/|$)/;
const decode=p=>p.split('/').slice(1).map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~'));
export function applyPatch(doc,ops,{maxOps=200}={}){
 if(!Array.isArray(ops)||!ops.length)throw new Error('A patch needs at least one operation');
 if(ops.length>maxOps)throw new Error(`A patch can change at most ${maxOps} fields`);
 const out=clone(doc);
 for(const op of ops){
  if(!op||!['add','remove','replace','test'].includes(op.op))throw new Error('Unsupported patch operation');
  if(typeof op.path!=='string'||!op.path.startsWith('/')||!EDITABLE.test(op.path))throw new Error(`Path ${op.path} cannot be edited`);
  const keys=decode(op.path);if(keys.some(k=>k==='__proto__'||k==='constructor'||k==='prototype'))throw new Error('Bad path');
  let parent=out;for(const k of keys.slice(0,-1)){if(parent==null||typeof parent!=='object'||!(k in parent))throw new Error(`Path ${op.path} does not exist`);parent=parent[Array.isArray(parent)?Number(k):k];}
  const last=keys.at(-1);if(parent==null||typeof parent!=='object')throw new Error(`Path ${op.path} does not exist`);
  const val=op.value===undefined?undefined:clone(op.value);
  if(Array.isArray(parent)){
   const i=last==='-'?parent.length:Number(last);if(!Number.isInteger(i)||i<0||i>(op.op==='add'?parent.length:parent.length-1))throw new Error(`Index out of range in ${op.path}`);
   if(op.op==='add')parent.splice(i,0,val);else if(op.op==='remove')parent.splice(i,1);else if(op.op==='replace')parent[i]=val;else if(stableStringify(parent[i])!==stableStringify(val))throw new Error(`Test failed at ${op.path}`);
  }else{
   if((op.op==='remove'||op.op==='replace'||op.op==='test')&&!(last in parent))throw new Error(`Path ${op.path} does not exist`);
   if(op.op==='remove')delete parent[last];else if(op.op==='test'){if(stableStringify(parent[last])!==stableStringify(val))throw new Error(`Test failed at ${op.path}`);}else parent[last]=val;
  }
 }
 return out;
}

/** Which beats need a new picture after going from design a to b. Theme/layout changes touch every beat. */
export function changedBeats(a,b){
 if(!a)return b.beats.map(x=>x.id);
 const global=stableStringify({t:a.theme,l:a.layout,f:a.format,brand:a.brand?.locked})!==stableStringify({t:b.theme,l:b.layout,f:b.format,brand:b.brand?.locked});
 const old=new Map(a.beats.map(x=>[x.id,stableStringify(x)]));
 return b.beats.filter(x=>global||old.get(x.id)!==stableStringify(x)).map(x=>x.id);
}

// ---------- design from an existing asset (backfill and first render) ----------
const DIRECTION=/\((?:[^()]*)\)/g;
/** Strip stage directions, timecodes and beat labels a script carries, leaving the words people should read. */
export function screenLine(text){
 return String(text||'').replace(/\[[^\]]*\]/g,' ').replace(DIRECTION,' ')
  .replace(/^\s*(?:HOOK|SETUP|PAYOFF(?:\s*\d+)?|CTA|CLAIM|PROOF|OUTRO|INTRO|BEAT\s*\d+)\s*:\s*/i,'')
  .replace(/\b(?:HOOK|SETUP|PAYOFF(?:\s*\d+)?|CTA)\s*\([^)]*\)\s*:/gi,'').replace(/\s+/g,' ').replace(/\s+([,.!?;:])/g,'$1').trim();
}
const labelOf=t=>(String(t||'').match(/(?:^|\]\s*)(HOOK|SETUP|PAYOFF(?:\s*\d+)?|CTA|CLAIM|PROOF)\b/i)?.[1]||'').toUpperCase();

/**
 * Best-effort VideoDesign for an asset. Uses the timed beat sheet when there is one, else the on-screen lines.
 * brand: {palette:[hex], fonts:{display,body}, logo_file_id}. Returns {design} or {read_only:reason}.
 */
export function designFromAsset(asset,{brand={},client={},seconds=null,voice=null,sourceFileId=null}={}){
 const data=asset?.data||{};
 let rows=(data.beat_sheet?.beats||[]).map(b=>({label:String(b.label||labelOf(b.text)||'').slice(0,24),text:screenLine(b.text),dur:Number(b.dur)})).filter(b=>b.text.split(' ').length>=2&&b.dur>0);
 let source='beat_sheet';
 if(rows.length<2){source='on_screen_text';rows=(data.on_screen_text||[]).map(screenLine).filter(t=>t.split(' ').length>=2).map((text,i)=>({label:i===0?'HOOK':'',text,dur:0}));}
 if(!rows.length&&data.script){source='script';rows=String(data.script).split(/(?<=[.!?])\s+/).map(screenLine).filter(t=>t.split(' ').length>=3).slice(0,8).map((text,i)=>({label:i===0?'HOOK':'',text,dur:0}));}
 if(!rows.length)return {read_only:'This video has no script or on-screen text to rebuild it from. It can be viewed but not edited.'};
 rows=rows.slice(0,24);
 // Durations: the beat sheet's, scaled to the narration when we know how long it is; otherwise by word count.
 const words=rows.map(r=>Math.max(1,r.text.split(' ').length));
 const known=rows.every(r=>r.dur>0);
 const target=Number(seconds)||(known?rows.reduce((a,r)=>a+r.dur,0):Math.max(8,Math.min(120,Number(data.target_seconds)||words.reduce((a,b)=>a+b,0)/2.6)));
 const weights=known?rows.map(r=>r.dur):words;const wsum=weights.reduce((a,b)=>a+b,0);
 const durs=weights.map(w=>Math.max(0.8,+(w/wsum*target).toFixed(2)));
 const pal=(brand.palette||[]).filter(c=>HEX.test(c)).map(c=>c.toLowerCase());
 const paper=pal[0]||'#f6f0e4',ink=pal[1]||'#16181d',accent=pal[2]||pal[1]||'#c0392b';
 const [inkOk,paperOk]=contrast(ink,paper)>=4.5?[ink,paper]:[pickInk(paper,pal),paper];
 const format=SIZES[data.format]?data.format:'reel';const [width,height]=SIZES[format];
 const display=brand.fonts?.display||'fraunces',body=brand.fonts?.body||'dm-sans';
 const design={schema:SCHEMA_ID,asset_id:asset.id,format,width,height,fps:30,
  theme:{background:{kind:'solid',color:paperOk},ink:inkOk,accent,fonts:{display:{id:display,weight:600},body:{id:body,weight:400}},type:{size:112,sub_size:44,letter_spacing:-0.02,line_height:1.04,align:'left',case:'none'},motion:{preset:'words',speed:1},safe_area:0.07},
  layout:{text_position:'center',logo:{position:brand.logo_file_id?'bottom-left':'none',file_id:brand.logo_file_id||null,size:72},locale_tag:{text:String(client.city||'').toUpperCase().slice(0,40),position:'top-right',visible:!!client.city},caption_bar:{visible:false,position:'bottom',style:'plain'}},
  beats:rows.map((r,i)=>({id:'b'+(i+1),label:r.label||(i===0?'HOOK':i===rows.length-1?'PAYOFF':''),duration:durs[i],text:emphasise(textToSpans(r.text),accent),caption:r.text.slice(0,600)})),
  audio:{voice:voice||null,source_file_id:sourceFileId||null,timing:'proportional'},
  media:[],
  brand:{palette:pal.length?pal:[paperOk,inkOk,accent],fonts:[...new Set([display,body,...(brand.font_ids||[])])],locked:true},
  meta:{source,backfilled:true,created_from_version:asset.version||1}};
 const problems=validateDesign(design);
 if(problems.length)return {read_only:'This video could not be rebuilt for editing: '+problems[0]};
 return {design};
}
function pickInk(paper,pal){return [...pal,'#16181d','#ffffff'].sort((a,b)=>contrast(b,paper)-contrast(a,paper))[0];}
// One emphasised word per beat (the longest), italic: the look of the reference card ("your *polo*").
function emphasise(spans,accent){
 if(spans.some(s=>s.style))return spans;
 let best=-1,len=3;spans.forEach((s,i)=>{const n=s.text.replace(/[^\p{L}]/gu,'').length;if(n>len){len=n;best=i;}});
 if(best>=0)spans[best]={...spans[best],style:{italic:true,color:accent}};
 return spans;
}

// ---------- design ideas: deterministic variants inside the brand kit ----------
const TYPE_SCALES=[{name:'Large',size:128,line_height:1.0,letter_spacing:-0.03},{name:'Editorial',size:104,line_height:1.08,letter_spacing:-0.01},{name:'Compact',size:88,line_height:1.15,letter_spacing:0}];
const MOTION_ORDER=['words','fade','slide','scale','typewriter'];
/**
 * N alternative looks for the same content. Each variant is a patch (ops), never a full document,
 * built by permuting brand palette roles, type scale, motion preset, alignment and font pairing. No model call.
 */
export function designVariants(d,{n=6}={}){
 const pal=(d.brand?.palette||[]).filter(c=>HEX.test(c));const fonts=d.brand?.fonts||[];
 const pairs=[];for(const bg of pal)for(const ink of pal)if(bg!==ink&&contrast(bg,ink)>=4.5){const acc=pal.find(c=>c!==bg&&c!==ink&&contrast(c,bg)>=3)||ink;pairs.push({bg,ink,acc});}
 if(!pairs.length)pairs.push({bg:bgColor(d.theme.background)||'#ffffff',ink:d.theme.ink,acc:d.theme.accent});
 const fontPairs=[[d.theme.fonts.display.id,d.theme.fonts.body.id]];if(fonts.length>=2)fontPairs.push([d.theme.fonts.body.id,d.theme.fonts.display.id]);
 const out=[];const seen=new Set();
 for(let i=0;out.length<n&&i<n*8;i++){
  // Co-prime strides so each variant differs in several dimensions at once, not only in colour.
  const p=pairs[(i*5)%pairs.length],ts=TYPE_SCALES[i%TYPE_SCALES.length],mo=MOTION_ORDER[i%MOTION_ORDER.length],al=i%2===1?'center':'left',fp=fontPairs[i%fontPairs.length];
  const gradient=i%4===3&&pal.length>=2;
  const background=gradient?{kind:'gradient',from:p.bg,to:pal.find(c=>c!==p.bg&&contrast(c,p.ink)>=4.5)||p.bg,angle:160}:{kind:'solid',color:p.bg};
  const ops=[{op:'replace',path:'/theme/background',value:background},{op:'replace',path:'/theme/ink',value:p.ink},{op:'replace',path:'/theme/accent',value:p.acc},
   {op:'replace',path:'/theme/type',value:{...d.theme.type,size:ts.size,line_height:ts.line_height,letter_spacing:ts.letter_spacing,align:al}},
   {op:'replace',path:'/theme/motion',value:{...d.theme.motion,preset:mo}},
   {op:'replace',path:'/theme/fonts',value:{display:{...d.theme.fonts.display,id:fp[0]},body:{...d.theme.fonts.body,id:fp[1]}}},
   // emphasised words follow the new accent; per-beat colour overrides are cleared so the look is coherent
   ...d.beats.flatMap((b,bi)=>[...(b.style?[{op:'remove',path:`/beats/${bi}/style`}]:[]),...b.text.map((s,si)=>s.style?.color?{op:'replace',path:`/beats/${bi}/text/${si}/style`,value:{...s.style,color:p.acc}}:null).filter(Boolean)])];
  const name=`${ts.name} · ${mo} · ${gradient?'gradient':lum(p.bg)<0.2?'dark':'light'}${al==='center'?' · centred':''}`;
  const key=stableStringify(ops.slice(0,6));if(seen.has(key)||out.some(v=>v.name===name))continue;seen.add(key);
  const candidate=applyPatch(d,ops);if(validateDesign(candidate).length)continue;
  out.push({id:'v'+(out.length+1),name,ops,swatch:{bg:p.bg,ink:p.ink,accent:p.acc}});
 }
 return out;
}

/** Fit a beat's text to the frame: the same arithmetic in the browser preview and the server render. */
export function fitSize(text,{size,width,height,safe,line_height,display_ratio=0.52,max_height_ratio=0.5}){
 const usable=width*(1-2*safe);const chars=Math.max(1,String(text).length);let s=size;
 for(;s>36;s-=2){const perLine=Math.max(4,Math.floor(usable/(s*display_ratio)));const lines=Math.ceil(chars/perLine);if(lines*s*line_height<=height*max_height_ratio)break;}
 return s;
}
