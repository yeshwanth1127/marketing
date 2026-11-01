// Brand-neutral graphic devices. Each returns an inline SVG drawn only in the given colour, so it inherits
// any brand. Shapes follow the brand's shape style (sharp / soft / round).
const f=n=>Math.round(n*100)/100;
export function motif(kind,{w,h,color,stroke=2,shape='soft',seed=1,opacity=1}={}){
 const open=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" style="display:block;opacity:${opacity}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">`;
 let body='';
 if(kind==='kolam'){ // dot lattice with interlocking loops (pulli kolam)
  const s=Math.min(w,h)/5.2,cols=Math.ceil(w/s)+1,rows=Math.ceil(h/s)+1,r=s*0.5;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const cx=x*s+(y%2?s/2:0),cy=y*s*0.86;
   body+=`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(stroke*1.6)}" fill="${color}" stroke="none"/>`;
   if((x+y+seed)%2===0)body+=`<rect x="${f(cx-r)}" y="${f(cy-r)}" width="${f(r*2)}" height="${f(r*2)}" rx="${f(shape==='sharp'?r*0.15:r*0.62)}" transform="rotate(45 ${f(cx)} ${f(cy)})"/>`;}
 }else if(kind==='arcs'){ // concentric arcs from the bottom-right corner
  const n=9,max=Math.hypot(w,h);for(let i=1;i<=n;i++){const r=max*i/n;body+=`<circle cx="${w}" cy="${h}" r="${f(r)}"/>`;}
 }else if(kind==='grid'){
  const s=Math.max(28,Math.min(w,h)/14);for(let y=s/2;y<h;y+=s)for(let x=s/2;x<w;x+=s)body+=`<circle cx="${f(x)}" cy="${f(y)}" r="${f(stroke*1.1)}" fill="${color}" stroke="none"/>`;
 }else if(kind==='stripes'){
  const g=stroke*7;for(let x=-h;x<w;x+=g)body+=`<line x1="${f(x)}" y1="${h}" x2="${f(x+h)}" y2="0"/>`;
 }else if(kind==='rosette'){ // rangoli rosette: polar repeat of petals, ring of dots
  const cx=w/2,cy=h/2,R=Math.min(w,h)/2-stroke*2,n=shape==='sharp'?12:16;
  for(let ring=0;ring<3;ring++){const rr=R*(1-ring*0.3),pw=rr*0.22;
   for(let i=0;i<n;i++){const a=i*360/n+(ring%2?180/n:0);
    body+=shape==='sharp'
     ?`<path d="M${f(cx)} ${f(cy-rr*0.45)} L${f(cx+pw/2)} ${f(cy-rr*0.72)} L${f(cx)} ${f(cy-rr)} L${f(cx-pw/2)} ${f(cy-rr*0.72)} Z" transform="rotate(${f(a)} ${f(cx)} ${f(cy)})"/>`
     :`<ellipse cx="${f(cx)}" cy="${f(cy-rr*0.72)}" rx="${f(pw/2)}" ry="${f(rr*0.27)}" transform="rotate(${f(a)} ${f(cx)} ${f(cy)})"/>`;}
   body+=`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rr*0.42)}"/>`;}
  for(let i=0;i<n*2;i++){const a=i*Math.PI*2/(n*2);body+=`<circle cx="${f(cx+Math.cos(a)*R)}" cy="${f(cy+Math.sin(a)*R)}" r="${f(stroke*1.4)}" fill="${color}" stroke="none"/>`;}
  body+=`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R*0.08)}" fill="${color}" stroke="none"/>`;
 }else if(kind==='rule'){
  body+=`<line x1="0" y1="${f(h/2-stroke*2)}" x2="${w}" y2="${f(h/2-stroke*2)}"/><line x1="0" y1="${f(h/2+stroke*2)}" x2="${w}" y2="${f(h/2+stroke*2)}"/>`;
 }
 return body?open+body+'</svg>':'';
}
