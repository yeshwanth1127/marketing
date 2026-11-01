// BEHIND THE SCENES — a field note: time-stamp, place, a line in someone's own words. Human, unpolished on purpose.
export default {
 id:'behind-scenes',name:'Behind the scenes',tone:'paper',
 purpose:'Team, process, prep, a day in the life; humanises the brand between promotional posts.',
 slots:{time:'e.g. "7:40 AM"',place:'e.g. "Indiranagar kitchen"',note:'what is happening, in someone\'s own words; *emphasis* allowed',person:'who said it, e.g. "Asha, head chef" (only with consent)',image:'approved photo file (optional)'},
 frames:s=>[{...s}],
 render(f,c){
  const deco=c.pr.motif!=='none'?`<div class="deco bts-deco">${c.motif('grid',1080,1920,'var(--line)')}</div>`:'';
  return `<main class="canvas">${deco}${c.rail({label:c.series||'Behind the scenes'})}
<section class="stamp"><span class="display time">${c.esc(f.time)}</span><span class="label muted">${c.esc(f.place)}</span></section>
${f.image?`<figure class="photo"><img src="${c.esc(f.image)}" alt=""></figure>`:''}
<section class="note fit"><span class="display qm">“</span><p class="display ntext" data-fit data-min="44">${c.t(f.note)}</p></section>
${f.person?`<footer class="foot"><span class="label">— ${c.esc(f.person)}</span><span class="label muted">${c.esc(c.pr.handle)}</span></footer>`:c.foot('')}</main>`;},
 css:`.L-behind-scenes .bts-deco{inset:0;opacity:.7}
.L-behind-scenes .stamp>.label{text-align:right}
.L-behind-scenes .stamp{display:flex;align-items:baseline;justify-content:space-between;gap:2rem;border-bottom:var(--stroke) solid var(--fg);padding-bottom:2.4rem;flex:none}
.L-behind-scenes .time{font-size:calc(13rem*var(--scale));line-height:.85;font-feature-settings:"lnum","tnum";color:var(--hi);white-space:nowrap}
.L-behind-scenes .photo{flex:1.2;min-height:0;border-radius:var(--radius);overflow:hidden}
.L-behind-scenes .photo img{width:100%;height:100%;object-fit:cover;display:block}
.L-behind-scenes .note{flex:1;display:flex;flex-direction:column;justify-content:flex-end;position:relative}
.L-behind-scenes .qm{font-size:calc(22rem*var(--scale));line-height:.6;color:var(--hi);height:9rem;flex:none}
.L-behind-scenes .ntext{font-size:calc(8.6rem*var(--scale));background:var(--bg)}
.fmt-landscape.L-behind-scenes .canvas{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto 1fr auto;column-gap:5rem}
.fmt-landscape.L-behind-scenes .rail,.fmt-landscape.L-behind-scenes .foot{grid-column:1/3}
.fmt-landscape.L-behind-scenes .stamp{flex-direction:column;border:0;border-right:var(--stroke) solid var(--fg);padding:0 5rem 0 0;justify-content:center}
.fmt-landscape.L-behind-scenes .time{font-size:calc(8rem*var(--scale))}
.fmt-landscape.L-behind-scenes .photo{display:none}
.fmt-landscape.L-behind-scenes .ntext{font-size:calc(5.4rem*var(--scale))}.fmt-landscape.L-behind-scenes .qm{display:none}`
};
