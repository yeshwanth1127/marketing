// CAMPAIGN — a studio lookbook post. The product is the hero; type is a short uppercase headline, one support line and four corner labels.
// Anatomy (top to bottom of the layer stack): backdrop gradient, product (photo or cutout) with a contact shadow, vignette + film grain,
// ornament, headline, support line, four corner labels, brand mark. Nothing else is drawn: no cards, no numbered circles, no buttons,
// no arrows, no icons, no emoji. See SKILL.md for the rules this layout enforces.
//
// Product imagery comes from files the client uploaded. There are three honest modes:
//   photo        a studio photo, full bleed behind the type (garments hung on a rail, laid flat, on a model)
//   cutout       a PNG with a transparent background, placed on the studio backdrop with a contact shadow
//   typographic  no product image: a poster with a massive headline, fabric texture and grain. The brief asks for a photo.
//   placeholder  no product image: a clearly marked zone where the garment photo goes (set slot placeholder:true)
// Nothing is ever faked with icons or illustration.

const FILLER=/\b(elevate[ds]?|elevating|unlock(?:s|ed|ing)?|seamless(?:ly)?|game[- ]?chang(?:er|ing)|level[- ]?up|next level|revolutionary|effortless(?:ly)?|curated|redefin(?:e|es|ed|ing)|unleash(?:es|ed|ing)?)\b/i;
const EMOJI=/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;
const ARROWS=/[←-⇿➡➔➜▶►»›]/;
const words=s=>String(s||'').replace(/\*/g,'').trim().split(/\s+/).filter(Boolean);
const LABEL_KEYS=['tl','tr','bl','br'];
const BACKDROPS={stone:{top:'#efece6',bottom:'#d6d1c7',mid:'#e3dfd7',dark:false},grey:{top:'#ebebea',bottom:'#c6c6c5',mid:'#d9d9d8',dark:false},charcoal:{top:'#34343a',bottom:'#101012',mid:'#222226',dark:true}};

/** Four corner labels from an array [tl,tr,bl,br] or an object {tl,tr,bl,br}. Uppercase, trimmed, empty when not given. */
export function cornerLabels(v){
 const arr=Array.isArray(v)?v:LABEL_KEYS.map(k=>v?.[k]);
 return LABEL_KEYS.map((_,i)=>String(arr[i]??'').replace(/\*/g,'').trim().toUpperCase().slice(0,28));
}

/** Rule check on one frame's slots. Returns [{severity,type,text}]. error = breaks a hard rule of the layout. */
export function lint(frame){
 const issues=[];const add=(severity,type,text)=>issues.push({severity,type,text});
 const head=words(frame.headline),support=words(frame.support||frame.sub),labels=cornerLabels(frame.labels);
 if(!head.length)add('error','headline','The headline is empty.');
 else if(head.length>5)add('error','headline','The headline is '+head.length+' words. Use 2 to 4 (5 at most).');
 else if(head.length<2||head.length>4)add('warning','headline','The headline is '+head.length+' word'+(head.length===1?'':'s')+'. Aim for 2 to 4.');
 if(support.length>22)add('warning','support','The support line is '+support.length+' words. One short sentence, two lines at most.');
 const total=head.length+support.length+labels.reduce((n,l)=>n+words(l).length,0);
 if(total>=25)add('error','word_count','There are '+total+' words on the canvas. Keep it under 25.');
 const filled=labels.filter(Boolean).length;
 if(filled<4)add('warning','labels','Only '+filled+' of 4 corner labels are set. The layout needs all four to anchor it like a magazine cover.');
 const all=[frame.headline,frame.support,frame.sub,...labels,frame.cta].filter(Boolean).join(' ');
 const filler=all.match(FILLER);if(filler)add('error','filler_phrase','Filler phrase "'+filler[0]+'" is banned.');
 if(EMOJI.test(all))add('error','emoji','Emoji and symbol characters are banned.');
 if(ARROWS.test(all))add('error','arrow','Arrows are banned on static posts.');
 if(frame.photo&&frame.cutout)add('warning','product_image','Set photo or cutout, not both. The cutout is ignored.');
 return issues;
}

const src=p=>{const s=String(p||'').trim();if(!s||/^(https?:)?\/\//i.test(s))return '';return s.startsWith('assets/')?'../'+s:s;};
const GRAIN="url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
const WEAVE="url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='w'><feTurbulence type='fractalNoise' baseFrequency='.035 .9' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23w)'/></svg>\")";

export default {
 id:'campaign',name:'Studio campaign',tone:'paper',
 purpose:'A premium lookbook post for apparel and other physical products: the product is the hero, one short uppercase headline, one support line, four corner labels. For product launches, styling tips, comparisons and carousels.',
 slots:{
  headline:'2 to 4 words, shown uppercase on one line. The opinion or the name ("SKIP THE POLO", "THE NEW ERA"). Never more than 5 words',
  support:'one short sentence, light weight, two lines at most, under the headline',
  labels:'four tiny uppercase corner labels [top-left, top-right, bottom-left, bottom-right], e.g. ["LIMITED RELEASE","NOV 2026","NEVER BASIC","SHOP NOW"]. Only facts the copy supports',
  photo:'path of a studio product photo, e.g. "assets/01-look.jpg". Shown full bleed. Leave the top third calm for the type',
  cutout:'path of a PNG with a transparent background. Placed on the studio backdrop with a contact shadow',
  placeholder:'true to show a clearly marked zone for the garment photo when no image is available (otherwise a typographic poster is made)',
  backdrop:'"stone" (default), "grey" or "charcoal"; the studio backdrop behind a cutout or typographic poster',
  text:'"dark" or "light": text colour on a photo (default follows the backdrop)',
  ornament:'"star" (default), "rule" or "none": one small ornament above the headline',
  accent:'optional hex taken from the product (a logo, stitching, a garment colour) for the ornament. Never a neon',
  frames:'optional list of per-frame slots for a carousel (same labels on every frame, numbered 01 / 05 in a corner)'
 },
 frames:s=>{const base={...s};delete base.frames;return (Array.isArray(s.frames)&&s.frames.length?s.frames:[{}]).map(f=>({...base,...f}));},
 render(f,c){
  const photo=src(f.photo),cutout=src(f.cutout);
  const mode=photo?'photo':cutout?'cutout':f.placeholder?'placeholder':'typographic';
  const bd=BACKDROPS[f.backdrop]?f.backdrop:'stone';
  const dark=f.text?f.text==='light':BACKDROPS[bd].dark;
  const labels=cornerLabels(f.labels);
  const head=c.plain(f.headline).trim(),support=c.plain(f.support||f.sub||'').trim();
  const accent=/^#[0-9a-f]{6}$/i.test(String(f.accent||''))?f.accent:'';
  const orn=f.ornament==='none'?'':f.ornament==='rule'?'<i class="orn orn-rule"></i>':'<svg class="orn orn-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0 14.7 9.3 24 12 14.7 14.7 12 24 9.3 14.7 0 12 9.3 9.3Z" fill="currentColor"/></svg>';
  const stacked=mode==='typographic'?head.split(/\s+/).map(w=>c.esc(w)).join('<br>'):c.esc(head);
  const product=mode==='photo'?`<img class="plate" src="${c.esc(photo)}" alt="">`
   :mode==='cutout'?`<div class="hero"><i class="floor"></i><img class="cut" src="${c.esc(cutout)}" alt=""></div>`
   :mode==='placeholder'?`<div class="hero"><div class="ph"><span>Product photo goes here</span><span>Upload a photo of the garment to replace this zone</span></div></div>`
   :'<div class="fabric"></div>';
  return `<main class="canvas bd-${bd} m-${mode}${photo&&f.artwork?" has-artwork":""}${dark?' is-light':''}"${accent?` style="--orn:${accent}"`:''}>
<div class="bd"></div>${product}<div class="vig"></div><div class="grain"></div>
<span class="corner tl">${c.esc(labels[0])}</span><span class="corner tr">${c.esc(labels[1])}</span>
<section class="copy fit">${orn}<h1 class="display headline" data-fit data-min="44">${stacked}</h1>${f.support||f.sub?`<p class="body support">${c.plain(f.support||f.sub)?c.esc(c.plain(f.support||f.sub)):''}</p>`:''}</section>
<span class="corner bl">${c.esc(labels[2])}</span><span class="corner br">${c.esc(labels[3])}</span>
<div class="seal">${c.mark()}</div>${c.total>1?`<span class="idx2">${String(c.index+1).padStart(2,'0')} / ${String(c.total).padStart(2,'0')}</span>`:''}
</main>`;},
 css:`body.L-campaign{background:#d9d9d8}
body.L-campaign.tone-ink{background:#d9d9d8}
.L-campaign .canvas{padding:calc(var(--W)*.06);display:block;--k:#141414;--k2:#3b3b3d;color:var(--k);background:transparent}
.L-campaign .canvas.is-light{--k:#f4f3ef;--k2:#d4d2cc}
.L-campaign .canvas.bd-stone{background:#e3dfd7}.L-campaign .canvas.bd-grey{background:#d9d9d8}.L-campaign .canvas.bd-charcoal{background:#222226}
.L-campaign .canvas.m-photo{background:#d9d9d8}
.L-campaign .canvas.m-photo.is-light{background:#2a2a2c}
.L-campaign .bd{position:absolute;inset:0;z-index:-4}
.L-campaign .bd-stone .bd{background:linear-gradient(180deg,#efece6 0%,#e3dfd7 55%,#d6d1c7 100%)}
.L-campaign .bd-grey .bd{background:linear-gradient(180deg,#ebebea 0%,#d9d9d8 55%,#c6c6c5 100%)}
.L-campaign .bd-charcoal .bd{background:linear-gradient(180deg,#34343a 0%,#222226 55%,#101012 100%)}
.L-campaign .plate{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-3}
.L-campaign .vig{position:absolute;inset:0;z-index:-2;pointer-events:none;background:radial-gradient(ellipse at 50% 46%,rgba(0,0,0,0) 52%,rgba(0,0,0,.2) 100%)}
.L-campaign .grain{position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.2;mix-blend-mode:multiply;background-image:${GRAIN}}
.L-campaign .is-light .grain{mix-blend-mode:screen;opacity:.1}
.L-campaign .fabric{position:absolute;inset:0;z-index:-3;opacity:.16;mix-blend-mode:multiply;background-image:${WEAVE}}
.L-campaign .is-light .fabric{mix-blend-mode:screen;opacity:.09}
.L-campaign .hero{position:absolute;left:50%;bottom:calc(var(--H)*.115);width:62%;height:calc(var(--H)*.47);transform:translateX(-50%);z-index:-2;display:flex;align-items:flex-end;justify-content:center}
.L-campaign .hero .cut{position:relative;max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(16px 22px 20px rgba(0,0,0,.24))}
.L-campaign .hero .floor{position:absolute;left:12%;right:4%;bottom:-2%;height:7%;border-radius:50%;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,.42),rgba(0,0,0,0) 70%);filter:blur(12px);transform:translateX(5%)}
.L-campaign .hero .ph{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;text-align:center;font-family:var(--f-body);font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:2.8rem;color:var(--k2);outline:1px solid var(--k2);outline-offset:-1px}
.L-campaign .hero .ph span+span{font-weight:400;text-transform:none;letter-spacing:0;font-size:2.8rem}
.L-campaign .corner{position:absolute;z-index:2;font-family:var(--f-body);font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:2.8rem;line-height:1.1;color:var(--k);max-width:44%;white-space:normal}
.L-campaign .corner.tl{left:calc(var(--W)*.06);top:calc(var(--W)*.06)}
.L-campaign .corner.tr{right:calc(var(--W)*.06);top:calc(var(--W)*.06);text-align:right}
.L-campaign .corner.bl{left:calc(var(--W)*.06);bottom:calc(var(--W)*.06)}
.L-campaign .corner.br{right:calc(var(--W)*.06);bottom:calc(var(--W)*.06);text-align:right}
.L-campaign .copy{position:absolute;left:calc(var(--W)*.06);right:calc(var(--W)*.06);top:calc(var(--H)*.115);display:flex;flex-direction:column;align-items:center;text-align:center;gap:1.8rem}
.L-campaign .headline{font-weight:800;text-transform:uppercase;letter-spacing:-.025em;word-spacing:.14em;line-height:.95;font-size:calc(14rem*var(--scale,1));white-space:nowrap;color:var(--k);max-width:100%}
.L-campaign .support{font-weight:300;font-size:3rem;line-height:1.3;color:var(--k);max-width:68%;text-wrap:balance;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.L-campaign .orn{color:var(--orn,var(--k));line-height:1}
.L-campaign .orn-star{display:block;width:3.4rem;height:3.4rem}
.L-campaign .orn-rule{display:block;width:5.6rem;height:2px;background:var(--orn,var(--k))}
.L-campaign .seal{position:absolute;left:50%;bottom:calc(var(--W)*.06);transform:translateX(-50%);z-index:2;display:flex;align-items:center;color:var(--k);--logo-h:40}
.L-campaign .seal .wordmark{font-size:3.4rem;color:var(--k)}
.L-campaign .seal img{height:calc(var(--logo-h)*1px);width:auto}
.L-campaign .idx2{position:absolute;z-index:2;left:50%;top:calc(var(--W)*.06);transform:translateX(-50%);font-family:var(--f-body);font-weight:700;letter-spacing:.06em;font-size:2.8rem;color:var(--k2)}
.L-campaign .m-typographic .copy{top:calc(var(--H)*.2);bottom:calc(var(--H)*.2);justify-content:center}
.L-campaign .m-typographic .headline{white-space:normal;font-size:calc(21rem*var(--scale,1));line-height:.86;letter-spacing:-.035em}
.L-campaign .m-typographic .support{margin-top:2rem}
.fmt-reel.L-campaign .canvas{padding-top:276px;padding-bottom:396px}
.fmt-reel.L-campaign .corner.tl,.fmt-reel.L-campaign .corner.tr{top:276px}.fmt-reel.L-campaign .corner.bl,.fmt-reel.L-campaign .corner.br{bottom:396px}
.fmt-reel.L-campaign .copy{top:340px}.fmt-reel.L-campaign .seal{bottom:396px}.fmt-reel.L-campaign .hero{bottom:520px;height:620px}
.fmt-landscape.L-campaign .canvas{padding:48px 72px}
.fmt-landscape.L-campaign .corner{font-size:2.8rem}.fmt-landscape.L-campaign .corner.tl,.fmt-landscape.L-campaign .corner.tr{top:48px}.fmt-landscape.L-campaign .corner.bl,.fmt-landscape.L-campaign .corner.br{bottom:48px}
.fmt-landscape.L-campaign .corner.tl,.fmt-landscape.L-campaign .corner.bl{left:72px}.fmt-landscape.L-campaign .corner.tr,.fmt-landscape.L-campaign .corner.br{right:72px}
.fmt-landscape.L-campaign .copy{top:110px;left:72px;right:72px;gap:1rem}.fmt-landscape.L-campaign .headline{font-size:calc(9rem*var(--scale,1))}.fmt-landscape.L-campaign .support{display:none}
.fmt-landscape.L-campaign .hero{width:40%;height:260px;bottom:90px}.fmt-landscape.L-campaign .seal{bottom:48px}.fmt-landscape.L-campaign .seal .wordmark{font-size:2.8rem}
.L-campaign .canvas.has-artwork{--k:var(--ink,#141414);--k2:var(--ink,#141414);background:var(--paper,#f4efe5)}
.L-campaign .has-artwork .bd,.L-campaign .has-artwork .vig,.L-campaign .has-artwork .grain{display:none}
.L-campaign .has-artwork .plate{height:71%;object-position:center 24%}
.L-campaign .has-artwork .copy{top:74%;gap:1rem}
.L-campaign .has-artwork .headline{font-size:calc(10rem*var(--scale,1))}
.L-campaign .has-artwork .orn{display:none}
.fmt-reel.L-campaign .has-artwork .plate{height:58%}
.fmt-reel.L-campaign .has-artwork .copy{top:61%}
.fmt-landscape.L-campaign .has-artwork .plate{width:52%;height:100%}
.fmt-landscape.L-campaign .has-artwork .copy{top:24%;left:56%;right:5%}
.fmt-landscape.L-campaign .has-artwork .headline{white-space:normal;font-size:7.6rem}
.fmt-landscape.L-campaign .has-artwork .seal{left:63%}`
};
