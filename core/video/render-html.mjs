// VideoDesign -> HTML. A pure function of the design: the editor's live preview and the worker's HyperFrames render
// use exactly this output, so what the user sees while editing is what gets encoded. Browser-safe (no node imports).
import {totalSeconds,beatStarts,fitSize,spansText} from './design.mjs';

export const RENDERER_VERSION='vd-html-1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hex=(v,fb)=>/^#[0-9a-f]{6}$/i.test(String(v||''))?v:fb;
const num=(v,fb)=>Number.isFinite(Number(v))?Number(v):fb;

function fontFaceCss(faces=[],fontUrl){
 return faces.flatMap(f=>(f.faces||[]).map(x=>{const w=Array.isArray(x.weight)?x.weight.join(' '):x.weight||400;
  return `@font-face{font-family:"${esc(f.family)}";src:url("${esc(fontUrl(f.id,x.file))}") format("woff");font-weight:${esc(w)};font-style:${x.style==='italic'?'italic':'normal'};font-display:block}`;})).join('\n');
}
function backgroundHtml(bg,fileUrl,{start,dur,render}){
 if(!bg)return '';
 if(bg.kind==='image'&&bg.file_id)return `<img class="bg-media" src="${esc(fileUrl(bg.file_id))}" alt=""/>${dimHtml(bg)}`;
 if(bg.kind==='video'&&bg.file_id)return `<video class="bg-media${render?' clip':''}" src="${esc(fileUrl(bg.file_id))}" muted playsinline ${render?`data-start="${start}" data-duration="${dur}" data-track-index="0"`:'autoplay loop'}></video>${dimHtml(bg)}`;
 return '';
}
const dimHtml=bg=>bg.dim?`<div class="bg-dim" style="opacity:${num(bg.dim,0)}"></div>`:'';
function bgCss(bg,fallback){
 if(!bg)return `background:${fallback}`;
 if(bg.kind==='gradient')return `background:linear-gradient(${num(bg.angle,180)}deg,${hex(bg.from,fallback)},${hex(bg.to,fallback)})`;
 if(bg.kind==='solid')return `background:${hex(bg.color,fallback)}`;
 return `background:${hex(bg.color,'#000000')}`;
}
const corner=pos=>({'top-left':'top:var(--safe);left:var(--safe)','top-right':'top:var(--safe);right:var(--safe)','bottom-left':'bottom:var(--safe);left:var(--safe)','bottom-right':'bottom:var(--safe);right:var(--safe)','top-center':'top:var(--safe);left:50%;transform:translateX(-50%)','bottom-center':'bottom:var(--safe);left:50%;transform:translateX(-50%)'})[pos]||'display:none';

/**
 * @param design VideoDesign
 * @param o.mode 'preview' (plays and loops in an iframe) | 'render' (HyperFrames composition, paused timeline)
 * @param o.only beat index to render on its own (per-beat render and cache), or null for the whole video
 * @param o.fonts [{id,family,faces:[{file,style,weight}]}] for the fonts the design uses
 * @param o.fontUrl (fontId,file)=>url, o.fileUrl (fileId)=>url, o.gsapSrc url of gsap.min.js
 */
export function designToHtml(design,o={}){
 const {mode='preview',only=null,fonts=[],fontUrl=(id,f)=>`fonts/${id}/${f}`,fileUrl=id=>`assets/${id}`,gsapSrc='assets/gsap.min.js'}=o;
 const render=mode==='render';const d=design;const T=d.theme,L=d.layout||{};const W=d.width,H=d.height;
 const fam=id=>(fonts.find(f=>f.id===id)?.family)||id;
 const display=`"${esc(fam(T.fonts.display.id))}",Georgia,serif`,body=`"${esc(fam(T.fonts.body.id))}",system-ui,sans-serif`;
 const starts=beatStarts(d);const idx=only===null||only===undefined?d.beats.map((_,i)=>i):[only];
 const total=only===null||only===undefined?totalSeconds(d):Number(d.beats[only].duration);
 const at=i=>only===null||only===undefined?starts[i]:0;
 const safe=num(T.safe_area,0.07);const ty=T.type||{};const ink=hex(T.ink,'#16181d');const paper=hex(T.background?.color||T.background?.from,'#f6f0e4');
 const justify={top:'flex-start',center:'center',bottom:'flex-end'}[L.text_position]||'center';
 const rail=L.rail;
 const lane=num(rail?.style?.laneWidth,54), speed=100/num(rail?.style?.periodSeconds,4);
 const visual=rail?.file_id?`<img src="${esc(fileUrl(rail.file_id))}" alt=""/>`:rail?`<svg viewBox="0 0 200 200">${rail.art.map(p=>`<path d="${esc(p.d)}" fill="${hex(p.fill,ink)}"/>`).join('')}</svg>`:'';
 const sections=idx.map(i=>{const b=d.beats[i];const s=at(i),dur=Number(b.duration);const al=b.style?.align||ty.align||'left';
  const text=spansText(b.text);const size=fitSize(text,{size:num(ty.size,112),width:W,height:H,safe,line_height:num(ty.line_height,1.04)});
  const words=b.text.map((w,wi)=>{const st=w.style||{};const css=[st.italic?'font-style:italic':'',st.bold?'font-weight:800':'',st.underline?'text-decoration:underline;text-decoration-thickness:.06em':'',st.color?`color:${hex(st.color,ink)}`:''].filter(Boolean).join(';');return `<span class="w" data-i="${wi}"${css?` style="${css}"`:''}>${esc(w.text)}</span>`;}).join(' ');
  const sub=(b.sub||[]).length?`<p class="sub">${(b.sub||[]).map(w=>`<span${w.style?.italic?' style="font-style:italic"':''}>${esc(w.text)}</span>`).join(' ')}</p>`:'';
  const cap=L.caption_bar?.visible&&b.caption?`<div class="cap cap-${L.caption_bar.position==='top'?'top':'bottom'} cap-${L.caption_bar.style==='bar'?'bar':'plain'}">${esc(b.caption)}</div>`:'';
  const own=b.style?.background;
  return `<section id="beat-${i}" class="beat${render?' clip':''}" ${render?`data-start="${s}" data-duration="${dur}" data-track-index="1"`:''} style="${own?bgCss(own,paper)+';':''}--ink:${hex(b.style?.ink,ink)}">
${own?backgroundHtml(own,fileUrl,{start:s,dur,render}):''}<div class="block" style="justify-content:${justify};text-align:${al}"><h1 class="head" style="font-size:${size}px">${rail&&i===0?esc(rail.caption):words}</h1>${sub}</div>${cap}
</section>`;}).join('\n');
 const logo=L.logo?.file_id&&L.logo.position!=='none'?`<img class="logo" src="${esc(fileUrl(L.logo.file_id))}" alt="" style="${corner(L.logo.position)};height:${num(L.logo.size,72)}px"/>`:'';
 const tag=L.locale_tag?.visible&&L.locale_tag.text?`<div class="tag" style="${corner(L.locale_tag.position)}">${esc(L.locale_tag.text)}</div>`:'';
 const chrome=logo||tag?`<div class="chrome${render?' clip':''}" ${render?`data-start="0" data-duration="${total}" data-track-index="5"`:''}>${logo}${tag}</div>`:'';
 const sp=num(T.motion?.speed,1);
 const anim=idx.map(i=>{const b=d.beats[i];const s=+at(i).toFixed(3),dur=Number(b.duration),last=i===d.beats.length-1;const preset=b.style?.motion||T.motion?.preset||'words';const n=b.text.length;
  const sel=`#beat-${i}`;const lines=[`tl.set("${sel}",{autoAlpha:1},${s});`];
  if(!last||only!==null&&only!==undefined)lines.push(`tl.set("${sel}",{autoAlpha:0},${+(s+dur).toFixed(3)});`);
  const t0=+(s+0.1).toFixed(3);
  if(rail&&i===0){/* Show the caption immediately on the cover. */}
  else if(preset==='words')lines.push(`tl.fromTo("${sel} .w",{y:40,autoAlpha:0},{y:0,autoAlpha:1,duration:${(0.5/sp).toFixed(3)},stagger:${(Math.min(0.08,dur*0.4/n)/sp).toFixed(3)},ease:"power3.out"},${t0});`);
  else if(preset==='fade')lines.push(`tl.fromTo("${sel} .head",{autoAlpha:0},{autoAlpha:1,duration:${(0.6/sp).toFixed(3)},ease:"power1.out"},${t0});`);
  else if(preset==='typewriter'){const step=Math.min(0.18,dur*0.6/n)/sp;lines.push(`document.querySelectorAll("${sel} .w").forEach((w,k)=>tl.fromTo(w,{autoAlpha:0},{autoAlpha:1,duration:0.01},${t0}+k*${step.toFixed(3)}));`);}
  else if(preset==='slide')lines.push(`tl.fromTo("${sel} .head",{x:-120,autoAlpha:0},{x:0,autoAlpha:1,duration:${(0.6/sp).toFixed(3)},ease:"power3.out"},${t0});`);
  else if(preset==='scale')lines.push(`tl.fromTo("${sel} .head",{scale:0.86,autoAlpha:0},{scale:1,autoAlpha:1,duration:${(0.6/sp).toFixed(3)},ease:"power2.out"},${t0});`);
  if((b.sub||[]).length)lines.push(`tl.fromTo("${sel} .sub",{y:16,autoAlpha:0},{y:0,autoAlpha:1,duration:0.45},${+(s+0.45).toFixed(3)});`);
  if(!last&&dur>1.2)lines.push(`tl.to("${sel} .block",{autoAlpha:0,duration:0.2},${+(s+dur-0.22).toFixed(3)});`);
  return lines.join('\n');}).join('\n');
 const player=render?'':`
let t0=performance.now(),paused=false,off=0;const D=${total};
function frame(){if(!paused){const t=((performance.now()-t0)/1000+off)%D;tl.seek(t);window.__t=t;parent.postMessage({videoDesignTime:t},'*');}requestAnimationFrame(frame);}
addEventListener('message',e=>{const m=e.data||{};if(typeof m.seek==='number'){off=m.seek;t0=performance.now();tl.seek(m.seek);}if(m.pause===true){paused=true;}if(m.pause===false){off=window.__t||0;t0=performance.now();paused=false;}});
document.fonts.ready.then(()=>requestAnimationFrame(frame));`;
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>video</title>
<style>
${fontFaceCss(fonts,fontUrl)}
html,body{margin:0;background:#000;overflow:hidden}
#root{position:relative;width:${W}px;height:${H}px;overflow:hidden;--safe:${Math.round(safe*W)}px;color:${ink};${bgCss(T.background,paper)}}
.bg-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.bg-dim{position:absolute;inset:0;background:#000}
.beat{position:absolute;inset:0;visibility:hidden;color:var(--ink)}
.block{position:absolute;inset:0;padding:calc(var(--safe) * 1.6) var(--safe);display:flex;flex-direction:column;box-sizing:border-box}
.head{margin:0;font-family:${display};font-weight:${num(T.fonts.display.weight,600)};line-height:${num(ty.line_height,1.04)};letter-spacing:${num(ty.letter_spacing,-0.02)}em;${ty.case==='upper'?'text-transform:uppercase;':''}overflow-wrap:break-word}
.w{display:inline-block}
.sub{margin:.9em 0 0;font-family:${body};font-weight:${num(T.fonts.body.weight,400)};font-size:${num(ty.sub_size,44)}px;line-height:1.3;opacity:.86}
.chrome{position:absolute;inset:0;pointer-events:none}
.logo{position:absolute;width:auto;max-width:40%;object-fit:contain}
.tag{position:absolute;font-family:${body};font-size:30px;font-weight:600;letter-spacing:.22em;color:${hex(T.accent,ink)}}
.cap{position:absolute;left:var(--safe);right:var(--safe);font-family:${body};font-size:38px;line-height:1.3;text-align:center}
.cap-bottom{bottom:calc(var(--safe) * 1.4)}.cap-top{top:calc(var(--safe) * 1.4)}
.cap-bar{background:rgba(0,0,0,.62);color:#fff;padding:18px 28px;border-radius:14px}
${rail?`
#root{background:linear-gradient(93deg,transparent 30%,#00000009 31%,#ffffff55 31.4%,transparent 39%),linear-gradient(174deg,transparent 67%,#0000000c 68%,transparent 69%),${paper}}
.product-lane{position:absolute;inset:0 ${100-lane}% 0 0;overflow:hidden}.product-strip{position:absolute;top:-32%;width:100%;height:32%}.product{height:100%;padding:5%;box-sizing:border-box;filter:drop-shadow(0 14px 11px #0002)}.product img,.product svg{width:100%;height:100%;object-fit:contain;transform:rotate(${num(rail.style?.rotation,0)}deg) scale(${num(rail.style?.visualScale,1)})}
.paper-fold{position:absolute;left:-3%;bottom:-3%;width:${lane+5}%;height:26%;background:linear-gradient(94deg,#0002,transparent 12%),${paper};border-top:5px solid #ffffff80;transform:skewY(6deg);box-shadow:0 -8px 18px #0001}
.block{left:${lane}%;right:4%;padding:0;top:16%;bottom:21%;align-items:flex-start;justify-content:center!important}.head{font-family:${body};font-weight:900;font-size:${Math.min(84,ty.size||96)}px!important;line-height:1.02;letter-spacing:-.045em}.w{display:inline}.rail-brand{position:absolute;right:6%;top:14%;font:700 44px ${body}}.chrome .logo{top:14%;bottom:auto;left:auto;right:6%}
`:''}</style>
<script src="${esc(gsapSrc)}"></script>
</head><body>
<div id="root" ${render?`data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}" data-fps="${d.fps||30}"`:''}>
${backgroundHtml(T.background,fileUrl,{start:0,dur:total,render})}
${rail?`<div class="product-lane"><div class="product-strip">${Array.from({length:5},()=>'<div class="product">'+visual+'</div>').join('')}</div></div><div class="paper-fold"></div>${logo?'':'<div class="rail-brand">'+esc(rail.brand)+'</div>'}`:''}
${sections}
${chrome}
</div>
<script>
window.__timelines=window.__timelines||{};
const tl=gsap.timeline({paused:true});
${rail?`tl.fromTo(".product-strip",{yPercent:${(only==null?0:starts[only]*speed)%100}},{yPercent:${(only==null?0:starts[only]*speed)%100+total*speed},duration:${total},ease:"none",modifiers:{yPercent:v=>parseFloat(v)%100}},0);`:''}
${anim}
tl.set({},{},${total});
window.__timelines["main"]=tl;
${player}
</script>
</body></html>`;
}
