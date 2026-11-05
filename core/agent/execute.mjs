import fs from 'node:fs';
import path from 'node:path';
import {perform} from '../api.mjs';
import {ROOT,fail,q} from '../db/index.mjs';
import {brandFor,descendantsOf,nodeBrief} from '../clients/tree.mjs';
import {computeMetrics,summarizeMetrics} from '../memory/index.mjs';
import {claudeState} from '../runtime/claude-cli.mjs';
import {describe as describeLayouts,catalog as fontCatalog} from '../design/brand-profile.mjs';
import {DRAFT_STEPS} from './catalog.mjs';
import {parseMetricsCsv} from './csv.mjs';
import {missingStep} from './context.mjs';
import {brandBody,companyBody,productBody} from './intake.mjs';
import {isStrategyDraft,nextStrategyField,strategyBrief,strategyInputs} from './strategy-fields.mjs';
import {monthInputs} from './month-fields.mjs';
import {questionnaireText,readyCheck,PACKAGES} from '../solo/index.mjs';

const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function prefill(tool,args,message,fileIds=[]){
 const out={...args};
 delete out.client_id;
 const found=String(message||'').match(UUID);
 for(const field of tool.open||[]){
  if(out[field.key])continue;
  if((field.key==='file_id'||field.key==='id'||field.key==='asset_id')&&fileIds[0]&&field.key==='file_id')out.file_id=fileIds[0];
  if(field.key==='file_ids'&&fileIds.length&&!out.file_ids)out.file_ids=fileIds.slice(0,10);
  if(['id','asset_id','file_id'].includes(field.key)&&found&&!out[field.key])out[field.key]=found[0];
 }
 if(tool.id==='import_numbers_csv'&&fileIds[0]&&!out.csv)out.file_id=fileIds[0];
 if(tool.id==='set_brand_kit'&&fileIds.length&&!out.file_ids)out.file_ids=fileIds.slice(0,10);
 return out;
}

export function nextQuestion(tool,args){
 if(isStrategyDraft(tool,args))return nextStrategyField(args);
 const fields=tool.open||[];
 const required=fields.some(f=>f.required);
 for(const field of fields){
  if(args['__skip_'+field.key])continue;
  if(required&&!field.required)continue;
  if(field.key==='file_ids'){if(!Array.isArray(args.file_ids)||!args.file_ids.length)return field;continue;}
  if(args[field.key]===undefined||args[field.key]==='')return field;
 }
 return null;
}

async function call(user,client,body){
 const res=await perform(user,{...body,client_id:client.id});
 const data=await res.json();
 if(!res.ok)fail(data.error||'The action failed',res.status);
 return data;
}

async function readFile(client,fileId){
 const f=(await q('SELECT storage_path,mime FROM files WHERE id=$1 AND client_id=$2',[fileId,client.id])).rows[0];
 if(!f)fail('File not found',404);
 const full=path.join(ROOT,'.local',f.storage_path);
 if(!full.startsWith(path.join(ROOT,'.local')+path.sep)||!fs.existsSync(full))fail('File not found',404);
 return fs.readFileSync(full,'utf8');
}

function provider(){return process.env.EXORA_AGENT_DRAFT||(claudeState().connected?'claude':'local_template');}

export async function execute(tool,raw,ctx){
 if(isStrategyDraft(tool,raw))raw={...raw,brief:strategyBrief(strategyInputs(raw),raw.brief&&!String(raw.brief).includes('objective: ')?raw.brief:'')};
 const args=tool.schema?tool.schema.parse(raw):raw;
 const {user,client}=ctx;
 switch(tool.action){
  case 'ready-check':{
   const ready=await readyCheck(client);
   return {ready,rows:ready.items.map(i=>({id:i.key,kind:'Check',title:i.label,status:i.ok?'done':'todo'}))};
  }
  case 'client-questionnaire':return {text:questionnaireText(client),rows:[]};
  case 'import-questionnaire':{
   const data=await call(user,client,{action:'import-questionnaire',text:args.text});
   return {...data,rows:[{id:client.id,kind:'Client',title:client.name,status:'active'}]};
  }
  case 'apply-package':{
   if(!PACKAGES[args.package_id])fail('Unknown package');
   return call(user,client,{action:'apply-package',package_id:args.package_id});
  }
  case 'produce-month':{
   const data=await call(user,client,{action:'produce-month',...monthInputs(args),language:args.language||client.languages?.[0]||'English'});
   return {...data,rows:[{id:data.job_id,kind:'Job',title:'Month production',status:'queued',type:'month'}]};
  }
  case 'record-client-decision':return call(user,client,{action:'record-client-decision',id:args.id,decision:args.decision,note:args.note||''});
  case 'month-pack':return call(user,client,{action:'month-pack',job_id:args.id||null});
  case 'get-context':{
   const waiting=(await q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind='Approval' AND status='awaiting_review'",[client.id])).rows[0].n;
   return {path:nodeBrief(client).path,role:user.role,missing:await missingStep(client),waiting,rows:[]};
  }
  case 'list-items':{
   const rows=(await q('SELECT id,kind,title,status,created_at FROM records WHERE client_id=$1 AND kind=$2 AND ($3::text IS NULL OR status=$3) ORDER BY created_at DESC LIMIT 30',[client.id,args.kind,args.status||null])).rows;
   return {rows,kind:args.kind,status:args.status||null};
  }
  case 'get-item':{
   const row=(await q('SELECT id,kind,title,status,data,created_at FROM records WHERE id=$1 AND client_id=$2',[args.id,client.id])).rows[0];
   if(!row)fail('Record not found',404);
   return {rows:[row],record:row};
  }
  case 'get-rollup':{
   const below=await descendantsOf(client.id);
   if(!below.length)return {rollup:null,rows:[]};
   const ids=[client.id,...below.map(n=>n.id)];
   const totals=(await q(`SELECT count(*) FILTER (WHERE kind='Approval' AND status='awaiting_review')::int AS waiting,
    coalesce(sum((data->>'value')::numeric) FILTER (WHERE kind='Metric' AND data->>'label'='real' AND data->>'metric'='spend'),0)::float AS spend,
    coalesce(sum((data->>'value')::numeric) FILTER (WHERE kind='Metric' AND data->>'label'='real' AND data->>'metric'='leads'),0)::float AS leads
    FROM records WHERE client_id=ANY($1)`,[ids])).rows[0];
   return {rollup:{totals},rows:[]};
  }
  case 'list-files':return {rows:(await q('SELECT id,name AS title,mime AS kind,created_at FROM files WHERE client_id=$1 ORDER BY created_at DESC LIMIT 30',[client.id])).rows.map(r=>({...r,kind:'File',status:''}))};
  case 'get-brand':{const b=await brandFor(client);return {brand:b.data,inherited:b.inherited,from:b.from,rows:b.record?[{id:b.record.id,kind:'BrandKit',title:b.record.title,status:b.record.status}]:[]};}
  case 'design-options':return {layouts:describeLayouts(),fonts:fontCatalog().fonts.map(f=>f.family),rows:[]};
  case 'results-summary':{
   const rows=(await q("SELECT data FROM records WHERE client_id=$1 AND kind='Metric'",[client.id])).rows;
   const summary=summarizeMetrics(rows);
   return {real:computeMetrics(rows.filter(r=>r.data.label==='real')),summary,rows:[]};
  }
  case 'receipts':return {rows:(await q('SELECT id,skill AS title,script,exit_code,created_at FROM tool_runs WHERE client_id=$1 ORDER BY created_at DESC LIMIT 20',[client.id])).rows.map(r=>({id:r.id,kind:'Receipt',title:r.title+' · '+r.script,status:r.exit_code===0?'completed':'failed'}))};
  case 'job-status':{
   const row=(await q('SELECT id,type,status,error,created_at FROM jobs WHERE id=$1 AND client_id=$2',[args.id,client.id])).rows[0];
   if(!row)fail('Job not found',404);
   return {job:row,rows:[{id:row.id,kind:'Job',title:row.type,status:row.status}]};
  }
  case 'create-company':{const data=await call(user,client,{action:'create-client',...companyBody(args)});return {...data,rows:[{id:data.id,kind:'Client',title:args.name,status:'active'}]};}
  case 'add-brand':{const data=await call(user,client,{action:'create-client',...brandBody(args,client)});return {...data,rows:[{id:data.id,kind:'Client',title:args.name,status:'active'}]};}
  case 'add-product':{const data=await call(user,client,{action:'create-client',...productBody(args,client)});return {...data,rows:[{id:data.id,kind:'Client',title:args.name,status:'active'}]};}
  case 'update-details':{
   const langs=args.languages?String(args.languages).split(',').map(s=>s.trim()).filter(Boolean):client.languages;
   const body={action:'update-client',name:args.name||client.name,industry:args.industry||client.industry,city:args.city||client.city,region:args.region||client.data?.region,tier:args.tier||client.data?.tier,languages:langs};
   if(args.website!==undefined)body.website=args.website==='none'?'':args.website;
   if(args.notes!==undefined)body.notes=args.notes==='none'?'':args.notes;
   return call(user,client,body);
  }
  case 'apply-brand-kit':{
   const ids=[...new Set([...(args.file_ids||[]),...(args.file_id?[args.file_id]:[])])];
   if(!ids.length&&ctx.fileIds?.length)ids.push(...ctx.fileIds.slice(0,10));
   if(!ids.length)fail('Attach at least one brand file');
   const file_ids=ids.slice(0,10);
   if(!args.confirmed){
    const preview=await call(user,client,{action:'apply-brand-kit',file_ids,preview:true});
    return {needsConfirm:true,confirmArgs:{file_ids,confirmed:true},summary:preview.summary||'Save this brand kit?'};
   }
   const saved=await call(user,client,{action:'apply-brand-kit',file_ids});
   return {...saved,rows:saved.rows||[{id:saved.record?.id,kind:'BrandKit',title:saved.record?.title,status:saved.record?.status||'draft'}]};
  }
  case 'draft':if(args.step==='strategy')return call(user,client,{action:'generate',as_job:true,module:DRAFT_STEPS.strategy,provider:provider(),brief:args.brief,inputs:strategyInputs(args),language:args.language||client.languages?.[0]||'English'});
  return call(user,client,{action:'generate',as_job:true,module:DRAFT_STEPS[args.step],provider:provider(),brief:args.brief,language:args.language||client.languages?.[0]||'English',format:args.format||'Reel'});
  case 'write-report':return call(user,client,{action:'generate',as_job:true,module:'09-results',provider:provider(),brief:args.brief,language:client.languages?.[0]||'English'});
  case 'save-item':{
   const row=(await q('SELECT * FROM records WHERE id=$1 AND client_id=$2',[args.id,client.id])).rows[0];
   if(!row)fail('Record not found',404);
   const data={...row.data};
   if(args.body){if(row.kind==='Asset')data.script=args.body;else data.body=args.body;}
   return call(user,client,{action:'save-record',id:row.id,kind:row.kind,title:args.title||row.title,data});
  }
  case 'revise':return call(user,client,{action:'revise',id:args.id});
  case 'choose-hook':return call(user,client,{action:'choose-hook',id:args.id,index:Number(args.index)});
  case 'render':return call(user,client,{action:'render',asset_id:args.asset_id,type:args.type,format:args.format,layout:args.layout||'auto',composer:args.composer||'template'});
  case 'clean-media':return call(user,client,{action:'clean-media',file_id:args.file_id,licence:args.licence});
  case 'submit-approval':return call(user,client,{action:'submit-approval',id:args.id});
  case 'schedule':return call(user,client,{action:'schedule',asset_id:args.asset_id,platform:args.platform,scheduled_at:args.scheduled_at,to:args.to});
  case 'ad-action':return call(user,client,{action:'ad-action',platform:args.platform,operation:args.operation,title:args.title,budget:Number(args.budget),asset_id:args.asset_id||null});
  case 'meta-status':{const {liveConnectors}=await import('../connectors/index.mjs');return {connectors:await liveConnectors(client.id)};}
  case 'connect-meta':{const {metaConfigured}=await import('../connectors/index.mjs');if(!metaConfigured())fail('Meta app credentials are not set on the server',503);return {url:'/api/auth/meta/start?client='+client.id,redirect:true};}
  case 'select-meta-account':return call(user,client,{action:'select-meta-account',ad_account_id:args.ad_account_id});
  case 'pull-meta-insights':return call(user,client,{action:'pull-meta-insights'});
  case 'import-csv':{
   const csv=args.csv||await readFile(client,args.file_id);
   return call(user,client,{action:'import-metrics',metrics:parseMetricsCsv(csv)});
  }
  case 'add-number':{
   if(!args.label)fail('Say whether this number is real, estimated, or inferred');
   return call(user,client,{action:'save-record',kind:'Metric',title:args.metric+' · '+args.date,data:{metric:args.metric,value:Number(args.value),label:args.label,source:args.source,date:args.date,campaign:args.campaign||''}});
  }
  case 'add-lesson':return call(user,client,{action:'save-record',kind:'Learning',title:args.title,data:{body:args.body,evidence_links:String(args.evidence).split('\n').map(s=>s.trim()).filter(Boolean),industry:client.industry,objective:'',pattern:''}});
  case 'add-task':return call(user,client,{action:'save-record',kind:'Task',title:args.title,data:{owner:args.owner||'',due_date:new Date().toISOString().slice(0,10),priority:args.priority||'medium',module:'managing',body:args.body||''}});
  case 'task-status':return call(user,client,{action:'task-status',id:args.id,status:args.status});
  case 'monthly-invoice':return call(user,client,{action:'monthly-invoice',amount:Number(args.amount),number:args.number,period:args.period,gst:args.gst===undefined||args.gst===''?18:Number(args.gst),description:args.description});
  case 'run-tool':{
   const params={};
   for(const field of tool.open||[])if(args[field.key]!==undefined&&args[field.key]!=='')params[field.key]=args[field.key];
   return call(user,client,{action:'run-tool',module:tool.module,tool:tool.scriptId,params,save:false});
  }
  default:fail('That action is not available');
 }
}
