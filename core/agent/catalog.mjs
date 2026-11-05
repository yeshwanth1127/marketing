import {z} from 'zod';
import {catalog as moduleCatalog,loadModule} from '../runtime/index.mjs';
import {brandFields,companyFields,detailFields,productFields} from './intake.mjs';
import {MONTH_FIELDS} from './month-fields.mjs';

export const GROUPS={
 read:'Look up what is already saved for this client: reviews, files, the brand, numbers, receipts.',
 clients:'Create or update the company, a brand, a product, or the brand kit.',
 draft:'Start a draft with the marketing skills. The draft is saved for editing and still needs review.',
 edit:'Edit a draft, make a new version, or choose a hook.',
 visuals:'Make a post, carousel, or reel, or clean up a soundtrack.',
 skill:'Run one declared skill script and show its result.',
 review:'Send writing, a visual, a strategy, a post, or an ad to the Review page.',
 posting:'Plan a post. This only creates a review item.',
 numbers:'Add numbers, a report, or a lesson. Numbers need a real, estimated, or inferred label from the marketer.',
 team:'Add or move a task, or draft a company invoice.',
 talk:'Explain, compare, or recommend from this client’s existing work. Nothing is saved.',
};

const KINDS=['BrandKit','Strategy','Campaign','Idea','Asset','Approval','Post','Ad','Metric','Report','Learning','Task'];
const STATUSES=['draft','awaiting_review','changes_requested','approved','rejected','scheduled','published','archived','recorded','todo','in_progress','done'];
const kindOptions=Object.fromEntries(KINDS.map(k=>[k,k]));
const statusOptions=Object.fromEntries(STATUSES.map(s=>[s,s]));

export const DRAFT_STEPS={
 'brand kit':'01-onboard',strategy:'02-strategy',plan:'03-plan',hooks:'04-hooks',writing:'05-content',
 SEO:'seo','AI answers':'geo',ads:'ads',creators:'influencers',team:'managing',report:'09-results',
};
const LAYOUTS=['hook','offer','myth-fact','faq','festival','list','before-after','behind-scenes','proof','event'];
const choice=(options,question,optional=false)=>({type:'choice',question,options,optional});

const id=z.string().regex(/^[0-9a-f-]{36}$/i);
const opt=s=>s.optional();

export const TOOLS=[
 {id:'get_context',group:'read',description:'Say where we are, the person’s role, and the first missing step.',risk:'read',roles:['admin','marketer','reviewer'],action:'get-context',closed:{},open:[],schema:z.object({})},
 {id:'list_items',group:'read',description:'List records of one kind, such as reviews, posts, or drafts.',risk:'read',roles:['admin','marketer','reviewer'],action:'list-items',closed:{kind:choice(kindOptions,'Which kind of record is being asked for?'),status:choice(statusOptions,'Which status, if they named one?',true)},open:[],schema:z.object({kind:z.enum(KINDS),status:opt(z.enum(STATUSES))}),mustState:[]},
 {id:'get_item',group:'read',description:'Open one record by its id.',risk:'read',roles:['admin','marketer','reviewer'],action:'get-item',closed:{},open:[{key:'id',required:true,label:'Which item? Paste its id.'}],schema:z.object({id})},
 {id:'get_rollup',group:'read',description:'Totals for this company or brand and everything under it.',risk:'read',roles:['admin','marketer','reviewer'],action:'get-rollup',closed:{},open:[],schema:z.object({})},
 {id:'list_files',group:'read',description:'List uploaded files for this client.',risk:'read',roles:['admin','marketer','reviewer'],action:'list-files',closed:{},open:[],schema:z.object({})},
 {id:'get_brand_kit',group:'read',description:'Show the brand kit in use, including one inherited from above.',risk:'read',roles:['admin','marketer','reviewer'],action:'get-brand',closed:{},open:[],schema:z.object({})},
 {id:'design_options',group:'read',description:'List fonts and layout types the design engine can use.',risk:'read',roles:['admin','marketer','reviewer'],action:'design-options',closed:{},open:[],schema:z.object({})},
 {id:'results_summary',group:'read',description:'Sum the numbers, split into real, estimated, and inferred.',risk:'read',roles:['admin','marketer','reviewer'],action:'results-summary',closed:{},open:[],schema:z.object({})},
 {id:'receipts',group:'read',description:'Show recent skill receipts for this client.',risk:'read',roles:['admin','marketer','reviewer'],action:'receipts',closed:{},open:[],schema:z.object({})},
 {id:'job_status',group:'read',description:'Check a draft, render, or tool job.',risk:'read',roles:['admin','marketer','reviewer'],action:'job-status',closed:{},open:[{key:'id',required:true,label:'Which job id?'}],schema:z.object({id})},
 {id:'create_company',group:'clients',description:'Create a new company.',risk:'confirm',roles:['admin','marketer'],needsCompanyMember:true,action:'create-company',closed:{},open:companyFields,schema:z.object({name:z.string().min(1),industry:z.string().min(1),city:z.string().min(1)}).passthrough()},
 {id:'add_brand',group:'clients',description:'Add a brand under this company.',risk:'confirm',roles:['admin','marketer'],needsCompanyMember:true,nodes:['company'],action:'add-brand',closed:{},open:brandFields,schema:z.object({name:z.string().min(1)}).passthrough()},
 {id:'add_product',group:'clients',description:'Add a product under this company or brand.',risk:'confirm',roles:['admin','marketer'],needsCompanyMember:true,nodes:['company','brand'],action:'add-product',closed:{},open:productFields,schema:z.object({name:z.string().min(1),description:z.string().min(1)}).passthrough()},
 {id:'update_details',group:'clients',description:'Change this client’s name, city, website, notes, or languages. Missing fields stay as they are.',risk:'confirm',roles:['admin','marketer'],action:'update-details',closed:{},open:detailFields,schema:z.object({}).passthrough()},
 {id:'set_brand_kit',group:'clients',description:'Build the brand kit from uploaded files (logo, PDF, deck, text, or anything readable). Colours, fonts, voice, and rules are extracted into the brand kit; nothing is saved until the marketer confirms.',risk:'confirm',roles:['admin','marketer'],module:'01-onboard',action:'apply-brand-kit',closed:{},open:[{key:'file_ids',required:true,label:'Attach one or more brand files.'}],schema:z.object({file_ids:z.array(id).min(1).max(10).optional(),file_id:id.optional(),confirmed:opt(z.boolean())}).passthrough()},
 {id:'draft',group:'draft',description:'Draft a brand kit, strategy, plan, hooks, writing, SEO, AI answers, ads, creators, team tasks, or a report.',risk:'draft',roles:['admin','marketer'],action:'draft',closed:{step:choice(Object.fromEntries(Object.keys(DRAFT_STEPS).map(k=>[k,k])),'Which step should be drafted?'),language:choice({English:'English',Hindi:'Hindi',Hinglish:'Hinglish',Kannada:'Kannada',Tamil:'Tamil'},'Which language, if they named one?',true),format:choice({Reel:'Reel',Carousel:'Carousel',Story:'Story',Blog:'Blog',Email:'Email','Ad copy':'Ad copy'},'Which format, if they named one?',true)},open:[{key:'brief',required:true,label:'What is this draft for? A sentence of real detail is enough.'}],schema:z.object({step:z.enum(Object.keys(DRAFT_STEPS)),brief:z.string().min(1)}).passthrough()},
 {id:'draft_month',group:'draft',description:'Produce a whole month: calendar, scored hooks, scripts, designs, ads and SEO. Ask how many posts, reels, carousels and ads first.',risk:'confirm',roles:['admin','marketer'],action:'produce-month',closed:{language:choice({English:'English',Hindi:'Hindi',Hinglish:'Hinglish',Kannada:'Kannada',Tamil:'Tamil','English + Tamil':'English + Tamil'},'Which language, if they named one?',true)},open:MONTH_FIELDS.filter(f=>f.key!=='language'),schema:z.object({goal:z.string().min(1),posts:z.coerce.number().int().min(0).max(30),reels:z.coerce.number().int().min(0).max(20),carousels:z.coerce.number().int().min(0).max(20),ads:z.coerce.number().int().min(0).max(20)}).passthrough()},
 {id:'ready_check',group:'read',description:'Show what is still missing before a new client or a monthly run can start.',risk:'read',roles:['admin','marketer','reviewer'],action:'ready-check',closed:{},open:[],schema:z.object({})},
 {id:'client_questionnaire',group:'clients',description:'Write the WhatsApp onboarding questionnaire to copy-paste to the client.',risk:'read',roles:['admin','marketer'],action:'client-questionnaire',closed:{},open:[],schema:z.object({})},
 {id:'import_questionnaire',group:'clients',description:'Save the client’s pasted WhatsApp reply. Does not invent prices or proof.',risk:'confirm',roles:['admin','marketer'],action:'import-questionnaire',closed:{},open:[{key:'text',required:true,label:'Paste the client’s reply.'}],schema:z.object({text:z.string().min(1)})},
 {id:'apply_package',group:'clients',description:'Apply a monthly package (Starter, Growth, or Content only). Copies counts and tasks, never another client’s content.',risk:'confirm',roles:['admin','marketer'],action:'apply-package',closed:{package_id:choice({starter:'Starter — 12 posts · 4 reels · ads',growth:'Growth — 12 posts · 6 reels · ads · SEO',content:'Content only — 12 posts · 4 reels'},'Which package?')},open:[],schema:z.object({package_id:z.enum(['starter','growth','content'])})},
 {id:'record_client_decision',group:'review',description:'Record what the client said on WhatsApp about a pack or asset: approved, changes, or rejected.',risk:'confirm',roles:['admin','marketer'],action:'record-client-decision',closed:{decision:choice({approved:'Client approved',changes_requested:'Client asked for changes',rejected:'Client rejected'},'What did the client say?')},open:[{key:'id',required:true,label:'Which item or job id?'},{key:'note',required:false,label:'Optional note from the WhatsApp message.'}],schema:z.object({id,decision:z.enum(['approved','changes_requested','rejected'])}).passthrough()},
 {id:'month_pack',group:'read',description:'Prepare the delivery folder for this month: captions, calendar, ads sheet, SEO checklist and rendered files.',risk:'read',roles:['admin','marketer'],action:'month-pack',closed:{},open:[{key:'id',required:false,label:'Month job id, or skip for the latest run.'}],schema:z.object({id:id.optional()})},
 {id:'save_item',group:'edit',description:'Save edits to a draft that is not locked.',risk:'draft',roles:['admin','marketer'],action:'save-item',closed:{},open:[{key:'id',required:true,label:'Which draft id should I update?'},{key:'title',required:false,label:'What is the new title? Reply skip to keep it.'},{key:'body',required:false,label:'What should the text say? Reply skip to keep it.'}],schema:z.object({id}).passthrough()},
 {id:'new_version',group:'edit',description:'Copy an approved asset or strategy into a new draft.',risk:'draft',roles:['admin','marketer'],action:'revise',closed:{},open:[{key:'id',required:true,label:'Which approved item should get a new version?'}],schema:z.object({id})},
 {id:'choose_hook',group:'edit',description:'Pick one of the scored opening lines.',risk:'draft',roles:['admin','marketer'],module:'04-hooks',action:'choose-hook',closed:{index:choice({0:'Option 1',1:'Option 2',2:'Option 3'},'Which opening line did they pick?')},open:[{key:'id',required:true,label:'Which idea should I update?'}],schema:z.object({id,index:z.coerce.number().int().min(0).max(20)})},
 {id:'make_visual',group:'visuals',description:'Render a post, carousel, or reel from a piece of writing.',risk:'draft',roles:['admin','marketer'],module:'06-design-video',action:'render',closed:{type:choice({image:'A single image',carousel:'A carousel',video:'A reel'},'Image, carousel, or reel?'),format:choice({square:'1:1',portrait:'4:5',reel:'9:16',landscape:'1.91:1'},'Which placement size?'),layout:choice(Object.fromEntries(LAYOUTS.map(k=>[k,k])),'Which layout type, if they named one?',true),composer:choice({template:'Fixed template',claude:'Claude designs'},'Template or Claude, if they said?',true)},open:[{key:'asset_id',required:true,label:'Which piece of writing should this visual use?'}],schema:z.object({type:z.enum(['image','carousel','video']),format:z.enum(['square','portrait','reel','landscape']),asset_id:id}).passthrough()},
 {id:'clean_sound',group:'visuals',description:'Denoise and normalise an uploaded audio or video file.',risk:'draft',roles:['admin','marketer'],module:'06-design-video',action:'clean-media',closed:{},open:[{key:'file_id',required:true,label:'Which audio or video file?'},{key:'licence',required:true,label:'What licence covers this file? I will not guess it.'}],schema:z.object({file_id:id,licence:z.string().min(4)})},
 {id:'send_for_review',group:'review',description:'Send writing, a visual, a strategy, a post, or an ad to Review.',risk:'confirm',roles:['admin','marketer'],module:'07-approve',action:'submit-approval',closed:{},open:[{key:'id',required:true,label:'Which item should go to Review?'}],schema:z.object({id})},
 {id:'plan_post',group:'posting',description:'Plan when an approved asset posts. Only a review item is created.',risk:'confirm',roles:['admin','marketer'],module:'08-publish',action:'schedule',closed:{platform:choice({Instagram:'Instagram',Facebook:'Facebook',YouTube:'YouTube',WhatsApp:'WhatsApp',Website:'Website'},'Which platform?')},open:[{key:'asset_id',required:true,label:'Which approved asset?'},{key:'scheduled_at',required:true,label:'When should it go out? Give a date and time.'},{key:'to',required:false,label:'WhatsApp number with country code, or skip.'}],schema:z.object({platform:z.enum(['Instagram','Facebook','YouTube','WhatsApp','Website']),asset_id:id,scheduled_at:z.string().min(4),to:opt(z.string())})},
 {id:'plan_ad_change',group:'posting',description:'Plan a Meta or Google launch, pause, or budget change. Only a review item is created.',risk:'confirm',roles:['admin','marketer'],module:'ads',action:'ad-action',closed:{platform:choice({Meta:'Meta',Google:'Google'},'Meta or Google?'),operation:choice({launch:'Launch',pause:'Pause',change_budget:'Change the budget'},'Launch, pause, or change the budget?')},open:[{key:'title',required:true,label:'What should we call this ad change?'},{key:'budget',required:true,label:'What budget in rupees did they state?'},{key:'asset_id',required:false,label:'An approved creative id, or skip.'}],schema:z.object({platform:z.enum(['Meta','Google']),operation:z.enum(['launch','pause','change_budget']),title:z.string().min(1),budget:z.coerce.number().nonnegative()}).passthrough(),mustState:['budget']},
 {id:'meta_status',group:'read',description:'Show whether Meta Ads is connected for this client, and which ad account is selected.',risk:'read',roles:['admin','marketer','reviewer'],action:'meta-status',closed:{},open:[],schema:z.object({})},
 {id:'connect_meta',group:'posting',description:'Start Facebook Login for Business so this client can connect Meta Ads. Returns a URL. Nothing is spent.',risk:'confirm',roles:['admin','marketer'],action:'connect-meta',closed:{},open:[],schema:z.object({})},
 {id:'pick_meta_account',group:'posting',description:'Choose which Meta ad account this client uses for approved launches.',risk:'confirm',roles:['admin','marketer'],action:'select-meta-account',closed:{},open:[{key:'ad_account_id',required:true,label:'Which ad account id (act_…)?'}],schema:z.object({ad_account_id:z.string().min(4)})},
 {id:'pull_meta_insights',group:'numbers',description:'Pull the last 7 days of Meta Ads numbers and save them as real metrics.',risk:'confirm',roles:['admin','marketer'],module:'09-results',action:'pull-meta-insights',closed:{},open:[],schema:z.object({})},
 {id:'import_numbers_csv',group:'numbers',description:'Import a CSV of numbers. Each row must already say real, estimated, or inferred.',risk:'confirm',roles:['admin','marketer'],module:'09-results',action:'import-csv',closed:{},open:[{key:'csv',required:true,label:'Paste the sheet, or attach a CSV. Columns: date, source, metric, value, label.'}],schema:z.object({csv:z.string().min(1)}).passthrough()},
 {id:'add_number',group:'numbers',description:'Add one number. The marketer must say whether it is real, estimated, or inferred.',risk:'confirm',roles:['admin','marketer'],module:'09-results',action:'add-number',closed:{metric:choice(Object.fromEntries(['impressions','reach','clicks','leads','spend','revenue','engagements','conversions','followers'].map(k=>[k,k])),'Which metric?'),label:choice({real:'They said it is real',estimated:'They said it is estimated',inferred:'They said it is inferred or a guess'},'Did they say real, estimated, or inferred?')},open:[{key:'value',required:true,label:'What number did they state?'},{key:'source',required:true,label:'Where does this number come from?'},{key:'date',required:true,label:'Which date (YYYY-MM-DD)?'},{key:'campaign',required:false,label:'Which campaign, or skip?'}],schema:z.object({metric:z.enum(['impressions','reach','clicks','leads','spend','revenue','engagements','conversions','followers']),label:z.enum(['real','estimated','inferred']),value:z.coerce.number().nonnegative(),source:z.string().min(1),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).passthrough(),mustState:['label','value']},
 {id:'write_report',group:'numbers',description:'Write a results report from the numbers already saved.',risk:'draft',roles:['admin','marketer'],module:'09-results',action:'write-report',closed:{},open:[{key:'brief',required:true,label:'What period or question should the report cover?'}],schema:z.object({brief:z.string().min(1)})},
 {id:'add_lesson',group:'numbers',description:'Save a lesson with at least one piece of evidence.',risk:'confirm',roles:['admin','marketer'],module:'09-results',action:'add-lesson',closed:{},open:[{key:'title',required:true,label:'What should we call the lesson?'},{key:'body',required:true,label:'What did we learn? Use only what the marketer said.'},{key:'evidence',required:true,label:'What is the evidence? A record id or a link.'}],schema:z.object({title:z.string().min(1),body:z.string().min(1),evidence:z.string().min(1)})},
 {id:'add_task',group:'team',description:'Add a task on this client.',risk:'draft',roles:['admin','marketer'],module:'managing',action:'add-task',closed:{priority:choice({low:'Low',medium:'Medium',high:'High'},'What priority, if they named one?',true)},open:[{key:'title',required:true,label:'What is the task?'},{key:'owner',required:false,label:'Who owns it? Reply skip to leave it blank.'}],schema:z.object({title:z.string().min(1)}).passthrough()},
 {id:'move_task',group:'team',description:'Move a task to to do, in progress, or done.',risk:'draft',roles:['admin','marketer'],module:'managing',action:'task-status',closed:{status:choice({todo:'To do',in_progress:'In progress',done:'Done'},'Which column?')},open:[{key:'id',required:true,label:'Which task?'}],schema:z.object({id,status:z.enum(['todo','in_progress','done'])})},
 {id:'monthly_invoice',group:'team',description:'Draft a retainer invoice with GST. Company level only.',risk:'confirm',roles:['admin','marketer'],needsCompanyMember:true,nodes:['company'],module:'managing',action:'monthly-invoice',closed:{},open:[{key:'amount',required:true,label:'What is the retainer amount in rupees, before GST?'},{key:'number',required:false,label:'Invoice number, or skip and I will use a draft number.'},{key:'period',required:false,label:'Which month (YYYY-MM)? Reply skip for this month.'},{key:'gst',required:false,label:'GST percent? Reply skip for 18.'}],schema:z.object({amount:z.coerce.number().nonnegative()}).passthrough(),mustState:['amount']},
];

const BANNED=/(approve|decline|delete|move-client|create-user|disable-user|settings|export|switch)/i;

let skillCache=null;
export function skillTools(){
 if(skillCache)return skillCache;
 const tools=[];
 for(const mod of moduleCatalog()){
  let loaded;try{loaded=loadModule(mod.key,{settings:{}});}catch{continue;}
  for(const script of loaded.tools.scripts||[]){
   const open=(script.params||[]).filter(p=>p.required&&p.type!=='output').map(p=>({key:p.name,required:true,label:p.label||p.name}));
   tools.push({id:'skill:'+mod.key+':'+script.id,group:'skill',description:script.label||script.help||script.id,risk:'draft',roles:['admin','marketer'],module:mod.key,action:'run-tool',scriptId:script.id,closed:{},open,schema:z.object({}).passthrough()});
  }
 }
 skillCache=tools;
 return tools;
}

export function allTools(){
 const tools=[...TOOLS,...skillTools()];
 for(const t of tools)if(BANNED.test(t.action||'')||BANNED.test(t.id))throw new Error('Catalog contains a forbidden tool: '+t.id);
 return tools;
}

export function visibleTools(user,client,{companyMember}){
 const node=client.node_type||'company';
 const disabled=new Set(client.settings?.disabled_modules||[]);
 return allTools().filter(t=>{
  if(!t.roles.includes(user.role))return false;
  if(t.module&&disabled.has(t.module))return false;
  if(t.needsCompanyMember&&!companyMember)return false;
  if(t.nodes&&!t.nodes.includes(node))return false;
  return true;
 });
}

export function toolById(id,tools){return tools.find(t=>t.id===id)||null;}

export function draftStepOptions(client){
 const disabled=new Set(client?.settings?.disabled_modules||[]);
 return Object.fromEntries(Object.entries(DRAFT_STEPS).filter(([,mod])=>!disabled.has(mod)).map(([name])=>[name,name]));
}
