import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';

const bin=()=>process.env.EXORA_CODEX_BIN||'codex';
let cached;
export function codexState(force=false){
  if(!force&&cached?.bin===bin()&&Date.now()-cached.at<5000)return cached.state;
  const probe=spawnSync(bin(),['login','status'],{encoding:'utf8',timeout:8000,windowsHide:true});
  const installed=!probe.error||probe.error.code!=='ENOENT';
  const connected=installed&&probe.status===0;
  const state={installed,connected,detail:!installed?'Codex CLI is not installed.':connected?'Codex account connected':'Codex account is not connected'};
  cached={bin:bin(),at:Date.now(),state};
  return state;
}

export async function executeCodex({prompt,outputSchema,attachments=[],timeoutMs=240000}){
  const state=codexState();
  if(!state.installed)throw new Error('Codex CLI is not installed.');
  if(!state.connected)throw new Error('Connect your Codex account before generating.');
  const workdir=fs.mkdtempSync(path.join(os.tmpdir(),'exora-codex-'));
  const args=['--ask-for-approval','never','exec','--json','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--cd',workdir];
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TMP|TEMP|TMPDIR|LANG|CODEX_HOME|CODEX_API_KEY|OPENAI_API_KEY)$/i.test(key)));
  const started=Date.now();try{
   if(outputSchema){const schemaPath=path.join(workdir,'output-schema.json');fs.writeFileSync(schemaPath,JSON.stringify(outputSchema),{mode:0o600});args.push('--output-schema',schemaPath);}
   for(const file of attachments.filter(f=>f.content===undefined)){
    if(!file.mime.startsWith('image/'))throw new Error('Codex accepts images and extracted document text. Upload a text or CSV version of this document.');
    const staged=path.join(workdir,file.filename);fs.copyFileSync(file.file,staged);args.push('--image',staged);
   }
   args.push('-');
   return await new Promise((resolve,reject)=>{
    const child=spawn(bin(),args,{cwd:workdir,env,stdio:['pipe','pipe','ignore'],windowsHide:true});let stdout='',done=false;
    const finish=e=>{if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve({text:codexLastMessage(stdout),model:codexModel(stdout),usage:events(stdout).findLast(e=>e.type==='turn.completed')?.usage||null,duration_ms:Date.now()-started});};
    const timer=setTimeout(()=>{child.kill();finish(new Error('Codex timed out while creating the draft.'));},timeoutMs);
    child.stdin.on('error',()=>{});child.stdin.end(prompt);
    child.stdout.on('data',d=>{stdout+=d.toString();if(stdout.length>8*1024*1024){child.kill();finish(new Error('Codex returned more data than this draft can safely accept.'));}});
    child.on('error',()=>finish(new Error('Could not start Codex CLI.')));child.on('close',code=>code===0?finish():finish(new Error(`Codex exited with code ${code}.`)));
  });}finally{fs.rmSync(workdir,{recursive:true,force:true});}
}
function events(stdout){return String(stdout).split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});}
function codexLastMessage(stdout){const es=events(stdout);for(let i=es.length-1;i>=0;i--){const e=es[i];if(e.type==='item.completed'&&e.item?.type==='agent_message')return String(e.item.text||'');if(e.type==='turn.completed'&&e.last_agent_message)return String(e.last_agent_message);}return '';}
function codexModel(stdout){return events(stdout).find(e=>e.type==='turn.started')?.model||null;}
