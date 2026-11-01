// LIST — the carousel workhorse. Cover with the count, one point per frame with a giant numeral, outro.
// In single-frame formats the whole list sits on one canvas.
export default {
 id:'list',name:'List carousel',tone:'paper',
 purpose:'Tips, steps, reasons, checklists; save-worthy educational carousels.',
 slots:{title:'what the list is, e.g. "Questions to ask before choosing a preschool"',items:'2–7 items: [{title, text}] (text optional)',kicker:'small label (optional)',cta:'call to action for the last frame'},
 frames(s,format){const items=(s.items||[]).slice(0,7);
  if(format==='landscape'||format==='square'&&items.length<=4&&s.single)return [{kind:'all',...s,items:format==='landscape'?items.slice(0,4):items}];
  return [{kind:'cover',...s,count:items.length,tone:'ink'},...items.map((it,i)=>({kind:'item',...it,n:i+1,count:items.length,kicker:s.kicker})),{kind:'outro',...s,tone:'accent'}];},
 render(f,c){
  const pad=n=>String(n).padStart(2,'0');
  if(f.kind==='cover')return `<main class="canvas">${c.rail({label:f.kicker||c.series})}
<section class="cover fit"><span class="display count">${pad(f.count)}</span><h1 class="display title" data-fit data-min="48">${c.t(f.title)}</h1></section>
<footer class="foot"><span class="label muted">Swipe</span><span class="label">→</span></footer></main>`;
  if(f.kind==='item'){const dots=Array.from({length:f.count},(_,i)=>`<i class="${i+1===f.n?'on':''}"></i>`).join('');
   return `<main class="canvas">${c.rail({label:f.kicker||c.series})}${['kolam','arcs','grid','stripes'].includes(c.pr.motif)?`<div class="deco item-deco">${c.motif('brand',520,520,'var(--line)')}</div>`:''}
<section class="item fit"><span class="display num">${pad(f.n)}</span><div class="words"><h2 class="display ititle" data-fit data-min="44">${c.t(f.title)}</h2>${f.text?`<p class="body muted">${c.t(f.text)}</p>`:''}</div></section>
<footer class="foot"><span class="dots">${dots}</span><span class="label muted">${c.esc(c.pr.handle)}</span></footer></main>`;}
  if(f.kind==='outro')return `<main class="canvas">${c.rail({})}
<section class="outro fit"><span class="label">Save this for later</span><h2 class="display otitle" data-fit data-min="48">${c.t(f.title)}</h2></section>${c.foot(f.cta)}</main>`;
  return `<main class="canvas">${c.rail({label:f.kicker||c.series})}<section class="all"><h1 class="display atitle fit" data-fit data-min="40">${c.t(f.title)}</h1>
<ol>${f.items.map((it,i)=>`<li><span class="display an">${pad(i+1)}</span><span class="body">${c.t(it.title)}</span></li>`).join('')}</ol></section>${c.foot(f.cta)}</main>`;},
 css:`.L-list .cover{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:2rem}
.L-list .count{font-size:calc(34rem*var(--scale));line-height:.78;color:var(--hi);letter-spacing:-.05em;font-feature-settings:"lnum"}
.L-list .title{font-size:calc(10rem*var(--scale))}
.L-list .item{flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:3rem}
.L-list .num{font-size:calc(40rem*var(--scale));line-height:.76;color:var(--hi);letter-spacing:-.06em;font-feature-settings:"lnum"}
.L-list .words{display:flex;flex-direction:column;gap:2.6rem;min-height:0}
.L-list .ititle{font-size:calc(12rem*var(--scale))}
.L-list .item-deco{right:calc(var(--margin)*var(--u));top:22%;width:44%;opacity:.9}.L-list .item-deco svg{width:100%;height:auto}
.L-list .dots{display:flex;gap:1rem}.L-list .dots i{display:block;width:1.6rem;height:1.6rem;border-radius:50%;border:var(--stroke) solid var(--fg)}.L-list .dots i.on{background:var(--fg);width:4.8rem;border-radius:1rem}
.L-list .outro{flex:1;display:flex;flex-direction:column;justify-content:center;gap:3rem}
.L-list .otitle{font-size:calc(10rem*var(--scale))}
.L-list .all{flex:1;display:flex;flex-direction:column;gap:3rem;min-height:0}
.L-list .atitle{font-size:calc(7rem*var(--scale));flex:none;max-height:40%}
.L-list ol{list-style:none;display:flex;flex-direction:column;flex:1;justify-content:flex-start}
.L-list li{display:grid;grid-template-columns:8rem 1fr;align-items:baseline;gap:2rem;border-top:var(--stroke) solid var(--line);padding:1.6rem 0}
.L-list .an{font-size:4.4rem;color:var(--hi)}
.fmt-landscape.L-list .all{display:grid;grid-template-columns:1fr 1.15fr;gap:5rem;align-items:center}
.fmt-landscape.L-list .atitle{max-height:100%;font-size:calc(6.4rem*var(--scale))}.fmt-landscape.L-list .all{min-height:0}.fmt-landscape.L-list li{padding:.5rem 0;grid-template-columns:5rem 1fr}.fmt-landscape.L-list li .body{font-size:2.8rem;line-height:1.25}.fmt-landscape.L-list .an{font-size:3.2rem}
.fmt-reel.L-list .num{font-size:calc(48rem*var(--scale))}`
};
