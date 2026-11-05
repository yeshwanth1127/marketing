// Strategy runs as four stages in one job. Growth Plan runs last and reads the verified
// outputs of the earlier stages, instead of guessing them in the same prompt.
import {z} from 'zod';
import {runAgent} from './agent.mjs';
import {inputsLedger,strategyInputs} from '../agent/strategy-fields.mjs';

const one=z.array(z.object({kind:z.string(),title:z.string().min(1).max(300),data:z.record(z.string(),z.unknown())})).min(1).max(10);

const COMMON=`This is stage {n} of 4 of ONE strategy, run in order: Positioning → Offer → Funnel → Growth plan.
workspace.json holds: "inputs_ledger" (every answer with status user_provided, not_provided or no_proof) and "foundations" (outputs of the earlier stages; also in foundations.json).
Evidence rules for this stage:
- Treat not_provided fields as unknown. Never fill them in silently.
- Anything you add that is not in inputs_ledger, the records or foundations goes into data.assumptions as {"item","reason"}.
- Keep every proof gap visible in data.proof_missing or data.gaps. No research was done; do not imply it was.
- If workspace.input.validation exists, its marketer decisions and corrections are authoritative. Apply them and do not restore rejected assumptions.
Write exactly ONE object of kind Strategy.`;

export const STRATEGY_STAGES=[
 {key:'positioning',label:'Positioning audit',skills:inputs=>inputs.competitors?['positioning-audit','competitor-positioning']:['positioning-audit'],
  task:`Run the positioning-audit skill (and competitor-positioning when loaded) on the business inputs, brand kit and records. There are no external profiles to fetch: the evidence is what the user gave you. Map only competitors the user named; mark unknowns "unclear".
If proof is no_proof, stop at a diagnosis as the skill requires and list the proof needed in proof_missing.`,
  sample:{stage:'positioning',positioning_statement:'For [audience] who need [job], [brand] helps them get [outcome] through [mechanism], with [proof or MISSING PROOF].',audience:'',customer_job:'',credible_difference:'',proof_used:[],proof_missing:[],competitor_map:[],profile_changes:[],unclear:[],assumptions:[]}},
 {key:'offer',label:'Offer design',skills:()=>['offers'],
  task:`Use foundations.positioning exactly as given. Apply the offers skill to the current offer.
Do not invent prices, guarantees, bonuses or deadlines the business has not confirmed: put them in recommendations, each marked "needs client approval". Urgency must be honest.`,
  sample:{stage:'offer',offer_summary:'',dream_outcome:'',value_equation:{dream_outcome:'',likelihood:'',time_delay:'',effort:''},recommendations:[],guarantee_option:'',urgency_option:'',next_step:'',proof_missing:[],assumptions:[]}},
 {key:'funnel',label:'Funnel & channels',skills:()=>['funnel-architect'],
  task:`Use foundations.positioning and foundations.offer. Apply funnel-architect to this business model and the channels and sales process in the ledger.
Any benchmark number is labelled "industry benchmark, unverified", never presented as the client's data.`,
  sample:{stage:'funnel',funnel_stages:[{name:'',goal:'',channel:'',content_role:'',kpi:''}],channel_roles:[],conversion_path:'',measurement_notes:'',gaps:[],assumptions:[]}},
 {key:'growth',label:'Growth plan',skills:()=>['growth-plan'],
  task:`Run the growth-plan skill LAST, as the synthesis of the stages above.
In this EXORA workspace its pre-conditions map to: Core Doc 3.1 Business analysis → client + inputs (business_model, objective, constraints); Core Doc 3.2 Segmentation → foundations.positioning.audience; Core Doc 3.3 Positioning → foundations.positioning; the offer → foundations.offer; Core Doc 3.4 DMFlow and channel documents → foundations.funnel + inputs channels; Part 7 KPI tree → inputs success_measure + foundations.funnel KPIs; budget → inputs budget_range; team → inputs team.
Referenced context-engine files, PDF/DOCX exports and save paths are not available here: ignore them. Do not refuse because Part 1–7 documents are absent. Write every section from what exists, list each missing source in data.gaps and each assumed number in data.assumptions.
Every forecast states its assumptions. If budget_range is not_provided, give scenarios as ranges labelled assumption. Synthesise; do not restate the foundations. Keep body under about 2,500 words.`},
];

export function stageSample(stage,client,base){
 if(stage.key!=='growth')return [{kind:'Strategy',title:client.name+' · '+stage.label,data:stage.sample}];
 const b=base?.[0]?.data||{};
 return [{kind:'Strategy',title:client.name+' · marketing strategy',data:{...b,executive_summary:'',budget_plan:'',kpi_framework:[],timeline_30_60_90:{days_1_30:'',days_31_60:'',days_61_90:''},team_plan:'',risks:[],scenarios:{conservative:'',moderate:'',aggressive:''},gaps:[],assumptions:[]}}];
}

const summaryOf=d=>String(d.positioning_statement||d.offer_summary||d.conversion_path||d.executive_summary||'').slice(0,300);

export async function runStrategyPipeline({client,user,run,records,workspace,mod,input,sample,progress,runner=runAgent}){
 const inputs=strategyInputs(input.inputs||{});
 const ledger=inputsLedger(inputs);
 const skillsFor=stage=>stage.skills(inputs).map(n=>mod.skills.find(s=>s.name===n)).filter(s=>s&&(s.source!=='CF'||client.settings?.cf_enabled));
 const plan=STRATEGY_STAGES.map(s=>({key:s.key,label:s.label,skills:skillsFor(s).map(x=>x.name)}));
 progress?.plan(plan);
 const foundations={},receipts=[],pipeline=[],loaded=new Map();
 // Results of stages that finished in an earlier, failed run of this strategy.
 const prior=input.resume?.results&&typeof input.resume.results==='object'?input.resume.results:{};
 for(const [i,stage] of STRATEGY_STAGES.entries()){
  const skills=skillsFor(stage);
  if(!skills.length)throw new Error(stage.label+' is unavailable: its skill is missing from this module');
  for(const s of skills)loaded.set(s.name,s);
  const done=stage.key!=='growth'&&prior[stage.key]?.data;
  if(done){
   foundations[stage.key]={...prior[stage.key].data,stage:stage.key};
   receipts.push(...(prior[stage.key].receipts||[]));
   pipeline.push({...(prior[stage.key].pipeline||{stage:stage.key,label:stage.label}),reused_from:input.resume.from_job||null});
   progress?.keep(stage.key,prior[stage.key]);
   progress?.reuse(stage.key,summaryOf(prior[stage.key].data));
   continue;
  }
  progress?.start(stage.key);
  const started=Date.now();
  try{
   const ws={...workspace,inputs_ledger:ledger,foundations};
   const extra=COMMON.replace('{n}',String(i+1))+'\n'+stage.task;
   const res=await runner({client,user,run,records,workspace:ws},mod,skills,stageSample(stage,client,sample),{extra,files:{'foundations.json':JSON.stringify(foundations,null,1)},onEvent:progress?e=>progress.event(e):undefined});
   const out=one.parse(res.outputs).find(o=>o.kind==='Strategy');
   if(!out)throw new Error('it did not return a strategy section');
   receipts.push(...(res.receipts||[]));
   const entry={stage:stage.key,label:stage.label,skills:skills.map(s=>s.name),receipts:(res.receipts||[]).length,duration_ms:Date.now()-started};
   pipeline.push(entry);
   if(stage.key==='growth'){
    progress?.finish(stage.key,summaryOf(out.data));
    const confirmed=input.validation?.confirmed===true;
    out.data={...out.data,foundations,inputs_ledger:ledger,pipeline,validation_status:confirmed?'confirmed':'needs_marketer_confirmation',validation:confirmed?{status:'confirmed',confirmed_at:new Date().toISOString(),source_strategy_id:input.validation.source_strategy_id||null,decisions:input.validation.decisions||[],notes:input.validation.notes||'',changed_fields:input.validation.changed_fields||[]}:{status:'needs_marketer_confirmation'}};
    return {outputs:[out],receipts,loaded:[...loaded.values()]};
   }
   foundations[stage.key]={...out.data,stage:stage.key};
   progress?.keep(stage.key,{data:out.data,receipts:res.receipts||[],pipeline:entry});
   progress?.finish(stage.key,summaryOf(out.data));
  }catch(e){progress?.fail(stage.key,e.message);throw new Error('Stage '+(i+1)+' ('+stage.label+') failed: '+e.message);}
 }
}
