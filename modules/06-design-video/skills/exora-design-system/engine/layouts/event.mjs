// EVENT — the date is the hero, set like a ticket stub; details sit on hairline rows.
export default {
 id:'event',name:'Event / announcement',tone:'paper',
 purpose:'Workshops, open days, launches, store openings, live sessions, admissions windows.',
 slots:{kicker:'e.g. "Open house" (optional)',title:'event name; *emphasis* allowed',day:'day of month, e.g. "16"',month:'e.g. "Nov"',weekday:'e.g. "Sunday"',time:'e.g. "10 AM – 1 PM"',venue:'e.g. "SunKidz, HSR Layout"',detail:'one line, e.g. "Free entry · Register on WhatsApp" (optional)',cta:'call to action'},
 frames:s=>[{...s}],
 render(f,c){
  const row=(k,v)=>v?`<div class="row"><span class="label muted">${k}</span><span class="body v">${c.t(v)}</span></div>`:'';
  return `<main class="canvas">${c.rail({label:f.kicker||c.series})}
<section class="hero"><div class="date tone-accent"><span class="label">${c.esc(f.month)}</span><span class="display day">${c.esc(f.day)}</span><span class="label">${c.esc(f.weekday)}</span></div>
<h1 class="display title fit" data-fit data-min="48">${c.t(f.title)}</h1></section>
<section class="rows">${row('When',f.time)}${row('Where',f.venue)}${row('Note',f.detail)}</section>
${c.foot(f.cta)}</main>`;},
 css:`.L-event .hero{flex:1;display:flex;flex-direction:column;gap:4rem;min-height:0}
.L-event .date{align-self:flex-start;background:var(--bg);color:var(--fg);border-radius:var(--radius);padding:2.6rem 4rem 2.4rem;display:flex;flex-direction:column;align-items:center;gap:.6rem;min-width:28rem}
.L-event .day{font-size:calc(19rem*var(--scale));line-height:.82;letter-spacing:-.05em;font-feature-settings:"lnum","tnum"}
.L-event .title{font-size:calc(10rem*var(--scale));flex:1}
.L-event .rows{display:flex;flex-direction:column;flex:none}
.L-event .row{display:grid;grid-template-columns:16rem 1fr;gap:2rem;align-items:baseline;border-top:var(--stroke) solid var(--line);padding:2rem 0}
.L-event .row .v{font-size:3.6rem}
.fmt-square.L-event .hero{flex-direction:row;align-items:flex-start}.fmt-square.L-event .title{font-size:calc(8rem*var(--scale));align-self:stretch}
.fmt-square.L-event .day{font-size:calc(15rem*var(--scale))}.fmt-square.L-event .row{padding:1.4rem 0}
.fmt-landscape.L-event .canvas{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto 1fr auto;column-gap:4rem}
.fmt-landscape.L-event .rail,.fmt-landscape.L-event .foot{grid-column:1/3}
.fmt-landscape.L-event .hero{display:contents}
.fmt-landscape.L-event .date{grid-row:2;align-self:center;padding:2rem 3rem;min-width:0}.fmt-landscape.L-event .day{font-size:calc(11rem*var(--scale))}
.fmt-landscape.L-event .title{grid-row:2;grid-column:2;font-size:calc(7rem*var(--scale));align-self:center;max-height:100%}
.fmt-landscape.L-event .rows{display:none}`
};
