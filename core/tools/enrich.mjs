// After generation, run each module's declared skill scripts on the outputs.
// Results replace any model- or template-made numbers; failures are recorded, never faked.
import {runScript,pythonDepsStatus} from './runner.mjs';
import {parseCaptionLint,lintDidNotRun,failingFindings} from './lint-result.mjs';
import {reviseCaption,reviseAttempts} from '../runtime/revise.mjs';

const has=(mod,id)=>(mod.tools?.scripts||[]).some(s=>s.id===id);
// The DMP gate scores six dimensions. These three need textstat and nltk; if they are missing the gate must say so, not pass quietly.
export const QUALITY_DIMENSIONS=['content_quality','brand_voice','readability'];
const label=d=>d.replace('_',' ');

/** What is stored for the DMP quality gate. `incomplete` is true when a required scorer did not run: that is not a pass. */
export function gateSummary(o){
 const missing=[...new Set([...(o.missing_dimensions||[]),...(o.skipped_dimensions||[])])];
 const notRun=QUALITY_DIMENSIONS.filter(d=>missing.includes(d));
 return {decision:o.decision,composite_score:o.composite_score,grade:o.grade,interpretation:o.interpretation,auto_rejected:o.auto_rejected,issues:o.issues||[],missing_dimensions:o.missing_dimensions||[],incomplete:notRun.length>0,not_run:notRun};
}

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

async function lintCopy(ctx,mod,out,{revise=null,autofix=false}={}){
 const receipts=[];const extra=[];
 let caption=String(out.data.caption||'');const script=String(out.data.script||'');
 if(caption&&has(mod,'caption-lint')){
  // "The linter ran and found problems" is a result with findings. Only a linter that could not run is "did not run".
  const lintOnce=async text=>{
   const r=await runScript(ctx,mod,'caption-lint',{stdin:text});receipts.push(r.receipt);
   if(!r.ok)return lintDidNotRun(r.error);
   return parseCaptionLint(r.output)||lintDidNotRun('the linter returned no checks');
  };
  const loop=await reviseCaption({caption,lint:lintOnce,revise,max:reviseAttempts(),fix:autofix});
  if(loop.caption!==caption){out.data.caption_original=caption;out.data.caption=loop.caption;caption=loop.caption;}
  out.data.caption_lint={...loop.lint,revised:!!out.data.caption_original,revisions:loop.attempts};
  // Unresolved hard failures stay on the record as blocking checks, in the same shape as every other check.
  for(const f of failingFindings(loop.lint))extra.push({severity:'error',message:`Caption (ig-caption): ${f.check} — ${f.finding}`,fix:f.fix,check:f.check,source:'ig-caption/caption.py'});
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
   out.data.quality_gate=gateSummary(o);
   const notRun=out.data.quality_gate.not_run;
   if(notRun.length){
    const deps=pythonDepsStatus();
    const why=deps.ok?'check the script errors in the receipts':'missing: '+deps.missing.join(', ');
    extra.push({severity:'warning',message:`Quality scoring is incomplete: ${notRun.map(label).join(', ')} did not run (${why}). The score below covers only the dimensions that ran.`,fix:'Install textstat and nltk with its data (npm run setup:python, or rebuild the Docker image), then regenerate.',source:'check/eval-runner.py'});
   }
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
 // DMP scorers on the full copy: brand voice, content quality, AI-tell scan. Scores only; never rewrite copy.
 if(body&&has(mod,'brand-voice')){
  const r=await runScript(ctx,mod,'brand-voice',{stdin:body,args:['--file','{input_file}']});receipts.push(r.receipt);
  out.data.brand_voice=r.ok?{overall_score:r.output.overall_score??null,dimensions:r.output.dimensions||r.output.scores||null,recommendation:r.output.recommendation||null,fallback:!!r.output.fallback}:{error:r.error};
  if(r.ok&&typeof r.output.overall_score==='number'&&r.output.overall_score<60)extra.push({severity:'warning',message:`Off brand voice (DMP brand-voice-scorer.py ${r.output.overall_score}/100).`,source:'check/brand-voice-scorer.py'});
  if(r.ok&&r.output.fallback)extra.push({severity:'warning',message:'Brand voice scoring ran in fallback mode: its dependencies are missing, so this score is not a real brand-voice reading.',fix:'Install textstat and nltk with its data, then regenerate.',source:'check/brand-voice-scorer.py'});
 }
 if(body&&has(mod,'content-score')){
  const r=await runScript(ctx,mod,'content-score',{stdin:body,args:['--file','{input_file}','--type',out.data.channel==='email'?'email':out.data.channel==='ad'?'ad':'social']});receipts.push(r.receipt);
  out.data.content_score=r.ok?{overall_score:r.output.overall_score??null,grade:r.output.grade||null,dimensions:r.output.dimensions||null,recommendations:(r.output.recommendations||[]).slice(0,6),fallback:!!r.output.fallback}:{error:r.error};
  if(r.ok&&r.output.fallback)extra.push({severity:'warning',message:'Content quality scoring ran in fallback mode: its dependencies are missing, so this score is not a real quality reading.',fix:'Install textstat and nltk with its data, then regenerate.',source:'check/content-scorer.py'});
 }
 if(body&&has(mod,'ai-tell-scan')){
  const r=await runScript(ctx,mod,'ai-tell-scan',{stdin:body,args:['--file','{input_file}']});receipts.push(r.receipt);
  out.data.ai_tell_scan=r.ok?{humanize_passed:r.output.humanize_passed,advisory_rating:r.output.advisory_rating,flagged_paragraph_pct:r.output.flagged_paragraph_pct,flagged_sentences:(r.output.flagged_sentences||[]).slice(0,8)}:{error:r.error};
  if(r.ok&&r.output.humanize_passed===false)extra.push({severity:'warning',message:`AI-tell scan: ${r.output.flagged_paragraph_pct}% of paragraphs flagged (${r.output.advisory_rating||'review'}). Run "Strip AI phrasing" or rewrite.`,source:'check/ai-tell-scan.py'});
 }
 // Keep this client's quality history (persistent DMP state) so trends and regressions are real.
 if(out.data.quality_gate&&typeof out.data.quality_gate.composite_score==='number'&&has(mod,'quality-log')){
  const r=await runScript(ctx,mod,'quality-log',{args:['--data',JSON.stringify({content_type:out.data.channel||'social',title:String(out.title||out.data.title||'Copy').slice(0,120),scores:{composite:out.data.quality_gate.composite_score},grade:out.data.quality_gate.grade||''})]});receipts.push(r.receipt);
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

// opts.autofix: true for generated drafts. Failed caption lint is then fed back to opts.revise (see runtime/revise.mjs), with a
// deterministic hashtag cap as the last resort. Text a person wrote (autofix false) is linted and reported, never rewritten.
export async function enrich(ctx,mod,outputs,opts={}){
 for(const out of outputs){
  let receipts=[];
  if(out.kind==='Idea'&&has(mod,'hookscore'))receipts=await scoreHooks(ctx,mod,out);
  else if(out.kind==='Asset'&&(out.data.type||'copy')==='copy')receipts=await lintCopy(ctx,mod,out,opts);
  else if(out.kind==='Report'&&mod.key==='09-results')receipts=await analyseResults(ctx,mod,out);
  if(receipts.length)out.data.receipts=[...(out.data.receipts||[]),...receipts];
 }
 return outputs;
}
