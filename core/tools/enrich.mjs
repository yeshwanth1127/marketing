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
 const body=[script,caption].filter(Boolean).join('\n\n');
 if(body&&has(mod,'quality-gate')){
  const r=await runScript(ctx,mod,'quality-gate',{stdin:body});receipts.push(r.receipt);
  if(r.ok){const o=r.output;
   out.data.quality_gate={decision:o.decision,composite_score:o.composite_score,grade:o.grade,interpretation:o.interpretation,auto_rejected:o.auto_rejected,issues:o.issues||[],missing_dimensions:o.missing_dimensions||[]};
   if(o.auto_rejected||o.decision==='FAIL')extra.push({severity:'error',message:'DMP quality gate failed: '+(o.interpretation||o.decision),source:'check/eval-runner.py'});
   for(const i of o.issues||[]){const sev=i.severity==='critical'?'error':i.severity==='low'?'info':'warning';extra.push({severity:sev,message:`${i.dimension}: ${i.reason}${i.value?` ("${i.value}")`:''}`,source:'check/eval-runner.py'});}
  }else out.data.quality_gate={error:r.error};
 }
 if(body&&has(mod,'claim-check')){
  const r=await runScript(ctx,mod,'claim-check',{stdin:body});receipts.push(r.receipt);
  if(r.ok){const o=r.output;out.data.claim_check={score:o.verification_score,interpretation:o.interpretation,summary:o.summary,claims:o.claims||[]};
   for(const c of o.claims||[]){
    if(c.status==='contradicted')extra.push({severity:'error',message:`Claim contradicts recorded evidence: "${c.text}"`,source:'verify-claims/claim-verifier.py'});
    else if(c.status==='unverified'||c.status==='evidence_unverified')extra.push({severity:'warning',message:`Claim needs evidence before approval: "${c.text}"`,source:'verify-claims/claim-verifier.py'});}
  }else out.data.claim_check={error:r.error};
 }
 if(script&&has(mod,'beat-sheet')){
  const r=await runScript(ctx,mod,'beat-sheet',{stdin:script});receipts.push(r.receipt);
  out.data.beat_sheet=r.ok?r.output:{error:r.error};
 }
 if(extra.length)out.data.checks=[...(out.data.checks||[]),...extra];
 return receipts;
}

// Step 9: run DMP's budget optimiser and creative-fatigue predictor on recorded (real-labelled) metrics.
async function analyseResults(ctx,mod,out){
 const receipts=[];const metrics=(ctx.records||[]).filter(r=>r.kind==='Metric'&&r.data.label==='real');
 const byChannel={};
 for(const m of metrics){const ch=m.data.channel||m.data.source;if(!ch)continue;const c=byChannel[ch]||={name:ch,spend:0,conversions:0,revenue:0};const k=m.data.metric;if(k==='spend')c.spend+=m.data.value;if(k==='conversions'||k==='leads')c.conversions+=m.data.value;if(k==='revenue')c.revenue+=m.data.value;}
 const channels=Object.values(byChannel).filter(c=>c.spend>0);
 if(channels.length>=2&&has(mod,'budget-reallocation')){
  const total=channels.reduce((a,c)=>a+c.spend,0);
  const r=await runScript(ctx,mod,'budget-reallocation',{args:['--channels',JSON.stringify(channels),'--total-budget',String(total)]});receipts.push(r.receipt);
  out.data.budget_reallocation=r.ok?r.output:{error:r.error};
 }
 const byCreative={};
 for(const m of metrics){const cr=m.data.asset_id||m.data.creative;if(!cr)continue;const d=(byCreative[cr]||={})[m.data.date]||={date:m.data.date,clicks:0,impressions:0};if(m.data.metric==='clicks')d.clicks+=m.data.value;if(m.data.metric==='impressions')d.impressions+=m.data.value;}
 const fatigue=[];
 for(const [cr,days] of Object.entries(byCreative)){
  const hist=Object.values(days).filter(d=>d.impressions>0).sort((a,b)=>a.date.localeCompare(b.date)).map(d=>({date:d.date,impressions:d.impressions,ctr:+(d.clicks/d.impressions*100).toFixed(3)}));
  if(hist.length<4||!has(mod,'creative-fatigue'))continue;
  const r=await runScript(ctx,mod,'creative-fatigue',{args:['--action','predict-fatigue','--creative-id',String(cr),'--performance-history',JSON.stringify(hist)]});receipts.push(r.receipt);
  fatigue.push(r.ok?r.output:{creative_id:cr,error:r.error});
 }
 if(fatigue.length)out.data.creative_fatigue=fatigue;
 return receipts;
}

export async function enrich(ctx,mod,outputs){
 for(const out of outputs){
  let receipts=[];
  if(out.kind==='Idea'&&has(mod,'hookscore'))receipts=await scoreHooks(ctx,mod,out);
  else if(out.kind==='Asset'&&(out.data.type||'copy')==='copy')receipts=await lintCopy(ctx,mod,out);
  else if(out.kind==='Report'&&mod.key==='09-results')receipts=await analyseResults(ctx,mod,out);
  if(receipts.length)out.data.receipts=[...(out.data.receipts||[]),...receipts];
 }
 return outputs;
}
