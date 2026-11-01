// After generation, run each module's declared skill scripts on the outputs.
// Results replace any model- or template-made numbers; failures are recorded, never faked.
import {runScript} from './runner.mjs';

const has=(mod,id)=>(mod.tools?.scripts||[]).some(s=>s.id===id);

async function scoreHooks(ctx,mod,out){
 const hooks=Array.isArray(out.data.hooks)?out.data.hooks:[];
 if(!hooks.length)return [];
 const lines=hooks.map(h=>String(h.text||'').replace(/\s+/g,' ').trim());
 const r=await runScript(ctx,mod,'hookscore',{stdin:lines.join('\n')+'\n'});
 const rows=r.ok?(Array.isArray(r.output)?r.output:[r.output]):[];
 const byText=new Map(rows.map(x=>[String(x.hook).trim(),x]));
 out.data.hooks=hooks.map((h,i)=>{const s=byText.get(lines[i]);
  return {...h,score:s?s.score:null,verdict:s?.verdict||null,weakest:s?.weakest||null,score_checks:s?.checks||null,score_flags:s?.flags||[],scored_by:r.ok?'ig-reel/hookscore.py':null};});
 out.data.score_label=r.ok?'Scored by ig-reel hookscore.py: text heuristics (length, specificity, stakes, front-loading, address). Not a view predictor.':'Hook scoring failed: '+r.error;
 return [r.receipt];
}

async function lintCopy(ctx,mod,out){
 const receipts=[];const extra=[];
 const caption=String(out.data.caption||'');const script=String(out.data.script||'');
 if(caption&&has(mod,'caption-lint')){
  const r=await runScript(ctx,mod,'caption-lint',{stdin:caption});receipts.push(r.receipt);
  out.data.caption_lint=r.ok?r.output:{error:r.error};
  if(r.ok)for(const c of r.output.checks||[])if(c.status==='FAIL')extra.push({severity:'warning',message:`Caption (ig-caption): ${c.check} — ${c.detail}`,source:'ig-caption/caption.py'});
 }
 if((caption||script)&&has(mod,'ai-tell')){
  const r=await runScript(ctx,mod,'ai-tell',{stdin:[script,caption].filter(Boolean).join('\n\n')});receipts.push(r.receipt);
  out.data.ai_tell=r.ok?{human_score:r.output.human_score,checks:r.output.checks}:{error:r.error};
  if(r.ok&&typeof r.output.human_score==='number'&&r.output.human_score<60)extra.push({severity:'warning',message:`Reads machine-written (ig-human detect.py human score ${r.output.human_score}/100). Rewrite flagged phrases.`,source:'ig-human/detect.py'});
 }
 if(script&&has(mod,'beat-sheet')){
  const r=await runScript(ctx,mod,'beat-sheet',{stdin:script});receipts.push(r.receipt);
  out.data.beat_sheet=r.ok?r.output:{error:r.error};
 }
 if(extra.length)out.data.checks=[...(out.data.checks||[]),...extra];
 return receipts;
}

export async function enrich(ctx,mod,outputs){
 for(const out of outputs){
  let receipts=[];
  if(out.kind==='Idea'&&has(mod,'hookscore'))receipts=await scoreHooks(ctx,mod,out);
  else if(out.kind==='Asset'&&(out.data.type||'copy')==='copy')receipts=await lintCopy(ctx,mod,out);
  if(receipts.length)out.data.receipts=[...(out.data.receipts||[]),...receipts];
 }
 return outputs;
}
