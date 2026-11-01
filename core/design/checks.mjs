// In-page design checks, used by Claude's preview tool and by the final renderer (same rules both times).
export const CANVAS={square:[1080,1080],portrait:[1080,1350],reel:[1080,1920],landscape:[1200,628]};
export const MARGIN={square:64,portrait:64,reel:64,landscape:48};
export const pageChecks=String.raw`(opts)=>{const issues=[];const W=innerWidth,H=innerHeight;
const lum=c=>{const m=(c||'').match(/[\d.]+/g);if(!m||m.length<3)return null;const [r,g,b,a=1]=m.map(Number);const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};return {L:0.2126*f(r)+0.7152*f(g)+0.0722*f(b),a}};
const bgOf=el=>{while(el){const l=lum(getComputedStyle(el).backgroundColor);if(l&&l.a>0.5)return l;el=el.parentElement}return {L:1,a:1}};
const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const seen=new Set();let n;
while((n=walker.nextNode())){const t=n.textContent.trim();if(!t)continue;const el=n.parentElement;if(!el||seen.has(el))continue;seen.add(el);const cs=getComputedStyle(el);
 if(cs.visibility==='hidden'||cs.display==='none'||Number(cs.opacity)===0)continue;
 const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const size=parseFloat(cs.fontSize);const text=t.slice(0,60);
 if(r.right>W+1||r.bottom>H+1||r.left<-1||r.top<-1)issues.push({severity:'error',type:'off_canvas',text});
 const clips=['hidden','clip'].includes(cs.overflow)||['hidden','clip'].includes(cs.overflowY)||['hidden','clip'].includes(cs.overflowX);
 if(clips&&(el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2))issues.push({severity:'error',type:'text_clipped',text});
 const minSize=Math.round(W*0.026);if(size<minSize)issues.push({severity:'warning',type:'small_text',text,detail:size+'px < '+minSize+'px'});
 const fg=lum(cs.color),bg=bgOf(el);if(fg){const hi=Math.max(fg.L,bg.L),lo=Math.min(fg.L,bg.L),ratio=(hi+0.05)/(lo+0.05),need=size>=48?3:4.5;if(ratio<need)issues.push({severity:'error',type:'low_contrast',text,detail:ratio.toFixed(2)+':1 < '+need+':1'});}
 if(opts.format==='reel'&&(r.top<260||r.bottom>H-380))issues.push({severity:'warning',type:'reel_safe_area',text});
 if(opts.margin&&(r.left<opts.margin-2||r.right>W-opts.margin+2))issues.push({severity:'warning',type:'outside_margin',text});}
const body=document.body.innerText.toLowerCase();for(const w of opts.banned||[])if(w&&body.includes(String(w).toLowerCase()))issues.push({severity:'error',type:'banned_word',text:w});
if(document.querySelectorAll('img[src^="http"],link[href^="http"],script[src^="http"],img[src^="//"]').length)issues.push({severity:'error',type:'remote_resource',text:'remote file referenced'});
return issues;}`;
