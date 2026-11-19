// Explicit inherit-from-parent: brand kit, design templates, details.
import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {handle} from '../core/api.mjs';import {q,pool,tx,insert,id} from '../core/db/index.mjs';
import {resolveClient,brandFor} from '../core/clients/tree.mjs';
import {templatesFor} from '../core/design/templates.mjs';
after(async()=>pool.end());
const stamp=Date.now();
async function request(route,body,token){const r=await handle(new Request('http://localhost:3100/api/'+route,{method:body?'POST':'GET',headers:{...(token?{cookie:token}:{}),...(body?{'content-type':'application/json',origin:'http://localhost:3100'}:{})},body:body?JSON.stringify(body):undefined}));let data=null;try{data=await r.clone().json()}catch{}return {status:r.status,data};}
const act=(client_id,body,t)=>request('action',{client_id,...body},t);
const login=async(email,password)=>{const r=await handle(new Request('http://localhost:3100/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({email,password})}));return r.headers.get('set-cookie').split(';')[0];};

test('brand / product can inherit kit, templates and details from the parent',async()=>{
 const admin=await login('admin@exora.local','ExoraLocal!2026');
 const co=(await act(null,{action:'create-client',name:'Inherit Co '+stamp,industry:'Education',city:'Bengaluru',languages:['English','Kannada'],region:'Karnataka',tier:'Tier 1',website:'https://inherit.example'},admin)).data.id;
 await act(co,{action:'update-client',name:'Inherit Co '+stamp,industry:'Education',city:'Bengaluru',region:'Karnataka',tier:'Tier 1',website:'https://inherit.example',languages:['English','Kannada'],approval_contact:'Priya, founder'},admin);
 await tx(async c=>{
  await c.query('UPDATE clients SET settings=$2 WHERE id=$1',[co,{package:{id:'growth',posts:16,reels:6,carousels:2,ads:2,channels:['Instagram'],seo:true},voice:{voice_id:'EXAVITQu4vr4xnSDxMaL',key:'rachel',name:'Calm narrator'}}]);
  await insert(c,{id:null},co,'BrandKit','Company kit',{colors:['#123456','#abcdef'],voice:'Warm and clear',audience:'Parents',banned_words:['guaranteed'],font:'Arial'});
  await insert(c,{id:null},co,'DesignTemplate','Company theme',{mode:'multicolour',colors:{paper:'#f7f4ef',ink:'#1a1a1a',accent:'#e4572e',support:['#2e86ab','#a23b72']},fonts:{heading:'Display',body:'Body'},direction:'Bright paper with accent pops',is_default:true});
 });
 const brand=(await act(null,{action:'create-client',parent_id:co,node_type:'brand',name:'Inherit Brand '+stamp},admin)).data.id;
 const product=(await act(null,{action:'create-client',parent_id:brand,node_type:'product',name:'Inherit Product '+stamp,brief:{category:'Course'}},admin)).data.id;

 let r=await act(brand,{action:'inherit-details'},admin);
 assert.equal(r.status,200,JSON.stringify(r.data));
 assert.ok(r.data.fields.includes('industry'));
 const brandNode=await resolveClient(brand);
 assert.equal(brandNode.industry,'Education');
 assert.equal(brandNode.city,'Bengaluru');
 assert.equal(brandNode.data.approval_contact,'Priya, founder');
 assert.equal(brandNode.own_settings.package?.id,'growth');
 assert.equal(brandNode.own_settings.voice?.name,'Calm narrator');

 r=await act(brand,{action:'inherit-brand-kit'},admin);
 assert.equal(r.status,200,JSON.stringify(r.data));
 let kit=await brandFor(brandNode);
 assert.equal(kit.inherited,false);
 assert.deepEqual(kit.data.colors,['#123456','#abcdef']);
 assert.equal(kit.data.inherited_from.id,co);

 r=await act(brand,{action:'inherit-design-templates',all:true},admin);
 assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.count,1);
 const brandTemplates=await templatesFor(await resolveClient(brand));
 assert.ok(brandTemplates.some(t=>!t.inherited&&t.title==='Company theme'));

 r=await act(product,{action:'inherit-brand-kit'},admin);
 assert.equal(r.status,200,JSON.stringify(r.data));
 kit=await brandFor(await resolveClient(product));
 assert.equal(kit.inherited,false);
 assert.deepEqual(kit.data.colors,['#123456','#abcdef']);

 r=await act(product,{action:'inherit-design-templates',all:true},admin);
 assert.equal(r.status,200);
 const productTemplates=await templatesFor(await resolveClient(product));
 assert.ok(productTemplates.some(t=>!t.inherited&&t.data?.inherited_from?.template_id));

 r=await act(product,{action:'inherit-details',fields:['industry','city','voice']},admin);
 assert.equal(r.status,200);
 const productNode=await resolveClient(product);
 assert.equal(productNode.industry,'Education');
 assert.equal(productNode.own_settings.voice?.name,'Calm narrator');

 assert.equal((await act(co,{action:'inherit-brand-kit'},admin)).status,400);
});
