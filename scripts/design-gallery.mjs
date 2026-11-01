// Renders every layout for every test brand (and EXORA's own profile) in every format, runs the design checks,
// and writes a contact sheet per brand: .local/design-gallery/<brand>/{<layout>-<format>-N.png, sheet.png}.
//   node scripts/design-gallery.mjs [--brands kaveri-dental,sunkidz] [--layouts hook,offer] [--formats portrait,square]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {compose,profileFor,audit,FONTS,LAYOUTS} from '../core/design/brand-profile.mjs';
import {pageChecks,MARGIN} from '../core/design/checks.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?process.argv[i+1].split(','):d;};
const dir=path.join(ROOT,'exora/brand-profiles/test');
const brands=arg('brands',[...fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5)),'exora']);
const layouts=arg('layouts',Object.keys(LAYOUTS));const formats=arg('formats',['portrait','square','reel','landscape']);
const samples=JSON.parse(fs.readFileSync(path.join(ROOT,'exora/design-system/samples.json'),'utf8'));
const OUT=path.join(ROOT,'.local/design-gallery');fs.mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox']});
const summary=[];
try{for(const b of brands){
 const file=b==='exora'?path.join(ROOT,'exora/brand-profiles/exora.json'):path.join(dir,b+'.json');const raw=JSON.parse(fs.readFileSync(file,'utf8'));
 const pr=profileFor(raw,{name:raw.name,languages:raw.languages});const copy=samples[b]||samples['kaveri-dental'];
 const bdir=path.join(OUT,b);fs.rmSync(bdir,{recursive:true,force:true});fs.mkdirSync(bdir,{recursive:true});
 const shots=[];
 for(const fmt of formats)for(const l of layouts){
  const htmls=compose({layout:l,slots:copy[l]||{},profile:pr,catalog:JSON.parse(fs.readFileSync(path.join(FONTS,'catalog.json'),'utf8')),format:fmt,fontBase:'file://'+FONTS});
  const [W,H]={square:[1080,1080],portrait:[1080,1350],reel:[1080,1920],landscape:[1200,628]}[fmt];
  const page=await browser.newPage({viewport:{width:W,height:H}});await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
  for(let i=0;i<htmls.length;i++){const hp=path.join(bdir,`${l}-${fmt}-${i+1}.html`);fs.writeFileSync(hp,htmls[i]);
   await page.goto('file://'+hp);await page.waitForFunction(()=>document.body.dataset.ready==='1',null,{timeout:15000});
   const issues=await page.evaluate(eval(pageChecks),{format:fmt,margin:MARGIN[fmt],banned:pr.banned_words});
   const png=hp.replace('.html','.png');await page.screenshot({path:png});shots.push({l,fmt,i,png,W,H,issues});
   for(const x of issues)summary.push({brand:b,layout:l,format:fmt,frame:i+1,...x});}
  await page.close();}
 // contact sheet per format
 for(const fmt of formats){const s=shots.filter(x=>x.fmt===fmt);if(!s.length)continue;const cols=fmt==='landscape'?4:6,tw=fmt==='landscape'?440:300;
  const html=`<body style="margin:0;background:#d9d9d4;font:14px sans-serif;padding:24px;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:20px;width:${cols*(tw+20)+28}px">${s.map(x=>`<figure style="margin:0"><img src="file://${x.png}" style="width:${tw}px;display:block;box-shadow:0 2px 10px #0002"><figcaption style="padding:6px 0;color:${x.issues.some(i=>i.severity==='error')?'#b00':'#333'}">${x.l} ${x.i+1}${x.issues.length?' · '+x.issues.map(i=>i.type).join(','):''}</figcaption></figure>`).join('')}</body>`;
  const sp=path.join(bdir,`sheet-${fmt}.html`);fs.writeFileSync(sp,html);const page=await browser.newPage({viewport:{width:cols*(tw+20)+28,height:800}});await page.goto('file://'+sp);await page.screenshot({path:sp.replace('.html','.png'),fullPage:true});await page.close();}
 console.log(b,'profile audit:',JSON.stringify(audit(pr)));
}}finally{await browser.close();}
fs.writeFileSync(path.join(OUT,'issues.json'),JSON.stringify(summary,null,1));
const errs=summary.filter(x=>x.severity==='error');
console.log(JSON.stringify({rendered_to:OUT,errors:errs.length,warnings:summary.length-errs.length,first_errors:errs.slice(0,15)},null,1));
