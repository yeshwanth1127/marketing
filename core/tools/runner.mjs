// Runs a skill's own script (vendored, unmodified) in a throwaway folder and records a receipt.
// Mode A ("direct"): our code supplies the input; the script's output is stored as-is.
import {spawn} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {ROOT,q,id} from '../db/index.mjs';
import {prepareDmp} from './dmp.mjs';

const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const DMP_SCRIPTS=path.join(ROOT,'core/tools/vendor-scripts/digital-marketing-pro/scripts');
let inventoryShas=null;
function vendorShas(){
 if(inventoryShas)return inventoryShas;
 inventoryShas=new Set();
 try{const inv=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/vendor-inventory.json'),'utf8'));
  for(const repo of inv.repositories||[])for(const s of repo.skills||[])if(s.sha256)inventoryShas.add(s.sha256);}catch{}
 return inventoryShas;
}
export function python(){
 const venv=path.join(ROOT,'.local/pyenv/bin/python');
 return process.env.EXORA_PYTHON||(fs.existsSync(venv)?venv:'python3');
}
export function scriptSpec(mod,scriptId){
 const spec=(mod.tools?.scripts||[]).find(s=>s.id===scriptId);
 if(!spec)throw new Error(`Script ${scriptId} is not declared in ${mod.key}/tools.yaml`);
 return spec;
}
// Network is not available to skill scripts: proxies point at a closed local port.
function sandboxEnv(box){
 const dead='http://127.0.0.1:9';
 const nltk=path.join(ROOT,'.local/nltk_data');
 return {PATH:'/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',HOME:box,TMPDIR:box,LANG:'C.UTF-8',LC_ALL:'C.UTF-8',PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8',
  ...(fs.existsSync(nltk)?{NLTK_DATA:nltk}:{}),
  http_proxy:dead,https_proxy:dead,HTTP_PROXY:dead,HTTPS_PROXY:dead,ALL_PROXY:dead,NO_PROXY:''};
}
function owner(mod,spec){
 const key=spec.module||mod.key;
 const m=key===mod.key?mod:JSON.parse(fs.readFileSync(path.join(ROOT,'core/runtime/catalog.json'),'utf8')).find(x=>x.key===key);
 if(!m)throw new Error('Unknown module '+key);
 const meta=(m.skills||[]).find(s=>s.name===spec.skill);
 if(!meta)throw new Error(`Skill ${spec.skill} is not part of ${key}`);
 return {meta,dir:path.join(ROOT,m.group,key,'skills',spec.skill)};
}
export async function runScript(ctx,mod,scriptId,{stdin='',args=[]}={}){
 const spec=scriptSpec(mod,scriptId);
 const {meta,dir:skillDir}=owner(mod,spec);
 const skillMd=fs.readFileSync(path.join(skillDir,'SKILL.md'));
 const shared=spec.scripts==='dmp';
 const scriptSrc=shared?path.join(DMP_SCRIPTS,spec.file):path.join(skillDir,spec.file);
 const scriptBuf=fs.readFileSync(scriptSrc);
 const box=fs.mkdtempSync(path.join(os.tmpdir(),'exora-tool-'));
 const env=sandboxEnv(box);const py=python();
 let work=path.join(box,'skill'),scriptPath;
 fs.cpSync(skillDir,work,{recursive:true});
 const vars={};
 let error=null,result={code:-1,out:'',err:''};const started=Date.now();
 try{
  if(shared){fs.cpSync(DMP_SCRIPTS,path.join(box,'scripts'),{recursive:true});scriptPath=path.join(box,'scripts',spec.file);work=box;
   const dmp=prepareDmp(box,path.join(box,'scripts'),py,env,ctx);env.CLAUDE_MARKETING_HOME=dmp.home;env.CLAUDE_PLUGIN_ROOT=box;Object.assign(vars,{brand:dmp.slug,evidence_file:dmp.evidenceFile});}
  else scriptPath=path.join(work,spec.file);
  const inputFile=path.join(box,'input.txt');fs.writeFileSync(inputFile,stdin);vars.input_file=inputFile;
  const fill=a=>String(a).replace(/\{(\w+)\}/g,(m,k)=>k in vars?vars[k]:m);
  const argv=['-I',scriptPath,...(spec.args||[]).map(fill),...args.map(fill)];
  const cap=4*1024*1024;
  result=await new Promise(resolve=>{
   const child=spawn(py,argv,{cwd:work,env,stdio:['pipe','pipe','pipe']});
   let out='',err='',done=false;
   const finish=v=>{if(!done){done=true;clearTimeout(t);resolve(v);}};
   const t=setTimeout(()=>{child.kill('SIGKILL');finish({code:-1,out,err:'timed out'});},spec.timeout_ms||60000);
   child.stdout.on('data',d=>{out+=d;if(out.length>cap){child.kill('SIGKILL');finish({code:-1,out:'',err:'output too large'});}});
   child.stderr.on('data',d=>{err+=d;if(err.length>cap)err=err.slice(-cap);});
   child.on('error',e=>finish({code:-1,out,err:String(e.message)}));
   child.on('close',code=>finish({code,out,err}));
   child.stdin.end(stdin);
  });
 }catch(e){error=String(e.message);}
 finally{fs.rmSync(box,{recursive:true,force:true});}
 let output=null;
 if(!error&&result.code!==0)error=(result.err||result.out||'script failed').slice(-1000);
 if(!error){if(spec.output==='json'){try{output=JSON.parse(result.out);}catch{error='script did not return JSON';}}else output=result.out;}
 // Copies of SKILL.md carry one appended attribution comment; strip it to compare with the pinned vendor file.
 const vendorSkillSha=sha(skillMd.toString('utf8').replace(/\n\n<!-- EXORA source: [^>]*-->\n$/,''));
 let scriptMatches=false;
 const vendorScript=shared?path.join(ROOT,'vendor/digital-marketing-pro/scripts',spec.file):path.join(ROOT,'vendor',path.dirname(meta.path||''),spec.file);
 try{scriptMatches=fs.readFileSync(vendorScript).equals(scriptBuf);}catch{}
 const receipt=id();
 await q(`INSERT INTO tool_runs(id,client_id,run_id,module,skill,source,script,skill_sha256,script_sha256,vendor_match,input_sha256,output_sha256,exit_code,duration_ms,error,created_by)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
  [receipt,ctx.client.id,ctx.run||null,mod.key,spec.skill,meta.source||null,spec.file,sha(skillMd),sha(scriptBuf),vendorShas().has(vendorSkillSha)&&scriptMatches,sha(JSON.stringify({stdin,args})),result.code===0?sha(result.out):null,result.code,Date.now()-started,error,ctx.user?.id||null]);
 return {receipt,ok:!error,output,error,skill:spec.skill,script:spec.file};
}
