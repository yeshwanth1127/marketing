// PROOF — a real customer's words, attributed. Numbers appear only when they come from verified evidence.
export default {
 id:'proof',name:'Testimonial / proof',tone:'ink',
 purpose:'Reviews, testimonials, verified results; social proof for ads and retargeting.',
 slots:{quote:'the customer\'s words, trimmed but not reworded; *emphasis* allowed',name:'customer name or initials (with consent)',detail:'e.g. "Parent, Whitefield" or "Google review"',stat_value:'a verified number, e.g. 4.9 (optional, evidence required)',stat_label:'what the number is, e.g. "Google rating · 212 reviews" (required with stat_value)',verified:'true only when the review is on record'},
 frames:s=>[{...s}],
 render(f,c){
  const stat=f.stat_value&&f.stat_label?`<div class="stat"><span class="display sv">${c.esc(f.stat_value)}</span><span class="label muted">${c.esc(f.stat_label)}</span></div>`:'';
  return `<main class="canvas">${c.rail({label:c.series})}
<section class="quote fit"><span class="display qm">“</span><blockquote class="display qtext" data-fit data-min="44">${c.t(f.quote)}</blockquote></section>
<footer class="attrib"><div class="who"><span class="label">${c.esc(f.name)}</span>${f.detail?`<span class="label muted">${c.esc(f.detail)}</span>`:''}${f.verified===true||f.verified==='true'?`<span class="chip hi">Verified</span>`:''}</div>${stat}</footer></main>`;},
 css:`.L-proof .quote{flex:1;display:flex;flex-direction:column;justify-content:center;gap:1rem}
.L-proof .qm{font-size:calc(34rem*var(--scale));line-height:.62;height:15rem;color:var(--hi);flex:none}
.L-proof .qtext{font-size:calc(9rem*var(--scale))}
.L-proof .attrib{display:flex;justify-content:space-between;align-items:flex-end;gap:3rem;border-top:var(--stroke) solid var(--line);padding-top:3.2rem;flex:none}
.L-proof .who{display:flex;flex-direction:column;gap:1.2rem;align-items:flex-start}.L-proof .who>.label{white-space:nowrap}
.L-proof .stat{display:flex;flex-direction:column;align-items:flex-end;gap:.8rem;text-align:right}
.L-proof .sv{font-size:calc(13rem*var(--scale));line-height:.85;color:var(--hi);font-feature-settings:"lnum"}
.fmt-landscape.L-proof .qm{display:none}.fmt-landscape.L-proof .who .label{white-space:nowrap}.fmt-landscape.L-proof .qtext{font-size:calc(5.6rem*var(--scale))}
.fmt-landscape.L-proof .attrib{padding-top:2rem}.fmt-landscape.L-proof .who{flex-direction:row;align-items:center;gap:2.4rem}.fmt-landscape.L-proof .sv{font-size:calc(7rem*var(--scale))}`
};
