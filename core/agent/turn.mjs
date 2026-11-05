import {access} from '../auth/index.mjs';
import {q,tx,id,fail,requestContext} from '../db/index.mjs';
import {visibleTools,toolById} from './catalog.mjs';
import {companyMember,missingStep} from './context.mjs';
import {routeMessage,RoutingUnavailable} from './router.mjs';
import {execute,nextQuestion,prefill} from './execute.mjs';
import {buildPack,talkAnswer} from './talk.mjs';
import {askText,cardsFrom,confirmText,fieldQuestion,resultText} from './replies.mjs';
import {buildGuidance,nextActions,wantsGuidance} from './guide.mjs';
import {KEEP,isStrategyDraft,strategyConfirm,strategyDefaults,strategyQuestion} from './strategy-fields.mjs';

const questionFor=(tool,args,field)=>isStrategyDraft(tool,args)?strategyQuestion(field,args):fieldQuestion(field);
const withDefaults=(tool,args,client)=>isStrategyDraft(tool,args)?strategyDefaults(args,client):args;

const SKIP=/^(skip|none|no|n\/a)$/i;
const YES=/^(yes|confirm|save|save it|do it)$/i;

async function dailyLimit(user){
 const row=(await q('SELECT settings FROM users WHERE id=$1',[user.id])).rows[0];
 const limit=Number(row?.settings?.daily_turns)||200;
 const n=(await q(`SELECT count(*)::int n FROM agent_messages m JOIN agent_threads t ON t.id=m.thread_id
  WHERE t.user_id=$1 AND m.role='user' AND m.created_at>=(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`,[user.id])).rows[0].n;
 if(n>=limit)fail('Daily limit of '+limit+' turns reached. It resets at midnight India time.',429);
}

async function lockThread(user,client){
 return tx(async c=>{
  await c.query(`INSERT INTO agent_threads(id,user_id,client_id) VALUES($1,$2,$3)
   ON CONFLICT (user_id, client_id) DO UPDATE SET updated_at=now()`,[id(),user.id,client.id]);
  const got=await c.query(`UPDATE agent_threads SET lock_until=now()+interval '3 minutes', updated_at=now()
   WHERE user_id=$1 AND client_id=$2 AND (lock_until IS NULL OR lock_until<now()) RETURNING *`,[user.id,client.id]);
  return got.rows[0]||null;
 });
}
async function unlock(threadId){await q('UPDATE agent_threads SET lock_until=NULL, updated_at=now() WHERE id=$1',[threadId]);}
async function saveThread(thread,patch){await q('UPDATE agent_threads SET slot=$2, pending=$3, updated_at=now() WHERE id=$1',[thread.id,patch.slot??null,patch.pending??null]);}
async function say(thread,role,body,data={}){const mid=id();await q('INSERT INTO agent_messages(id,thread_id,role,body,data) VALUES($1,$2,$3,$4,$5)',[mid,thread.id,role,body,data]);return {id:mid,role,body,data};}

function finish(decision,extra={}){
 if(decision.type==='refuse'||decision.type==='ask')return {text:decision.question||askText(decision.reason),data:{route:decision}};
 return extra;
}

async function afterFields(thread,tool,args,ctx,send){
 const clean={...args};
 for(const k of Object.keys(clean))if(k.startsWith('__'))delete clean[k];
 const strategy=isStrategyDraft(tool,args);
 if(strategy)for(const k of Object.keys(args))if(k.startsWith('__skip_'))clean[k]=true;
 if((tool.risk==='confirm'||strategy)&&tool.action!=='apply-brand-kit'){
  const pending={id:id(),tool:tool.id,args:clean};
  await saveThread(thread,{slot:null,pending});
  const text=strategy?strategyConfirm(clean):confirmText(tool,clean);
  const message=await say(thread,'assistant',text,{confirm:true,pending:pending.id,tool:tool.id});
  send('confirm',{text,pending:pending.id,tool:tool.id});
  send('result',{text,message});
  return;
 }
 await saveThread(thread,{slot:null,pending:null});
 await runTool(thread,tool,clean,ctx,send);
}

async function sendGuidance(thread,ctx,send,message){
 const {text,actions}=await buildGuidance(ctx.client,ctx.user,ctx.tools,{message});
 await say(thread,'assistant',text,{talk:true,actions});
 send('talk',{text,actions});
 send('result',{text,actions,talk:true});
}

async function runTool(thread,tool,args,ctx,send){
 let result;
 try{result=await execute(tool,args,ctx);}
 catch(e){
  const text=e.message||'That did not work.';
  await say(thread,'assistant',text,{error:true,tool:tool.id});
  send('error',{error:text});
  send('result',{text});
  return;
 }
 if(result?.needsConfirm){
  const pending={id:id(),tool:tool.id,args:result.confirmArgs};
  await saveThread(thread,{slot:null,pending});
  const text=result.summary||confirmText(tool,result.confirmArgs);
  await say(thread,'assistant',text,{confirm:true,pending:pending.id,tool:tool.id,preview:true});
  send('confirm',{text,pending:pending.id});
  send('result',{text});
  return;
 }
 const text=resultText(tool,result,ctx.client);
 const cards=cardsFrom(result);
 const missing=await missingStep(ctx.client);
 const tools=ctx.tools||visibleTools(ctx.user,ctx.client,{companyMember:await companyMember(ctx.user,ctx.client)});
 const actions=nextActions(ctx.client,ctx.user,tools,missing,{waiting:result.rows?.length&&tool.id==='list_items'&&result.kind==='Approval'?result.rows.length:undefined});
 await say(thread,'assistant',text,{tool:tool.id,cards,actions,count:result.count,job_id:result.job_id||null});
 send('result',{text,cards,actions,tool:tool.id,count:result.rows?result.rows.length:result.count,job_id:result.job_id||null});
}

export async function runTurn({user,client,body,send,thread}){
 const message=String(body.message||'').trim();
 const fileIds=Array.isArray(body.file_ids)?body.file_ids.slice(0,10):[];
 const member=await companyMember(user,client);
 const tools=visibleTools(user,client,{companyMember:member});
 const ctx={user,client,tools,fileIds};
 try{
  if(body.tool){
   const tool=toolById(String(body.tool),tools);
   if(!tool)fail('That action is not available');
   let args={...(body.tool_args&&typeof body.tool_args==='object'?body.tool_args:{})};
   args=withDefaults(tool,prefill(tool,args,message,fileIds),client);
   const field=nextQuestion(tool,args);
   if(field){
    await saveThread(thread,{slot:{tool:tool.id,args},pending:null});
    const text=questionFor(tool,args,field);
    const actions=field.key==='file_ids'?[{id:tool.id+'-upload',label:'Upload brand files',tool:tool.id,args,needsUpload:true},{id:tool.id,label:'Use attached files',tool:tool.id,args}]:[{id:tool.id,label:'Continue',tool:tool.id,args}];
    await say(thread,'assistant',text,{ask:field.key,slot:tool.id,actions});
    send('ask',{text,field:field.key});
    send('result',{text});
    return;
   }
   if(tool.risk==='confirm'){
    const pending={id:id(),tool:tool.id,args};
    await saveThread(thread,{slot:null,pending});
    const text=confirmText(tool,args);
    await say(thread,'assistant',text,{confirm:true,pending:pending.id,tool:tool.id});
    send('confirm',{text,pending:pending.id,tool:tool.id});
    send('result',{text});
    return;
   }
   await runTool(thread,tool,args,ctx,send);
   return;
  }
  if(message)await say(thread,'user',message,{file_ids:fileIds});
  const confirm=body.confirm===true||(thread.pending&&YES.test(message));
  const cancel=body.confirm===false||(thread.pending&&/^(no|cancel)$/i.test(message)&&body.confirm!==true);
  if(cancel&&thread.pending){
   await saveThread(thread,{slot:thread.slot,pending:null});
   const text='Cancelled. Nothing was saved.';
   await say(thread,'assistant',text,{});
   send('result',{text});
   return;
  }
  if(confirm&&thread.pending){
   const tool=toolById(thread.pending.tool,tools);
   if(!tool)fail('That action is not available');
   const args=thread.pending.args||{};
   await saveThread(thread,{slot:null,pending:null});
   thread.pending=null;
   await runTool(thread,tool,args,ctx,send);
   return;
  }
  if(thread.slot?.tool){
   const tool=toolById(thread.slot.tool,tools);
   let args={...thread.slot.args};
   args=withDefaults(tool,prefill(tool,args,message,fileIds),client);
   let field=nextQuestion(tool,args);
   if(!field){await afterFields(thread,tool,args,ctx,send);return;}
   if(!message&&!fileIds.length){const text=questionFor(tool,args,field);const actions=field.key==='file_ids'?[{id:tool.id+'-upload',label:'Upload brand files',tool:tool.id,args,needsUpload:true},{id:tool.id,label:'Use attached files',tool:tool.id,args}]:[];await say(thread,'assistant',text,{ask:field.key,slot:tool.id,actions});send('ask',{text});send('result',{text});return;}
   if(!message&&fileIds.length&&field?.key==='file_ids'){await afterFields(thread,tool,args,ctx,send);return;}
   if(!field.required&&SKIP.test(message))args['__skip_'+field.key]=true;
   else if(args['__default_'+field.key]&&KEEP.test(message))args[field.key]=args['__default_'+field.key];
   else if(field.required&&SKIP.test(message)){const text=questionFor(tool,args,field);await say(thread,'assistant',text,{ask:field.key});send('ask',{text});send('result',{text});return;}
   else args[field.key]=message;
   const more=nextQuestion(tool,args);
   if(more){
    await saveThread(thread,{slot:{tool:tool.id,args},pending:null});
    const text=questionFor(tool,args,more);
    await say(thread,'assistant',text,{ask:more.key,slot:tool.id});
    send('ask',{text,field:more.key});
    send('result',{text});
    return;
   }
   await afterFields(thread,tool,args,ctx,send);
   return;
  }
  if(!message&&!fileIds.length)fail('Write a message');
  let decision;
  try{decision=await routeMessage({message:message||'Use the attached file',user,client,tools,missing:await missingStep(client),lastQuestion:''});}
  catch(e){
   if(e instanceof RoutingUnavailable||e.status===409){const text=askText('unavailable');await say(thread,'assistant',text,{});send('result',{text});return;}
   throw e;
  }
  send('route',{type:decision.type,tool:decision.tool?.id||null,reason:decision.reason||null});
  if(decision.type==='guide'){
   await sendGuidance(thread,ctx,send,message);
   return;
  }
  if(decision.type==='talk'){
   const pack=await buildPack(client,user,{threadId:thread.id,message});
   const answer=await talkAnswer(pack,message);
   const actions=nextActions(client,user,tools,await missingStep(client),{});
   await say(thread,'assistant',answer.text,{talk:true,actions});
   send('talk',{text:answer.text,actions});
   send('result',{text:answer.text,actions,talk:true});
   return;
  }
  if(decision.type==='ask'||decision.type==='refuse'){
   if(decision.type==='ask'&&decision.reason==='unclear'&&wantsGuidance(message)){
    await sendGuidance(thread,ctx,send,message);
    return;
   }
   const text=decision.question||askText(decision.reason);
   const actions=decision.type==='ask'?nextActions(client,user,tools,await missingStep(client),{}):[];
   await say(thread,'assistant',text,{route:decision.type,reason:decision.reason,actions});
   send(decision.type==='ask'?'ask':'result',{text});
   if(decision.type==='ask')send('result',{text,actions});
   return;
  }
  const tool=decision.tool;
  let args=withDefaults(tool,prefill(tool,decision.args||{},message,fileIds),client);
  const field=nextQuestion(tool,args);
  if(field){
   await saveThread(thread,{slot:{tool:tool.id,args},pending:null});
   const text=questionFor(tool,args,field);
   await say(thread,'assistant',text,{ask:field.key,slot:tool.id});
   send('ask',{text,field:field.key});
   send('result',{text});
   return;
  }
  if(decision.type==='confirm'){
   const pending={id:id(),tool:tool.id,args};
   await saveThread(thread,{slot:null,pending});
   const text=confirmText(tool,args);
   await say(thread,'assistant',text,{confirm:true,pending:pending.id,tool:tool.id});
   send('confirm',{text,pending:pending.id,tool:tool.id});
   send('result',{text});
   return;
  }
  await runTool(thread,tool,args,ctx,send);
 }finally{await unlock(thread.id);}
}

function stream(work){
 const encoder=new TextEncoder();
 return new Response(new ReadableStream({async start(controller){
  const send=(event,data)=>controller.enqueue(encoder.encode('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n'));
  try{await work(send);}catch(e){send('error',{error:e.message||'The turn failed'});}
  finally{send('done',{});controller.close();}
 }}),{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store'}});
}

export async function agentHttp(req,user){
 const body=await req.json();
 const client=await access(user,body.client_id);
 await dailyLimit(user);
 const thread=await lockThread(user,client);
 if(!thread)fail('A turn is already running on this thread',409);
 return stream(send=>requestContext.run({via:'agent'},()=>runTurn({user,client,body,send,thread})));
}

export async function agentThread(req,user){
 const url=new URL(req.url);
 const client=await access(user,url.searchParams.get('client'));
 const thread=(await q('SELECT * FROM agent_threads WHERE user_id=$1 AND client_id=$2',[user.id,client.id])).rows[0];
 if(!thread)return Response.json({thread:null,messages:[],pending:null});
 const messages=(await q('SELECT id,role,body,data,created_at FROM agent_messages WHERE thread_id=$1 ORDER BY created_at',[thread.id])).rows;
 return Response.json({thread:{id:thread.id,client_id:client.id},messages,pending:thread.pending,slot:thread.slot});
}
