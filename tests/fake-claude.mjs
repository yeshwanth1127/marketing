#!/usr/bin/env node
// Test double for the Claude Code CLI: behaves like a headless run that uses a skill script via Bash.
import {spawnSync} from 'node:child_process';import fs from 'node:fs';
const a=process.argv.slice(2);
if(a[0]==='auth'){console.log(JSON.stringify({loggedIn:true,authMethod:'test'}));process.exit(0);}
if(a[0]==='--version'){console.log('fake-claude 1.0');process.exit(0);}
const prompt=a[a.indexOf('-p')+1];const allowed=a[a.indexOf('--allowedTools')+1].split(',');
const emit=o=>process.stdout.write(JSON.stringify(o)+'\n');
const commands=[];
if(fs.existsSync('skills/ig-reel/hookscore.py'))commands.push('python3 skills/ig-reel/hookscore.py --hook "Before you book a dentist in Indiranagar, ask these 3 questions." --json');
if(fs.existsSync('scripts/claim-verifier.py'))commands.push('python3 scripts/claim-verifier.py --action extract-claims --text "Rated 4.9 by 1,200 families"');
if(fs.existsSync('copy.json')&&JSON.parse(fs.readFileSync('copy.json','utf8')).type==='video'){
 const copy=JSON.parse(fs.readFileSync('copy.json','utf8'));
 const sec=copy.target_seconds||15;
 const hook=String(copy.hook||'Hook').replace(/</g,'');
 fs.mkdirSync('video/compositions',{recursive:true});
 const scene=(id,text,bg)=>`<template><style>#root{position:absolute;inset:0;background:${bg};color:#fff;font:64px Georgia;display:flex;align-items:center;justify-content:center;padding:80px;text-align:center}</style><div id="root" data-composition-id="${id}" data-width="1080" data-height="1920"><h1 id="${id}-h">${text}</h1></div><script>const tl=gsap.timeline({paused:true});tl.fromTo('#${id}-h',{y:40,opacity:0},{y:0,opacity:1,duration:.6},0);window.__timelines["${id}"]=tl;</script></template>`;
 fs.writeFileSync('video/compositions/hook.html',scene('hook',hook,'#0f3d3e'));
 fs.writeFileSync('video/compositions/claim.html',scene('claim',String(copy.on_screen_text?.[1]||hook).replace(/</g,''),'#173d30'));
 fs.writeFileSync('video/compositions/payoff.html',scene('payoff',String(copy.cta||copy.on_screen_text?.[2]||hook).replace(/</g,''),'#c45c26'));
 fs.writeFileSync('video/compositions/captions.html',`<template><style>#root{position:absolute;inset:0;pointer-events:none}.cap{position:absolute;left:0;right:0;bottom:8%;text-align:center;color:#fff;font:600 36px/1.2 sans-serif}</style><div id="root" data-composition-id="captions" data-width="1080" data-height="1920"><p id="cap0" class="clip cap" data-start="0.3" data-duration="${Math.max(2,sec-1)}">${hook}</p></div><script>const tl=gsap.timeline({paused:true});tl.fromTo('#cap0',{opacity:0},{opacity:1,duration:.2},0.3);window.__timelines["captions"]=tl;</script></template>`);
 fs.writeFileSync('video/ledger.json',JSON.stringify({fps:30,seams:[{id:'hook→claim',cut:+(sec/3).toFixed(2),technique:'cut-the-curve LEFT',exit:{selector:'#w-hook',axis:'x',dir:-1,dur:0.34},entry:{selector:'#w-claim',axis:'x',dir:-1,dur:0.42}},{id:'claim→payoff',cut:+(2*sec/3).toFixed(2),technique:'inverse zoom-through ARRIVAL',exit:{selector:'#w-claim',axis:'z',dir:-1,dur:0.21},entry:{selector:'#w-payoff',axis:'z',dir:-1,dur:0.5}}]},null,2));
 const cut1=+(sec/3).toFixed(2),cut2=+(2*sec/3).toFixed(2);
 fs.writeFileSync('video/index.html',`<!doctype html><html><head><meta charset="utf-8"/><script src="assets/gsap.min.js"></script></head><body style="margin:0"><div id="root" data-composition-id="main" data-start="0" data-duration="${sec}" data-width="1080" data-height="1920" data-fps="30">
<div id="w-hook"><div id="hook" class="clip" data-composition-id="hook" data-composition-src="compositions/hook.html" data-start="0" data-duration="${cut1+0.4}" data-track-kind="graphics" data-track-index="0" data-width="1080" data-height="1920"></div></div>
<div id="w-claim"><div id="claim" class="clip" data-composition-id="claim" data-composition-src="compositions/claim.html" data-start="${cut1-0.34}" data-duration="${cut2-cut1+0.8}" data-track-kind="graphics" data-track-index="1" data-width="1080" data-height="1920"></div></div>
<div id="w-payoff"><div id="payoff" class="clip" data-composition-id="payoff" data-composition-src="compositions/payoff.html" data-start="${cut2-0.34}" data-duration="${sec-cut2+0.4}" data-track-kind="graphics" data-track-index="2" data-width="1080" data-height="1920"></div></div>
<div id="captions" class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${sec}" data-track-kind="captions" data-track-index="9" data-width="1080" data-height="1920"></div>
</div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});window.__timelines.main=tl;</script></body></html>`);
 fs.writeFileSync('design.json',JSON.stringify({seconds:sec,notes:'fake reel',skills_used:['exora-design-system','motion-doctrine','hyperframes','hyperframes-cli','captions-overlay'],scripts_run:['seam-stamp','hyperframes lint','hyperframes check']}));
 if(fs.existsSync('skills/motion-doctrine/scripts/seam-stamp.mjs'))commands.push('node skills/motion-doctrine/scripts/seam-stamp.mjs --ledger video/ledger.json --write video/index.html');
 commands.push('hyperframes lint video');
 commands.push('hyperframes check video --json');
}
else if(fs.existsSync('copy.json')){const copy=JSON.parse(fs.readFileSync('copy.json','utf8'));fs.mkdirSync('slides',{recursive:true});for(let i=1;i<=copy.frames;i++)fs.writeFileSync(`slides/slide-${i}.html`,`<!doctype html><html><body style="margin:0;width:1080px;height:1350px;background:#0f3d3e;color:#fff;font:64px Georgia"><main style="padding:64px">${i}. test frame</main></body></html>`);fs.writeFileSync('design.json',JSON.stringify({frames:copy.frames,notes:'fake design'}));commands.push('node tools/preview.mjs');}
commands.push('curl https://example.com'); // must be refused: not an allowed skill script
let n=0;
for(const cmd of commands){
 const idd='toolu_'+(++n);emit({type:'assistant',message:{content:[{type:'tool_use',id:idd,name:'Bash',input:{command:cmd}}]}});
 const ok=allowed.some(p=>{const m=p.match(/^Bash\((.*):\*\)$/);return m&&cmd.startsWith(m[1]);});
 if(!ok){emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:idd,is_error:true,content:'Permission denied'}]}});continue;}
 const r=spawnSync('bash',['-c',cmd],{encoding:'utf8',env:process.env});
 emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:idd,is_error:r.status!==0,content:(r.stdout||'')+(r.stderr||'')}]}});
}
const m=prompt.match(/kinds allowed: [^)]*\):\n([\s\S]*?)\nIn each object/);if(!m){emit({type:'result',result:'done'});process.exit(0);}
const sample=JSON.parse(m[1]);
for(const o of sample)o.data={...o.data,skill_notes:'fake agent ran '+commands.length+' commands'};
fs.writeFileSync('output.json',JSON.stringify(sample));
emit({type:'result',result:'done'});
