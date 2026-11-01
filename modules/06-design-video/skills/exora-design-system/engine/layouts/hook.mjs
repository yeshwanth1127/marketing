// HOOK — one statement that stops the scroll. The headline is the whole design.
export default {
 id:'hook',name:'Hook post',tone:'ink',
 purpose:'A single scroll-stopping statement or question; first frame of a carousel; reel cover.',
 slots:{kicker:'short label above the headline (optional)',headline:'the hook, 4–14 words; wrap one key phrase in *asterisks* for emphasis',sub:'one supporting line (optional)',cta:'call to action (optional)'},
 frames:s=>[{...s}],
 render(f,c){
  const deco=c.pr.motif!=='none'?`<div class="deco hook-deco">${c.motif('brand',640,640,'var(--line)')}</div>`:'';
  return `<main class="canvas">${deco}${c.rail({label:f.kicker_rail||c.series})}<div class="rule"></div>
<section class="stage fit">${f.kicker?`<p class="label hi kicker">${c.esc(f.kicker)}</p>`:''}<h1 class="display headline" data-fit data-min="56">${c.t(f.headline)}</h1>${f.sub?`<p class="body muted sub">${c.t(f.sub)}</p>`:''}</section>
${c.foot(f.cta)}</main>`;},
 css:`.L-hook .stage{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:3.2rem}
.L-hook .headline{font-size:calc(15.5rem*var(--scale));max-width:96%}
.L-hook .sub{max-width:84%}
.L-hook .hook-deco{right:-14%;top:9%;width:62%;opacity:.9}
.L-hook .hook-deco svg{width:100%;height:auto}
.fmt-landscape.L-hook .headline{font-size:calc(8rem*var(--scale));max-width:82%}
.fmt-landscape.L-hook .sub,.fmt-landscape.L-hook .rule{display:none}.fmt-landscape.L-hook .stage{justify-content:center;gap:1.4rem}
.fmt-landscape.L-hook .hook-deco{width:40%;top:-20%;right:-8%}
.fmt-reel.L-hook .stage{justify-content:center}
.fmt-reel.L-hook .hook-deco{top:4%;right:-20%;width:80%}`
};
