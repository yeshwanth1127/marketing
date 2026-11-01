// Brand profile: the only place a brand's look lives. The EXORA method (layouts) reads these variables
// and never hard-codes a colour, font or shape. normalize() accepts a full profile or a legacy brand kit
// ({colors:[...], font:'...'}) and always returns a complete, contrast-safe profile.
import {isHex,contrast,luminance,saturation,mix,readable} from './color.mjs';

export const DENSITY={airy:{margin:96,gap:40,lead:1.0},balanced:{margin:80,gap:32,lead:0.96},dense:{margin:64,gap:24,lead:0.92}};
export const SHAPE={sharp:{radius:0},soft:{radius:14},round:{radius:36},pill:{radius:999}};
export const MOTIFS=['none','kolam','arcs','grid','stripes','rule'];
export const DEFAULT_FONTS={serif:'fraunces',sans:'instrument-sans',label:'jetbrains-mono'};
const SCRIPT_FONTS={Hindi:'noto-sans-devanagari',Marathi:'noto-sans-devanagari',Hinglish:null,Kannada:'noto-sans-kannada',Tamil:'noto-sans-tamil'};

function fontId(name,catalog,fallback){if(!name)return fallback;const n=String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');const hit=catalog.fonts.find(f=>f.id===n||f.family.toLowerCase()===String(name).toLowerCase());return hit?hit.id:fallback;}

// Assign colour roles from an unordered palette: ink = darkest, paper = lightest (warmed if too dark),
// accent = most saturated colour that is neither.
export function rolesFromPalette(colors){
 const c=[...new Set((colors||[]).filter(isHex).map(v=>v.toLowerCase()))];
 if(!c.length)return {paper:'#f6f3ec',ink:'#16181d',accent:'#e4572e'};
 const byL=[...c].sort((a,b)=>luminance(a)-luminance(b));
 let ink=byL[0],paper=byL.at(-1);
 if(luminance(ink)>0.08)ink=mix(ink,'#000000',0.72);
 if(luminance(paper)<0.6)paper=mix(paper,'#ffffff',0.9);
 const rest=c.filter(v=>v!==byL[0]&&v!==byL.at(-1));
 const accent=(rest.length?rest:c).sort((a,b)=>saturation(b)-saturation(a))[0];
 return {paper,ink,accent};
}

export function normalize(input={},catalog){
 const p=input.profile&&typeof input.profile==='object'?input.profile:{};
 const legacy=rolesFromPalette(input.colors);
 const col={...legacy,...(p.colors||{})};
 for(const k of ['paper','ink','accent'])if(!isHex(col[k]))col[k]=legacy[k];
 // Guarantee the paper/ink pair reads as body text.
 if(contrast(col.paper,col.ink)<7)col.ink=luminance(col.paper)>0.4?mix(col.ink,'#000000',0.6):mix(col.ink,'#ffffff',0.85);
 col.accent_ink=isHex(col.accent_ink)&&contrast(col.accent_ink,col.accent)>=4.5?col.accent_ink:readable(col.accent,[col.ink,col.paper,'#000000','#ffffff']);
 col.surface=isHex(col.surface)?col.surface:mix(col.paper,col.ink,luminance(col.paper)>0.4?0.06:0.12);
 col.muted=isHex(col.muted)&&contrast(col.muted,col.paper)>=4.5?col.muted:mix(col.ink,col.paper,0.38);
 if(contrast(col.muted,col.paper)<4.5)col.muted=mix(col.ink,col.paper,0.2);
 col.support=(col.support||[]).filter(isHex).slice(0,3);
 const t=p.type||{};const legacyFont=fontId(input.font,catalog,null);
 const legacyRole=legacyFont&&catalog.fonts.find(f=>f.id===legacyFont)?.role;
 const display={font:fontId(t.display?.font,catalog,legacyFont||DEFAULT_FONTS.serif),weight:t.display?.weight??(legacyRole==='sans'?700:420),case:t.display?.case||'none',tracking:t.display?.tracking??-0.025,italic_accent:t.display?.italic_accent??true,width:t.display?.width??100,optical:t.display?.optical??null,soft:t.display?.soft??null,leading:t.display?.leading??0.98};
 const body={font:fontId(t.body?.font,catalog,legacyRole==='sans'?legacyFont:DEFAULT_FONTS.sans),weight:t.body?.weight??420};
 const label={font:fontId(t.label?.font,catalog,DEFAULT_FONTS.label),case:t.label?.case||'upper',tracking:t.label?.tracking??0.14,weight:t.label?.weight??500};
 const scripts={...Object.fromEntries((input.languages||[]).map(l=>[l,SCRIPT_FONTS[l]]).filter(([,v])=>v)),...(t.scripts||{})};
 const shapeStyle=SHAPE[p.shape?.style]?p.shape.style:'soft';
 const density=DENSITY[p.density]?p.density:'balanced';
 return {
  version:1,
  name:p.name||input.client_name||input.name||'Brand',
  handle:p.handle||'',
  wordmark:p.wordmark||p.name||input.client_name||'',
  colors:col,
  type:{display,body,label,scale:['tight','balanced','dramatic'].includes(t.scale)?t.scale:'balanced',scripts},
  logo:{file:p.logo?.file||null,placement:p.logo?.placement||'top-left',height:p.logo?.height||56,clear_space:p.logo?.clear_space??0.5},
  shape:{style:shapeStyle,radius:p.shape?.radius??SHAPE[shapeStyle].radius,stroke:p.shape?.stroke??2},
  motif:MOTIFS.includes(p.motif)?p.motif:'none',
  image:{style:p.image?.style||'none',treatment:p.image?.treatment||'natural'},
  density,
  tones:Array.isArray(p.tones)&&p.tones.length?p.tones.filter(x=>['paper','ink','accent'].includes(x)):['paper','ink','accent'],
  motion:{pace:['calm','balanced','punchy'].includes(p.motion?.pace)?p.motion.pace:'balanced'},
  rules:{do:p.rules?.do||[],dont:p.rules?.dont||[]},
  banned_words:input.banned_words||p.banned_words||[]
 };
}

// Problems a designer should see before using the profile.
export function audit(pr){const out=[],c=pr.colors;
 const pair=(a,b,need,label)=>{const r=contrast(a,b);if(r<need)out.push({severity:need>=4.5?'error':'warning',issue:`${label} contrast ${r.toFixed(2)}:1 < ${need}:1`});};
 pair(c.ink,c.paper,7,'Ink on paper');pair(c.accent_ink,c.accent,4.5,'Text on accent');pair(c.muted,c.paper,4.5,'Muted text on paper');
 if(contrast(c.accent,c.paper)<1.6&&contrast(c.accent,c.ink)<1.6)out.push({severity:'warning',issue:'Accent is close to both paper and ink; it will not stand out.'});
 return out;}

// Each tone is a surface the layouts can sit on. hi = the emphasis colour that is readable on it.
export function tones(pr){const c=pr.colors;
 const hiOn=(bg,fg)=>contrast(c.accent,bg)>=3?c.accent:fg;
 const pm=contrast(c.muted,c.surface)>=4.5?c.muted:mix(c.ink,c.paper,0.22);
 return {paper:{bg:c.paper,fg:c.ink,muted:pm,hi:hiOn(c.paper,c.ink),line:mix(c.paper,c.ink,0.22),card:c.surface},
  ink:{bg:c.ink,fg:c.paper,muted:mix(c.paper,c.ink,0.32),hi:hiOn(c.ink,c.paper),line:mix(c.ink,c.paper,0.26),card:mix(c.ink,c.paper,0.08)},
  accent:{bg:c.accent,fg:c.accent_ink,muted:c.accent_ink,hi:c.accent_ink,line:mix(c.accent,c.accent_ink,0.3),card:mix(c.accent,c.accent_ink,0.1)}};
}
export const pickTone=(pr,wanted)=>pr.tones.includes(wanted)?wanted:pr.tones[0]||'paper';

// CSS for a profile: @font-face (local files only) + :root variables + tone classes.
export function css(pr,catalog,fontBase){
 const used=new Set([pr.type.display.font,pr.type.body.font,pr.type.label.font,...Object.values(pr.type.scripts)].filter(Boolean));
 const faces=[];const fam=id=>catalog.fonts.find(f=>f.id===id);
 for(const id of used){const f=fam(id);if(!f)continue;for(const face of f.faces)faces.push(`@font-face{font-family:"x-${id}";src:url("${fontBase}/${id}/${face.file}") format("woff");font-style:${face.style};font-weight:${face.weight[0]} ${face.weight[1]};font-display:block;unicode-range:${face.unicode_range};}`);}
 const stack=(id,generic)=>{const scripts=Object.values(pr.type.scripts).filter(Boolean).map(s=>`"x-${s}"`);return [`"x-${id}"`,...scripts,generic].join(',');};
 const d=pr.type.display,D=DENSITY[pr.density],T=tones(pr);
 const scale={tight:0.86,balanced:1,dramatic:1.16}[pr.type.scale];
 const vars=[`--paper:${pr.colors.paper}`,`--ink:${pr.colors.ink}`,`--accent:${pr.colors.accent}`,`--accent-ink:${pr.colors.accent_ink}`,`--surface:${pr.colors.surface}`,`--muted:${pr.colors.muted}`,
  `--f-display:${stack(d.font,fam(d.font)?.role==='serif'?'serif':'sans-serif')}`,`--f-body:${stack(pr.type.body.font,'sans-serif')}`,`--f-label:${stack(pr.type.label.font,'monospace')}`,
  `--w-display:${d.weight}`,`--w-body:${pr.type.body.weight}`,`--w-label:${pr.type.label.weight}`,`--case-display:${d.case==='upper'?'uppercase':'none'}`,`--case-label:${pr.type.label.case==='upper'?'uppercase':'none'}`,
  `--track-display:${d.tracking}em`,`--track-label:${pr.type.label.tracking}em`,`--lead-display:${Math.max(0.93,d.leading*D.lead).toFixed(3)}`,`--scale:${scale}`,
  `--fvs-display:${[d.width!==100?`"wdth" ${d.width}`:null,d.optical?`"opsz" ${d.optical}`:null,d.soft!=null?`"SOFT" ${d.soft}`:null].filter(Boolean).join(',')||'normal'}`,
  `--radius:${pr.shape.radius}px`,`--stroke:${pr.shape.stroke}px`,`--margin:${D.margin}px`,`--gap:${D.gap}px`];
 const toneCss=Object.entries(T).map(([k,t])=>`.tone-${k}{--bg:${t.bg};--fg:${t.fg};--muted-fg:${t.muted};--hi:${t.hi};--line:${t.line};--card:${t.card};}`).join('\n');
 return faces.join('\n')+`\n:root{${vars.join(';')}}\n`+toneCss;
}
