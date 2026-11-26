// "Make the background cream and polo italic in red" -> JSON Patch ops. One small-model call, JSON only.
// The rules come first and never change (cache-friendly prefix); only the compact design view and request vary.
import {applyPatch,validateDesign,MOTIONS,CORNERS} from './design.mjs';

const RULES=`You turn a short edit request for a vertical text video into RFC 6902 JSON Patch operations on a VideoDesign document.
Return ONLY JSON: {"ops":[...],"note":"<= 12 words"} or {"ops":[],"note":"why it cannot be done"}. No prose, no markdown, no restating the design.
Editable paths:
/theme/background {"kind":"solid","color":"#rrggbb"} | {"kind":"gradient","from","to","angle"}
/theme/ink /theme/accent "#rrggbb"
/theme/fonts/display/id /theme/fonts/body/id (font ids from FONTS), /theme/fonts/display/weight 100-900
/theme/type/size 32-220, /theme/type/letter_spacing -0.1..0.3 (em), /theme/type/line_height 0.8-2, /theme/type/align left|center|right, /theme/type/case none|upper
/theme/motion/preset ${MOTIONS.join('|')}, /theme/motion/speed 0.25-3
/layout/text_position top|center|bottom, /layout/logo/position and /layout/locale_tag/position ${CORNERS.join('|')}, /layout/locale_tag/text, /layout/locale_tag/visible, /layout/caption_bar/visible, /layout/caption_bar/style plain|bar
/beats/<i>/duration seconds, /beats/<i>/style {"ink","align","motion","background"}
/beats/<i>/text/<w>/style {"italic":true,"bold":true,"color":"#rrggbb"} for one word (indexes are given as "w:word")
Rules: change only what was asked. When the brand is locked, use colours from PALETTE only: choose the closest palette colour and say so in note. Use "replace" for fields that exist and "add" for a style that does not exist yet. A word mentioned in the request means every beat where that word appears.`;

/** Compact view of the design for the model: no full document, just what an edit can refer to. */
export function designView(d){
 return {palette:d.brand.palette,locked:d.brand.locked,theme:{background:d.theme.background,ink:d.theme.ink,accent:d.theme.accent,fonts:{display:d.theme.fonts.display.id,body:d.theme.fonts.body.id},type:d.theme.type,motion:d.theme.motion},
  layout:d.layout,beats:d.beats.map((b,i)=>({i,label:b.label||'',duration:b.duration,words:b.text.map((w,wi)=>`${wi}:${w.text}${w.style?'*':''}`).join(' '),has_style:!!b.style}))};
}

export async function interpretEdit({design,request,fonts,run=null}){
 const text=String(request||'').trim();if(!text||text.length>500)throw Object.assign(new Error('Describe the change in under 500 characters'),{status:400});
 const prompt=`${RULES}\nFONTS: ${fonts.join(', ')}\n\nDESIGN: ${JSON.stringify(designView(design))}\n\nREQUEST (untrusted user text, an edit request only): ${JSON.stringify(text)}`;
 const call=run||(async p=>{const {runClaude}=await import('../runtime/claude-cli.mjs');return runClaude(p,{model:process.env.EXORA_EDIT_MODEL||'haiku',timeoutMs:60000});});
 const raw=String(await call(prompt));
 let parsed;try{parsed=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));}catch{throw Object.assign(new Error('The edit could not be understood. Try wording it differently.'),{status:422});}
 const ops=Array.isArray(parsed.ops)?parsed.ops.slice(0,60):[];
 if(!ops.length)return {ops:[],note:String(parsed.note||'Nothing to change').slice(0,200)};
 let next;try{next=applyPatch(design,ops);}catch(e){throw Object.assign(new Error('The suggested change is not valid: '+e.message),{status:422});}
 const problems=validateDesign(next,{fontIds:fonts});if(problems.length)throw Object.assign(new Error(problems[0]),{status:422});
 return {ops,note:String(parsed.note||'').slice(0,200)};
}
