// OFFER — a coupon-ticket with the price as the hero. Only real prices and terms from approved copy.
export default {
 id:'offer',name:'Offer',tone:'paper',
 purpose:'A price, discount or package with its terms; sale and festive offers; ad creatives.',
 slots:{kicker:'e.g. "Diwali offer" (optional)',title:'what is offered, 2–8 words',price:'the number only, e.g. 1,499 or 30%',currency:'₹ (default) or empty for percentages',was:'original price, number only (optional)',unit:'e.g. "per session" or "off" (optional)',terms:'conditions, one line',valid:'e.g. "Till 15 Nov" (optional)',cta:'call to action'},
 frames:s=>[{...s}],
 render(f,c){
  const cur=f.currency===undefined?'₹':f.currency;
  return `<main class="canvas">${c.rail({label:c.series})}
<section class="intro fit">${f.kicker?`<span class="chip hi">${c.esc(f.kicker)}</span>`:''}<h1 class="display title" data-fit data-min="48">${c.t(f.title)}</h1></section>
<section class="ticket tone-accent"><div class="notch l"></div><div class="notch r"></div>
 <div class="price-row"><span class="display price">${cur?`<span class="cur">${c.esc(cur)}</span>`:''}${c.esc(f.price)}</span>${f.unit?`<span class="label unit">${c.esc(f.unit)}</span>`:''}</div>
 <div class="ticket-foot">${f.was?`<span class="label was">Was ${c.esc(cur)}${c.esc(f.was)}</span>`:'<span></span>'}${f.valid?`<span class="label">${c.esc(f.valid)}</span>`:''}</div>
</section>
${f.terms?`<p class="body muted terms">${c.t(f.terms)}</p>`:''}
${c.foot(f.cta)}</main>`;},
 css:`.L-offer .intro{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start;gap:2.8rem}
.L-offer .title{font-size:calc(10.5rem*var(--scale))}
.L-offer .ticket{position:relative;background:var(--bg);color:var(--fg);border-radius:var(--radius);padding:4.4rem 5.6rem 3.6rem;display:flex;flex-direction:column;gap:2rem;flex:none}
.L-offer .notch{position:absolute;top:50%;width:6.4rem;height:6.4rem;margin-top:-3.2rem;border-radius:50%;background:var(--page)}
.L-offer .notch.l{left:-3.2rem}.L-offer .notch.r{right:-3.2rem}
.L-offer .price-row{display:flex;align-items:flex-end;gap:2.4rem;flex-wrap:wrap}
.L-offer .price{font-size:calc(24rem*var(--scale));line-height:.8;letter-spacing:-.04em;font-feature-settings:"lnum","tnum";white-space:nowrap}
.L-offer .cur{font-size:.42em;vertical-align:.95em;margin-right:.08em;letter-spacing:0}
.L-offer .unit{padding-bottom:1.6rem}
.L-offer .ticket-foot{display:flex;justify-content:space-between;gap:2rem;border-top:var(--stroke) dashed var(--line);padding-top:2.2rem}
.L-offer .was{text-decoration:line-through;text-decoration-thickness:var(--stroke)}
.L-offer .terms{font-size:3rem;max-width:90%}
.fmt-landscape.L-offer .canvas{display:grid;grid-template-columns:1fr 1.05fr;grid-template-rows:auto 1fr auto;column-gap:5rem}
.fmt-landscape.L-offer .rail{grid-column:1/3}
.fmt-landscape.L-offer .intro{grid-column:1;grid-row:2}
.fmt-landscape.L-offer .ticket{grid-column:2;grid-row:2;align-self:center;padding:2.4rem 3.6rem;gap:1.2rem}
.fmt-landscape.L-offer .canvas{grid-template-rows:auto minmax(0,1fr) auto}.fmt-landscape.L-offer .unit{padding-bottom:.6rem}.fmt-landscape.L-offer .ticket-foot{padding-top:1.2rem}
.fmt-landscape.L-offer .terms{display:none}
.fmt-landscape.L-offer .foot{grid-column:1/3}
.fmt-landscape.L-offer .title{font-size:calc(6.4rem*var(--scale))}
.fmt-landscape.L-offer .price{font-size:calc(10rem*var(--scale))}
.fmt-square.L-offer .price{font-size:calc(19rem*var(--scale))}
.fmt-square.L-offer .title{font-size:calc(8.5rem*var(--scale))}`
};
