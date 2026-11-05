import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../core/api.mjs';
import {q,pool,id} from '../core/db/index.mjs';
import {monthInputs,buildSlots} from '../core/agent/month-fields.mjs';
import {parseQuestionnaire,readyCheck,applyPackage,PACKAGES,buildMonthPack} from '../core/solo/index.mjs';
import {allTools} from '../core/agent/catalog.mjs';
import {runMonthJob} from '../core/runtime/month.mjs';

process.env.EXORA_AGENT_DRAFT='local_template';
let cookie,client,stamp=Date.now();
async function request(route,body,token=cookie){const r=await handle(new Request('http://127.0.0.1:3100/api/'+route,{method:body?'POST':'GET',headers:{cookie:token||'',origin:'http://127.0.0.1:3100',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}));return r;}
async function json(route,body){const r=await request(route,body);const d=await r.json();return {status:r.status,data:d};}

test('Month intake rejects an empty production',()=>{
 assert.throws(()=>monthInputs({posts:0,reels:0,carousels:0,goal:'x'}));
 const in_=monthInputs({month:'2026-11',goal:'Enquiries',offer:'No offer',posts:2,reels:1,carousels:1,ads:0,budget:'25000',channels:'Instagram, SEO'});
 assert.equal(in_.posts,2);assert.equal(in_.reels,1);assert.equal(in_.seo,true);assert.equal(buildSlots(in_).length,4);
});
test('Questionnaire parse keeps the raw reply and optional approver',()=>{
 const p=parseQuestionnaire('We sell braces.\nApprover: Meera\nNever say: guaranteed');
 assert.match(p.questionnaire,/braces/);assert.equal(p.approval_contact,'Meera');
});
test('Packages copy counts, never content',()=>{
 const s=applyPackage({disabled_modules:['geo']},'growth');
 assert.equal(s.package.reels,6);assert.equal(s.package.seo,true);assert.deepEqual(s.disabled_modules,['geo']);
 assert.ok(PACKAGES.starter&&PACKAGES.content);
});
test('Catalog exposes month tools without banned export ids',()=>{
 const ids=allTools().map(t=>t.id);
 assert.ok(ids.includes('draft_month'));assert.ok(ids.includes('ready_check'));assert.ok(ids.includes('month_pack'));
 assert.equal(ids.some(id=>/export/i.test(id)),false);
});
test('Sign in and create a solo test client',async()=>{
 const login=await request('auth/login',{email:'admin@exora.local',password:'ExoraLocal!2026'},'');
 assert.equal(login.status,200);
 cookie=login.headers.get('set-cookie').split(';')[0];
 const r=await json('action',{action:'create-client',name:'Solo '+stamp,industry:'Dental',city:'Bengaluru'});
 assert.equal(r.status,200);client=r.data.id;
});
test('Produce-month is blocked until brand and confirmed strategy exist',async()=>{
 const r=await json('action',{action:'produce-month',client_id:client,month:'2026-11',goal:'Bookings',offer:'No offer',posts:1,reels:0,carousels:0,ads:0,budget:0,provider:'local_template'});
 assert.equal(r.status,400);assert.match(r.data.error||'',/Brand kit/);
 const boot=await json('bootstrap?client='+client);assert.equal(boot.data.ready.canProduce,false);
});
test('Ready check, questionnaire import and package apply',async()=>{
 const qn=await json('action',{action:'import-questionnaire',client_id:client,text:'Services: cleaning\nApprover: Ravi'});
 assert.equal(qn.status,200);assert.equal(qn.data.approval_contact,'Ravi');
 const pkg=await json('action',{action:'apply-package',client_id:client,package_id:'starter'});
 assert.equal(pkg.status,200);assert.equal(pkg.data.package.posts,12);
 const tasks=(await q("SELECT count(*)::int n FROM records WHERE client_id=$1 AND kind='Task'",[client])).rows[0].n;
 assert.ok(tasks>=2);
});
test('A ready client can queue and run a one-slot month',async()=>{
 const kit=await json('action',{action:'save-record',client_id:client,kind:'BrandKit',title:'Kit',data:{colors:['#244c3b','#d9edaf'],font:'Arial',voice:'Warm',audience:'Families'}});
 assert.equal(kit.status,200,JSON.stringify(kit.data));
 const strat=await json('action',{action:'save-record',client_id:client,kind:'Strategy',title:'Direction',data:{body:'Grow cleanings',positioning:'Local',objective:'Bookings',audience:'Families'}});
 assert.equal(strat.status,200);await q("UPDATE records SET status='approved' WHERE id=$1",[strat.data.id]);
 const blocked=await readyCheck((await json('bootstrap?client='+client)).data.client);
 assert.equal(blocked.canProduce,true);
 const queued=await json('action',{action:'produce-month',client_id:client,month:'2026-11',goal:'Bookings',offer:'No offer',posts:1,reels:0,carousels:0,ads:0,budget:0,channels:'Instagram',provider:'local_template'});
 assert.equal(queued.status,200,JSON.stringify(queued.data));assert.ok(queued.data.job_id);
 const job=(await q('SELECT * FROM jobs WHERE id=$1',[queued.data.job_id])).rows[0];
 await runMonthJob(job);
 const done=(await q('SELECT * FROM jobs WHERE id=$1',[job.id])).rows[0];
 assert.equal(done.status,'completed',done.error);
 const campaign=(await q("SELECT * FROM records WHERE client_id=$1 AND kind='Campaign' AND data->>'month_job'=$2",[client,job.id])).rows[0];
 assert.ok(campaign);assert.equal(campaign.data.slots.length,1);
 const ideas=(await q("SELECT * FROM records WHERE client_id=$1 AND kind='Idea' AND data->>'month_job'=$2",[client,job.id])).rows;
 assert.equal(ideas.length,1);assert.ok(ideas[0].data.hooks?.length>=1);assert.equal(typeof ideas[0].data.selected_hook,'number');
 const copies=(await q("SELECT * FROM records WHERE client_id=$1 AND kind='Asset' AND coalesce(data->>'type','copy')='copy' AND data->>'month_job'=$2",[client,job.id])).rows;
 assert.equal(copies.length,1);
 const visuals=(await q("SELECT * FROM records WHERE client_id=$1 AND kind='Asset' AND data->>'type'<>'copy' AND data->>'month_job'=$2",[client,job.id])).rows;
 assert.equal(visuals.length,1);assert.equal(visuals[0].data.render_status,'queued');
 const pack=await buildMonthPack({id:client,name:'Solo'},job.id);
 assert.ok(pack.files.includes('captions.txt'));assert.ok(pack.files.includes('calendar.csv'));assert.ok(pack.files.includes('hooks.csv'));
 const decide=await json('action',{action:'record-client-decision',client_id:client,id:campaign.id,decision:'approved',note:'WhatsApp yes'});
 assert.equal(decide.status,200);
});
after(async()=>{await pool.end();});
