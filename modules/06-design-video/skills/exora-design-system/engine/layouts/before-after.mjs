// BEFORE / AFTER — two states, one seam, one arrow. Photos optional (approved photos only).
export default {
 id:'before-after',name:'Before / after',tone:'paper',
 purpose:'Transformations, results, problem → solution, old way → new way.',
 slots:{title:'what changed (optional)',before_label:'default "Before"',before:'the before state, short',after_label:'default "After"',after:'the after state, short; *emphasis* allowed',before_image:'approved photo file (optional)',after_image:'approved photo file (optional)',note:'honest qualifier, e.g. "Results vary" (optional)'},
 frames:s=>[{...s}],
 render(f,c){
  const half=(cls,label,text,img,tone)=>`<section class="half ${cls} tone-${tone}">${img?`<img src="${c.esc(img)}" alt="">`:''}<span class="chip">${c.esc(label)}</span><p class="display htext fit"><span data-fit data-min="40">${c.t(text)}</span></p></section>`;
  return `<main class="canvas">${c.rail({label:f.title?c.plain(f.title):c.series})}
<div class="split">${half('b',f.before_label||'Before',f.before,f.before_image,c.tone('paper'))}<span class="seam"><span>→</span></span>${half('a',f.after_label||'After',f.after,f.after_image,c.pr.tones.includes('accent')?'accent':'ink')}</div>
${f.note?`<p class="label muted note">${c.esc(f.note)}</p>`:''}</main>`;},
 css:`.L-before-after .split{flex:1;display:flex;flex-direction:column;position:relative;gap:var(--stroke);min-height:0}
.L-before-after .half{flex:1;position:relative;overflow:hidden;border-radius:var(--radius);background:var(--bg);color:var(--fg);padding:4.4rem;display:flex;flex-direction:column;justify-content:space-between;gap:2.4rem;min-height:0}
.L-before-after .half.b{background:var(--card)}
.L-before-after .half img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
.L-before-after .half>*:not(img){position:relative;z-index:1}
.L-before-after .half.b .htext{color:var(--muted-fg);font-size:calc(7rem*var(--scale))}
.L-before-after .half.a .htext{font-size:calc(8.6rem*var(--scale))}
.L-before-after .htext{flex:1;display:flex;align-items:flex-end;min-height:0}
.L-before-after .seam{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;width:12rem;height:12rem;border-radius:50%;display:grid;place-items:center;background:var(--page);color:var(--fg);font-size:5.4rem;font-family:var(--f-body)}
.L-before-after .seam span{display:inline-block;transform:rotate(90deg)}
.fmt-square.L-before-after .split,.fmt-landscape.L-before-after .split{flex-direction:row}
.fmt-square.L-before-after .seam span,.fmt-landscape.L-before-after .seam span{transform:none}
.fmt-landscape.L-before-after .half{padding:3rem}.fmt-landscape.L-before-after .seam{width:9rem;height:9rem;font-size:4rem}
.fmt-landscape.L-before-after .half.b .htext{font-size:calc(5rem*var(--scale))}.fmt-landscape.L-before-after .half.a .htext{font-size:calc(5.6rem*var(--scale))}
.fmt-square.L-before-after .half.b .htext{font-size:calc(6rem*var(--scale))}.fmt-square.L-before-after .half.a .htext{font-size:calc(7rem*var(--scale))}`
};
