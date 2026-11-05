import {q} from '../db/index.mjs';
import {contextRecords,nodeBrief} from '../clients/tree.mjs';

const own=(records,client,kind,pred=()=>true)=>records.some(r=>r.kind===kind&&r.client_id===client.id&&pred(r));
const any=(records,kind,pred=()=>true)=>records.some(r=>r.kind===kind&&pred(r));

export async function missingStep(client){
 const records=await contextRecords(client);
 const steps=[
  ['brief',client.node_type==='product'?!!client.data?.brief?.description:!!(client.name&&client.industry&&client.city)],
  ['brand kit',any(records,'BrandKit')],
  ['strategy',own(records,client,'Strategy',r=>r.status==='approved')],
  ['monthly plan',own(records,client,'Campaign')],
  ['hooks',own(records,client,'Idea')],
  ['writing',own(records,client,'Asset',r=>(r.data?.type||'copy')==='copy')],
  ['visuals',own(records,client,'Asset',r=>r.data?.type&&r.data.type!=='copy'&&r.data.render_status==='completed')],
  ['review',own(records,client,'Approval',r=>r.status==='approved')],
  ['posting request',own(records,client,'Post')],
  ['numbers',own(records,client,'Metric')],
  ['report and lessons',own(records,client,'Report')||own(records,client,'Learning')],
 ];
 return steps.find(([,ok])=>!ok)?.[0]||'nothing — the loop is in place';
}

export async function companyMember(user,client){
 if(user.role==='admin')return true;
 const m=await q('SELECT 1 FROM memberships WHERE user_id=$1 AND client_id=$2',[user.id,client.company_id||client.id]);
 return !!m.rowCount;
}

export function routerState({message,user,client,missing,lastQuestion}){
 const brief=nodeBrief(client);
 return {message:String(message||'').slice(0,4000),path:brief.path,role:user.role,node:client.name,node_type:client.node_type||'company',missing,last_question:lastQuestion||''};
}
