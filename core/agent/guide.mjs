import {q} from '../db/index.mjs';
import {contextRecords,nodeBrief} from '../clients/tree.mjs';
import {DRAFT_STEPS} from './catalog.mjs';
import {missingStep} from './context.mjs';
import {openrouterChat,openrouterKey,openrouterModel} from './openrouter.mjs';

const STEP_ORDER=[
 ['brief','Client details',null],
 ['brand kit','Brand kit',null],
 ['strategy','Strategy',null],
 ['monthly plan','Monthly plan',null],
 ['hooks','Hooks',null],
 ['writing','Writing',null],
 ['visuals','Visuals',null],
 ['review','Review sign-off',null],
 ['posting request','Posting plan',null],
 ['numbers','Numbers',null],
 ['report and lessons','Report and lessons',null],
];

const own=(records,client,kind,pred=()=>true)=>records.some(r=>r.kind===kind&&r.client_id===client.id&&pred(r));
const any=(records,kind,pred=()=>true)=>records.some(r=>r.kind===kind&&pred(r));

function stepDone(client,records,key){
 if(key==='brief')return client.node_type==='product'?!!client.data?.brief?.description:!!(client.name&&client.industry&&client.city);
 if(key==='brand kit')return any(records,'BrandKit');
 if(key==='strategy')return own(records,client,'Strategy',r=>r.status==='approved');
 if(key==='monthly plan')return own(records,client,'Campaign');
 if(key==='hooks')return own(records,client,'Idea');
 if(key==='writing')return own(records,client,'Asset',r=>(r.data?.type||'copy')==='copy');
 if(key==='visuals')return own(records,client,'Asset',r=>r.data?.type&&r.data.type!=='copy'&&r.data.render_status==='completed');
 if(key==='review')return own(records,client,'Approval',r=>r.status==='approved');
 if(key==='posting request')return own(records,client,'Post');
 if(key==='numbers')return own(records,client,'Metric');
 if(key==='report and lessons')return own(records,client,'Report')||own(records,client,'Learning');
 return false;
}

export function wantsGuidance(message){
 const m=String(message||'').toLowerCase();
 return /what('s| is|s)? left|onboard|what (should|do) i|what to do|where are we|next step|help me|get context|what am i missing|what's waiting|what is waiting|review queue|status of this/i.test(m);
}

function hasTool(tools,id){return tools.some(t=>t.id===id);}

export function nextActions(client,user,tools,missing,extra={}){
 const actions=[];
 const pick=(id,label,args={},message='')=>{if(hasTool(tools,id))actions.push({id,label,tool:id,args,message:message||label});};
 const node=client.node_type||'company';
 if(missing==='brief'&&node==='product')pick('update_details','Fill in the product brief',{});
 else if(missing==='brand kit'){
  pick('client_questionnaire','Copy WhatsApp questionnaire',{},'Write the onboarding questionnaire');
  pick('set_brand_kit','Build brand kit from files',{},'Build the brand kit from uploaded brand files');
 }else if(missing==='strategy')pick('draft','Next: Draft strategy',{step:'strategy'},'Draft the marketing strategy');
 else if(missing==='monthly plan'){
  pick('draft_month','Next: Produce the whole month',{},'Produce this month: ask me how many posts and reels');
  pick('draft','Or draft only the calendar',{step:'plan'},'Draft the monthly content plan');
 }
 else if(missing==='hooks')pick('draft','Next: Suggest hooks',{step:'hooks'},'Draft hook ideas');
 else if(missing==='writing')pick('draft','Next: Draft writing',{step:'writing'},'Draft a caption or script');
 else if(missing==='visuals')pick('make_visual','Next: Make a visual',{type:'image',format:'square'},'Make a square post visual');
 else if(missing==='review')pick('send_for_review','Next: Send something to Review',{});
 else if(missing==='posting request'){
  pick('connect_meta','Connect Meta Ads',{},'Connect Meta Ads for this client');
  pick('plan_post','Next: Plan a post',{platform:'Instagram'},'Plan an Instagram post');
 }
 else if(missing==='numbers')pick('add_number','Next: Add results',{metric:'leads'},'Add a lead number');
 else if(missing==='report and lessons')pick('write_report','Next: Write a results report',{},'Write a results report');
 pick('list_items','See review queue',{kind:'Approval',status:'awaiting_review'},'What is waiting for review?');
 if(extra.waiting>0&&hasTool(tools,'list_items'))pick('list_items','Open '+extra.waiting+' waiting review'+(extra.waiting>1?'s':''),{kind:'Approval',status:'awaiting_review'});
 if(node==='company'&&hasTool(tools,'add_brand'))pick('add_brand','Add a brand',{});
 if(['company','brand'].includes(node)&&hasTool(tools,'add_product'))pick('add_product','Add a product',{});
 return actions.slice(0,6);
}

export async function analyzeClient(client,user){
 const [records,missing,waitingRow]=await Promise.all([
  contextRecords(client),
  missingStep(client),
  q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind='Approval' AND status='awaiting_review'",[client.id]),
 ]);
 const waiting=waitingRow.rows[0].n;
 const steps=STEP_ORDER.map(([key,label])=>({key,label,done:stepDone(client,records,key),next:key===missing}));
 const path=nodeBrief(client).path;
 return {path,role:user.role,missing,waiting,steps,recordsCount:records.length};
}

function checklistText(analysis){
 const lines=analysis.steps.filter(s=>!s.done).slice(0,6).map(s=>(s.next?'→ ':'  ')+s.label+(s.next?' (next)':''));
 const done=analysis.steps.filter(s=>s.done).length;
 return [
  `${analysis.path} · you are ${analysis.role}.`,
  done?`${done} onboarding steps already in place.`:'Nothing is checked off yet.',
  analysis.waiting?`${analysis.waiting} item${analysis.waiting>1?'s':''} waiting for review.`:'Nothing is waiting for review.',
  analysis.missing==='nothing — the loop is in place'?'The main loop is in place. Keep posting, measuring, and learning.':'Next step: '+analysis.missing+'.',
  lines.length?'Still to do:\n'+lines.join('\n'):'',
 ].filter(Boolean).join('\n');
}

export async function buildGuidance(client,user,tools,{message=''}={}){
 const analysis=await analyzeClient(client,user);
 const actions=nextActions(client,user,tools,analysis.missing,{waiting:analysis.waiting});
 const facts=checklistText(analysis);
 let text=facts;
 if(openrouterKey()){
  try{
   text=await openrouterChat({
    model:openrouterModel('talk'),
    prompt:`You are EXORA's assistant for one pinned client. Use only the facts below. In 3–5 short sentences: say what is already done, what is missing next, and what the marketer should do now. Do not invent data. Do not say you will save anything.\nFacts:\n${facts}\nQuestion: ${String(message||'What should I do next?').slice(0,500)}`,
    timeoutMs:35000,
   });
  }catch{/* keep template */}
 }
 return {text,actions,analysis};
}
