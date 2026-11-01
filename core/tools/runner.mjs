// Runs a skill's own script (vendored, unmodified) in a throwaway folder and records a receipt.
// Mode A ("direct"): our code supplies the input; the script's output is stored as-is.
import {spawn} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {ROOT,q,id} from '../db/index.mjs';

const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
let inventoryShas=null;
function vendorShas(){
 if(inventoryShas)return inventoryShas;
 inventoryShas=new Set();
 try{const inv=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/vendor-inventory.json'),'utf8'));
  for(const repo of inv.repositories||[])for(const s of repo.skills||[])if(s.sha256)inventoryShas.add(s.sha256);}catch{}
 return inventoryShas;
}
export function scriptSpec(mod,scriptId){
 const spec=(mod.tools?.scripts||[]).find(s=>s.id===scriptId);
 if(!spec)throw new Error(`Script ${scriptId} is not declared in ${mod.key}/tools.yaml`);
 return spec;
}
// Network is not available to skill scripts: proxies point at a closed local port.
function sandboxEnv(box){
 const deadProxy='http://127.0.0.1:9';
 return {PATH:'/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',HOME:box,TMPDIR:box,LANG:'C.UTF-8',LC_ALL:'C.UTF-8',PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8',
  http_proxy:deadProxy,https_proxy:deadProxy,HTTP_PROXY:deadProxy,HTTPS_PROXY:deadProxy,ALL_PROXY:deadProxy,NO_PROXY:''};
}
export async function runScript(ctx,mod,scriptId,{stdin='',args=[]}={}){
 const spec=scriptSpec(mod,scriptId);
 // A script may come from another module's skill (spec.module), read-only.
 const ownerKey=spec.module||mod.key;
 const owner=ownerKey===mod.key?mod:JSON.parse(fs.readFileSync(path.join(ROOT,'core/runtime/catalog.json'),'utf8')).find(m=>m.key===ownerKey);
 if(!owner)throw new Error('Unknown module '+ownerKey);
 const skillMeta=(owner.skills||[]).find(s=>s.name===spec.skill);
 if(!skillMeta)throw new Error(`Skill ${spec.skill} is not part of ${ownerKey}`);
 const skillDir=path.join(ROOT,owner.group,ownerKey,'skills',spec.skill);
 const skillMd=fs.readFileSync(path.join(skillDir,'SKILL.md'));
 const scriptBuf=fs.readFileSync(path.join(skillDir,spec.file));
 const box=fs.mkdtempSync(path.join(os.tmpdir(),'exora-tool-'));
 const work=path.join(box,'skill');
 fs.cpSync(skillDir,work,{recursive:true});
 const started=Date.now();const cap=4*1024*1024;
 const result=await new Promise(resolve=>{
  const child=spawn(process.env.EXORA_PYTHON||'python3',['-I',path.join(work,spec.file),...(spec.args||[]),...args],{cwd:work,env:sandboxEnv(box),stdio:['pipe','pipe','pipe']});
  let out='',err='',done=false;
  const finish=v=>{if(!done){done=true;clearTimeout(t);resolve(v);}};
  const t=setTimeout(()=>{child.kill('SIGKILL');finish({code:-1,out,err:'timed out'});},spec.timeout_ms||30000);
  child.stdout.on('data',d=>{out+=d;if(out.length>cap){child.kill('SIGKILL');finish({code:-1,out:'',err:'output too large'});}});
  child.stderr.on('data',d=>{err+=d;if(err.length>cap)err=err.slice(-cap);});
  child.on('error',e=>finish({code:-1,out,err:String(e.message)}));
  child.on('close',code=>finish({code,out,err}));
  child.stdin.end(stdin);
 });
 fs.rmSync(box,{recursive:true,force:true});
 let output=null,error=result.code===0?null:(result.err||'script failed').slice(-1000);
 if(result.code===0){if(spec.output==='json'){try{output=JSON.parse(result.out);}catch{error='script did not return JSON';}}else output=result.out;}
 const receipt=id();
 const skillSha=sha(skillMd);
 // Copied SKILL.md files carry one appended attribution comment; strip it to compare with the pinned vendor file.
 const vendorSkillSha=sha(skillMd.toString('utf8').replace(/\n\n<!-- EXORA source: [^>]*-->\n$/,''));
 let scriptMatches=false;
 if(skillMeta?.path){try{scriptMatches=fs.readFileSync(path.join(ROOT,'vendor',path.dirname(skillMeta.path),spec.file)).equals(scriptBuf);}catch{}}
 const vendorMatch=vendorShas().has(vendorSkillSha)&&scriptMatches;
 await q(`INSERT INTO tool_runs(id,client_id,run_id,module,skill,source,script,skill_sha256,script_sha256,vendor_match,input_sha256,output_sha256,exit_code,duration_ms,error,created_by)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
  [receipt,ctx.client.id,ctx.run||null,mod.key,spec.skill,skillMeta?.source||null,spec.file,skillSha,sha(scriptBuf),vendorMatch,sha(JSON.stringify({stdin,args})),result.code===0?sha(result.out):null,result.code,Date.now()-started,error,ctx.user?.id||null]);
 return {receipt,ok:result.code===0&&!error,output,error,skill:spec.skill,script:spec.file};
}
