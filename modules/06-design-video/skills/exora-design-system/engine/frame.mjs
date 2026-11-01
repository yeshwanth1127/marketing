// Assembles one frame: base grammar + brand CSS + layout CSS + markup + the fit script.
// Every visual value comes from the brand profile; the layout only decides structure.
import {css as brandCss,pickTone,tones} from './profile.mjs';
import {motif} from './motifs.mjs';
export const CANVAS={square:[1080,1080],portrait:[1080,1350],reel:[1080,1920],landscape:[1200,628]};
const U={square:1,portrait:1,reel:1,landscape:1.12};
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Copy markup: *word* = emphasis (accent / italic), line breaks kept. Nothing else is interpreted.
export const rich=s=>esc(s).replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');
export const plain=s=>String(s??'').replace(/\*/g,'');

export const BASE=`*{box-sizing:border-box;margin:0;padding:0}
html{font-size:calc(10px*var(--u))}
body{--page:var(--bg);width:var(--W);height:var(--H);overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--f-body);font-weight:var(--w-body);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-kerning:normal}
.canvas{position:relative;width:100%;height:100%;padding:calc(var(--margin)*var(--u));display:flex;flex-direction:column;gap:calc(var(--gap)*var(--u));isolation:isolate}
.fmt-reel .canvas{padding-top:276px;padding-bottom:396px}
.fmt-landscape .canvas{padding:50px 72px;gap:20px}
.fmt-landscape .foot .label.muted{display:none}
.fmt-landscape .cta{padding:1.2rem 2rem}
.deco{position:absolute;pointer-events:none;z-index:-1}
.display{font-family:var(--f-display);font-weight:var(--w-display);text-transform:var(--case-display);letter-spacing:var(--track-display);line-height:var(--lead-display);font-variation-settings:var(--fvs-display);text-wrap:balance;hyphens:manual}
.display em{font-style:var(--em-style,italic);color:var(--hi)}
.no-italic .display em{font-style:normal}
.label{font-family:var(--f-label);font-weight:var(--w-label);text-transform:var(--case-label);letter-spacing:var(--track-label);font-size:2.8rem;line-height:1.25}
.body{font-size:3.4rem;line-height:1.38;text-wrap:pretty}
.muted{color:var(--muted-fg)}
.hi{color:var(--hi)}
.fit{min-height:0}
.rail{display:flex;align-items:center;justify-content:space-between;gap:2.4rem;flex:none}
.rail .mark{display:flex;align-items:center;gap:1.4rem;min-width:0}
.rail .mark img{height:calc(var(--logo-h)*var(--u));width:auto;display:block}
.wordmark{font-family:var(--f-display);font-weight:var(--w-display);font-variation-settings:var(--fvs-display);font-size:4.6rem;letter-spacing:var(--track-display);line-height:1;white-space:nowrap}
.rail .meta{display:flex;gap:2.4rem;align-items:center;white-space:nowrap;min-width:0}
.rule{height:var(--stroke);background:var(--line);flex:none}
.foot{display:flex;align-items:center;justify-content:space-between;gap:2.4rem;flex:none}
.cta{display:inline-flex;align-items:center;gap:1.4rem;font-family:var(--f-label);font-weight:var(--w-label);text-transform:var(--case-label);letter-spacing:var(--track-label);font-size:2.8rem;line-height:1.1;padding:1.8rem 2.6rem;border-radius:var(--radius);background:var(--fg);color:var(--bg);white-space:nowrap}
.cta .arrow{font-family:var(--f-body);letter-spacing:0;font-weight:600}
.chip{align-self:flex-start;display:inline-flex;align-items:center;font-family:var(--f-label);font-weight:var(--w-label);text-transform:var(--case-label);letter-spacing:var(--track-label);font-size:2.8rem;line-height:1;padding:1.2rem 1.8rem;border:var(--stroke) solid currentColor;border-radius:var(--radius);white-space:nowrap}
.card{background:var(--card);border-radius:var(--radius)}
`;
// Shrinks every .fit element's [data-fit] text until it fits its box, then marks the page ready.
export const FIT=`<script>(async()=>{try{await document.fonts.ready}catch(e){}
// Height the content needs (works for flex-end boxes, where overflow goes upward and scrollHeight misses it).
const need=b=>{const kids=[...b.children].filter(k=>getComputedStyle(k).position!=='absolute');const cs=getComputedStyle(b);
 if(!kids.length)return b.scrollHeight-parseFloat(cs.fontSize)*0.32; // leaf text: allow tight-leading glyph overhang
 const pad=parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom),gap=parseFloat(cs.rowGap)||0,h=kids.map(k=>k.getBoundingClientRect().height);
 return (cs.display.includes('flex')&&!cs.flexDirection.startsWith('column'))?Math.max(...h)+pad:h.reduce((a,v)=>a+v,0)+gap*(kids.length-1)+pad;};
const over=b=>need(b)>b.clientHeight+2||b.scrollWidth>b.clientWidth+1;
for(const t of document.querySelectorAll('[data-fit]')){const box=t.closest('.fit')||t;let s=parseFloat(getComputedStyle(t).fontSize);const min=parseFloat(t.dataset.min||28);let i=0;
 while(over(box)&&s>min&&i++<90){s=Math.max(min,s*0.96);t.style.fontSize=s+'px';}}
document.body.dataset.ready='1';})();</script>`;

export function context(profile,catalog,{format='portrait',fontBase='fonts',logoBase='',index=0,total=1,series=''}={}){
 const [W,H]=CANVAS[format]||CANVAS.portrait;const T=tones(profile);
 return {pr:profile,format,W,H,index,total,series,T,
  tone:want=>pickTone(profile,want),
  t:rich,esc,plain,
  motif:(kind,w,h,color,extra={})=>motif(kind==='brand'?profile.motif:kind,{w,h,color,stroke:Math.max(1.5,profile.shape.stroke),shape:profile.shape.style,...extra}),
  mark:()=>profile.logo.file?`<img src="${esc(logoBase+profile.logo.file)}" alt="${esc(profile.name)}">`:`<span class="wordmark">${esc(profile.wordmark||profile.name)}</span>`,
  idx:()=>total>1?`<span class="label">${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}</span>`:'',
  rail(opts={}){return `<header class="rail"><div class="mark">${this.mark()}</div><div class="meta">${opts.label?`<span class="label muted">${esc(opts.label)}</span>`:''}${this.idx()}</div></header>`;},
  foot(cta,opts={}){const handle=opts.handle===false?'':profile.handle;return `<footer class="foot">${cta?`<span class="cta">${esc(plain(cta))}<span class="arrow">→</span></span>`:'<span></span>'}${handle?`<span class="label muted">${esc(handle)}</span>`:''}</footer>`;},
  fontBase,catalog};
}

export function document({layout,frame,ctx,tone}){
 const t=ctx.tone(tone||frame.tone||layout.tone||'paper');
 const italic=ctx.catalog.fonts.find(f=>f.id===ctx.pr.type.display.font)?.faces.some(x=>x.style==='italic')&&ctx.pr.type.display.italic_accent;
 const markup=layout.render(frame,ctx,t);
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(layout.id)}</title><style>
${brandCss(ctx.pr,ctx.catalog,ctx.fontBase)}
:root{--W:${ctx.W}px;--H:${ctx.H}px;--u:${U[ctx.format]};--logo-h:${ctx.pr.logo.height}}
${BASE}
${layout.css||''}
</style></head><body class="fmt-${ctx.format} tone-${t} L-${layout.id}${italic?'':' no-italic'}">${markup}${FIT}</body></html>`;
}
