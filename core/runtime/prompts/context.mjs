import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT,q,fail} from '../../db/index.mjs';

const uuid=/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','text/plain':'txt','text/csv':'csv','application/pdf':'pdf'};
const exec=promisify(execFile);
const readPdf=`import sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
out = ''
for page in reader.pages[:5]:
    if len(out) >= 6000:
        break
    out += (page.extract_text() or '')[:6000-len(out)]
sys.stdout.buffer.write(out.encode('utf-8'))
`;

export async function promptAttachments(client,ids=[]){
 if(!Array.isArray(ids)||ids.length>5||ids.some(id=>typeof id!=='string'||!uuid.test(id)))fail('Choose up to five workspace attachments.');
 if(!ids.length)return [];
 ids=[...new Set(ids)];
 const rows=(await q('SELECT id,name,mime,size,storage_path FROM files WHERE client_id=$1 AND id=ANY($2::uuid[])',[client.id,ids])).rows;
 if(rows.length!==ids.length)fail('A selected attachment is unavailable in this workspace.',404);
 const root=await fs.realpath(path.join(ROOT,'.local','uploads'));
 return Promise.all(ids.map(async id=>{
  const row=rows.find(x=>x.id===id),ext=extensions[row.mime];
  if(!ext||Number(row.size)>5*1024*1024)fail('Attachments must be PNG, JPEG, WebP, PDF, text or CSV and under 5 MB.');
  const file=await fs.realpath(path.resolve(ROOT,'.local',row.storage_path));
  const relative=path.relative(root,file);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))fail('Attachment is unavailable.',404);
  let content;
  if(['txt','csv'].includes(ext)){
   const fd=await fs.open(file,'r');
   try{const buf=Buffer.alloc(6000);const {bytesRead}=await fd.read(buf);content=buf.subarray(0,bytesRead).toString('utf8');}finally{await fd.close();}
  }
  if(ext==='pdf'){
   try{
    const result=await exec(process.env.EXORA_PYTHON||process.env.PYTHON_BIN||'python3',['-I','-c',readPdf,file],{timeout:10000,maxBuffer:30000,encoding:'utf8',windowsHide:true});
    content=result.stdout.trim()||undefined;
   }catch{/* Claude can read the original PDF when local text extraction is unavailable. */}
  }
  return {id,name:row.name,mime:row.mime,filename:id+'.'+ext,file,content};
 }));
}

export async function promptHistory(user,client,threadId){
 if(!threadId)return [];
 if(typeof threadId!=='string'||!uuid.test(threadId))fail('Invalid conversation.');
 const rows=(await q(`SELECT m.id,m.role,m.body AS content,m.created_at FROM agent_messages m
 JOIN agent_threads t ON t.id=m.thread_id WHERE t.id=$1 AND t.client_id=$2 AND t.user_id=$3
 AND m.role IN ('user','assistant') ORDER BY m.created_at DESC,m.id DESC LIMIT 24`,[threadId,client.id,user.id])).rows;
 return rows.reverse();
}
