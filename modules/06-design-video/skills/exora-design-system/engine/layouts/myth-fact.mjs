// MYTH vs FACT — the myth is struck through on a quiet panel; the fact lands on the inverse panel.
export default {
 id:'myth-fact',name:'Myth vs fact',tone:'paper',
 purpose:'Correct a common belief in the category with a verified fact; educational trust content.',
 slots:{myth:'the belief, as people say it',fact:'the correction, plain and short; *emphasis* allowed',note:'source or who says so (optional, must be real)',cta:'call to action (optional)'},
 frames:s=>[{...s}],
 render(f,c){
  return `<main class="canvas">${c.rail({label:c.series||'Myth vs fact'})}
<section class="panel myth fit"><span class="label tag"><span class="mk">✕</span>Myth</span><p class="display mtext" data-fit data-min="34">${c.t(f.myth)}</p></section>
<section class="panel fact tone-ink fit"><span class="label tag"><span class="mk">✓</span>Fact</span><p class="display ftext" data-fit data-min="34">${c.t(f.fact)}</p>${f.note?`<p class="label muted note">${c.esc(f.note)}</p>`:''}</section>
${c.foot(f.cta)}</main>`;},
 css:`.L-myth-fact .panel{flex:1;border-radius:var(--radius);padding:4.4rem 4.8rem;display:flex;flex-direction:column;gap:2.6rem;background:var(--bg);color:var(--fg)}
.L-myth-fact .myth{background:var(--card);flex:.8}
.L-myth-fact .fact{flex:1.2}
.L-myth-fact .tag{display:flex;align-items:center;gap:1.4rem}
.L-myth-fact .mk{display:inline-grid;place-items:center;width:5.2rem;height:5.2rem;border-radius:var(--radius);border:var(--stroke) solid currentColor;font-family:var(--f-body);letter-spacing:0;font-size:2.8rem}
.L-myth-fact .fact .mk{background:var(--hi);color:var(--bg);border-color:var(--hi)}
.L-myth-fact .mtext{font-size:calc(7.2rem*var(--scale));color:var(--muted-fg);text-decoration:line-through;text-decoration-thickness:calc(var(--stroke)*2);text-decoration-color:var(--hi)}
.L-myth-fact .ftext{font-size:calc(8.8rem*var(--scale))}
.L-myth-fact .note{margin-top:auto}
.fmt-landscape.L-myth-fact .canvas{display:grid;grid-template-columns:1fr 1.2fr;grid-template-rows:auto 1fr auto;column-gap:3rem}
.fmt-landscape.L-myth-fact .rail,.fmt-landscape.L-myth-fact .foot{grid-column:1/3}
.fmt-landscape.L-myth-fact .panel{padding:2.4rem 3rem;gap:1.4rem}.fmt-landscape.L-myth-fact .note{display:none}.fmt-landscape.L-myth-fact .canvas{grid-template-rows:auto minmax(0,1fr) auto}.fmt-landscape.L-myth-fact .mk{width:4.4rem;height:4.4rem;font-size:2.8rem}
.fmt-landscape.L-myth-fact .mtext{font-size:calc(5rem*var(--scale))}.fmt-landscape.L-myth-fact .ftext{font-size:calc(5.6rem*var(--scale))}`
};
