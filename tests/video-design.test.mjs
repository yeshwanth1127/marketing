// Editable video: VideoDesign schema, JSON Patch, brand lock, variants, HTML render, router, MCP client, versioned API.
import {test,after} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {handle} from '../core/api.mjs';import {q,pool} from '../core/db/index.mjs';
import {applyPatch,validateDesign,designFromAsset,designVariants,changedBeats,screenLine,textToSpans,brandViolations,stableStringify,totalSeconds,VIDEO_DESIGN_JSON_SCHEMA} from '../core/video/design.mjs';
import {designToHtml} from '../core/video/render-html.mjs';
import {routeVideo,renderBudget,fitToSeconds,beatKey} from '../core/video/pipeline.mjs';
import {interpretEdit,designView} from '../core/video/edit-intent.mjs';
import {CreativeClawClient,parseRpc} from '../core/connectors/creative-claw.mjs';
after(async()=>pool.end());

const BRAND={palette:['#f6f0e4','#16181d','#c0392b','#e2e2e4'],fonts:{display:'fraunces',body:'dm-sans'}};
const ASSET={id:crypto.randomUUID(),version:1,data:{type:'video',format:'reel',beat_sheet:{beats:[
 {label:'HOOK',start:0,dur:7.6,text:"[0-3s] HOOK (on camera, holding a polo on a hanger): Bengaluru, don't wear your polo the same way twice."},
 {label:'',start:7.6,dur:8.4,text:'[3-8s] SETUP (voiceover, phone clock): It\'s Thursday evening.'},
 {label:'PAYOFF',start:16,dur:5,text:'PAYOFF 1: One. Polo with chinos. Tidy, easy, office-ready. (Cut: polo tucked half-front.)'}]}}};
const make=()=>designFromAsset(ASSET,{brand:BRAND,client:{city:'Bengaluru'}}).design;

test('backfill builds a valid design from a beat sheet, without stage directions or timecodes',()=>{
 const d=make();assert.deepEqual(validateDesign(d),[]);
 assert.equal(d.beats.length,3);assert.equal(d.beats[0].label,'HOOK');assert.equal(totalSeconds(d),21);
 const words=d.beats.map(b=>b.text.map(w=>w.text).join(' '));
 assert.equal(words[0],"Bengaluru, don't wear your polo the same way twice.");
 assert.ok(words.every(w=>!/\[|\(|HOOK|SETUP|PAYOFF|voiceover/.test(w)),'no directions on screen: '+words.join(' | '));
 assert.equal(d.layout.locale_tag.text,'BENGALURU');assert.equal(d.brand.locked,true);
 assert.equal(screenLine('PAYOFF 2: Two. (Cut: jeans.) Dark jeans.'),'Two. Dark jeans.');
 assert.deepEqual(textToSpans('your *polo* now').map(s=>s.style?.italic||false),[false,true,false]);
});
test('backfill degrades to read-only when there is nothing to rebuild from',()=>{
 const r=designFromAsset({id:'x',data:{type:'video'}},{brand:BRAND});assert.ok(r.read_only&&!r.design);
});
test('the brief example is two ops: background and one word, no full document',()=>{
 const d=make();const wi=d.beats[0].text.findIndex(w=>w.text==='polo');
 const next=applyPatch(d,[{op:'replace',path:'/theme/background',value:{kind:'solid',color:'#f6f0e4'}},{op:'add',path:`/beats/0/text/${wi}/style`,value:{italic:true,color:'#c0392b'}}]);
 assert.deepEqual(next.beats[0].text[wi].style,{italic:true,color:'#c0392b'});assert.deepEqual(validateDesign(next),[]);
 assert.equal(d.beats[0].text[wi].style,undefined,'the input design is not mutated');
 // Cream is already this brand's paper colour, so only the beat with "polo" needs a new picture.
 assert.deepEqual(changedBeats(d,next),['b1']);
});
test('patches cannot touch audio, palette, identity or prototypes, and reject bad ops',()=>{
 const d=make();
 for(const path of ['/audio/voice','/brand/palette/0','/schema','/meta/source','/asset_id'])assert.throws(()=>applyPatch(d,[{op:'replace',path,value:1}]),/cannot be edited/);
 assert.throws(()=>applyPatch(d,[{op:'add',path:'/theme/__proto__/x',value:1}]),/Bad path/);
 assert.throws(()=>applyPatch(d,[{op:'move',path:'/theme/ink',from:'/theme/accent'}]),/Unsupported/);
 assert.throws(()=>applyPatch(d,[{op:'replace',path:'/beats/9/duration',value:2}]),/does not exist|out of range/);
 assert.throws(()=>applyPatch(d,[{op:'test',path:'/theme/ink',value:'#000000'}]),/Test failed/);
 assert.equal(applyPatch(d,[{op:'replace',path:'/brand/locked',value:false}]).brand.locked,false,'off-brand unlock is the one brand field a user may change');
});
test('brand lock: off-palette colours and non-brand fonts are refused until unlocked',()=>{
 const d=make();const off=applyPatch(d,[{op:'replace',path:'/theme/ink',value:'#00ff00'},{op:'replace',path:'/theme/fonts/display/id',value:'syne'}]);
 assert.equal(brandViolations(off).length,2);assert.ok(validateDesign(off).some(e=>/not in the brand palette/.test(e)));
 const unlocked=applyPatch(off,[{op:'replace',path:'/brand/locked',value:false}]);assert.deepEqual(validateDesign(unlocked),[]);
});
test('design ideas are deterministic patches that stay on-brand and readable, with distinct names',()=>{
 const d=make();const a=designVariants(d),b=designVariants(d);
 assert.ok(a.length>=4);assert.deepEqual(a,b,'deterministic');assert.equal(new Set(a.map(v=>v.name)).size,a.length);
 for(const v of a){const x=applyPatch(d,v.ops);assert.deepEqual(validateDesign(x),[],v.name);assert.equal(brandViolations(x).length,0);}
 assert.equal(new Set(a.map(v=>v.ops.find(o=>o.path==='/theme/motion').value.preset)).size>=3,true,'variants differ in motion, not only colour');
});
test('HTML render is a pure function of the design and escapes user text',()=>{
 const d=applyPatch(make(),[{op:'replace',path:'/beats/0/text/0',value:{text:'<img src=x onerror=alert(1)>'}}]);
 const h1=designToHtml(d,{mode:'render'}),h2=designToHtml(d,{mode:'render'});assert.equal(h1,h2);
 assert.ok(!h1.includes('<img src=x'));assert.ok(h1.includes('&lt;img src=x'));
 assert.match(h1,/data-composition-id="main" data-start="0" data-duration="21"/);assert.match(h1,/window\.__timelines\["main"\]=tl/);
 const one=designToHtml(d,{mode:'render',only:1});assert.match(one,/data-duration="8.4"/);assert.ok(!one.includes('id="beat-0"'));
 const pre=designToHtml(d,{mode:'preview'});assert.ok(pre.includes('requestAnimationFrame')&&!pre.includes('data-composition-id'));
});
test('per-beat cache keys change only for the beats an edit touches',()=>{
 const d=make();const e=applyPatch(d,[{op:'replace',path:'/beats/2/duration',value:6}]);
 assert.equal(beatKey(d,0),beatKey(e,0));assert.equal(beatKey(d,1),beatKey(e,1));assert.notEqual(beatKey(d,2),beatKey(e,2));
 assert.deepEqual(changedBeats(d,e),['b3']);
 const t=applyPatch(d,[{op:'replace',path:'/theme/ink',value:'#16181d'}]);assert.equal(changedBeats(d,t).length,d.theme.ink==='#16181d'?0:3);
});
test('router: typographic -> local HTML; footage layers -> generative; Claude film only on request',()=>{
 const d=make();assert.equal(routeVideo({design:d}).route,'html-local');
 assert.equal(routeVideo({design:{...d,media:[{id:'m',kind:'generated_video',beat_id:'b1',status:'pending'}]}}).route,'generative');
 assert.equal(routeVideo({design:d,payload:{composer:'claude-film'}}).route,'claude-film');
 assert.equal(routeVideo({design:d,payload:{composer:'claude'}}).route,'html-local','the old default composer flag no longer forces the slow path');
});
test('render budget respects the container memory limit',()=>{
 assert.deepEqual(renderBudget({cpus:20,memory:2*2**30}),{perBeat:2,parallel:2,chromes:4});
 assert.equal(renderBudget({cpus:20,memory:8*2**30}).chromes,19);assert.equal(renderBudget({cpus:2,memory:1*2**30}).chromes,1);
});
test('beats are re-timed to the narration keeping their pacing',()=>{
 const d=make();const f=fitToSeconds(d,42);assert.ok(Math.abs(totalSeconds(f)-42)<0.05);assert.ok(f.beats[0].duration/f.beats[2].duration-d.beats[0].duration/d.beats[2].duration<0.01);
});
test('edit intent: one small-model call returns validated ops; invalid or off-brand output is refused',async()=>{
 const d=make();let prompt='';
 const r=await interpretEdit({design:d,request:'make polo italic red',fonts:['fraunces','dm-sans'],run:async p=>{prompt=p;return '{"ops":[{"op":"add","path":"/beats/0/text/4/style","value":{"italic":true,"color":"#c0392b"}}],"note":"polo italic in brand red"}';}});
 assert.equal(r.ops.length,1);assert.ok(prompt.indexOf('Return ONLY JSON')<prompt.indexOf('DESIGN:'),'stable rules come before the per-request delta');
 assert.ok(!prompt.includes('"schema"'),'the full document is not sent');assert.ok(JSON.stringify(designView(d)).length<4000);
 await assert.rejects(interpretEdit({design:d,request:'neon',fonts:['fraunces','dm-sans'],run:async()=>'{"ops":[{"op":"replace","path":"/theme/ink","value":"#39ff14"}]}'}),/brand palette/);
 await assert.rejects(interpretEdit({design:d,request:'x',fonts:[],run:async()=>'sure! here you go'}),/could not be understood/);
});
test('Creative Claw client: SSE responses, session header, retries safe calls, never retries paid generation',async()=>{
 assert.deepEqual(parseRpc('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":1}}\n\n','text/event-stream').result,{ok:1});
 let calls=[];const fake=async(url,init)=>{const b=JSON.parse(init.body);calls.push(b.method+(b.params?.name?':'+b.params.name:''));
  if(b.method==='initialize')return new Response(JSON.stringify({jsonrpc:'2.0',id:b.id,result:{}}),{headers:{'mcp-session-id':'s1','content-type':'application/json'}});
  if(b.method==='tools/list')return new Response(`data: ${JSON.stringify({jsonrpc:'2.0',id:b.id,result:{tools:[{name:'generate_video'},{name:'check_job'}]}})}\n\n`,{headers:{'content-type':'text/event-stream'}});
  if(b.method==='tools/call')return new Response('busy',{status:503});
  return new Response(JSON.stringify({jsonrpc:'2.0',id:b.id,result:{}}),{headers:{'content-type':'application/json'}});};
 const c=new CreativeClawClient({url:'https://example.test/mcp',token:'t',enabled:true,timeoutMs:5000},fake);
 assert.equal((await c.resolveTool('generate_video')).name,'generate_video');
 calls=[];await assert.rejects(c.call('generate_video',{prompt:'x'},{paid:true}),/503/);assert.equal(calls.filter(x=>x==='tools/call:generate_video').length,1,'paid call made exactly once');
 await assert.rejects(new CreativeClawClient({url:'https://x',token:''},fake).listTools(),/not configured/);
 assert.equal(VIDEO_DESIGN_JSON_SCHEMA.$id,'exora.video-design/1');
});

// ---------- API: versions, undo/redo/revert, conflicts, approved lock, retry ----------
let cookie,client,asset;
async function api(path,body){const r=await handle(new Request('http://localhost:3100/api/'+path,{method:body?'POST':'GET',headers:{cookie,'content-type':'application/json',origin:'http://localhost:3100'},body:body?JSON.stringify(body):undefined}));return {status:r.status,body:await r.json()};}
test('video-design API: lazy backfill, patch -> version, conflicts, undo/redo/revert, apply queues one job',async()=>{
 const login=await handle(new Request('http://localhost:3100/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({email:'admin@exora.local',password:'ExoraLocal!2026'})}));cookie=login.headers.get('set-cookie').split(';')[0];
 const made=await handle(new Request('http://localhost:3100/api/action',{method:'POST',headers:{cookie,'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({action:'create-client',name:'Video Edit Test '+Date.now(),industry:'clothing',city:'Bengaluru',languages:['English']})}));
 client=(await made.json()).id;asset=crypto.randomUUID();
 const user=(await q("SELECT id FROM users WHERE role='admin' LIMIT 1")).rows[0];
 await q("INSERT INTO records(id,client_id,kind,title,status,data,created_by) VALUES($1,$2,'Asset','Polo reel','draft',$3,$4)",[asset,client,ASSET.data,user.id]);
 const g=await api(`video-design?client=${client}&asset=${asset}`);assert.equal(g.status,200,JSON.stringify(g.body));assert.equal(g.body.head,1);assert.equal(g.body.design.beats.length,3);assert.ok(g.body.fonts.length>5);
 const v=await api(`video-design/variants?client=${client}&asset=${asset}`);assert.ok(v.body.variants.length>=3);
 const p=await api('video-design/patch',{client_id:client,asset_id:asset,base:1,ops:[{op:'replace',path:'/theme/motion/preset',value:'typewriter'}]});assert.equal(p.status,200,JSON.stringify(p.body));assert.equal(p.body.version,2);
 const stale=await api('video-design/patch',{client_id:client,asset_id:asset,base:1,ops:[{op:'replace',path:'/theme/motion/preset',value:'fade'}]});assert.equal(stale.status,409,'stale base is refused');
 const bad=await api('video-design/patch',{client_id:client,asset_id:asset,base:2,ops:[{op:'replace',path:'/audio/voice',value:null}]});assert.equal(bad.status,400);
 assert.equal((await api('video-design/undo',{client_id:client,asset_id:asset})).body.head,1);
 assert.equal((await api('video-design/redo',{client_id:client,asset_id:asset})).body.head,2);
 const rv=await api('video-design/revert',{client_id:client,asset_id:asset});assert.equal(rv.body.head,3);
 const after=await api(`video-design?client=${client}&asset=${asset}`);assert.equal(after.body.design.theme.motion.preset,'words','revert restores the original look');
 const a1=await api('video-design/apply',{client_id:client,asset_id:asset});const a2=await api('video-design/apply',{client_id:client,asset_id:asset});
 assert.equal(a1.body.status,'queued');assert.equal(a2.body.status,'already-queued');assert.equal(a1.body.job_id,a2.body.job_id);
 await q("UPDATE jobs SET status='failed',error='Beat 2 did not render' WHERE id=$1",[a1.body.job_id]);
 const rt=await api('video-design/retry',{client_id:client,job_id:a1.body.job_id});assert.equal(rt.body.status,'queued');
 await q("DELETE FROM jobs WHERE id=$1",[a1.body.job_id]);
 await q("UPDATE records SET status='approved' WHERE id=$1",[asset]);
 const locked=await api('video-design/patch',{client_id:client,asset_id:asset,base:3,ops:[{op:'replace',path:'/theme/motion/preset',value:'fade'}]});assert.equal(locked.status,409,'approved work is immutable');
});
