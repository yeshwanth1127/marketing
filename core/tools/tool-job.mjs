// Runs a declared skill tool for the app (directly, or from the worker for long media tools):
// resolves uploaded input files for the client, runs the script, stores output media as client files.
import fs from 'node:fs';import path from 'node:path';
import {ROOT,q,tx,id as newId,insert,audit} from '../db/index.mjs';
import {loadModule} from '../runtime/index.mjs';
import {contextRecords} from '../clients/tree.mjs';
import {runScript,scriptSpec} from './runner.mjs';
const bad=(m,s=400)=>{const e=new Error(m);e.status=s;throw e;};
export async function resolveInputFiles(clientId,files){
 const out=[];
 for(const f of files||[]){
  const row=(await q('SELECT * FROM files WHERE id=$1 AND client_id=$2',[f.id,clientId])).rows[0];
  if(!row)bad('Input file not found for this client');
  if(f.accept&&!f.accept.split(',').some(a=>row.mime.startsWith(a.trim())))bad(`${row.name} is not a ${f.accept} file`);
  const full=path.join(ROOT,'.local',row.storage_path);if(!full.startsWith(path.join(ROOT,'.local')+path.sep)||!fs.existsSync(full))bad('Input file is missing on disk');
  out.push({param:f.param,path:full,name:row.name,convert:f.convert});
 }
 return out;
}
export async function runToolForClient({client,user,moduleKey,toolId,args,stdin,files,save}){
 const mod=loadModule(moduleKey,client);const spec=scriptSpec(mod,toolId);
 const records=await contextRecords(client);
 const inputFiles=await resolveInputFiles(client.id,files);
 const r=await runScript({client,user,run:null,records},mod,spec.id,{args,stdin,inputFiles});
 if(!r.ok)bad('The tool did not run: '+r.error);
 const saved=[];
 for(const f of r.files||[]){const fid=newId();await q('INSERT INTO files(id,client_id,name,mime,size,storage_path,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[fid,client.id,f.name,f.mime,fs.statSync(f.path).size,path.relative(path.join(ROOT,'.local'),f.path),user.id]);saved.push({id:fid,name:f.name,mime:f.mime});}
 let record=null;
 if(save){if(!mod.io.writes.includes('Report'))bad('This module cannot save tool reports');record=await tx(c=>insert(c,user,client.id,'Report',(spec.label||spec.id)+' · '+new Date().toISOString().slice(0,10),{tool:spec.id,skill:spec.skill,script:spec.file,output:r.output,files:saved,receipts:[r.receipt],provider:'skill_tool'}));}
 await audit({query:q},user,client.id,'tool:'+spec.id,record?.id||null,{receipt:r.receipt,files:saved.map(f=>f.id)});
 return {output:r.output,receipt:r.receipt,record,files:saved};
}
