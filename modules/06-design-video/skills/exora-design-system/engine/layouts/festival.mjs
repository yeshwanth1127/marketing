// FESTIVAL — a greeting card, not an ad. Rangoli rosette built from the brand's own shape and colour,
// a bilingual line in the client's script, and the brand's sign-off. No discount unless the copy has one.
export default {
 id:'festival',name:'Festival post',tone:'ink',
 purpose:'Festival and occasion greetings (Deepavali, Ugadi, Pongal, Onam, Eid, Christmas…); regional relevance.',
 slots:{festival:'festival name, e.g. "Deepavali"',greeting:'the greeting headline; *emphasis* allowed',local_line:'the greeting in the client\'s Indian language (optional, must be checked by a native speaker)',message:'one warm line from the brand (optional)',signoff:'e.g. "From all of us at …" (optional)'},
 frames:s=>[{...s}],
 render(f,c){
  const size=c.format==='landscape'?360:c.format==='reel'?620:c.format==='square'?300:520;
  return `<main class="canvas"><div class="frame-line"></div>
<header class="fest-top"><span class="label hi">${c.esc(f.festival)}</span>${c.idx()}</header>
<section class="fest fit"><div class="rosette">${c.motif('rosette',size,size,'var(--hi)')}</div>
<div class="words"><h1 class="display greet" data-fit data-min="48">${c.t(f.greeting)}</h1>${f.local_line?`<p class="display local">${c.esc(f.local_line)}</p>`:''}${f.message?`<p class="body muted msg">${c.t(f.message)}</p>`:''}</div></section>
<footer class="fest-foot"><div class="mark">${c.mark()}</div>${f.signoff?`<span class="label muted">${c.esc(f.signoff)}</span>`:''}</footer></main>`;},
 css:`.L-festival .canvas{align-items:center;text-align:center}
.L-festival .frame-line{position:absolute;inset:calc(var(--margin)*var(--u)*.45);border:var(--stroke) solid var(--line);border-radius:var(--radius);z-index:-1;pointer-events:none;outline:var(--stroke) solid var(--line);outline-offset:1.2rem}
.fmt-reel.L-festival .frame-line{inset:200px 40px 320px}
.L-festival .fest-top{width:100%;display:flex;justify-content:space-between}
.L-festival .fest{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4rem;width:100%}
.L-festival .rosette{flex:none}
.L-festival .words{display:flex;flex-direction:column;gap:2.4rem;align-items:center;min-height:0}
.L-festival .greet{font-size:calc(11rem*var(--scale));max-width:92%}
.L-festival .local{font-size:calc(6rem*var(--scale));color:var(--hi);letter-spacing:0;text-transform:none;line-height:1.35}
.L-festival .msg{max-width:80%}
.L-festival .fest-foot{display:flex;flex-direction:column;align-items:center;gap:1.2rem}
.fmt-square.L-festival .fest{gap:2.4rem}.fmt-square.L-festival .msg{display:none}.fmt-square.L-festival .greet{font-size:calc(9rem*var(--scale))}
.fmt-square.L-festival .local,.fmt-landscape.L-festival .local{font-size:calc(4.4rem*var(--scale))}
.fmt-landscape.L-festival .fest{flex-direction:row;gap:5rem;text-align:left}
.fmt-landscape.L-festival .words{align-items:flex-start}
.fmt-landscape.L-festival .greet{font-size:calc(7rem*var(--scale))}
.fmt-landscape.L-festival .msg{display:none}
.fmt-landscape.L-festival .fest-foot{flex-direction:row;width:100%;justify-content:space-between}`
};
