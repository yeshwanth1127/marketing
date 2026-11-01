// FAQ — the question is set like a headline; the answer reads like a calm reply.
export default {
 id:'faq',name:'FAQ',tone:'paper',
 purpose:'Answer one real customer question; series content; Google Business Profile posts.',
 slots:{question:'the question as a customer asks it',answer:'2–4 short sentences',series:'series name, e.g. "Ask Kaveri" (optional)',number:'question number in the series (optional)',cta:'call to action (optional)'},
 frames:s=>[{...s}],
 render(f,c){
  const deco=c.pr.motif!=='none'?`<div class="deco faq-deco">${c.motif('brand',1080,300,'var(--line)')}</div>`:'';
  return `<main class="canvas">${deco}${c.rail({label:[f.series||c.series,f.number?'Nº '+f.number:''].filter(Boolean).join(' · ')})}<div class="rule"></div>
<section class="q fit"><span class="display qm">Q.</span><h1 class="display question" data-fit data-min="48">${c.t(f.question)}</h1></section>
<section class="a"><span class="display am">A.</span><p class="body answer">${c.t(f.answer)}</p></section>
${c.foot(f.cta)}</main>`;},
 css:`.L-faq .q{flex:1.3;display:flex;flex-direction:column;justify-content:flex-end;gap:1.6rem}
.L-faq .qm,.L-faq .am{font-size:calc(7rem*var(--scale));color:var(--hi);line-height:1}
.L-faq .question{font-size:calc(10.5rem*var(--scale))}
.L-faq .a{display:grid;grid-template-columns:9rem 1fr;gap:2.4rem;align-items:start;border-top:var(--stroke) solid var(--line);padding-top:3.6rem;flex:none}
.L-faq .am{font-size:calc(5rem*var(--scale));color:var(--muted-fg)}
.L-faq .answer{font-size:3.6rem;max-width:92%}
.L-faq .faq-deco{left:0;right:0;top:15%;opacity:.7}
.L-faq .faq-deco svg{width:100%;height:auto}
.fmt-landscape.L-faq .canvas{display:grid;grid-template-columns:1.1fr 1fr;grid-template-rows:auto auto minmax(0,1fr) auto;column-gap:5rem}
.fmt-landscape.L-faq .rail,.fmt-landscape.L-faq .rule,.fmt-landscape.L-faq .foot{grid-column:1/3}
.fmt-landscape.L-faq .q{grid-row:3;justify-content:center}.fmt-landscape.L-faq .a{grid-row:3;align-self:center;border:0;padding:0;grid-template-columns:1fr}
.fmt-landscape.L-faq .am{display:none}.fmt-landscape.L-faq .question{font-size:calc(6.4rem*var(--scale))}.fmt-landscape.L-faq .answer{font-size:2.8rem;line-height:1.3}.fmt-landscape.L-faq .q,.fmt-landscape.L-faq .a{min-height:0}
.fmt-landscape.L-faq .faq-deco{display:none}`
};
