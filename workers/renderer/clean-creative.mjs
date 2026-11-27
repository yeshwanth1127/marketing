import path from 'node:path';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {id} from '../../core/db/index.mjs';
import {catalog,FONTS} from '../../core/design/brand-profile.mjs';
import {referencePixels,withReferenceTemp} from '../../core/design/reference-image.mjs';
import {illustrationFor} from './illustration.mjs';

function luminance(hex) {
 const linear=hex.slice(1).match(/../g).map(pair=>{
  const value=parseInt(pair,16)/255;
  return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;
 });
 return linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
}

async function fontRule(fontId, family) {
 const font=catalog().fonts.find(f=>f.id===fontId);
 const face=font?.faces.find(f=>f.style==='normal');
 if(!face)return '';
 const bytes=await fs.readFile(path.join(FONTS,font.id,face.file));
 return `@font-face{font-family:${family};src:url(data:font/woff;base64,${bytes.toString('base64')});font-weight:${[].concat(face.weight).join(' ')}}`;
}

export async function renderCleanCreative({asset,payload,dir}) {
 const template=payload.design_template, theme=template.data;
 const measured=theme.design_spec?.palette?.length && theme.design_spec.canvas
  ? theme.design_spec
  : await withReferenceTemp(tmp=>referencePixels('inspect',template.reference_image_path,path.join(tmp,'palette.png'),{slots:[]}));
 const palette=[...measured.palette,theme.colors?.paper,theme.colors?.ink].filter(c=>/^#[a-f\d]{6}$/i.test(c));
 const background=palette[0]||'#23493c', light=luminance(background);
 const contrast=c=>(Math.max(light,luminance(c))+0.05)/(Math.min(light,luminance(c))+0.05);
 const ink=[...palette,'#ffffff','#000000'].find(c=>contrast(c)>=4.5);
 const scale=1080/Math.min(measured.canvas.width,measured.canvas.height);
 const size=n=>Math.max(2,Math.round(n*Math.min(scale,2048/Math.max(measured.canvas.width,measured.canvas.height))/2)*2);
 const reel=asset.data.type==='video'&&asset.data.format==='reel';
 const width=reel?1080:size(measured.canvas.width),height=reel?1920:size(measured.canvas.height);
 const fontCSS=await fontRule(theme.fonts?.heading,'Headline')+await fontRule(theme.fonts?.body,'Body');
 const css=`${fontCSS}
 *{box-sizing:border-box}html,body{margin:0}main{height:100vh;padding:7vmin 7.5vmin;display:flex;flex-direction:column;background:${background};color:${ink};font-family:Body,Arial,sans-serif;overflow-wrap:anywhere}
 header{font:600 4.5vmin/1.25 Headline,Georgia,serif;border-bottom:1px solid currentColor;padding-bottom:2.5vmin}
 figure{margin:0;flex:1 1 auto;min-height:15vmin;position:relative;color:${palette.find(c=>c!==ink&&contrast(c)>=3)||ink}}figure svg{position:absolute;right:4%;top:6%;height:90%;width:65%}section{padding:4vmin 0}h1{font:450 1em/1.2 Headline,Georgia,serif;letter-spacing:-.035em;margin:0;text-wrap:balance}
 p{font-size:.41em;line-height:1.33;margin:2.7vmin 0 0;max-width:41em}
 footer{border-top:1px solid currentColor;padding-top:3vmin}strong{display:inline-block;background:${ink};color:${background};max-width:100%;font-size:3vmin;line-height:1.3;padding:1.35vmin 2.6vmin;border-radius:1vmin} [hidden]{display:none}
 `;
 const copy=asset.data;
 const lines=(copy.on_screen_text||[]).filter(s=>typeof s==='string'&&s.trim());
 const multi=['carousel','video'].includes(copy.type);
 const headlines=multi&&lines.length?lines.slice(0,8):[lines[0]||copy.headline||copy.title||asset.title.replace(/ - (image|carousel|video)$/,'')];
 const firstSentence=String(copy.body||copy.caption||copy.script||'').trim().split(/(?<=[.!?।])\s+|\n/u)[0];
 if(copy.type==='video'&&headlines.length===1&&firstSentence&&firstSentence.length<=240&&firstSentence!==headlines[0]&&firstSentence!==copy.cta){
  headlines.push(firstSentence);
 }
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 const files=[];
 try{
  const page=await browser.newPage({viewport:{width,height}});
  const illustration=illustrationFor([asset.title,...lines,copy.caption,copy.body].filter(Boolean).join(' '));
  await page.setContent(`<meta charset=utf-8><style>${css}</style><main><header></header><figure>${illustration}</figure><section><h1></h1><p></p></section><footer><strong></strong></footer></main>`);
  for(const [index,headline] of headlines.entries()){
   const body=[!multi&&lines[1],index===0&&!headlines.includes(firstSentence)&&firstSentence].find(s=>s&&s!==headline&&s!==copy.cta&&s.length<=240)||'';
   const cta=(!multi||index===headlines.length-1)&&copy.cta!==headline?copy.cta:'';
   await page.evaluate(async ({headline,body,cta,brand})=>{
    for(const [selector,text] of [['header',brand],['h1',headline],['p',body],['strong',cta]]){
     const element=document.querySelector(selector);
     element.textContent=text||'';
     element.hidden=!text;
    }
    document.querySelector('footer').hidden=!cta;
    const section=document.querySelector('section'), main=document.querySelector('main');
    for(let size=10;size>=4;size-=0.25){
     section.style.fontSize=size+'vmin';
     await document.fonts.ready;
     const last=cta?document.querySelector('footer'):section;
     if(last.getBoundingClientRect().bottom<=innerHeight-parseFloat(getComputedStyle(main).paddingBottom)+1&&main.scrollWidth<=innerWidth)return;
    }
    throw Error('The selected copy is too long for this canvas. Shorten the headline or CTA and try again.');
   },{headline,body,cta,brand:payload.client_name});
   const name=`creative-${index+1}.png`,file=path.join(dir,name);
   await page.screenshot({path:file});
   files.push({id:id(),name,path:file,mime:'image/png'});
  }
 }finally{await browser.close();}
 return {files,width,height,engine:'EXORA clean reference creative',design_checks:[]};
}
