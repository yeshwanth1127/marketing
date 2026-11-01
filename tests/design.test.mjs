// EXORA design engine: one brand-neutral method, many brand profiles.
import {test,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {handle} from '../core/api.mjs';import {pool} from '../core/db/index.mjs';
import {compose,profileFor,audit,catalog,LAYOUTS,templateFrames} from '../core/design/brand-profile.mjs';
import {renderAsset} from '../workers/renderer/index.mjs';
after(async()=>pool.end());
const read=f=>JSON.parse(fs.readFileSync(new URL('../exora/brand-profiles/test/'+f+'.json',import.meta.url),'utf8'));
const samples=JSON.parse(fs.readFileSync(new URL('../exora/design-system/samples.json',import.meta.url),'utf8'));
const dental=profileFor(read('kaveri-dental'),{name:'Kaveri'}),fashion=profileFor(read('ruh-atelier'),{name:'Ruh'});

test('ten layout types, each composes in every placement for every test brand',()=>{
 assert.equal(Object.keys(LAYOUTS).length,10);
 for(const pr of [dental,fashion])for(const l of Object.keys(LAYOUTS))for(const format of ['portrait','square','reel','landscape']){
  const html=compose({layout:l,slots:samples['kaveri-dental'][l],profile:pr,catalog:catalog(),format});assert.ok(html.length>=1,l);
  for(const h of html){assert.match(h,/^<!doctype html>/);assert.doesNotMatch(h,/(?:src|href)=["']?(?:https?:)?\/\/|url\(["']?https?:/,'no remote files');}}
});

test('same layout, two brands: the method is shared, the look is not',()=>{
 const a=compose({layout:'offer',slots:samples['kaveri-dental'].offer,profile:dental,catalog:catalog()})[0];
 const b=compose({layout:'offer',slots:samples['kaveri-dental'].offer,profile:fashion,catalog:catalog()})[0];
 assert.ok(a.includes('--accent:#ff7a59')&&a.includes('x-instrument-serif'));
 assert.ok(b.includes('--accent:#8c1c1c')&&b.includes('x-gloock'));
 const classes=h=>[...h.replace(/<style>[\s\S]*?<\/style>/,'').matchAll(/class="([^"]+)"/g)].map(m=>m[1]).filter(c=>!/^(fmt-|deco)/.test(c));
 assert.deepEqual(classes(a).filter(c=>!c.includes('-deco')),classes(b).filter(c=>!c.includes('-deco')),'same structure');
});

test('legacy brand kits become complete, contrast-safe profiles',()=>{
 const pr=profileFor({colors:['#3a5a40','#a3b18a','#dad7cd'],font:'Arial'},{name:'Legacy Co',languages:['Kannada']});
 assert.deepEqual(audit(pr).filter(x=>x.severity==='error'),[]);
 assert.equal(pr.type.scripts.Kannada,'noto-sans-kannada');
 for(const id of [pr.type.display.font,pr.type.body.font,pr.type.label.font])assert.ok(catalog().fonts.some(f=>f.id===id),id);
 assert.equal(profileFor({},{name:'Empty'}).wordmark,'Empty');
});

test('fixed-layout renders: real PNGs per brand, no design-check errors, visibly different',async()=>{
 const shots=[];
 for(const [i,b] of [['a',read('kaveri-dental')],['b',read('sunkidz')]].entries()){
  const asset={id:crypto.randomUUID(),title:'Questions to ask',data:{type:'carousel',format:'portrait',on_screen_text:['4 questions to ask *first*','How long?','Who does it?','What does it cost?'],cta:'Book now'}};
  const r=await renderAsset(asset,{brand:b[1],client_name:b[1].name,layout:'list'});
  assert.equal(r.files.length,5,'cover + 3 points + outro');assert.match(r.engine,/EXORA design engine/);
  assert.deepEqual(r.design_checks.flatMap(f=>f.issues).filter(x=>x.severity==='error'),[]);
  shots.push(crypto.createHash('sha256').update(fs.readFileSync(r.files[1].path)).digest('hex'));
  fs.rmSync(r.files[0].path.replace(/[^/]+$/,''),{recursive:true,force:true});
 }
 assert.notEqual(shots[0],shots[1]);
});

test('template frames fall back to a hook when a carousel has no list items',()=>{
 const f=templateFrames({asset:{title:'One line',data:{type:'carousel',on_screen_text:['Only a hook']}},brand:{},client:{name:'X'},format:'square'});
 assert.equal(f.length,1);assert.match(f[0],/L-hook/);
});

let cookie,client;
async function request(route,body){const r=await handle(new Request('http://localhost:3100/api/'+route,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin:'http://localhost:3100'}:{})},body:body?JSON.stringify(body):undefined}));const ct=r.headers.get('content-type')||'';return {status:r.status,headers:r.headers,data:ct.includes('json')?await r.json():await r.text()};}
test('API: design catalog, live brand preview and profile validation',async()=>{
 const r=await handle(new Request('http://localhost:3100/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({email:'admin@exora.local',password:'ExoraLocal!2026'})}));cookie=r.headers.get('set-cookie').split(';')[0];
 client=(await request('action',{action:'create-client',name:'Design Test '+Date.now(),industry:'Fashion label',city:'Jaipur',languages:['English','Hindi']})).data.id;
 const cat=await request('design-catalog?client='+client);assert.equal(cat.status,200);assert.equal(cat.data.layouts.length,10);assert.ok(cat.data.fonts.length>=20);
 const bad=await request('action',{client_id:client,action:'save-record',kind:'BrandKit',title:'Ruh',data:{colors:['#ebe4d6'],profile:{type:{display:{font:'comic-sans'}}}}});
 assert.equal(bad.status,400);assert.match(bad.data.error,/Unknown font/);
 const prof=read('ruh-atelier').profile;
 const ok=await request('action',{client_id:client,action:'save-record',kind:'BrandKit',title:'Ruh',data:{colors:['#ebe4d6','#15110f','#8c1c1c'],profile:prof}});assert.equal(ok.status,200,JSON.stringify(ok.data));
 const pv=await request('brand-preview?client='+client+'&layout=festival&format=square');assert.equal(pv.status,200);
 assert.match(pv.data,/--accent:#8c1c1c/);assert.match(pv.data,/\/api\/design-fonts\/gloock\//);assert.match(pv.data,/tiro-devanagari-hindi/);
 const font=await request('design-fonts/gloock/Gloock-Regular.woff');assert.equal(font.status,200);
 assert.equal((await request('design-fonts/..%2F..%2Fpackage.json/x.woff')).status,404);
 const render=await request('action',{client_id:client,action:'render',asset_id:'00000000-0000-0000-0000-000000000000',type:'image',format:'portrait',layout:'nope'});assert.equal(render.status,400);
});
