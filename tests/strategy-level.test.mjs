import {test} from 'node:test';
import assert from 'node:assert/strict';
import {strategyLevel,strategyScope,strategyFieldsFor,strategyQuestion,nextStrategyField,strategyConfirm,strategyDatedTitle,ensureDatedTitle} from '../core/agent/strategy-fields.mjs';
import {nextActions,setupGaps,setupStatus,strategyPath,strategyGuidanceText} from '../core/agent/guide.mjs';

const company={id:'c',name:'SunKidz',node_type:'company',chain:[{id:'c',name:'SunKidz',node_type:'company'}]};
const brand={id:'b',name:'sunkidz',node_type:'brand',chain:[{id:'b',name:'sunkidz',node_type:'brand'},{id:'c',name:'SunKidz',node_type:'company'}]};
const product={id:'p',name:'After school',node_type:'product',data:{brief:{audience:'Busy parents',offer:'₹8,000 / month',description:'After-school care'}},chain:[{id:'p',name:'After school',node_type:'product'},{id:'b',name:'sunkidz',node_type:'brand'},{id:'c',name:'SunKidz',node_type:'company'}]};

test('Strategy level follows the pinned node',()=>{
 assert.equal(strategyLevel(company),'company');
 assert.equal(strategyLevel(brand),'brand');
 assert.equal(strategyLevel(product),'product');
 assert.equal(strategyScope(brand).title,'Brand strategy');
 assert.match(strategyScope(product).path,/SunKidz › sunkidz › After school/);
});

test('Portfolio-level extra questions only appear on the matching node',()=>{
 const ck=strategyFieldsFor(company).map(f=>f.key);
 const bk=strategyFieldsFor(brand).map(f=>f.key);
 const pk=strategyFieldsFor(product).map(f=>f.key);
 assert.ok(ck.includes('brand_architecture'));
 assert.equal(bk.includes('brand_architecture'),false);
 assert.ok(bk.includes('sibling_difference'));
 assert.ok(pk.includes('product_role'));
 assert.equal(ck.includes('product_role'),false);
});

test('Strategy questions name the level',()=>{
 const field=nextStrategyField({},brand);
 const q=strategyQuestion(field,{},brand);
 assert.match(q,/Brand strategy for sunkidz/);
 assert.match(q,/this brand/i);
 const productQ=strategyQuestion(nextStrategyField({},product),{},product);
 assert.match(productQ,/Product strategy/);
 assert.match(productQ,/this product/i);
});

test('Confirm copy names the workspace path',()=>{
 const text=strategyConfirm({objective:'Increase sales or revenue',business_model:'Project-based services'},brand);
 assert.match(text,/brand strategy/i);
 assert.match(text,/SunKidz › sunkidz/);
});

test('Strategy titles include the IST date',()=>{
 const at=new Date('2026-11-16T08:00:00+05:30');
 assert.equal(strategyDatedTitle(product,at),'After school · Product strategy · 16 Nov 2026');
 assert.equal(ensureDatedTitle('After school GTM · Product strategy · 16 Nov 2026',product,at),'After school GTM · Product strategy · 16 Nov 2026');
 assert.equal(ensureDatedTitle('Growth plan',product,at),'After school · Product strategy · 16 Nov 2026');
});

const tools=[
 {id:'draft'},{id:'list_items'},{id:'client_questionnaire'},{id:'set_brand_kit'},{id:'add_brand'},{id:'add_product'},
];
const user={role:'admin'};

test('Missing setup points at Client & brand, not the WhatsApp questionnaire',()=>{
 const gaps=setupGaps(product,[]);
 assert.equal(gaps.some(g=>g.key==='brand kit'),true);
 const path=strategyPath(product,[], 'brand kit');
 assert.equal(path.phase,'setup');
 const actions=nextActions(product,user,tools,'brand kit',{records:[]});
 assert.equal(actions[0].href,'/01-onboard');
 assert.match(actions[0].label,/brand setup/i);
 assert.equal(actions.some(a=>a.tool==='client_questionnaire'),false);
 const text=strategyGuidanceText(product,path,{path:'SunKidz › sunkidz › After school'});
 assert.match(text,/Finish setup before the product strategy/i);
 assert.match(text,/Finish brand setup/);
});

test('Finish setup is named for the client, brand or product that is incomplete',()=>{
 const bareProduct={...product,data:{brief:{}}};
 const both=nextActions(bareProduct,user,tools,'brief',{records:[]});
 assert.deepEqual(both.map(a=>a.label),['Finish product setup','Finish brand setup']);
 assert.equal(both[0].client_id,'p');
 assert.equal(both[1].client_id,'b');
 const brandActions=nextActions(brand,user,tools,'brand kit',{records:[]});
 assert.equal(brandActions[0].label,'Finish brand setup');
 const incompleteClient={...company,industry:'',city:''};
 const clientActions=nextActions(incompleteClient,user,tools,'brief',{records:[]});
 assert.equal(clientActions[0].label,'Finish client setup');
 const ready=setupStatus(product,[{kind:'BrandKit',client_id:'b'}]);
 assert.equal(ready.complete,true);
});

test('After setup, next step is the product strategy wizard',()=>{
 const records=[{kind:'BrandKit',client_id:'b',status:'approved'}];
 const path=strategyPath(product,records,'strategy');
 assert.equal(path.phase,'draft');
 const actions=nextActions(product,user,tools,'strategy',{records});
 assert.equal(actions[0].tool,'draft');
 assert.equal(actions[0].args.step,'strategy');
 assert.match(actions[0].label,/Product strategy/);
 const text=strategyGuidanceText(product,path,{path:'SunKidz › sunkidz › After school'});
 assert.match(text,/draft the product strategy/i);
 assert.match(text,/FOUR STAGES/);
 assert.match(text,/assumptions, not facts/);
});

test('Awaiting confirmation offers review; confirmed offers submit',()=>{
 const kit={kind:'BrandKit',client_id:'b',status:'approved'};
 const awaiting=[kit,{id:'s1',kind:'Strategy',client_id:'p',status:'draft',data:{validation_status:'needs_marketer_confirmation'}}];
 assert.equal(strategyPath(product,awaiting,'strategy').phase,'review');
 assert.equal(nextActions(product,user,tools,'strategy',{records:awaiting})[0].reviewStrategy,true);
 const confirmed=[kit,{id:'s2',kind:'Strategy',client_id:'p',status:'draft',data:{validation_status:'confirmed'}}];
 assert.equal(strategyPath(product,confirmed,'strategy').phase,'save');
 assert.equal(nextActions(product,user,tools,'strategy',{records:confirmed})[0].focusSave,true);
});
