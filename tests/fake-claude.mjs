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
if(fs.existsSync('copy.json')&&JSON.parse(fs.readFileSync('copy.json','utf8')).type==='video'){const copy=JSON.parse(fs.readFileSync('copy.json','utf8'));fs.writeFileSync('video/index.html',`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="root" data-composition-id="main" data-start="0" data-duration="${copy.target_seconds}" data-width="1080" data-height="1920" data-fps="30"><h1 id="t" class="clip" data-start="0" data-duration="${copy.target_seconds}" data-track-index="0" style="font:80px Georgia;color:#fff;background:#0f3d3e;margin:300px 64px">${copy.hook}</h1></div><script src="assets/gsap.min.js"></script><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.fromTo('#t',{opacity:0},{opacity:1,duration:1},0);window.__timelines.main=tl;</script></body></html>`);fs.writeFileSync('design.json',JSON.stringify({seconds:copy.target_seconds,notes:'fake reel'}));commands.push('hyperframes lint video');}
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
