// Strategy inputs, in the order the staged pipeline uses them.
// Shared by the chat intake (one question at a time) and the guided dialog.
// Labels change by node: client (company) / brand / product. Keys stay the same so stages stay compatible.

export const STRATEGY_SECTIONS=[
 {key:'business',label:'The business',note:'Used by every stage.'},
 {key:'positioning',label:'Stage 1 · Positioning',note:'Positioning Audit uses these first.'},
 {key:'offer',label:'Stage 2 · Offer',note:'Offer Design builds on the positioning.'},
 {key:'funnel',label:'Stage 3 · Funnel & channels',note:'Funnel Architect maps how people buy.'},
 {key:'growth',label:'Stage 4 · Growth plan',note:'Growth Plan combines everything above.'},
];

export const STRATEGY_LEVELS={
 company:{
  key:'company',label:'Client',noun:'client',title:'Client strategy',
  about:'Account-level direction: shared market, brand architecture, and where spend goes. Brand and product strategies sit under this — they do not replace it.',
  altitude:'Write at CLIENT (company) altitude. Cover the whole account, not one brand’s voice or one product’s offer. Name which brands or products inherit this, and what they must still decide themselves.',
  sections:{
   business:{label:'The client account',note:'Shared facts for every brand under this client.'},
   positioning:{label:'Stage 1 · Client positioning',note:'How the company is known in the market, before any one brand.'},
   offer:{label:'Stage 2 · Commercial model',note:'How the account makes money across brands and products.'},
   funnel:{label:'Stage 3 · Shared channels',note:'Channels and sales paths the client owns together.'},
   growth:{label:'Stage 4 · Account growth',note:'Where investment goes across the portfolio.'},
  },
  labels:{
   objective:'What results should this client-level strategy achieve across the whole account?',
   business_model:'How does this client make money across its brands and products?',
   audience:'Who is the shared market this client serves — not one product’s buyers?',
   customer_problem:'What problem does the client as a whole help people solve?',
   current_positioning:'How does the client currently describe itself as a company?',
   proof:'What approved proof supports the client promise (group results, not one SKU)?',
   competitors:'Which competing companies should this client be compared with? Names or links, one per line.',
   core_deliverable:'What does the client actually deliver across the account?',
   offer:'What is the client’s commercial model or retainer — not one product’s price?',
   desired_action:'What should a potential customer of this client be able to do first?',
   channels:'Which channels does the client run at account level?',
   sales_process:'How does an enquiry become a customer for this client today?',
   timing:'What time period should this client strategy cover?',
   budget_range:'What monthly paid budget is realistic for the whole client (INR)?',
   success_measure:'Which outcomes define success for the client account?',
   constraints:'Which constraints must every brand under this client respect?',
  },
 },
 brand:{
  key:'brand',label:'Brand',noun:'brand',title:'Brand strategy',
  about:'How this brand shows up: promise, audience, and difference from sibling brands. Product strategies sit under this. Client strategy sits above it.',
  altitude:'Write at BRAND altitude. This is identity and market position for one customer-facing brand. Do not write a product GTM or a whole-account plan. Inherit client constraints; leave product offers to product strategies.',
  sections:{
   business:{label:'This brand',note:'Facts for this brand only — not the parent client, not a product.'},
   positioning:{label:'Stage 1 · Brand positioning',note:'What this brand stands for versus other brands.'},
   offer:{label:'Stage 2 · Brand offer system',note:'The brand’s commercial promise. SKU-level prices belong on products.'},
   funnel:{label:'Stage 3 · Brand channels',note:'Where this brand speaks and how people buy under it.'},
   growth:{label:'Stage 4 · Brand growth',note:'How this brand grows inside the client account.'},
  },
  labels:{
   objective:'What should this brand achieve in the market?',
   business_model:'How does this brand make money?',
   audience:'Who does this brand speak to?',
   customer_problem:'What problem does this brand own in the customer’s mind?',
   current_positioning:'How does this brand currently describe itself?',
   proof:'What approved proof supports this brand’s promise?',
   competitors:'Which competing brands should be compared? Names or links, one per line.',
   core_deliverable:'What does a customer of this brand actually get?',
   offer:'What is this brand’s commercial promise or price range?',
   desired_action:'What should someone do next after meeting this brand?',
   channels:'Which channels does this brand use today?',
   sales_process:'How does an enquiry become a customer of this brand?',
   timing:'What time period should this brand strategy cover?',
   budget_range:'What monthly paid budget is realistic for this brand (INR)?',
   success_measure:'Which outcomes define success for this brand?',
   constraints:'Which constraints must this brand’s marketing respect?',
  },
 },
 product:{
  key:'product',label:'Product',noun:'product',title:'Product strategy',
  about:'Go-to-market for this offer: who buys it, the price, proof, and the next step. Voice and look come from the parent brand. Client strategy sits above both.',
  altitude:'Write at PRODUCT altitude. This is go-to-market for one offer. Do not rewrite the parent brand’s identity. Use the brand kit and any parent strategy as given; focus on who buys this product, the offer, and the conversion path.',
  sections:{
   business:{label:'This product',note:'Facts for this offer only. Brand voice is inherited.'},
   positioning:{label:'Stage 1 · Product positioning',note:'Why someone picks this product, not the whole brand.'},
   offer:{label:'Stage 2 · This offer',note:'Price, deliverable and next step for this product.'},
   funnel:{label:'Stage 3 · Product path',note:'How this product is found, considered and bought.'},
   growth:{label:'Stage 4 · Product growth',note:'Targets and spend for this product, under the brand plan.'},
  },
  labels:{
   objective:'What should marketing for this product achieve?',
   business_model:'How is this product paid for?',
   audience:'Who buys this specific product?',
   customer_problem:'What job is the buyer hiring this product to do?',
   current_positioning:'How is this product currently described?',
   proof:'What approved proof supports claims about this product?',
   competitors:'Which competing products should be compared? Names or links, one per line.',
   core_deliverable:'What exactly does the customer receive with this product?',
   offer:'What is the price or commercial next step for this product?',
   desired_action:'What should a potential buyer of this product do next?',
   channels:'Where is this product marketed or sold today?',
   sales_process:'How does someone go from interest to buying this product?',
   timing:'What time period should this product strategy cover?',
   budget_range:'What monthly paid budget is realistic for this product (INR)?',
   success_measure:'Which outcomes define success for this product?',
   constraints:'Which constraints must this product’s marketing respect?',
  },
 },
};

const opt=' Reply skip if unknown.';
const choices=(...items)=>Object.fromEntries(items.map(item=>[item,item]));
export const STRATEGY_FIELDS=[
 {key:'objective',section:'business',required:true,type:'multi-choice',label:'What business results should this strategy achieve?',options:choices('Increase qualified leads','Increase sales or revenue','Build brand awareness','Launch a new offer','Enter a new market','Improve retention or repeat purchases','Clarify positioning')},
 {key:'business_model',section:'business',required:true,type:'multi-choice',label:'How does the business make money?',options:choices('One-time product purchases','Recurring subscription or membership','Project-based services','Monthly retainer services','Appointments or consultations','Commission or marketplace fees','Licensing or usage fees')},
 {key:'brand_architecture',section:'business',required:false,levels:['company'],type:'multi-choice',label:'How do brands under this client relate?'+opt,options:choices('One master brand','Separate brands under one client','A mix of shared and distinct brands','Only one brand so far')},
 {key:'audience',section:'positioning',required:true,type:'text',label:'Who is the real buying audience?',hint:'Describe the specific person, company or decision-maker.'},
 {key:'customer_problem',section:'positioning',required:true,type:'text',label:'What problem is the customer trying to solve?',hint:'Use the customer’s words if possible.'},
 {key:'current_positioning',section:'positioning',required:true,type:'text',label:'How does the business currently describe itself?',hint:'Paste the current description or write one sentence.'},
 {key:'sibling_difference',section:'positioning',required:false,levels:['brand'],type:'text',label:'How should this brand differ from other brands under the same client?'+opt,hint:'Skip if this is the only brand.'},
 {key:'product_role',section:'positioning',required:false,levels:['product'],type:'text',label:'What role does this product play in the brand (hero SKU, entry offer, premium line)?'+opt},
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

export function strategyLevel(client){
 const t=client?.node_type||'company';
 return t==='brand'?'brand':t==='product'?'product':'company';
}
export function strategyMeta(client){return STRATEGY_LEVELS[strategyLevel(client)];}
export function strategyDate(at=new Date()){
 return new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(at);
}
export function strategyDatedTitle(client,at=new Date()){
 const scope=strategyScope(client);
 return `${client?.name||'Workspace'} · ${scope.title} · ${strategyDate(at)}`.slice(0,300);
}
export function ensureDatedTitle(title,client,at=new Date()){
 const scope=strategyScope(client);
 const date=strategyDate(at);
 const t=String(title||'').trim();
 if(t&&t.includes(date)&&t.toLowerCase().includes(scope.title.toLowerCase()))return t.slice(0,300);
 return strategyDatedTitle(client,at);
}
export function strategyScope(client){
 const meta=strategyMeta(client);
 const chain=client?.chain||[];
 const path=chain.length?chain.slice().reverse().map(n=>n.name).join(' › '):(client?.name||'');
 const parent=chain[1]||null;
 const company=chain[chain.length-1]||null;
 return {level:meta.key,label:meta.label,noun:meta.noun,title:meta.title,about:meta.about,altitude:meta.altitude,name:client?.name||'',path,parent_name:parent?.name||null,company_name:company?.name||client?.name||null};
}
export function strategySectionsFor(client){
 const overlay=strategyMeta(client).sections||{};
 return STRATEGY_SECTIONS.map(s=>({...s,...(overlay[s.key]||{})}));
}
export function strategyFieldsFor(client){
 const level=strategyLevel(client);
 const labels=strategyMeta(client).labels||{};
 return STRATEGY_FIELDS.filter(f=>!f.levels||f.levels.includes(level)).map(f=>({...f,label:labels[f.key]||f.label}));
}

export function isStrategyDraft(tool,args){return tool?.id==='draft'&&args?.step==='strategy';}

// Only known keys, trimmed and capped. Skipped fields stay absent.
export function strategyInputs(args={}){
 const out={};
 for(const k of STRATEGY_KEYS){const v=args[k];if(v===undefined||v===null||args['__skip_'+k])continue;const s=String(v).trim().slice(0,4000);if(s)out[k]=s;}
 return out;
}

// Every input with where it came from, so later stages can tell fact from assumption.
export function inputsLedger(inputs={},client){
 return strategyFieldsFor(client).map(f=>{
  const v=inputs[f.key];
  if(!v)return {field:f.key,stage:f.section,status:'not_provided',value:null};
  if(f.defaultValue&&v===f.defaultValue)return {field:f.key,stage:f.section,status:'platform_default',value:v};
  if(f.key==='proof'&&NO_PROOF.test(v))return {field:f.key,stage:f.section,status:'no_proof',value:v};
  return {field:f.key,stage:f.section,status:'user_provided',value:v};
 });
}

export function strategyBrief(inputs={},brief='',client){
 const scope=client?strategyScope(client):null;
 const head=scope?`Strategy level: ${scope.title} for ${scope.path||scope.name}`:'';
 const lines=strategyFieldsFor(client).filter(f=>inputs[f.key]).map(f=>f.key.replaceAll('_',' ')+': '+inputs[f.key]);
 return [head,String(brief||'').trim(),...lines].filter(Boolean).join('\n\n')||'Marketing strategy';
}

// Answers already saved on the client, offered back instead of retyped.
export function strategyDefaults(args,client){
 const brief=client?.data?.brief||{};
 const fields=strategyFieldsFor(client);
 const out={...Object.fromEntries(fields.filter(f=>f.defaultValue).map(f=>[f.key,f.defaultValue])),...args};
 if(brief.audience&&!out.audience&&!out.__default_audience)out.__default_audience=String(brief.audience);
 if(brief.offer&&!out.offer&&!out.__default_offer)out.__default_offer=String(brief.offer);
 if(brief.description&&!out.core_deliverable&&!out.__default_core_deliverable&&strategyLevel(client)==='product')out.__default_core_deliverable=String(brief.description);
 return out;
}
export const KEEP=/^(keep|same|use it|use that|yes)$/i;

export function nextStrategyField(args,client){
 for(const f of strategyFieldsFor(client)){if(f.hidden)continue;if(args['__skip_'+f.key])continue;if(args[f.key]===undefined||args[f.key]==='')return f;}
 return null;
}

export function strategyQuestion(field,args={},client){
 const fields=strategyFieldsFor(client);
 const i=fields.findIndex(f=>f.key===field.key);
 const prev=i>0?fields[i-1]:null;
 const sections=strategySectionsFor(client);
 const section=sections.find(s=>s.key===field.section);
 const scope=client?strategyScope(client):null;
 const scopeLine=scope&&(!prev)?`${scope.title} for ${scope.name}. ${scope.about}\n\n`:'';
 const head=!prev||prev.section!==field.section?`${section.label}. ${section.note}\n\n`:'';
 const saved=args['__default_'+field.key]?`\nSaved answer: ${args['__default_'+field.key]}\nReply keep to use it.`:'';
 const visible=fields.filter(f=>!f.hidden);
 const n=visible.findIndex(f=>f.key===field.key);
 return `${scopeLine}${head}Question ${n+1} of ${visible.length}: ${field.label}${saved}`;
}

export function strategyConfirm(args,client){
 const inputs=strategyInputs(args);
 const fields=strategyFieldsFor(client);
 const scope=client?strategyScope(client):null;
 const given=fields.filter(f=>inputs[f.key]).map(f=>'• '+f.key.replaceAll('_',' ')+': '+inputs[f.key].replace(/\s+/g,' ').slice(0,200));
 const missing=fields.filter(f=>!f.hidden&&!inputs[f.key]).map(f=>f.key.replaceAll('_',' '));
 return [
  scope?`Ready to build the ${scope.title.toLowerCase()} for ${scope.path||scope.name}.`:'Ready to build the strategy.',
  'Four stages, in this order:\n1. Positioning audit\n2. Offer design (uses the positioning)\n3. Funnel & channels (uses positioning and offer)\n4. Growth plan (last; combines all three)',
  'Your answers:\n'+given.join('\n'),
  missing.length?'Not provided (will be shown as assumptions, not facts): '+missing.join(', '):'',
  'Start the strategy?',
 ].filter(Boolean).join('\n\n');
}
