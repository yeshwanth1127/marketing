// Colour maths for the EXORA design engine (WCAG 2.x relative luminance and contrast).
export const isHex=c=>/^#[0-9a-f]{6}$/i.test(c||'');
export const rgb=h=>h.slice(1).match(/../g).map(v=>parseInt(v,16));
export const hex=([r,g,b])=>'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
export function luminance(h){const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};const [r,g,b]=rgb(h);return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
export function saturation(h){const [r,g,b]=rgb(h).map(v=>v/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;return mx===mn?0:(mx-mn)/(1-Math.abs(2*l-1));}
export const mix=(a,b,t)=>{const x=rgb(a),y=rgb(b);return hex(x.map((v,i)=>v+(y[i]-v)*t));};
// Best readable text colour from candidates on a background.
export const readable=(bg,candidates)=>candidates.filter(isHex).sort((p,q)=>contrast(q,bg)-contrast(p,bg))[0];
