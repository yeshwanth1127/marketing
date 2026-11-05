import {requestContext,q} from '../db/index.mjs';
import {resolveClient} from '../clients/tree.mjs';
import {generate} from '../runtime/index.mjs';
import {createProgress} from '../runtime/progress.mjs';

export async function runGenerateJob(job){
 const client=await resolveClient(job.client_id);
 const user={id:job.created_by,role:'marketer'};
 const progress=createProgress(p=>q('UPDATE jobs SET progress=$2,updated_at=now() WHERE id=$1',[job.id,p]));
 try{
  const result=await requestContext.run({via:job.payload?.via||null},()=>generate(user,client,job.payload,{progress}));
  const records=(result.records||[]).map(r=>({id:r.id,kind:r.kind,title:r.title}));
  await progress.flush();
  await q("UPDATE jobs SET status='completed',result=$2,updated_at=now() WHERE id=$1",[job.id,{records}]);
  return result;
 }finally{await progress.flush();}
}
