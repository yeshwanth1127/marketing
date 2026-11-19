import {q} from '../db/index.mjs';
import {contextRecords,nodeBrief} from '../clients/tree.mjs';
import {missingStep} from './context.mjs';
import {openrouterChat,openrouterKey,openrouterModel} from './openrouter.mjs';
import {strategyMeta} from './strategy-fields.mjs';

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
const ownStrategies=(records,client)=>(records||[]).filter(r=>r.kind==='Strategy'&&r.client_id===client.id&&!['rejected','archived'].includes(r.status));

function stepDone(client,records,key){
 if(key==='brief')return client.node_type==='product'?!!client.data?.brief?.description:!!(client.name&&client.industry&&client.city);
 if(key==='brand kit')return any(records,'BrandKit');
 if(key==='strategy')return own(records,client,'Strategy',r=>r.status==='approved'||!!r.data?.finalized_at);
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

export function wantsTalk(message){
 const m=String(message||'').trim().toLowerCase().replace(/[.!?]+$/,'');
 return /^(hi|hello|hey|yo|hola|namaste|vanakkam|good (morning|afternoon|evening)|help)$/i.test(m);
}

function hasTool(tools,id){return tools.some(t=>t.id===id);}

function levelBlock(noun,id,name,gaps){
 return {noun,id,name,gaps,complete:!gaps.length,label:'Finish '+noun+' setup'};
}

export function setupStatus(client,records=[]){
 const node=client.node_type||'company';
 const chain=client.chain||[];
 const hasKit=any(records,'BrandKit');
 const brand=chain.find(n=>n.node_type==='brand')||(node==='brand'?{id:client.id,name:client.name,node_type:'brand'}:null);
 const levels=[];
 if(node==='product'){
  const gaps=[];
  if(!client.data?.brief?.description)gaps.push({key:'brief',label:'product description — what it is, who buys it, and the offer'});
  levels.push(levelBlock('product',client.id,client.name,gaps));
  if(brand){
   const bgaps=[];
   if(!hasKit)bgaps.push({key:'brand kit',label:'brand kit — logo, colours and voice (inherited by this product)'});
   levels.push(levelBlock('brand',brand.id,brand.name,bgaps));
  }
 }else if(node==='brand'){
  const gaps=[];
  if(!(client.name&&client.industry&&client.city))gaps.push({key:'brief',label:'brand name, industry and city'});
  if(!hasKit)gaps.push({key:'brand kit',label:'brand kit — logo, colours and voice'});
  levels.push(levelBlock('brand',client.id,client.name,gaps));
 }else{
  const gaps=[];
  if(!(client.name&&client.industry&&client.city))gaps.push({key:'brief',label:'company name, industry and city'});
  levels.push(levelBlock('client',client.id,client.name,gaps));
 }
 const incomplete=levels.filter(l=>!l.complete);
 return {complete:!incomplete.length,current:levels[0]||null,levels,incomplete};
}

export function setupGaps(client,records=[]){
 return setupStatus(client,records).incomplete.flatMap(l=>l.gaps.map(g=>({...g,noun:l.noun,id:l.id,name:l.name})));
}

export function strategyPath(client,records=[],missing=''){
 const meta=strategyMeta(client);
 const list=ownStrategies(records,client);
 const awaiting=list.find(r=>r.status==='draft'&&r.data?.validation_status==='needs_marketer_confirmation');
 if(awaiting)return {phase:'review',meta,record:awaiting};
 const confirmed=list.find(r=>r.data?.validation_status==='confirmed'&&r.status==='draft'&&!r.data?.finalized_at);
 if(confirmed)return {phase:'save',meta,record:confirmed};
 const status=setupStatus(client,records);
 if(!status.complete)return {phase:'setup',gaps:setupGaps(client,records),incomplete:status.incomplete,meta};
 if(!list.length)return {phase:'draft',meta};
 return {phase:'loop',meta,missing};
}

function pathFromMissing(client,missing){
 const meta=strategyMeta(client);
 if(missing==='brief'||missing==='brand kit')return {phase:'setup',meta,gaps:[{key:missing,label:missing}]};
 if(missing==='strategy')return {phase:'draft',meta};
 return {phase:'loop',meta,missing};
}

export function strategyGuidanceText(client,path,analysis={}){
 const meta=path.meta||strategyMeta(client);
 const name=client.name;
 const workspace=`${analysis.path||name} · ${meta.label} workspace.`;
 if(path.phase==='setup'){
  const blocks=(path.incomplete||[]).map(l=>`${l.label}${l.name&&l.noun!==meta.noun?' · '+l.name:''}\n`+(l.gaps||[]).map(g=>'• '+g.label).join('\n'));
  return [
   workspace,
   `Finish setup before the ${meta.title.toLowerCase()}.`,
   blocks.join('\n\n')||'Required facts for this '+meta.noun+' are incomplete.',
   'Open Client & brand, finish what’s listed, then come back for the strategy questions.',
  ].join('\n\n');
 }
 if(path.phase==='draft'){
  return [
   workspace,
   `Setup is in place for ${name}. Next: draft the ${meta.title.toLowerCase()}.`,
   meta.about,
   `${meta.title.toUpperCase()} · FOUR STAGES\n1 Positioning Audit → 2 Offer Design → 3 Funnel Architect → 4 Growth Plan`,
   `These are ${meta.noun} questions, not portfolio setup. Unspecified answers become assumptions, not facts.`,
  ].join('\n\n');
 }
 if(path.phase==='review'){
  return [
   workspace,
   `A ${meta.title.toLowerCase()} draft is ready for ${name}.`,
   'Review the facts and assumptions, edit anything that is wrong, then accept them. The background agent will finalize the strategy with a dated title you can edit before you submit.',
  ].join('\n\n');
 }
 if(path.phase==='save'){
  return [
   workspace,
   `The ${meta.title.toLowerCase()} for ${name} is ready.`,
   'Claude named it with today’s date. Edit the title if you want, then submit to save and finalize this strategy.',
  ].join('\n\n');
 }
 return null;
}

export function nextActions(client,user,tools,missing,extra={}){
 const actions=[];
 const pick=(id,label,args={},message='')=>{if(hasTool(tools,id))actions.push({id,label,tool:id,args,message:message||label});};
 const node=client.node_type||'company';
 const meta=strategyMeta(client);
 const path=Array.isArray(extra.records)?strategyPath(client,extra.records,missing):pathFromMissing(client,missing);
 if(path.phase==='setup'){
  for(const level of path.incomplete||[{noun:meta.noun,id:client.id,label:'Finish '+meta.noun+' setup'}]){
   actions.push({id:'finish-setup-'+level.noun,label:level.label,href:'/01-onboard',client_id:level.id,message:'Finish the setup of this '+level.noun});
  }
 }else if(path.phase==='draft'){
  pick('draft','Draft '+meta.title,{step:'strategy'},'Draft the '+meta.title.toLowerCase()+' for '+client.name);
 }else if(path.phase==='review'){
  actions.push({id:'review-strategy',label:'Review and edit values',reviewStrategy:true,message:'Review the strategy values'});
 }else if(path.phase==='save'){
  actions.push({id:'submit-strategy',label:'Name and submit strategy',focusSave:true,message:'Edit the dated title and submit'});
 }else{
  const loopMissing=missing==='strategy'&&ownStrategies(extra.records||[],client).length
   ? (STEP_ORDER.slice(3).find(([key])=>!stepDone(client,extra.records||[],key))?.[0]||'nothing — the loop is in place')
   : missing;
  if(loopMissing==='monthly plan')pick('draft','Draft the monthly calendar',{step:'plan'},'Draft the monthly content plan');
  else if(loopMissing==='hooks')pick('draft','Suggest hooks',{step:'hooks'},'Draft hook ideas');
  else if(loopMissing==='writing')pick('draft','Draft writing',{step:'writing'},'Draft a caption or script');
  else if(loopMissing==='visuals')pick('make_visual','Make a visual',{type:'image',format:'square'},'Make a square post visual');
  else if(loopMissing==='review')pick('send_for_review','Send something to Review',{});
  else if(loopMissing==='posting request'){
   pick('connect_meta','Connect Meta Ads',{},'Connect Meta Ads for the workspace');
   pick('plan_post','Plan a post',{platform:'Instagram'},'Plan an Instagram post');
  }
  else if(loopMissing==='numbers')pick('add_number','Add results',{metric:'leads'},'Add a lead number');
  else if(loopMissing==='report and lessons')pick('write_report','Write a results report',{},'Write a results report');
  if(extra.waiting>0&&hasTool(tools,'list_items'))pick('list_items','Open '+extra.waiting+' waiting review'+(extra.waiting>1?'s':''),{kind:'Approval',status:'awaiting_review'});
  if(node==='company'&&hasTool(tools,'add_brand'))pick('add_brand','Add a brand',{});
  if(['company','brand'].includes(node)&&hasTool(tools,'add_product'))pick('add_product','Add a product',{});
 }
 return actions.slice(0,6);
}

export async function analyzeClient(client,user){
 const [records,missing,waitingRow]=await Promise.all([
  contextRecords(client),
  missingStep(client),
  q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind='Approval' AND status='awaiting_review'",[client.id]),
 ]);
 const waiting=waitingRow.rows[0].n;
 const meta=strategyMeta(client);
 const path=strategyPath(client,records,missing);
 const steps=STEP_ORDER.map(([key,label])=>({key,label:key==='strategy'?meta.title:label,done:stepDone(client,records,key),next:key===missing}));
 return {path:nodeBrief(client).path,role:user.role,missing,waiting,steps,records,pathToStrategy:path,recordsCount:records.length};
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
 const path=analysis.pathToStrategy;
 const actions=nextActions(client,user,tools,analysis.missing,{waiting:analysis.waiting,records:analysis.records});
 const focused=strategyGuidanceText(client,path,analysis);
 let text=focused||checklistText(analysis);
 if(!focused&&openrouterKey()){
  try{
   const meta=strategyMeta(client);
   text=await openrouterChat({
    model:openrouterModel('talk'),
    prompt:`You are EXORA's guided assistant for one pinned workspace: ${analysis.path} (${meta.label}). Portfolio questions collect facts about this ${meta.noun}. Strategy questions build a ${meta.title.toLowerCase()} for this ${meta.noun} only — not for a sibling brand or product. Use only the facts below. In 3–5 short sentences: say what is already done, what is missing next, and what the marketer should do now. Do not invent data. Do not say you will save anything.\nFacts:\n${text}\nQuestion: ${String(message||'What should I do next?').slice(0,500)}`,
    timeoutMs:35000,
   });
  }catch{/* keep template */}
 }
 return {text,actions,analysis};
}
