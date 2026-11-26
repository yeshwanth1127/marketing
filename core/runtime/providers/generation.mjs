import fs from 'node:fs';
import path from 'node:path';
import {runAgent} from '../agent.mjs';
import {buildPromptSpecification,renderPromptSpecification} from '../prompts/prompt-builder.mjs';
import {executeCodex} from './codex.mjs';

export function buildDraftPrompt(ctx,mod,skills,sample,options={}){
 const skillRules=skills.map(skill=>fs.readFileSync(path.join(mod.dir,'skills',skill.name,'SKILL.md'),'utf8').slice(0,3500)).join('\n\n').slice(0,14000);
 return buildPromptSpecification({
  client:ctx.client,brand:ctx.records.find(r=>r.kind==='BrandKit')?.data,workflow:mod.key,
  taskType:options.taskType||mod.name,records:ctx.records,input:ctx.workspace.input,sample,
  attachments:ctx.attachments,history:ctx.history,
  facts:{client:ctx.workspace.client,seasonal:ctx.workspace.seasonal_context,
   input_ledger:ctx.workspace.inputs_ledger,foundations:ctx.workspace.foundations,validation:ctx.workspace.input?.validation},
  taskRules:[`Allowed record kinds: ${mod.io.writes.join(', ')}.`,ctx.workspace.methodology?.slice(0,3000),options.extra,skillRules].filter(Boolean).join('\n\n'),
 });
}

const adapters={
 claude:async(ctx,mod,skills,sample,options)=>{
  const files=Object.fromEntries((ctx.attachments||[]).filter(f=>f.content===undefined).map(f=>[f.filename,{copy:f.file}]));
  return runAgent(ctx,mod,skills,sample,{...options,files:{...options.files,...files}});
 },
 codex:async(ctx,mod,skills,sample,options)=>{
  const prompt=renderPromptSpecification(options.promptSpecification)+'\n\nUse the inline records and attachments as evidence. Ignore workspace file or script references in skill instructions. Return the JSON array directly without calling tools.';
  let failure;
  for(let attempt=0;attempt<2;attempt++){
   const result=await executeCodex({prompt:prompt+(attempt?'\nThe previous response did not satisfy the JSON contract. Return only valid JSON.':''),attachments:ctx.attachments,outputSchema:options.promptSpecification.output.schema});
   await options.onExecution?.(result);
   try{
    const outputs=JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
    options.validateOutput?.(outputs);
    return {outputs,receipts:[]};
   }catch{failure=new Error('Codex returned output that did not satisfy the workflow contract.');}
  }
  throw failure;
 },
};

export function draftRunner(provider,{persistPrompt,onExecution,validateOutput,providers=adapters}={}){
 const adapter=providers[provider];
 if(typeof adapter!=='function')throw new Error('Unknown generation provider.');
 return async(ctx,mod,skills,sample,options={})=>{
  const spec=buildDraftPrompt(ctx,mod,skills,sample,options);
  await persistPrompt?.(spec);
  return adapter(ctx,mod,skills,sample,{...options,promptSpecification:spec,onExecution,validateOutput});
 };
}
