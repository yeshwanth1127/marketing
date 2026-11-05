import {choice,noul,TypeSafeClient} from '@typesafe-ai/sdk';
import {GROUPS,draftStepOptions} from './catalog.mjs';
import {openrouterChat,openrouterKey,openrouterModel,parseModelJson,routeAnswers,routePrompt} from './openrouter.mjs';
import {wantsGuidance} from './guide.mjs';

export const MIN_CONFIDENCE=0.7;
export const MIN_MARGIN=0.15;
export const JEV_MODEL=process.env.TYPESAFE_MODEL||'jev-latest';

export class RoutingUnavailable extends Error{
 constructor(message='Routing is unavailable. The steps on the left still work.'){super(message);this.status=409;}
}

let stub=null;
export function setJevStub(fn){stub=fn;}

export function marginOf(probabilities){
 const vals=Object.values(probabilities||{}).map(Number).filter(n=>Number.isFinite(n)).sort((a,b)=>b-a);
 if(!vals.length)return 0;
 if(vals.length===1)return vals[0];
 return vals[0]-vals[1];
}
export function clearEnough(answer){
 if(!answer||answer.choice==null)return false;
 return Number(answer.confidence)>=MIN_CONFIDENCE&&marginOf(answer.probabilities)>=MIN_MARGIN;
}

function stated(answers,key){
 const n=answers[key+'?']?.noul;
 if(n===undefined)return false;
 return n>=0.5;
}

export function stageOneQuestions(groups){
 const options=Object.fromEntries(groups.map(g=>[g,GROUPS[g]||g]));
 return {
  group:{type:'choice',instructions:'Which single group handles this message? Pick talk when they want an explanation, a comparison, or advice and not a change. Pick ask only if you cannot tell.',options:{...options,ask:'The message is unclear. Ask one question.'}},
  act:{type:'noul',instructions:'Is the user asking us to change, save, draft, send, schedule, or spend?'},
  forbidden:{type:'noul',instructions:'Is the user asking to approve, decline, delete, move a client, manage people, change settings, export data, or switch to a different client?'},
  single:{type:'noul',instructions:'Is this one request, rather than two different things to do?'},
 };
}

export function stageTwoQuestions(tools,client){
 const options=Object.fromEntries(tools.map(t=>[t.id,t.description]));
 options.ask='No listed tool fits. Ask one question.';
 const questions={tool:{type:'choice',instructions:'Which one tool should handle this? Pick ask when none of them fits.',options}};
 for(const tool of tools){
  for(const [name,spec] of Object.entries(tool.closed||{})){
   const optionsFor=name==='step'&&tool.id==='draft'?draftStepOptions(client):spec.options;
   questions[tool.id+'.'+name]={type:'choice',instructions:spec.question,options:optionsFor};
   questions[tool.id+'.'+name+'?']={type:'noul',instructions:'Did the user state this: '+spec.question};
  }
 }
 return questions;
}

export function interpret({stage1,stage2,tools}){
 const group=stage1?.group;
 if(Number(stage1?.forbidden?.noul)>0.7)return {type:'refuse',reason:'forbidden'};
 if(Number(stage1?.single?.noul)<0.5)return {type:'ask',reason:'split'};
 if(!clearEnough(group)||group.choice==='ask')return {type:'ask',reason:'unclear'};
 if(group.choice==='talk'){
  if(Number(stage1?.act?.noul)>=0.7)return {type:'ask',reason:'act'};
  return {type:'talk'};
 }
 const groupTools=tools.filter(t=>t.group===group.choice);
 if(!groupTools.length)return {type:'ask',reason:'empty'};
 const pick=stage2?.tool;
 if(!clearEnough(pick)||pick.choice==='ask'||!groupTools.some(t=>t.id===pick.choice))return {type:'ask',reason:'unclear'};
 const tool=groupTools.find(t=>t.id===pick.choice);
 const args={};
 let weakest=pick.confidence;
 for(const name of Object.keys(tool.closed||{})){
  const spec=tool.closed[name];
  const said=stated(stage2,tool.id+'.'+name);
  const arg=stage2[tool.id+'.'+name];
  if(!said){
   if((tool.mustState||[]).includes(name))return {type:'refuse',reason:name==='label'?'label':'unstated',field:name};
   if(!spec.optional)return {type:'ask',reason:'field',question:spec.question};
   continue;
  }
  if(!clearEnough(arg))return {type:'ask',reason:'unclear'};
  args[name]=arg.choice;
  weakest=Math.min(weakest,arg.confidence);
 }
 if((tool.mustState||[]).includes('label')&&!args.label)return {type:'refuse',reason:'label'};
 return {type:tool.risk==='confirm'?'confirm':'run',tool,args,confidence:weakest};
}

function toSdk(questions){
 const out={};
 for(const [key,q] of Object.entries(questions))out[key]=q.type==='noul'?noul(q.instructions):choice(q.instructions,q.options);
 return out;
}

export async function askJev(state,questions){
 if(stub)return stub(state,questions);
 if(openrouterKey()){
  try{
   const text=await openrouterChat({model:openrouterModel('route'),prompt:routePrompt(state,questions),timeoutMs:25000});
   return routeAnswers(questions,parseModelJson(text));
  }catch(e){
   if(e instanceof RoutingUnavailable)throw e;
   throw new RoutingUnavailable('Routing is unavailable ('+(e.message||'OpenRouter')+'). The steps on the left still work.');
  }
 }
 if(!process.env.TYPESAFE_API_KEY)throw new RoutingUnavailable();
 try{
  const client=new TypeSafeClient({apiKey:process.env.TYPESAFE_API_KEY,timeout:20000});
  const {answers}=await client.systemOne({state,model:JEV_MODEL,questions:toSdk(questions)});
  return answers;
 }catch(e){
  if(e instanceof RoutingUnavailable)throw e;
  throw new RoutingUnavailable();
 }
}

export function gateStageOne(stage1,tools){
 const group=stage1?.group;
 if(Number(stage1?.forbidden?.noul)>0.7)return {type:'refuse',reason:'forbidden'};
 if(Number(stage1?.single?.noul)<0.5)return {type:'ask',reason:'split'};
 if(!clearEnough(group)||group.choice==='ask')return {type:'ask',reason:'unclear'};
 if(group.choice==='talk')return Number(stage1?.act?.noul)>=0.7?{type:'ask',reason:'act'}:{type:'talk'};
 if(!tools.some(t=>t.group===group.choice))return {type:'ask',reason:'empty'};
 return {type:'continue',group:group.choice};
}

export async function routeMessage({message,user,client,tools,missing,lastQuestion}){
 const {routerState}=await import('./context.mjs');
 const state=routerState({message,user,client,missing,lastQuestion});
 if(wantsGuidance(message))return {type:'guide'};
 const groups=['talk',...new Set(tools.map(t=>t.group))];
 const stage1=await askJev(state,stageOneQuestions(groups));
 const gated=gateStageOne(stage1,tools);
 if(gated.type!=='continue')return gated;
 const groupTools=tools.filter(t=>t.group===gated.group);
 let questions=stageTwoQuestions(groupTools,client);
 let stage2;
 if(Object.keys(questions).length>28){
  const toolOnly={tool:questions.tool};
  stage2=await askJev(state,toolOnly);
  const winner=groupTools.find(t=>t.id===stage2?.tool?.choice);
  if(winner&&Object.keys(winner.closed||{}).length){
   const more={};
   for(const [k,v] of Object.entries(stageTwoQuestions([winner],client)))if(k!=='tool')more[k]=v;
   if(Object.keys(more).length)Object.assign(stage2,await askJev(state,more));
  }
 }else stage2=await askJev(state,questions);
 return interpret({stage1,stage2,tools});
}
