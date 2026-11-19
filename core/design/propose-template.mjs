// Ask a few details, then draft a DesignTemplate the marketer can edit and save.
import {q} from '../db/index.mjs';
import {catalog,rolesFromPalette} from './brand-profile.mjs';
import {completePalette,extractOneFile} from '../brand/kit-from-files.mjs';
import {openrouterChat,openrouterKey,openrouterModel,parseModelJson} from '../agent/openrouter.mjs';

const trim=(v,n)=>String(v||'').trim().slice(0,n);
const hexOk=c=>/^#[0-9a-f]{6}$/i.test(String(c||''));
const norm=c=>String(c).toLowerCase();

function lum(hex){
 const n=parseInt(hex.slice(1),16);
 const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};
 return 0.2126*f((n>>16)&255)+0.7152*f((n>>8)&255)+0.0722*f(n&255);
}
function sat(hex){
 const n=parseInt(hex.slice(1),16),r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255;
 const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;
 return mx===mn?0:(mx-mn)/(1-Math.abs(2*l-1));
}

const VIBE_FONTS=[
 {re:/\b(kid|child|play|fun|school|toy|cartoon|family|warm|friendly|soft|multi)\b/i,heading:'fraunces',body:'instrument-sans'},
 {re:/\b(clinic|dental|calm|quiet|luxury|editorial|premium|studio)\b/i,heading:'instrument-serif',body:'instrument-sans'},
 {re:/\b(tech|saas|product|startup|modern|sharp|bold)\b/i,heading:'instrument-sans',body:'instrument-sans'},
 {re:/\b(festive|launch|energy|sport|loud|punchy)\b/i,heading:'fraunces',body:'instrument-sans'},
];

function pickFonts(vibe,brandProfile,lib){
 const ids=new Set(lib.map(f=>f.id));
 const hit=VIBE_FONTS.find(v=>v.re.test(vibe));
 const heading=hit?.heading||brandProfile?.type?.display?.font||'fraunces';
 const body=hit?.body||brandProfile?.type?.body?.font||'instrument-sans';
 return {
  heading:ids.has(heading)?heading:(lib.find(f=>f.role==='serif')?.id||lib[0]?.id||'fraunces'),
  body:ids.has(body)?body:(lib.find(f=>f.role==='sans')?.id||lib[0]?.id||'instrument-sans'),
 };
}

/** Multicolour: light paper + dark ink + many vivid accents from a logo/palette. */
export function multicolourTheme(colors,{preferWarmPaper=true}={}){
 const palette=[...new Set((colors||[]).map(norm).filter(hexOk))];
 const vivid=palette.filter(c=>sat(c)>0.28&&lum(c)>0.12&&lum(c)<0.92).sort((a,b)=>sat(b)-sat(a));
 const lights=palette.filter(c=>lum(c)>0.78&&sat(c)<0.35).sort((a,b)=>lum(b)-lum(a));
 const darks=palette.filter(c=>lum(c)<0.28).sort((a,b)=>lum(a)-lum(b));
 // Never put a saturated brand hue on the full page — keep paper neutral/light.
 const paper=lights[0]||(preferWarmPaper?'#fff8ef':'#f7f4ef');
 const ink=darks[0]||'#1a1a1a';
 const accents=vivid.filter(c=>c!==paper&&c!==ink);
 const accent=accents[0]||rolesFromPalette(palette).accent||'#f0a202';
 const support=accents.filter(c=>c!==accent).slice(0,5);
 return {paper,ink,accent,support,mode:'multicolour'};
}

export function shouldUseMulticolour({vibe='',extracted=[],forced}={}){
 if(forced===true)return true;
 if(forced===false)return false;
 const vivid=(extracted||[]).filter(c=>hexOk(c)&&sat(norm(c))>0.28);
 if(vivid.length>=3)return true;
 return /\b(multi|colourful|colorful|rainbow|kids?|child|play|fun|school|toy|cartoon)\b/i.test(vibe);
}

function localCopy({title,vibe,audience,client,hasRef,multicolour,support}){
 const who=client.brand_name||client.name||'the brand';
 const industry=client.industry||'local business';
 const city=client.city||'';
 const mood=vibe||'clean, on-brand, and easy to reuse';
 const forWhom=audience||`people who care about ${industry}${city?` in ${city}`:''}`;
 const paletteNote=multicolour
  ?`This is a multicolour theme: keep paper light/neutral and ink dark for reading; rotate accent + support colours (${[...(support||[])].slice(0,4).join(', ')||'brand hues'}) across frames, stickers, underlines and CTAs — never flood a whole frame with one saturated hue.`
  :'Prefer clear hierarchy and the theme paper / ink / accent trio.';
 return {
  direction:`Visual theme for ${who}: ${mood}. ${paletteNote} Prefer clear hierarchy and ${hasRef?'the uploaded style reference as mood only (never copy its subject or text)':'simple brand-led layouts'}. Aimed at ${forWhom}.`,
  rules:[
   multicolour?'Keep backgrounds light; use many brand hues as accents, not full-bleed fills':'Use only this theme’s paper / ink / accent colours',
   multicolour?'Rotate support colours across frames, icons, underlines and CTA chips':'Keep headlines short and readable on mobile',
   'Keep headlines short and readable on mobile',
   'Leave breathing room; one idea per frame',
   hasRef?'Treat the reference image as style mood only':'Stay close to the brand kit look',
  ].join('\n'),
  avoid:[
   'Crowded layouts and tiny text',
   multicolour?'One saturated colour filling the whole frame as background':'Off-brand colours or stock-looking clichés',
   'Copying subjects, logos or wording from the reference image',
   'Hard-to-read low-contrast type',
  ].join('\n'),
  title:title||`${who} visual theme`,
 };
}

async function enrichCopy(base,ctx){
 if(!openrouterKey())return base;
 try{
  const raw=await openrouterChat({
   model:openrouterModel('talk'),
   prompt:`You draft an EXORA design template (visual theme) for a marketer to edit.
Return JSON only with keys: title, direction, rules, avoid.
- title: short name (max 80 chars)
- direction: 2-4 sentences on recurring mood, lighting, texture, imagery (max 1200 chars)
- rules: 3-6 short lines separated by \\n — always include / do
- avoid: 3-5 short lines separated by \\n
${ctx.multicolour?'This is a MULTICOLOUR theme: light paper, dark ink, many accent/support hues. Say so clearly.':''}
Do not invent prices, proof, or claims. Do not copy subjects from a reference image.
Brand: ${ctx.name}
Industry: ${ctx.industry||'n/a'}
City: ${ctx.city||'n/a'}
Audience note: ${ctx.audience||'n/a'}
Vibe / mood: ${ctx.vibe||'n/a'}
Has style reference image: ${ctx.hasRef?'yes':'no'}
Starter draft:
${JSON.stringify(base)}`,
   timeoutMs:35000,
  });
  const parsed=parseModelJson(raw);
  return {
   title:trim(parsed.title,300)||base.title,
   direction:trim(parsed.direction,3000)||base.direction,
   rules:trim(parsed.rules,3000)||base.rules,
   avoid:trim(parsed.avoid,1500)||base.avoid,
  };
 }catch{return base;}
}

export async function proposeDesignTemplate(client,{title='',vibe='',audience='',reference_image_file_id=null,use_brand_colors=true,multicolour=undefined,brand=null}={}){
 const lib=catalog().fonts||[];
 const brandProfile=brand?.profile||null;
 const name=trim(title,300);
 const mood=trim(vibe,500);
 const who=trim(audience,500);
 let refId=reference_image_file_id&&/^[0-9a-f-]{36}$/i.test(String(reference_image_file_id))?String(reference_image_file_id):null;
 let extracted=[];
 if(refId){
  const row=(await q('SELECT * FROM files WHERE id=$1 AND client_id=$2 AND mime IN (\'image/png\',\'image/jpeg\',\'image/webp\')',[refId,client.id])).rows[0];
  if(!row)throw Object.assign(new Error('Choose an image uploaded to this workspace'),{status:400});
  try{extracted=(await extractOneFile(client,row)).colors||[];}catch{extracted=[];}
 }
 const brandColors=[brandProfile?.colors?.paper,brandProfile?.colors?.ink,brandProfile?.colors?.accent,...(brandProfile?.colors?.support||[])].filter(hexOk);
 const sourceColors=extracted.length?completePalette(extracted):(use_brand_colors&&brandColors.length?brandColors:completePalette(brand?.colors||[]));
 const multi=shouldUseMulticolour({vibe:mood+' '+(client.name||''),extracted:sourceColors,forced:multicolour});
 const roles=multi?multicolourTheme(sourceColors):{...rolesFromPalette(sourceColors),support:[],mode:'classic'};
 if(!multi&&Array.isArray(brandProfile?.colors?.support))roles.support=brandProfile.colors.support.filter(hexOk).slice(0,5);
 const fonts=pickFonts([mood,who,client.industry,client.name].filter(Boolean).join(' '),brandProfile,lib);
 const base=localCopy({title:name,vibe:mood,audience:who,client,hasRef:!!refId,multicolour:multi,support:roles.support});
 const copy=await enrichCopy(base,{name:client.brand_name||client.name,industry:client.industry,city:client.city,audience:who,vibe:mood,hasRef:!!refId,multicolour:multi});
 return {
  title:copy.title,
  data:{
   direction:copy.direction,
   rules:copy.rules,
   avoid:copy.avoid,
   is_default:false,
   reference_image_file_id:refId,
   mode:roles.mode||(multi?'multicolour':'classic'),
   colors:{paper:roles.paper,ink:roles.ink,accent:roles.accent,support:roles.support||[]},
   fonts,
  },
  meta:{
   from_image:extracted.length>0,
   from_brand:!!(use_brand_colors&&brandColors.length&&!extracted.length),
   multicolour:multi,
   extracted_colors:extracted.slice(0,8),
   note:multi
    ?'Multicolour draft: light background, dark text, and several accent hues from the logo/palette. Edit anything before saving.'
    :(extracted.length?'Colours drafted from the style reference image. Edit anything before saving.':(use_brand_colors&&brandColors.length?'Colours started from the brand kit. Edit anything before saving.':'Colours drafted from available brand cues. Edit anything before saving.')),
  },
 };
}
