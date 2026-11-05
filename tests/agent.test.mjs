import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handle} from '../core/api.mjs';
import {q,pool,id} from '../core/db/index.mjs';
import {allTools,visibleTools} from '../core/agent/catalog.mjs';
import {assertIntakeSamples} from '../core/agent/intake.mjs';
import {gateStageOne,interpret,setJevStub} from '../core/agent/router.mjs';
import {setOpenRouterOff} from '../core/agent/openrouter.mjs';
import {buildPack,setClaudeGate,setTalkRunner,talkPrompt,talkSpawnArgs as talkArgs} from '../core/agent/talk.mjs';
import {runGenerateJob} from '../core/agent/jobs.mjs';
import {resolveClient} from '../core/clients/tree.mjs';
import {wantsGuidance} from '../core/agent/guide.mjs';
import {runStrategyPipeline} from '../core/runtime/strategy.mjs';
import {createProgress} from '../core/runtime/progress.mjs';
setOpenRouterOff(true);
process.env.EXORA_AGENT_DRAFT='local_template';
const fixtures=JSON.parse(fs.readFileSync(new URL('./agent-fixtures.json',import.meta.url),'utf8'));
let cookie,client,stamp=Date.now();
const toolsFor=(role='marketer')=>allTools().filter(t=>t.roles.includes(role));
function picked(name,confidence=0.95){return {choice:name,confidence,probabilities:{[name]:0.9,ask:0.04}};}
function stage1(group,{act=0.08,forbidden=0.04,single=0.96,confidence=0.95}={}){return {group:picked(group,confidence),act:{noul:act},forbidden:{noul:forbidden},single:{noul:single}};}
function stage2(tool,args={},omit=[]){
 const out={tool:picked(tool)};
 for(const [key,value] of Object.entries(args)){out[tool+'.'+key]=picked(value);out[tool+'.'+key+'?']={noul:omit.includes(key)?0.1:0.97};}
 return out;
}
function answersFor(fix){
 return async (state,questions)=>{
  if(questions.group)return stage1(fix.group,{forbidden:fix.forbidden??0.04,confidence:fix.confidence??0.95,act:fix.act??0.08});
  return stage2(fix.tool,fix.args||{},fix.omitStated||[]);
 };
}
async function request(route,body,token=cookie){const r=await handle(new Request('http://127.0.0.1:3100/api/'+route,{method:body?'POST':'GET',headers:{cookie:token||'',origin:'http://127.0.0.1:3100',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}));return r;}
async function events(res){
 if(!(res.headers.get('content-type')||'').includes('text/event-stream'))return {status:res.status,json:await res.json(),events:[]};
 const text=await res.text();
 const parsed=text.split('\n\n').map(block=>{const event=block.match(/event: (.+)/)?.[1];const data=block.match(/data: (.+)/)?.[1];return event&&data?{event,data:JSON.parse(data)}:null;}).filter(Boolean);
 const result=parsed.find(e=>e.event==='result')?.data||parsed.find(e=>e.event==='talk')?.data;
 return {status:res.status,events:parsed,result,error:parsed.find(e=>e.event==='error')?.data};
}
async function turn(body,token=cookie){return events(await request('agent/turn',{client_id:client,...body},token));}
after(async()=>{setJevStub(null);setTalkRunner(null);setClaudeGate(null);setOpenRouterOff(false);await pool.end();});

test('Intake samples pass the real validators',()=>{assert.doesNotThrow(()=>assertIntakeSamples());});
test('Guidance questions skip vague routing',()=>{
 assert.equal(wantsGuidance('what is left for this clients onboarding'),true);
 assert.equal(wantsGuidance('why are leads dropping?'),false);
});
test('Talk spawn uses an empty tool list and the small model',()=>{
 const args=talkArgs();
 assert.equal(args[0],'--model');assert.equal(args[2],'--tools');assert.equal(args[3],'');
 assert.ok(args.includes('--strict-mcp-config'));
 assert.equal(args.at(-1),'{"mcpServers":{}}');
 assert.equal(args.join(' ').includes('mcp__exora'),false);
 assert.match(talkPrompt({pinned:{name:'Noolrun'},metrics:{rows:[]}},'why'),/only the JSON pack/);
});
test('Fixtures route to the expected tool, including Hindi and Hinglish',()=>{
 const tools=toolsFor('admin');
 for(const fix of fixtures){
  const decision=fix.expect==='ask'||fix.expect==='refuse'||fix.group==='talk'
   ?interpret({stage1:stage1(fix.group,{forbidden:fix.forbidden??0.04,confidence:fix.confidence??0.95,act:fix.act??0.05}),stage2:stage2(fix.tool||'list_items',fix.args||{},fix.omitStated||[]),tools})
   :interpret({stage1:stage1(fix.group),stage2:stage2(fix.tool,fix.args),tools});
  if(fix.group==='talk'&&!fix.expect)assert.equal(decision.type,'talk',fix.id);
  else if(fix.expect)assert.equal(decision.type,fix.expect,fix.id);
  else{assert.equal(decision.tool.id,fix.tool,fix.id);for(const [k,v] of Object.entries(fix.args))assert.equal(String(decision.args[k]),String(v),fix.id+' '+k);}
 }
 const low=gateStageOne(stage1('read',{confidence:0.2}),tools);
 assert.equal(low.type,'ask');
});
test('The catalog has no approve, delete, move, people, settings, export, or passthrough',()=>{
 const banned=/approve|decline|delete|move-client|create-user|disable-user|settings|export|passthrough|switch/i;
 for(const t of allTools()){assert.equal(banned.test(t.id+' '+(t.action||'')),false,t.id);assert.ok(['read','draft','confirm'].includes(t.risk));}
 assert.ok(allTools().some(t=>t.action==='run-tool'));
});
test('Sign in and create the agent client',async()=>{
 const login=await request('auth/login',{email:'admin@exora.local',password:'ExoraLocal!2026'},'');
 assert.equal(login.status,200);
 cookie=login.headers.get('set-cookie').split(';')[0];
 const r=await request('action',{action:'create-client',name:'Agent '+stamp,industry:'Apparel',city:'Bengaluru',languages:['English','Hindi'],website:'https://keep.example',notes:'keep me'});
 assert.equal(r.status,200);client=(await r.json()).id;
});
test('Onboarding guidance returns analysis and action buttons',async()=>{
 setOpenRouterOff(true);
 setJevStub(()=>{throw new Error('router should not run');});
 const res=await turn({message:'what is left for onboarding?'});
 setJevStub(null);
 assert.equal(res.error,undefined,JSON.stringify(res));
 assert.match(res.result.text,/next step|brand kit|strategy|review|loop|onboard/i,res.result.text);
 assert.ok(Array.isArray(res.result.actions)&&res.result.actions.length>=2,JSON.stringify(res.result.actions));
 assert.ok(res.result.actions.some(a=>a.tool==='set_brand_kit'));
});
test('A missing website or notes field does not wipe the saved values',async()=>{
 const r=await request('action',{client_id:client,action:'update-client',name:'Agent '+stamp,industry:'Apparel',city:'Bengaluru',languages:['English']});
 assert.equal(r.status,200,JSON.stringify(await r.clone().json()));
 const row=(await q('SELECT data FROM clients WHERE id=$1',[client])).rows[0];
 assert.equal(row.data.website,'https://keep.example');
 assert.equal(row.data.notes,'keep me');
});
test('Low confidence never calls a handler',async()=>{
 const before=(await q('SELECT count(*)::int n FROM records WHERE client_id=$1',[client])).rows[0].n;
 setJevStub(answersFor({group:'read',confidence:0.2,message:'hmm'}));
 const res=await turn({message:'hmm'});
 assert.equal(res.result.text.includes('Which do you want'),true,JSON.stringify(res));
 assert.equal((await q('SELECT count(*)::int n FROM records WHERE client_id=$1',[client])).rows[0].n,before);
});
test('A client id in the message is ignored and the pinned queue is used',async()=>{
 const other=(await request('action',{action:'create-client',name:'Other '+stamp,industry:'Retail',city:'Pune'})).json().then(d=>d.id);
 const otherId=await other;
 await q("INSERT INTO records(id,client_id,kind,title,data,status) VALUES($1,$2,'Approval','Foreign','{}','awaiting_review')",[id(),otherId]);
 await q("INSERT INTO records(id,client_id,kind,title,data,status) VALUES($1,$2,'Approval','Ours','{}','awaiting_review')",[id(),client]);
 let seen='';
 setJevStub(async (state,questions)=>{seen=state.message;return answersFor(fixtures.find(f=>f.id==='waiting-hi'))(state,questions);});
 const res=await turn({message:'रिव्यू में क्या रुका है? '+otherId});
 assert.equal(seen.includes('रिव्यू'),true);
 assert.equal(res.result.text.includes('1 waiting'),true,res.result.text);
 assert.equal(res.result.text.includes('Foreign'),false);
});
test('Talk quotes stored leads and writes no record',async()=>{
 await request('action',{client_id:client,action:'save-record',kind:'Metric',title:'leads',data:{metric:'leads',value:4242,label:'real',source:'sheet',date:'2026-11-01'}});
 setJevStub(answersFor({group:'talk',message:'why'}));
 setTalkRunner(async pack=>`Leads ${pack.metrics.rows.find(r=>r.value===4242).label}: 4242.`);
 const before=(await q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind<>'Metric'",[client])).rows[0].n;
 const res=await turn({message:'why are leads dropping?'});
 assert.equal(res.result.text.includes('4242'),true,res.result?.text||JSON.stringify(res));
 assert.match(res.result.text,/real/);
 assert.equal((await q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind<>'Metric'",[client])).rows[0].n,before);
 const via=(await q("SELECT via FROM audit WHERE client_id=$1 AND action='create:Metric' ORDER BY id DESC LIMIT 1",[client])).rows[0];
 assert.equal(via.via,null);
});
test('Pongal advice uses the festival file and saves nothing',async()=>{
 await q("UPDATE clients SET data=data||'{\"region\":\"Tamil Nadu\"}' WHERE id=$1",[client]);
 setJevStub(answersFor({group:'talk'}));
 setTalkRunner(async pack=>{const hit=pack.seasonal.events.find(e=>/pongal/i.test(e.name));return `Pongal is ${hit.date}. This is a suggestion, not a saved post.`;});
 const before=(await q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind IN ('Campaign','Asset')",[client])).rows[0].n;
 const res=await turn({message:'what should we post for Pongal?'});
 assert.match(res.result.text,/2027-01-15/);
 assert.equal((await q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind IN ('Campaign','Asset')",[client])).rows[0].n,before);
});
test('A pack pinned elsewhere does not load another client’s rows',async()=>{
 const bId=(await (await request('action',{action:'create-client',name:'SiblingCo '+stamp,industry:'Retail',city:'Mysuru'})).json()).id;
 await q("INSERT INTO records(id,client_id,kind,title,data,status) VALUES($1,$2,'Metric','secret','{\"metric\":\"leads\",\"value\":7777,\"label\":\"real\",\"source\":\"x\",\"date\":\"2026-11-02\"}','recorded')",[id(),bId]);
 const pack=await buildPack(await resolveClient(client),{id:'u',role:'admin'});
 assert.equal(JSON.stringify(pack).includes('7777'),false);
 assert.equal(JSON.stringify(pack).includes('4242'),true);
});
test('Product-only tools omit company writes and sibling rows',async()=>{
 const company=client;
 const brand=(await (await request('action',{client_id:company,action:'create-client',parent_id:company,node_type:'brand',name:'Studio '+stamp,industry:'Apparel',city:'Bengaluru'})).json()).id;
 const a=(await (await request('action',{client_id:brand,action:'create-client',parent_id:brand,node_type:'product',name:'Shirt '+stamp,industry:'Apparel',city:'Bengaluru',brief:{description:'A shirt'}})).json()).id;
 const b=(await (await request('action',{client_id:brand,action:'create-client',parent_id:brand,node_type:'product',name:'Saree '+stamp,industry:'Apparel',city:'Bengaluru',brief:{description:'A saree',evidence:[{claim:'ONLY-LEHENGA',source:'note',date:'2026-01-01'}]}})).json()).id;
 await q("INSERT INTO records(id,client_id,kind,title,data,status) VALUES($1,$2,'Metric','a','{\"metric\":\"leads\",\"value\":111,\"label\":\"real\",\"source\":\"a\",\"date\":\"2026-11-03\"}','recorded')",[id(),a]);
 await q("INSERT INTO records(id,client_id,kind,title,data,status) VALUES($1,$2,'Metric','b','{\"metric\":\"leads\",\"value\":222,\"label\":\"real\",\"source\":\"b\",\"date\":\"2026-11-03\"}','recorded')",[id(),b]);
 const email=`product.${stamp}@test.local`;
 assert.equal((await request('action',{action:'create-user',name:'Product',email,password:'TestPassword!2026',role:'marketer',client_ids:[a]})).status,200);
 const pc=(await request('auth/login',{email,password:'TestPassword!2026'},'')).headers.get('set-cookie').split(';')[0];
 const node=await resolveClient(a);
 const user=(await q('SELECT id,role FROM users WHERE email=$1',[email])).rows[0];
 const visible=visibleTools(user,node,{companyMember:false});
 for(const id of ['create_company','add_brand','add_product','monthly_invoice'])assert.equal(visible.some(t=>t.id===id),false,id);
 assert.equal((await request('bootstrap?client='+b,undefined,pc)).status,403);
 const pack=await buildPack(node,user);
 const raw=JSON.stringify(pack);
 assert.equal(raw.includes('222'),false);
 assert.equal(raw.includes('ONLY-LEHENGA'),false);
 assert.equal(raw.includes('111'),true);
});
test('Brand preview reads a file and does not save until confirmed',async()=>{
 const form=new FormData();form.set('client_id',client);form.set('file',new File(['Use #112233 and #abcdef'],'guide.txt',{type:'text/plain'}));
 const up=await handle(new Request('http://127.0.0.1:3100/api/upload',{method:'POST',headers:{cookie,origin:'http://127.0.0.1:3100'},body:form}));
 assert.equal(up.status,200,await up.clone().text());
 const file=await up.json();
 const before=(await q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind='BrandKit'",[client])).rows[0].n;
 const preview=await (await request('action',{client_id:client,action:'apply-brand-kit',file_ids:[file.id],preview:true})).json();
 assert.ok((preview.colors||preview.data?.colors).includes('#112233'));
 assert.equal((await q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind='BrandKit'",[client])).rows[0].n,before);
});
test('Chat can onboard two brands and two products that match the button path',async()=>{
 const ask=async(fix,pinned,message,confirm=false)=>{setJevStub(answersFor(fix));return events(await request('agent/turn',{client_id:pinned,message,confirm:confirm||undefined}));};
 const fill=async(fix,pinned,fields)=>{
  let res=await ask(fix,pinned,'please add it');
  for(const value of fields){assert.match(res.result?.text||'',/\?/,JSON.stringify(res));res=await ask(fix,pinned,value);}
  assert.match(res.result.text,/Save this/);
  res=await ask(fix,pinned,'yes',true);
  assert.equal(res.error,undefined,JSON.stringify(res.error||res.result));
  return res.result.cards[0].id;
 };
 const company=await fill({group:'clients',tool:'create_company',args:{}},client,['Fabblen '+stamp,'Apparel','Bengaluru']);
 const studio=await fill({group:'clients',tool:'add_brand',args:{}},company,['Studio line']);
 const festive=await fill({group:'clients',tool:'add_brand',args:{}},company,['Festive line']);
 const shirt=await fill({group:'clients',tool:'add_product',args:{}},studio,['Linen shirt','A washed linen shirt']);
 const saree=await fill({group:'clients',tool:'add_product',args:{}},festive,['Silk saree','A silk saree for festivals']);
 const rows=(await q('SELECT id,name,node_type,parent_id,industry,city,data FROM clients WHERE id=ANY($1)',[[company,studio,festive,shirt,saree]])).rows;
 const by=Object.fromEntries(rows.map(r=>[r.id,r]));
 assert.equal(by[company].node_type,null);
 assert.equal(by[studio].node_type,'brand');assert.equal(by[studio].parent_id,company);assert.equal(by[studio].industry,'Apparel');assert.equal(by[studio].city,'Bengaluru');
 assert.equal(by[festive].parent_id,company);
 assert.equal(by[shirt].node_type,'product');assert.equal(by[shirt].parent_id,studio);assert.equal(by[shirt].data.brief.description,'A washed linen shirt');
 assert.equal(by[saree].parent_id,festive);assert.equal(by[saree].data.brief.description,'A silk saree for festivals');
 const via=(await q("SELECT via FROM audit WHERE action='create:Client' AND entity_id=$1",[company])).rows[0];
 assert.equal(via.via,'agent');
});
test('Draft and visual tools only queue jobs',async()=>{
 const copy=await (await request('action',{client_id:client,action:'generate',module:'05-content',provider:'local_template',brief:'A linen shirt'})).json();
 const asset=copy.records[0];
 setJevStub(answersFor({group:'draft',tool:'draft',args:{step:'writing'}}));
 let res=await turn({message:'draft a caption'});
 assert.match(res.result.text,/What is this draft for/);
 setJevStub(()=>{throw new Error('should not route');});
 res=await turn({message:'More shop visits this week'});
 assert.match(res.result.text,/Job /,res.result.text);
 const job=(await q("SELECT * FROM jobs WHERE id=$1",[res.result.job_id])).rows[0];
 assert.equal(job.type,'generate');
 assert.equal((await q("SELECT count(*)::int n FROM records WHERE data->>'run_id' IS NOT NULL AND client_id=$1 AND title ILIKE '%shop%'",[client])).rows[0].n,0);
 const done=await runGenerateJob(job);
 assert.ok(done.records.length>=1);
 setJevStub(answersFor({group:'visuals',tool:'make_visual',args:{type:'image',format:'square',composer:'template'}}));
 res=await turn({message:'make a square post for '+asset.id});
 if(res.result.text.includes('?'))res=await turn({message:asset.id});
 assert.match(res.result.text,/Job /);
 const render=(await q('SELECT type FROM jobs WHERE id=$1',[res.result.job_id])).rows[0];
 assert.equal(render.type,'render');
});
test('Strategy stages run in order and Growth Plan reads the earlier results',async()=>{
 const mod={skills:['positioning-audit','competitor-positioning','offers','funnel-architect','growth-plan'].map(name=>({name,source:'X'}))};
 const calls=[];let saved=null;
 const progress=createProgress(p=>{saved=p;});
 const runner=async(ctx,m,skills,sample,opts)=>{calls.push({skills:skills.map(s=>s.name),seen:Object.keys(ctx.workspace.foundations)});opts.onEvent({type:'read',skill:skills[0].name,text:'Reading '+skills[0].name});return {outputs:JSON.parse(JSON.stringify(sample)),receipts:[]};};
 const r=await runStrategyPipeline({client:{name:'Acme',settings:{}},user:{},run:'r',records:[],workspace:{},mod,input:{inputs:{objective:'Leads',proof:'No approved proof yet'}},sample:[{kind:'Strategy',title:'t',data:{}}],progress,runner});
 await progress.flush();
 assert.deepEqual(calls.map(c=>c.skills[0]),['positioning-audit','offers','funnel-architect','growth-plan']);
 assert.deepEqual(calls.at(-1).seen,['positioning','offer','funnel']);
 assert.deepEqual(Object.keys(r.outputs[0].data.foundations),['positioning','offer','funnel']);
 assert.equal(r.outputs[0].data.inputs_ledger.find(x=>x.field==='proof').status,'no_proof');
 assert.equal(r.outputs[0].data.inputs_ledger.find(x=>x.field==='budget_range').status,'not_provided');
 assert.deepEqual(saved.stages.map(s=>s.status),['done','done','done','done']);
 await assert.rejects(runStrategyPipeline({client:{name:'A',settings:{}},mod,input:{},workspace:{},sample:[{kind:'Strategy',title:'t',data:{}}],runner:async(c,m,sk)=>{if(sk[0].name==='offers')throw new Error('boom');return {outputs:[{kind:'Strategy',title:'x',data:{}}]};}}),/Stage 2 \(Offer design\) failed/);
 // Resume: stages 1-2 finished before a failure at stage 3; the retry starts at stage 3.
 const failing=createProgress(()=>{});let n=0;
 await assert.rejects(runStrategyPipeline({client:{name:'A',settings:{}},mod,input:{},workspace:{},sample:[{kind:'Strategy',title:'t',data:{}}],progress:failing,runner:async(c,m,sk)=>{n++;if(sk[0].name==='funnel-architect')throw new Error('timeout');return {outputs:[{kind:'Strategy',title:'x',data:{note:sk[0].name}}],receipts:['rc'+n]};}}),/Stage 3/);
 await failing.flush();
 assert.deepEqual(Object.keys(failing.state.results),['positioning','offer']);
 const again=[];const resumed=createProgress(()=>{});
 const r2=await runStrategyPipeline({client:{name:'A',settings:{}},mod,input:{resume:{from_job:'old',results:JSON.parse(JSON.stringify(failing.state.results))}},workspace:{},sample:[{kind:'Strategy',title:'t',data:{}}],progress:resumed,runner:async(c,m,sk)=>{again.push(sk[0].name);return {outputs:[{kind:'Strategy',title:'x',data:{}}],receipts:[]};}});
 assert.deepEqual(again,['funnel-architect','growth-plan']);
 assert.equal(r2.outputs[0].data.foundations.offer.note,'offers');
 assert.deepEqual(r2.receipts,['rc1','rc2']);
 assert.deepEqual(resumed.state.stages.map(s=>s.reused||false),[true,true,false,false]);
});
test('Strategy chat asks inputs in stage order and confirms before the staged run',async()=>{
 setJevStub(answersFor({group:'draft',tool:'draft',args:{step:'strategy'}}));
 let res=await turn({message:'create the marketing strategy'});
 assert.match(res.result.text,/Question 1 of 18/,res.result.text);
 setJevStub(()=>{throw new Error('should not route');});
 const asked=[];
 for(let i=0;i<30&&!/Start the strategy\?/.test(res.result.text);i++){
  const n=Number(res.result.text.match(/Question (\d+) of/)[1]);asked.push(n);
  res=await turn({message:/Reply keep/.test(res.result.text)?'keep':/Reply skip/.test(res.result.text)?'skip':'Answer '+n});
 }
 assert.deepEqual(asked,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,17,18]);
 assert.match(res.result.text,/1\. Positioning audit[\s\S]*4\. Growth plan/);
 assert.match(res.result.text,/Not provided[^\n]*competitors/);
 res=await turn({confirm:true});
 assert.match(res.result.text,/Job /,res.result.text);
 const job=(await q('SELECT * FROM jobs WHERE id=$1',[res.result.job_id])).rows[0];
 assert.equal(job.payload.module,'02-strategy');
 assert.equal(job.payload.inputs.objective,'Answer 1');
 assert.equal(job.payload.inputs.competitors,undefined);
 const done=await runGenerateJob(job);
 assert.ok(done.records.length>=1);
});
test('Planning a post creates only a review item',async()=>{
 const asset=(await q("SELECT id FROM records WHERE client_id=$1 AND kind='Asset' AND status='draft' AND coalesce(data->>'type','copy') NOT IN ('image','carousel','video','audio') ORDER BY created_at DESC LIMIT 1",[client])).rows[0];
 const sub=await (await request('action',{client_id:client,action:'submit-approval',id:asset.id})).json();
 const email=`rev.${stamp}@test.local`;
 await request('action',{action:'create-user',name:'Rev',email,password:'TestPassword!2026',role:'reviewer',client_ids:[client]});
 const rc=(await request('auth/login',{email,password:'TestPassword!2026'},'')).headers.get('set-cookie').split(';')[0];
 assert.equal((await request('action',{client_id:client,action:'decide-approval',id:sub.id,decision:'approved',reason:'ok'},rc)).status,200);
 const when=new Date(Date.now()+86400000).toISOString();
 setJevStub(answersFor({group:'posting',tool:'plan_post',args:{platform:'Instagram'}}));
 let res=await turn({message:'schedule it'});
 assert.match(res.result.text,/\?/);
 res=await turn({message:asset.id});
 assert.match(res.result.text,/\?/);
 res=await turn({message:when});
 assert.match(res.result.text,/Save this/);
 const postsBefore=(await q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind='Post' AND status='published'",[client])).rows[0].n;
 res=await turn({message:'yes',confirm:true});
 assert.equal(postsBefore,0);
 assert.match(res.result.text,/[Rr]eview/,res.result.text);
 const post=(await q("SELECT status FROM records WHERE client_id=$1 AND kind='Post' ORDER BY created_at DESC LIMIT 1",[client])).rows[0];
 assert.equal(post.status,'awaiting_review');
});
test('A metric label is refused unless the marketer stated it',async()=>{
 const before=(await q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind='Metric'",[client])).rows[0].n;
 setJevStub(answersFor(fixtures.find(f=>f.id==='label')));
 const res=await turn({message:'add 12 leads'});
 assert.match(res.result.text,/real, estimated, or inferred/);
 assert.equal((await q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind='Metric'",[client])).rows[0].n,before);
});
test('The second turn keeps the slot and a parallel turn is refused',async()=>{
 setJevStub(async (state,questions)=>{if(questions.group){await new Promise(r=>setTimeout(r,400));return stage1('talk');}return {};});
 setTalkRunner(async ()=>'held');
 const first=request('agent/turn',{client_id:client,message:'hold this thread'});
 for(let i=0;i<50;i++){const row=await q('SELECT lock_until FROM agent_threads WHERE client_id=$1 AND user_id=(SELECT id FROM users WHERE email=$2)',[client,'admin@exora.local']);if(row.rows[0]?.lock_until&&new Date(row.rows[0].lock_until)>new Date())break;await new Promise(r=>setTimeout(r,20));}
 const second=await request('agent/turn',{client_id:client,message:'also this'});
 assert.equal(second.status,409);
 await events(await first);
});
test('Invoices are company-level and the GST is computed on the server',async()=>{
 const product=(await q("SELECT id FROM clients WHERE name=$1",['Linen shirt'])).rows[0];
 const denied=await request('action',{client_id:product.id,action:'monthly-invoice',amount:1000});
 assert.equal(denied.status,400);
 const ok=await (await request('action',{client_id:client,action:'monthly-invoice',amount:1000,gst:18,number:'EX-TEST',period:'2026-11'})).json();
 const row=(await q('SELECT data FROM records WHERE id=$1',[ok.id])).rows[0];
 assert.equal(row.data.tax,180);
 assert.equal(row.data.total,1180);
});
test('Claude disconnected: talk asks to connect, and a read still answers',async()=>{
 setClaudeGate(()=>({connected:false}));setTalkRunner(null);
 setJevStub(answersFor({group:'talk'}));
 let res=await turn({message:'what should we try next?'});
 assert.match(res.result.text,/Connect Claude in Settings/);
 setJevStub(answersFor(fixtures.find(f=>f.id==='waiting')));
 res=await turn({message:"what's waiting for review?"});
 assert.match(res.result.text,/waiting for review/);
});
test('Routing is unavailable without a key, and there is no tool-picking fallback',async()=>{
 setJevStub(null);setOpenRouterOff(true);const saved=process.env.TYPESAFE_API_KEY;delete process.env.TYPESAFE_API_KEY;
 try{const res=await turn({message:'hello'});assert.match(res.result.text,/Routing is unavailable/);}
 finally{setOpenRouterOff(false);if(saved)process.env.TYPESAFE_API_KEY=saved;}
});
test('Daily turn limit is enforced',async()=>{
 const used=(await q(`SELECT count(*)::int n FROM agent_messages m JOIN agent_threads t ON t.id=m.thread_id WHERE t.user_id=(SELECT id FROM users WHERE email='admin@exora.local') AND m.role='user' AND m.created_at>=(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`)).rows[0].n;
 assert.equal((await request('action',{action:'agent-limit',limit:used+1})).status,200);
 try{
  setJevStub(answersFor({group:'talk'}));setClaudeGate(()=>({connected:true}));setTalkRunner(async ()=>'ok');
  const first=await turn({message:'one'});
  assert.equal(first.status,200);
  const second=await request('agent/turn',{client_id:client,message:'two'});
  assert.equal(second.status,429);
 }finally{await request('action',{action:'agent-limit',limit:200});}
});
