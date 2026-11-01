// Copied into Claude's folder as tools/preview.mjs (with __ROOT__/__CHROME__ filled in).
// Renders slides/*.html to previews/*.png at the canvas size and prints the design-check report as JSON.
import fs from 'node:fs';import path from 'node:path';
const {chromium}=await import('__ROOT__/node_modules/playwright/index.mjs');
const {pageChecks,CANVAS,MARGIN}=await import('__ROOT__/core/design/checks.mjs');
const brand=JSON.parse(fs.readFileSync('brand.json','utf8')),copy=JSON.parse(fs.readFileSync('copy.json','utf8'));
const [W,H]=CANVAS[copy.format]||CANVAS.portrait;
const slides=fs.existsSync('slides')?fs.readdirSync('slides').filter(f=>/^slide-\d+\.html$/.test(f)).sort((a,b)=>parseInt(a.slice(6))-parseInt(b.slice(6))):[];
if(!slides.length){console.log(JSON.stringify({error:'No slides/slide-N.html files yet'}));process.exit(1);}
fs.mkdirSync('previews',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'__CHROME__',args:['--no-sandbox']});
const report=[];
try{const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
 await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
 const fn=eval(pageChecks);
 for(const f of slides){await page.goto('file://'+path.resolve('slides',f),{waitUntil:'load'});
  const issues=await page.evaluate(fn,{format:copy.format,margin:MARGIN[copy.format],banned:brand.banned_words||[]});
  const png=path.join('previews',f.replace('.html','.png'));await page.screenshot({path:png});report.push({slide:f,preview:png,issues});}
}finally{await browser.close();}
const errors=report.reduce((a,s)=>a+s.issues.filter(i=>i.severity==='error').length,0);
console.log(JSON.stringify({canvas:[W,H],slides:report,errors,next:errors?'Fix the errors, then run node tools/preview.mjs again.':'Open each PNG with Read and judge the design.'},null,1));
