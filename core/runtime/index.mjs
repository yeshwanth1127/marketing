import {contextRecords,nodeBrief} from '../clients/tree.mjs';
import {inspectUntrusted} from './security.mjs';
import {seasonal} from './seasonal.mjs';
import fs from 'node:fs';import path from 'node:path';import YAML from 'yaml';import {z} from 'zod';import {runStrategyPipeline} from './strategy.mjs';
import {ensureDatedTitle,strategyScope} from '../agent/strategy-fields.mjs';
import {claudeReviser} from './revise.mjs';
import {promptAttachments,promptHistory} from './prompts/context.mjs';
import {draftRunner} from './providers/generation.mjs';
import {promptMetadata} from './prompts/prompt-builder.mjs';
import {selectedProvider,requireProvider} from './providers/index.mjs';
import {ROOT,q,tx,id,insert,upsertStrategy,audit,fail} from '../db/index.mjs';import {template} from './templates.mjs';import {enrich} from '../tools/enrich.mjs';
export const catalog=()=>JSON.parse(fs.readFileSync(path.join(ROOT,'core/runtime/catalog.json'),'utf8'));
export function loadModule(key,client){const mod=catalog().find(m=>m.key===key);if(!mod)fail('Unknown module');if(client.settings?.disabled_modules?.includes(key))fail('This module is disabled for this client',403);const dir=path.join(ROOT,mod.group,key);for(const part of ['skills','tools.yaml','io.yaml','screen'])if(!fs.existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir,part)))fail('Module contract is incomplete: '+part,503);const io=YAML.parse(fs.readFileSync(path.join(dir,'io.yaml'),'utf8')),tools=YAML.parse(fs.readFileSync(path.join(dir,'tools.yaml'),'utf8'));if(!Array.isArray(io.reads)||!Array.isArray(io.writes)||!Array.isArray(tools.tools))fail('Invalid module contract',503);return {...mod,dir,io,tools};}
export function checks(data,brand={}){const text=[data.script,data.caption,data.body].filter(Boolean).join('\n'),rules=JSON.parse(fs.readFileSync(path.join(ROOT,'exora/compliance/rules.json'),'utf8'));const results=rules.rules.filter(r=>new RegExp(r.pattern,'i').test(text)).map(r=>({severity:r.severity,message:r.message}));for(const w of brand.banned_words||[])if(w&&text.toLowerCase().includes(w.toLowerCase()))results.push({severity:'error',message:'Brand banned phrase: '+w});if(data.creator_paid&&!/#ad\b|#sponsored\b/i.test(text))results.push({severity:'error',message:'Paid creator content requires a clear disclosure label.'});if(data.type==='audio'&&!data.licence)results.push({severity:'error',message:'Store the audio licence before review.'});return results;}
const envelope=z.array(z.object({kind:z.string(),title:z.string().min(1).max(300),data:z.record(z.string(),z.unknown())})).min(1).max(10);
export async function generate(user,client,input,{progress=null}={}){
 const mod=loadModule(input.module,client);
 if(mod.io.approval_required)fail('This module requires a dedicated approval action');
 const provider=requireProvider(selectedProvider(input.provider,client.settings));
 const records=await contextRecords(client,{kinds:mod.io.reads});
 const [attachments,history]=provider==='local_template'?[[],[]]:await Promise.all([
  promptAttachments(client,input.file_ids),promptHistory(user,client,input.thread_id),
 ]);
 const flags=inspectUntrusted({input,records,attachments:attachments.map(f=>f.content),history});
 if(flags.length){
  await audit({query:q},user,client.id,'runtime:untrusted-instruction',null,{module:input.module,count:flags.length});
  fail('Potential instructions were found in source content. Remove instructions that ask the model to ignore rules or reveal secrets before generating.');
 }
 const run=id(),started=Date.now();
 await q("INSERT INTO runs(id,client_id,module,provider,status,created_by) VALUES($1,$2,$3,$4,'running',$5)",[run,client.id,input.module,provider,user.id]);
 try{
 let outputs,loaded=[],agentReceipts=[];
 const sample=template(input.module,client,records,input);
 if(provider==='local_template')outputs=sample;
 else{
  const selected=input.skill?(Array.isArray(input.skill)?input.skill:String(input.skill).split(/[,+]/).map(s=>s.trim()).filter(Boolean)):mod.defaults;
  if(selected.some(name=>!mod.skills.some(s=>s.name===name)))fail('Selected capability is not available in this module');
  loaded=mod.skills.filter(s=>selected.includes(s.name)&&(s.source!=='CF'||client.settings?.cf_enabled));
  if(!loaded.length)fail('This capability is disabled or unavailable');
  const workspace={
   client:nodeBrief(client),input,methodology:fs.readFileSync(path.join(ROOT,'exora/methodology.md'),'utf8'),
   records:records.slice(0,50).map(({id,kind,title,status,data,inherited_from})=>({id,kind,title,status,data,inherited_from:inherited_from?.name})),
   seasonal_context:seasonal(client.data?.region,input.month||new Date().toISOString().slice(0,7)),
  };
  const ctx={client,user,run,records,workspace,attachments,history};
  const stages=[];
  const runner=draftRunner(provider,{
   persistPrompt:async spec=>{
    const metadata=promptMetadata(spec);
    stages.push(metadata);
    await q('UPDATE runs SET prompt_metadata=$2 WHERE id=$1',[run,{...metadata,stages,output_validation:'pending'}]);
   },
   onExecution:result=>q('UPDATE runs SET model=coalesce($2,model),usage=coalesce($3,usage) WHERE id=$1',[run,result.model,result.usage]),
   validateOutput:value=>{
    if(envelope.parse(value).some(out=>!mod.io.writes.includes(out.kind)))throw new Error('Output violates module write contract');
   },
  });
  if(input.module==='02-strategy'&&!input.skill){
   const res=await runStrategyPipeline({...ctx,mod,input,sample,progress,runner});
   ({outputs,loaded,receipts:agentReceipts}=res);
  }else{
   progress?.plan([{key:'draft',label:mod.name,skills:loaded.map(s=>s.name)}]);
   progress?.start('draft');
   try{
    const res=await runner(ctx,mod,loaded,sample,{onEvent:progress?e=>progress.event(e):undefined});
    ({outputs,receipts:agentReceipts}=res);
    progress?.finish('draft');
   }catch(e){progress?.fail('draft',e.message);throw e;}
  }
 }
outputs=envelope.parse(outputs);if(input.module==='02-strategy'){const scope=strategyScope(client);for(const out of outputs){out.data={...out.data,level:scope.level,scope};if(out.kind==='Strategy')out.title=ensureDatedTitle(out.title,client);}}for(const out of outputs){if(!mod.io.writes.includes(out.kind))fail('Output violates module write contract');if(out.kind==='Asset'){out.data.checks=checks(out.data,records.find(r=>r.kind==='BrandKit')?.data);if(out.data.type!=='copy')out.data.type='copy';}out.data.provider=provider;out.data.run_id=run;if(provider!=='local_template'){out.data.language=input.language||'English';out.data.translation_status='needs_human_review';}if(provider!=='local_template')out.data.evidence_note='AI-generated draft. Verify claims and sources before approval.';}
await enrich({client,user,run,records},mod,outputs,{autofix:true,revise:provider==='claude'?claudeReviser({language:input.language||'English'}):null});if(agentReceipts.length)for(const out of outputs)out.data.receipts=[...agentReceipts,...(out.data.receipts||[])];
const saved=await tx(async c=>{const s=[];for(const out of outputs){
  if(out.kind==='Strategy'){
   const replaceId=input.validation?.source_strategy_id||null;
   s.push(await upsertStrategy(c,user,client.id,out.title,out.data,{replace_id:replaceId}));
  }else s.push(await insert(c,user,client.id,out.kind,out.title,out.data));
 }await c.query("UPDATE runs SET status='completed',skill_count=$2,output_ids=$3,duration_ms=$4,prompt_metadata=prompt_metadata||$5::jsonb WHERE id=$1",[run,loaded.length,JSON.stringify(s.map(v=>v.id)),Date.now()-started,{output_validation:'passed'}]);await audit(c,user,client.id,'run:'+input.module,run,{provider,skills:loaded.map(s=>s.name)});return s;});return {records:saved,provider};}catch(e){await q("UPDATE runs SET status='failed',error=$2,duration_ms=$3,prompt_metadata=prompt_metadata||$4::jsonb WHERE id=$1",[run,'Generation failed before saving.',Date.now()-started,{output_validation:'did not pass'}]);throw e;}}
