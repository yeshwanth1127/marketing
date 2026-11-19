// Local reel composer that actually runs the video skills in this repo (no Claude).
// Uses exora-design-system frames, motion-doctrine seam-stamp, captions-overlay rails,
// and the HyperFrames project contract. Claude may still refine this when the account is free.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {ROOT} from '../db/index.mjs';
import {compose,catalog,catalogFor,css as brandCss} from './brand-profile.mjs';
import {brandFiles,VIDEO_SKILLS,cleanOnScreen as cleanCopy,reelScreenCopy} from './compose.mjs';
export {cleanOnScreen} from './compose.mjs';

const W=1080,H=1920,FPS=30,SKILL_DIR=path.join(ROOT,'modules/06-design-video/skills');
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));


function imageSize(file){
 try{
  const buf=fs.readFileSync(file);
  if(buf[0]===0x89&&buf[1]===0x50)return {w:buf.readUInt32BE(16),h:buf.readUInt32BE(20)};
  if(buf[0]===0xff&&buf[1]===0xd8){
   let i=2;while(i<buf.length-8){if(buf[i]!==0xff){i++;continue;}const m=buf[i+1];if(m>=0xc0&&m<=0xc3&&m!==0xc4)return {h:buf.readUInt16BE(i+5),w:buf.readUInt16BE(i+7)};const len=buf.readUInt16BE(i+2);if(len<2)break;i+=2+len;}
  }
 }catch{}
 return null;
}

export function logoIsMark(file){
 if(!file||!fs.existsSync(file))return false;
 const s=imageSize(file);if(!s||!s.w||!s.h)return false;
 const ar=s.w/s.h;return ar>=0.6&&ar<=1.35&&s.w<=900&&s.h<=900;
}

export function reelSeconds(asset){
 return Math.min(Math.max(Math.ceil(Number(asset.data?.target_seconds||asset.data?.beat_sheet?.total_seconds||15)||15),8),120);
}

export function reelBeats(asset,client={}){
 const copy=reelScreenCopy(asset,client);
 const lines=copy.on_screen_text||[];
 const hook=copy.hook;
 const support=lines[1]&&lines[1]!==hook?emphasize(lines[1],client):emphasize(hook,client);
 const cta=copy.cta||'';
 const place=[client.city,client.region].filter(Boolean).join(', ');
 const brand=client.brand_name||client.name||hook;
 return [
  {id:'hook',layout:'hook',kicker:'',headline:hook,sub:'',cta:'',tone:'ink'},
  {id:'claim',layout:'hook',kicker:'',headline:support,sub:lines[2]||'',cta:'',tone:'paper'},
  {id:'payoff',layout:'hook',kicker:place||'',headline:cta||brand,sub:cta?hook:'',cta:cta||'',tone:'accent'}
 ];
}

function emphasize(line,client){
 const name=String(client.brand_name||client.name||'').trim();
 if(name&&new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(line)&&!/\*[^*]+\*/.test(line))
  return line.replace(new RegExp(`\\b(${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})\\b`,'i'),'*$1*');
 if(/\*[^*]+\*/.test(line))return line;
 const words=line.split(/\s+/);const i=words.reduce((best,w,idx)=>w.replace(/[^A-Za-z]/g,'').length>(words[best]||'').replace(/[^A-Za-z]/g,'').length?idx:best,0);
 const core=(words[i]||'').replace(/[^A-Za-z]/g,'');
 if(core.length>=4){words[i]=words[i].replace(core,'*'+core+'*');return words.join(' ');}
 return line;
}

function captionGroups(text,seconds){
 const words=cleanCopy(String(text||'').replace(/\*/g,'')).split(/\s+/).filter(Boolean);
 if(!words.length)return [];
 const groups=[];for(let i=0;i<words.length;){const n=Math.min(4,Math.max(2,words.length-i>=6?3:words.length-i));groups.push(words.slice(i,i+n).join(' '));i+=n;}
 const start=0.25,span=Math.max(1.4,(seconds-0.8)/groups.length);
 return groups.map((text,i)=>{const s=+(start+i*span).toFixed(2);return {id:'cap-'+i,text,start:s,dur:+Math.min(span+0.15,seconds-s-0.12).toFixed(2)};});
}

function wordSpans(richHtml){
 return String(richHtml).split(/(<em>[\s\S]*?<\/em>)/).map(part=>{
  if(part.startsWith('<em>'))return `<span class="w">${part}</span>`;
  return part.split(/(\s+)/).map(t=>/^\s*$/.test(t)?t:`<span class="w">${t}</span>`).join('');
 }).join('');
}

function asComposition({id,html}){
 const style=(html.match(/<style>([\s\S]*?)<\/style>/)?.[1]||'').replace(/z-index:\s*-1/g,'z-index:0').replace(/\bbody\{/g,'.frame{').replace(/:root\{/g,'#root,.frame{');
 const bodyClass=html.match(/<body class="([^"]*)"/)?.[1]||'';
 let inner=html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1]||'';
 inner=inner.replace(/<script>[\s\S]*?<\/script>/g,'');
 inner=inner.replace(/<h1([^>]*class="[^"]*headline[^"]*")/ ,`<h1 id="${id}-headline"$1`);
 inner=inner.replace(/<h1([^>]*class="[^"]*title[^"]*")/ ,`<h1 id="${id}-headline"$1`);
 inner=inner.replace(/(<h1[^>]*id="[^"]+-headline"[^>]*>)([\s\S]*?)(<\/h1>)/,(_,a,b,c)=>a+wordSpans(b)+c);
 inner=inner.replace(/<p([^>]*class="[^"]*sub[^"]*")/ ,`<p id="${id}-sub"$1`);
 inner=inner.replace(/<main class="canvas"/,`<div class="canvas"`).replace(/<\/main>/,'</div>');
 return `<template>
<style>
#root{position:absolute;inset:0;overflow:hidden}
${style}
#root,.frame,.canvas{width:100%;height:100%}
.mark img{height:56px!important;width:auto!important;max-width:200px;object-fit:contain}
.w{display:inline-block;will-change:transform,opacity}
</style>
<div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
<div class="frame ${esc(bodyClass)}">${inner}</div>
</div>
<script>
const tl=gsap.timeline({paused:true});
const h=document.querySelector('#${id}-headline .w')? '#${id}-headline .w' : '#${id}-headline';
if(document.querySelector(h))tl.fromTo(h,{y:42,opacity:0},{y:0,opacity:1,duration:.62,stagger:.04,ease:'power3.out'},.16);
if(document.querySelector('#${id}-sub'))tl.fromTo('#${id}-sub',{y:22,opacity:0},{y:0,opacity:1,duration:.5,ease:'power2.out'},.55);
if(document.querySelector('.cta'))tl.fromTo('.cta',{y:18,opacity:0},{y:0,opacity:1,duration:.45,ease:'power2.out'},.9);
if(document.querySelector('.hook-deco'))tl.fromTo('.hook-deco',{scale:.92,opacity:.2},{scale:1,opacity:.9,duration:.8,ease:'power2.out'},0);
window.__timelines[${JSON.stringify(id)}]=tl;
</script>
</template>`;
}

function writeBrandFiles(dir,files){
 for(const [rel,spec] of Object.entries(files)){
  const dest=path.join(dir,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});
  if(spec&&spec.copy){const st=fs.statSync(spec.copy);if(st.isDirectory())fs.cpSync(spec.copy,dest,{recursive:true});else fs.copyFileSync(spec.copy,dest);}
  else fs.writeFileSync(dest,spec);
 }
}

export async function composeVideoFromSkills({client,asset,brand,keepDir,designTemplate=null}){
 if(!keepDir)throw new Error('keepDir is required');
 const seconds=reelSeconds(asset);
 const beats=reelBeats(asset,client);
 const logo_path=logoIsMark(brand?.logo_path)?brand.logo_path:null;
 const theme=designTemplate?.data||null;
 const {profile,files}=brandFiles({...brand,logo_path},client,{prefix:'',theme});
 fs.rmSync(keepDir,{recursive:true,force:true});fs.mkdirSync(path.join(keepDir,'compositions'),{recursive:true});
 writeBrandFiles(keepDir,files);
 fs.mkdirSync(path.join(keepDir,'assets'),{recursive:true});
 fs.copyFileSync(path.join(ROOT,'node_modules/gsap/dist/gsap.min.js'),path.join(keepDir,'assets/gsap.min.js'));
 fs.writeFileSync(path.join(keepDir,'brand.css'),brandCss(profile,catalogFor(profile),'fonts'));
 fs.writeFileSync(path.join(keepDir,'hyperframes.json'),JSON.stringify({paths:{assets:'assets'}}));
 fs.writeFileSync(path.join(keepDir,'copy.json'),JSON.stringify({format:'reel',type:'video',target_seconds:seconds,beats,hook:beats[0].headline,cta:asset.data?.cta||'',language:asset.data?.language||'English'},null,1));

 const n=beats.length,base=seconds/n,exitDur=.34,entryDur=.42;
 const cuts=beats.slice(1).map((b,i)=>+(((i+1)*base).toFixed(2)));
 const cat=catalog();
 for(const beat of beats){
  const html=compose({layout:beat.layout,slots:{kicker:beat.kicker,headline:beat.headline,sub:beat.sub,cta:beat.cta},profile,catalog:cat,format:'reel',fontBase:'../fonts',logoBase:logo_path?'../':''})[0];
  fs.writeFileSync(path.join(keepDir,'compositions',beat.id+'.html'),asComposition({id:beat.id,html}));
 }

 const hosts=beats.map((beat,i)=>{
  const cutBefore=i===0?0:cuts[i-1];
  const cutAfter=i===n-1?seconds:cuts[i];
  const start=i===0?0:+(cutBefore-exitDur).toFixed(2);
  const end=i===n-1?seconds:+(cutAfter+entryDur).toFixed(2);
  const dur=+(end-Math.max(0,start)).toFixed(2);
  const st=Math.max(0,start);
  return `  <div id="el-${beat.id}" style="position:absolute;inset:0;transform-origin:50% 50%">
    <div id="${beat.id}" class="clip" data-composition-id="${beat.id}" data-composition-src="compositions/${beat.id}.html" data-start="${st}" data-duration="${dur}" data-width="${W}" data-height="${H}" data-track-kind="graphics" data-track-index="${i}"></div>
  </div>`;
 }).join('\n');

 const groups=captionGroups(beats[0].headline,seconds);
 const capMarkup=groups.map(g=>`    <p id="${g.id}" class="clip cap" data-start="${g.start}" data-duration="${g.dur}">${esc(g.text)}</p>`).join('\n');
 const capScript=groups.map(g=>`tl.fromTo('#${g.id}',{y:16,opacity:0},{y:0,opacity:1,duration:.18,ease:'power2.out'},${g.start});tl.to('#${g.id}',{opacity:0,duration:.12,ease:'power2.in'},${+(g.start+g.dur-0.12).toFixed(2)});`).join('\n');
 fs.writeFileSync(path.join(keepDir,'compositions','captions.html'),`<template>
<style>
#root{position:absolute;inset:0;pointer-events:none;text-align:center}
.cap{position:absolute;left:0;right:0;bottom:8%;margin:0 auto;font:600 36px/1.2 var(--f-body,sans-serif);color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.45);max-width:900px;padding:0 48px}
</style>
<div id="root" data-composition-id="captions" data-width="${W}" data-height="${H}">
${capMarkup}
</div>
<script>
const tl=gsap.timeline({paused:true});
${capScript}
window.__timelines["captions"]=tl;
</script>
</template>`);

 const ledger={fps:FPS,seams:cuts.map((cut,i)=>({id:`${beats[i].id}→${beats[i+1].id}`,cut:Number(cut),technique:'cut-the-curve LEFT',exit:{selector:`#el-${beats[i].id}`,axis:'x',dir:-1,dur:exitDur},entry:{selector:`#el-${beats[i+1].id}`,axis:'x',dir:-1,dur:entryDur,travel:8}}))};
 if(ledger.seams.length){
  const last=ledger.seams.at(-1);
  last.technique='inverse zoom-through ARRIVAL';
  last.exit={selector:last.exit.selector,axis:'z',dir:-1,dur:.21};
  last.entry={selector:last.entry.selector,axis:'z',dir:-1,dur:.5,scanRoot:last.entry.selector};
 }
 fs.writeFileSync(path.join(keepDir,'ledger.json'),JSON.stringify(ledger,null,2));

 const index=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>reel</title>
<link rel="stylesheet" href="brand.css"/>
<script src="assets/gsap.min.js"></script>
<style>
html,body{margin:0;background:#000}
#root{position:relative;width:${W}px;height:${H}px;overflow:hidden}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${seconds}" data-width="${W}" data-height="${H}" data-fps="${FPS}">
${hosts}
  <div id="captions" class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${seconds}" data-width="${W}" data-height="${H}" data-track-kind="captions" data-track-index="9"></div>
</div>
<script>
window.__timelines=window.__timelines||{};
const tl=gsap.timeline({paused:true});
window.__timelines["main"]=tl;
</script>
</body>
</html>`;
 fs.writeFileSync(path.join(keepDir,'index.html'),index);

 const stamp=spawnSync(process.execPath,[path.join(SKILL_DIR,'motion-doctrine/scripts/seam-stamp.mjs'),'--ledger','ledger.json','--write','index.html'],{cwd:keepDir,encoding:'utf8'});
 if(stamp.status!==0)throw new Error('motion-doctrine seam-stamp failed: '+String(stamp.stderr||stamp.stdout).slice(0,400));

 const hf=path.join(ROOT,'node_modules/hyperframes/bin/hyperframes.mjs');
 const env={...process.env,HYPERFRAMES_NO_TELEMETRY:'1',DO_NOT_TRACK:'1',HYPERFRAMES_CONFIG_DIR:path.join(ROOT,'.local/hyperframes')};
 const lint=spawnSync(process.execPath,[hf,'lint',keepDir],{cwd:keepDir,encoding:'utf8',env,timeout:120000});
 const lintOut=String(lint.stdout||lint.stderr||'');
 const lint_ok=lint.status===0||!/✗/.test(lintOut);
 const design={seconds,notes:'Composed by workspace video skills (design system, motion doctrine, HyperFrames, captions overlay).',skills_used:VIDEO_SKILLS.filter(s=>['exora-design-system','motion-doctrine','hyperframes','hyperframes-cli','captions-overlay'].includes(s)),lint_ok,issues_remaining:lint_ok?[]:[lintOut.slice(0,400)]};
 fs.writeFileSync(path.join(keepDir,'design.json'),JSON.stringify(design,null,2));
 if(!fs.existsSync(path.join(keepDir,'index.html')))throw new Error('Video skills did not produce index.html');
 return {dir:keepDir,design,seconds,receipts:[],soundtrack:false,skills:design.skills_used,composer:'skills'};
}

export async function composeVideoOrSkills(opts){
 if(opts.forceSkills)return composeVideoFromSkills(opts);
 const {composeVideo}=await import('./compose.mjs');
 try{return {...await composeVideo(opts),composer:'claude'};}
 catch(e){
  if(opts.allowSkillsFallback===false)throw e;
  const skills=await composeVideoFromSkills(opts);
  return {...skills,fallback_error:String(e.message||'').replace(/https?:\/\/\S+/g,'[provider URL removed]').slice(0,400)};
 }
}
