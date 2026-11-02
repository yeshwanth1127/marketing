// Products and brands (docs/products-and-brands.md): shape rules, isolation between siblings,
// what passes down, access, totals, de-dup, delete.
import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {handle} from '../core/api.mjs';import {q,pool,id,tx,insert} from '../core/db/index.mjs';
import {resolveClient,contextRecords,brandFor} from '../core/clients/tree.mjs';import {loadModule} from '../core/runtime/index.mjs';
after(async()=>pool.end());
const stamp=Date.now();let admin,co,bridal,saree,lehenga,solo,mc;
async function request(route,body,token=admin){const r=await handle(new Request('http://localhost:3100/api/'+route,{method:body?'POST':'GET',headers:{...(token?{cookie:token}:{}),...(body?{'content-type':'application/json',origin:'http://localhost:3100'}:{})},body:body?JSON.stringify(body):undefined}));let data=null;try{data=await r.clone().json()}catch{}return {status:r.status,data};}
const act=(client_id,body,t=admin)=>request('action',{client_id,...body},t);
const rec=(cid,kind,title,data,status='draft')=>tx(c=>insert(c,{id:null},cid,kind,title,data,status));
const login=async(email,password)=>{const r=await handle(new Request('http://localhost:3100/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({email,password})}));return r.headers.get('set-cookie').split(';')[0];};

test('build a company → brand → products tree; shape rules hold',async()=>{
 admin=await login('admin@exora.local','ExoraLocal!2026');
 co=(await act(null,{action:'create-client',name:'Rang Textiles '+stamp,industry:'Apparel',city:'Jaipur',languages:['English','Hindi']})).data.id;
 bridal=(await act(null,{action:'create-client',parent_id:co,node_type:'brand',name:'Rang Bridal'})).data.id;
 saree=(await act(null,{action:'create-client',parent_id:bridal,node_type:'product',name:'Bandhej saree',brief:{description:'Hand-tied bandhej silk saree',sector:'Apparel',evidence:[{claim:'Handwoven in Bagru',source:'Supplier certificate 2026'}]}})).data.id;
 lehenga=(await act(null,{action:'create-client',parent_id:bridal,node_type:'product',name:'Bridal lehenga',brief:{evidence:[{claim:'Real zari work',source:'Lab report'}]}})).data.id;
 solo=(await act(null,{action:'create-client',parent_id:co,node_type:'product',name:'Saree restoration'})).data.id;
 for(const x of [co,bridal,saree,lehenga,solo])assert.ok(x);
 const s=await resolveClient(saree);assert.equal(s.city,'Jaipur');assert.deepEqual(s.languages,['English','Hindi']);
 assert.equal((await act(null,{action:'create-client',parent_id:saree,node_type:'product',name:'Too deep'})).status,400);
 assert.equal((await act(null,{action:'create-client',parent_id:bridal,node_type:'brand',name:'Brand in brand'})).status,400);
 await assert.rejects(q('UPDATE clients SET parent_id=$1,node_type=$2 WHERE id=$3',[saree,'product',solo]),/cannot have/);
});

test('name on creatives is the nearest brand or company',async()=>{
 assert.equal((await resolveClient(saree)).brand_name,'Rang Bridal');
 assert.equal((await resolveClient(solo)).brand_name,'Rang Textiles '+stamp);
 assert.deepEqual((await resolveClient(saree)).chain.map(n=>n.node_type),['product','brand','company']);
});

test('siblings never see each other; strategy, lessons and company-wide campaigns pass down',async()=>{
 await rec(co,'BrandKit','Company kit',{colors:['#4e0d1f','#e3a92b'],banned_words:['guaranteed'],disclaimers:'Colours may vary.',evidence:[{claim:'Since 1986',source:'Registration'}]});
 await rec(co,'Strategy','Company strategy',{positioning:'Heritage textiles'});
 await rec(co,'Learning','Company lesson',{body:'Reels beat carousels'});
 await rec(co,'Campaign','Diwali group push',{company_wide:true,budget:0});
 await rec(co,'Campaign','Company brand film',{budget:50000});
 await rec(co,'Asset','Company post',{type:'copy',body:'company only'});
 await rec(lehenga,'Asset','LEHENGA SECRET DRAFT',{type:'copy',body:'zari'});
 await rec(lehenga,'Strategy','LEHENGA STRATEGY',{positioning:'zari'});
 await rec(saree,'Asset','Saree draft',{type:'copy',body:'bandhej'});
 const ctx=await contextRecords(await resolveClient(saree));const titles=ctx.map(r=>r.title);const blob=JSON.stringify(ctx);
 assert.ok(titles.includes('Saree draft'));assert.ok(titles.includes('Company strategy'));assert.ok(titles.includes('Company lesson'));assert.ok(titles.includes('Diwali group push'));
 assert.ok(!blob.includes('LEHENGA'),'no sibling data');assert.ok(!titles.includes('Company post'),'company drafts do not pass down');assert.ok(!titles.includes('Company brand film'),'only company-wide campaigns pass down');
 assert.equal(ctx[0].kind,'BrandKit');assert.equal(ctx.filter(r=>r.kind==='BrandKit').length,1);
 assert.equal(ctx.find(r=>r.title==='Company strategy').inherited_from.id,co);
});

test('brand kit: nearest kit wins whole; bans, disclaimers and proof add up the chain only',async()=>{
 let b=await brandFor(await resolveClient(saree));
 assert.deepEqual(b.data.colors,['#4e0d1f','#e3a92b']);assert.ok(b.inherited);assert.ok(b.data.banned_words.includes('guaranteed'));
 const claims=b.data.evidence.map(e=>e.claim);assert.ok(claims.includes('Since 1986'));assert.ok(claims.includes('Handwoven in Bagru'));assert.ok(!claims.includes('Real zari work'),'sibling proof never used');
 await rec(saree,'BrandKit','Saree look',{colors:['#ffffff','#111111'],banned_words:['cheapest']});
 b=await brandFor(await resolveClient(saree));
 assert.deepEqual(b.data.colors,['#ffffff','#111111']);assert.ok(!b.inherited);
 assert.ok(b.data.banned_words.includes('guaranteed')&&b.data.banned_words.includes('cheapest'),'company ban kept');assert.ok(b.data.disclaimers.includes('Colours may vary.'));
 const l=await brandFor(await resolveClient(lehenga));assert.ok(!l.data.banned_words.includes('cheapest'),'saree ban not on lehenga');
 const r=await act(lehenga,{action:'save-record',kind:'Asset',title:'Lehenga caption',data:{type:'copy',body:'Results guaranteed, cheapest in town'}});assert.equal(r.status,200,JSON.stringify(r.data));
 const msgs=(await q('SELECT data FROM records WHERE id=$1',[r.data.id])).rows[0].data.checks.map(c=>c.message).join(' | ');assert.match(msgs,/banned phrase: guaranteed/,'company ban applies in a product');assert.doesNotMatch(msgs,/banned phrase: cheapest/,'sibling ban does not');
});

test('access: a product-only person sees only their product; company members see everything below',async()=>{
 const email=`saree.${stamp}@test.local`;await act(co,{action:'create-user',name:'Saree marketer',email,password:'TestPassword!2026',role:'marketer',client_ids:[saree]});mc=await login(email,'TestPassword!2026');
 let r=await request('bootstrap?client='+saree,undefined,mc);assert.equal(r.status,200);assert.deepEqual(r.data.clients.map(c=>c.id),[saree]);assert.equal(r.data.brand.inherited,false);
 for(const other of [lehenga,bridal,co])assert.equal((await request('bootstrap?client='+other,undefined,mc)).status,403);
 assert.equal((await act(lehenga,{action:'save-record',kind:'Task',title:'x',data:{}},mc)).status,403);
 const e2=`bridal.${stamp}@test.local`;await act(co,{action:'create-user',name:'Bridal lead',email:e2,password:'TestPassword!2026',role:'marketer',client_ids:[bridal]});const bc=await login(e2,'TestPassword!2026');
 r=await request('bootstrap?client='+bridal,undefined,bc);assert.deepEqual(new Set(r.data.clients.map(c=>c.id)),new Set([bridal,saree,lehenga]));
 assert.equal((await request('bootstrap?client='+lehenga,undefined,bc)).status,200);assert.equal((await request('bootstrap?client='+co,undefined,bc)).status,403);
 assert.equal((await act(null,{action:'create-client',parent_id:co,node_type:'product',name:'Sneaky'},mc)).status,403);
});

test('the company logo is usable inside a product, other company files are not',async()=>{
 const logo=id(),other=id();for(const [fid,n] of [[logo,'logo.png'],[other,'private.png']])await q('INSERT INTO files(id,client_id,name,mime,size,storage_path) VALUES($1,$2,$3,$4,$5,$6)',[fid,co,n,'image/png',1,'uploads/none-'+fid+'.png']);
 await rec(bridal,'BrandKit','Bridal kit',{colors:['#4e0d1f','#e3a92b'],logo_file_id:logo});
 await q("DELETE FROM records WHERE client_id=$1 AND kind='BrandKit'",[saree]);
 assert.deepEqual((await brandFor(await resolveClient(saree))).file_ids,[logo]);
 assert.equal((await request(`files/${logo}?via=${saree}`,undefined,mc)).status,404,'allowed, but file missing on disk');
 assert.equal((await request(`files/${other}?via=${saree}`,undefined,mc)).status,404);
 assert.equal((await request(`files/${logo}`,undefined,mc)).status,403);
});

test('settings pass down; a product stores only what it changes',async()=>{
 await act(co,{action:'settings',disabled_modules:['ads']});
 const s=await resolveClient(saree);assert.throws(()=>loadModule('ads',s),/disabled/);assert.ok(s.settings.disabled_modules.includes('ads'));assert.deepEqual(s.own_settings,{});
 await act(saree,{action:'settings',disabled_modules:[]});const s2=await resolveClient(saree);assert.deepEqual(s2.settings.disabled_modules,[]);assert.deepEqual((await resolveClient(lehenga)).settings.disabled_modules,['ads']);
 await act(co,{action:'settings',disabled_modules:[]});
});

test('money: company-wide campaigns hold none; numbers are counted once per company',async()=>{
 assert.equal((await act(co,{action:'save-record',kind:'Campaign',title:'Bad',data:{company_wide:true,budget:1000}})).status,400);
 const row={date:'2026-10-01',source:'Meta export',metric:'spend',value:1200,label:'real',campaign:'Diwali'};
 let r=await act(saree,{action:'import-metrics',metrics:[row,{...row,metric:'leads',value:30}]});assert.equal(r.data.count,2);
 r=await act(co,{action:'import-metrics',metrics:[row,{...row,campaign:'Other',value:500}]});assert.equal(r.data.count,1);assert.equal(r.data.duplicates,1);
 r=await request('bootstrap?client='+co);assert.equal(r.data.rollup.totals.spend,1700);assert.equal(r.data.rollup.totals.leads,30);
 assert.equal(r.data.rollup.nodes.length,5);
});

test('an existing client can be moved under a company',async()=>{
 const old=(await act(null,{action:'create-client',name:'Old client '+stamp,industry:'Retail',city:'Pune'})).data.id;
 assert.equal((await act(old,{action:'move-client',id:old,parent_id:saree,node_type:'product'})).status,400);
 assert.equal((await act(old,{action:'move-client',id:old,parent_id:co,node_type:'product'})).status,200);
 assert.equal((await resolveClient(old)).brand_name,'Rang Textiles '+stamp);
});

test('deleting the company deletes every brand and product under it',async()=>{
 const fp=await request('client-footprint?client='+co);assert.equal(fp.data.below.length,5);
 assert.equal((await act(co,{action:'delete-client',confirm_name:'Rang Textiles '+stamp})).status,200);
 const left=(await q('SELECT count(*)::int n FROM clients WHERE id=ANY($1)',[[co,bridal,saree,lehenga,solo]])).rows[0].n;assert.equal(left,0);
 assert.equal((await q("SELECT count(*)::int n FROM records WHERE client_id=ANY($1)",[[co,bridal,saree,lehenga,solo]])).rows[0].n,0);
});

test('brand kit: logo, preferred words and samples save; renders use the brand name',async()=>{
 const c2=(await act(null,{action:'create-client',name:'Kit Co '+stamp,industry:'Retail',city:'Pune'})).data.id;
 const br=(await act(null,{action:'create-client',parent_id:c2,node_type:'brand',name:'Kit Brand'})).data.id;
 const pr=(await act(null,{action:'create-client',parent_id:br,node_type:'product',name:'Kit Product',brief:{description:'x'}})).data.id;
 const logo=id();await q('INSERT INTO files(id,client_id,name,mime,size,storage_path) VALUES($1,$2,$3,$4,$5,$6)',[logo,br,'logo.png','image/png',1,'uploads/none-'+logo+'.png']);
 const r=await act(br,{action:'save-record',kind:'BrandKit',title:'Kit',data:{colors:['#111111','#ffffff'],voice:'Warm',preferred_words:['handmade'],sample_content:['Made by hand'],banned_words:['cheap'],logo_file_id:logo}});assert.equal(r.status,200,JSON.stringify(r.data));
 const b=await brandFor(await resolveClient(pr));assert.equal(b.data.logo_file_id,logo);assert.deepEqual(b.data.preferred_words,['handmade']);assert.deepEqual(b.file_ids.includes(logo),true);
 const prev=await request(`brand-preview?client=${pr}&layout=hook&format=portrait`);assert.equal(prev.status,200);
 const asset=(await act(pr,{action:'save-record',kind:'Asset',title:'Copy',data:{type:'copy',body:'Hello'}})).data.id;
 const rr=await act(pr,{action:'render',asset_id:asset,type:'image',format:'portrait',layout:'auto',composer:'template'});assert.equal(rr.status,200,JSON.stringify(rr.data));
 const job=(await q("SELECT payload FROM jobs WHERE client_id=$1 AND type='render' ORDER BY created_at DESC LIMIT 1",[pr])).rows[0];assert.equal(job.payload.client_name,'Kit Brand');
 await act(c2,{action:'delete-client',confirm_name:'Kit Co '+stamp});
});
