// Strategy inputs, in the order the staged pipeline uses them.
// Shared by the chat intake (one question at a time) and the guided dialog.
export const STRATEGY_SECTIONS=[
 {key:'business',label:'The business',note:'Used by every stage.'},
 {key:'positioning',label:'Stage 1 · Positioning',note:'Positioning Audit uses these first.'},
 {key:'offer',label:'Stage 2 · Offer',note:'Offer Design builds on the positioning.'},
 {key:'funnel',label:'Stage 3 · Funnel & channels',note:'Funnel Architect maps how people buy.'},
 {key:'growth',label:'Stage 4 · Growth plan',note:'Growth Plan combines everything above.'},
];
const opt=' Reply skip if unknown.';
const choices=(...items)=>Object.fromEntries(items.map(item=>[item,item]));
export const STRATEGY_FIELDS=[
 {key:'objective',section:'business',required:true,type:'multi-choice',label:'What business results should this strategy achieve?',options:choices('Increase qualified leads','Increase sales or revenue','Build brand awareness','Launch a new offer','Enter a new market','Improve retention or repeat purchases','Clarify positioning')},
 {key:'business_model',section:'business',required:true,type:'multi-choice',label:'How does the business make money?',options:choices('One-time product purchases','Recurring subscription or membership','Project-based services','Monthly retainer services','Appointments or consultations','Commission or marketplace fees','Licensing or usage fees')},
 {key:'audience',section:'positioning',required:true,type:'text',label:'Who is the real buying audience?',hint:'Describe the specific person, company or decision-maker.'},
 {key:'customer_problem',section:'positioning',required:true,type:'text',label:'What problem is the customer trying to solve?',hint:'Use the customer’s words if possible.'},
 {key:'current_positioning',section:'positioning',required:true,type:'text',label:'How does the business currently describe itself?',hint:'Paste the current description or write one sentence.'},
 {key:'proof',section:'positioning',required:true,type:'text',label:'What approved proof supports the promise?',hint:'Add verified outcomes, case studies or quotes, or write “No approved proof yet”.'},
 {key:'competitors',section:'positioning',required:false,type:'text',label:'Which competitors should be compared? Names or links, one per line.'+opt},
 {key:'core_deliverable',section:'offer',required:true,type:'text',label:'What exactly does the customer receive?',hint:'List the actual product, service or deliverables.'},
 {key:'offer',section:'offer',required:true,type:'text',label:'What is the current offer, price or commercial next step?',hint:'Include the price or pricing structure if it is approved.'},
 {key:'desired_action',section:'offer',required:true,type:'multi-choice',label:'What should a potential customer be able to do next?',options:choices('Buy online','Book an appointment','Request a consultation','Request a quote','Start a free trial','Visit a location','Call the business','Send a WhatsApp message','Submit an enquiry form')},
 {key:'channels',section:'funnel',required:false,type:'multi-choice',label:'Which marketing or sales channels are used today?'+opt,options:choices('Instagram','Facebook','LinkedIn','YouTube','Google Search','Google Business Profile','Website or SEO','Email','WhatsApp','Offline or events','Partners or referrals','Paid advertising')},
 {key:'sales_process',section:'funnel',required:false,type:'multi-choice',label:'How can an enquiry become a customer today?'+opt,options:choices('Direct online purchase','Enquiry → call → purchase','Enquiry → consultation → proposal → purchase','Message → appointment → purchase','Lead → sales demo → contract','Store visit → purchase','No defined sales process yet')},
 {key:'timing',section:'growth',required:true,label:'What time period should the strategy cover?',options:choices('Next 30 days','Next 90 days','Next 6 months','Next 12 months','Launch-specific period','Always-on strategy')},
 {key:'budget_range',section:'growth',required:false,type:'budget-slider',label:'What monthly paid marketing budget is realistic (INR)?'+opt,values:[0,5000,10000,15000,20000,25000,30000,40000,50000,75000,100000,150000,200000,300000,500000,750000,1000000,1500000,2000000,3000000,5000000]},
 {key:'success_measure',section:'growth',required:true,type:'multi-choice',label:'Which measurable outcomes will define success?',options:choices('Qualified leads','Sales or revenue','Bookings or appointments','Conversion rate','Cost per lead or acquisition','Website traffic','Brand reach or awareness','Repeat purchases or retention','Return on ad spend')},
 {key:'team',section:'growth',required:false,hidden:true,defaultValue:'Marketer using EXORA',label:'Who is available to execute the marketing strategy?'},
 {key:'constraints',section:'growth',required:false,type:'multi-choice',label:'Which constraints must the strategy respect?'+opt,options:choices('Limited team capacity','Limited content production','Limited sales capacity','Fixed budget','Legal or regulatory rules','Claims require approval','Seasonal demand','Geographic limits','No known constraints')},
 {key:'references',section:'growth',required:false,type:'text',label:'Source links or evidence the strategy may rely on, one per line.'+opt},
];
export const STRATEGY_KEYS=STRATEGY_FIELDS.map(f=>f.key);
const NO_PROOF=/^\s*(no( approved)? proof( yet)?|none|n\/a)\.?\s*$/i;

export function isStrategyDraft(tool,args){return tool?.id==='draft'&&args?.step==='strategy';}

// Only known keys, trimmed and capped. Skipped fields stay absent.
export function strategyInputs(args={}){
 const out={};
 for(const k of STRATEGY_KEYS){const v=args[k];if(v===undefined||v===null||args['__skip_'+k])continue;const s=String(v).trim().slice(0,4000);if(s)out[k]=s;}
 return out;
}

// Every input with where it came from, so later stages can tell fact from assumption.
export function inputsLedger(inputs={}){
 return STRATEGY_FIELDS.map(f=>{
  const v=inputs[f.key];
  if(!v)return {field:f.key,stage:f.section,status:'not_provided',value:null};
  if(f.defaultValue&&v===f.defaultValue)return {field:f.key,stage:f.section,status:'platform_default',value:v};
  if(f.key==='proof'&&NO_PROOF.test(v))return {field:f.key,stage:f.section,status:'no_proof',value:v};
  return {field:f.key,stage:f.section,status:'user_provided',value:v};
 });
}

export function strategyBrief(inputs={},brief=''){
 const lines=STRATEGY_FIELDS.filter(f=>inputs[f.key]).map(f=>f.key.replaceAll('_',' ')+': '+inputs[f.key]);
 return [String(brief||'').trim(),...lines].filter(Boolean).join('\n\n')||'Marketing strategy';
}

// Answers already saved on the client, offered back instead of retyped.
export function strategyDefaults(args,client){
 const brief=client?.data?.brief||{};
 const out={...Object.fromEntries(STRATEGY_FIELDS.filter(f=>f.defaultValue).map(f=>[f.key,f.defaultValue])),...args};
 if(brief.audience&&!out.audience&&!out.__default_audience)out.__default_audience=String(brief.audience);
 if(brief.offer&&!out.offer&&!out.__default_offer)out.__default_offer=String(brief.offer);
 return out;
}
export const KEEP=/^(keep|same|use it|use that|yes)$/i;

export function nextStrategyField(args){
 for(const f of STRATEGY_FIELDS){if(args['__skip_'+f.key])continue;if(args[f.key]===undefined||args[f.key]==='')return f;}
 return null;
}

export function strategyQuestion(field,args={}){
 const i=STRATEGY_FIELDS.indexOf(field);
 const prev=STRATEGY_FIELDS[i-1];
 const section=STRATEGY_SECTIONS.find(s=>s.key===field.section);
 const head=!prev||prev.section!==field.section?`${section.label}. ${section.note}\n\n`:'';
 const saved=args['__default_'+field.key]?`\nSaved answer: ${args['__default_'+field.key]}\nReply keep to use it.`:'';
 return `${head}Question ${i+1} of ${STRATEGY_FIELDS.length}: ${field.label}${saved}`;
}

export function strategyConfirm(args){
 const inputs=strategyInputs(args);
 const given=STRATEGY_FIELDS.filter(f=>inputs[f.key]).map(f=>'• '+f.key.replaceAll('_',' ')+': '+inputs[f.key].replace(/\s+/g,' ').slice(0,200));
 const missing=STRATEGY_FIELDS.filter(f=>!inputs[f.key]).map(f=>f.key.replaceAll('_',' '));
 return ['Ready to build the strategy in four stages, in this order:\n1. Positioning audit\n2. Offer design (uses the positioning)\n3. Funnel & channels (uses positioning and offer)\n4. Growth plan (last; combines all three)',
  'Your answers:\n'+given.join('\n'),
  missing.length?'Not provided (will be shown as assumptions, not facts): '+missing.join(', '):'',
  'Start the strategy?'].filter(Boolean).join('\n\n');
}
