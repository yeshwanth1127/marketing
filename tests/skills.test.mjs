// Proves the platform's numbers come from the vendored skills' own scripts, with receipts.
import {test,after} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import path from 'node:path';
import {handle} from '../core/api.mjs';import {q,pool,ROOT} from '../core/db/index.mjs';
let cookie,client,idea,asset;const stamp=Date.now();
async function request(route,body,token=cookie){const r=await handle(new Request('http://localhost:3100/api/'+route,{method:body?'POST':'GET',headers:{...(token?{cookie:token}:{}),...(body?{'content-type':'application/json',origin:'http://localhost:3100'}:{})},body:body?JSON.stringify(body):undefined}));return {status:r.status,data:await r.json(),headers:r.headers};}
const action=body=>request('action',{client_id:client,...body});
const vendor=(rel,stdin,args)=>{const r=spawnSync('python3',['-I',path.join(ROOT,'vendor',rel),...args],{input:stdin,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
after(async()=>pool.end());

test('setup: sign in and run steps 1-5',async()=>{
 const r=await request('auth/login',{email:'admin@exora.local',password:'ExoraLocal!2026'},'');cookie=r.headers.get('set-cookie').split(';')[0];
 client=(await action({action:'create-client',name:'Skills Test '+stamp,industry:'Dental clinic',city:'Bengaluru',languages:['English']})).data.id;
 for(const module of ['01-onboard','02-strategy','03-plan','04-hooks','05-content']){const g=await action({action:'generate',module,provider:'local_template',brief:'Family dental care'});assert.equal(g.status,200,JSON.stringify(g.data));if(module==='04-hooks')idea=g.data.records[0];if(module==='05-content')asset=g.data.records[0];}
});

test('Hook scores equal the vendored ig-reel hookscore.py output (golden)',()=>{
 const expected=vendor('instagram-agent-skill/skills/ig-reel/hookscore.py',idea.data.hooks.map(h=>h.text).join('\n')+'\n',['-','--json']);
 const byText=new Map((Array.isArray(expected)?expected:[expected]).map(x=>[x.hook,x.score]));
 for(const h of idea.data.hooks){assert.equal(h.scored_by,'ig-reel/hookscore.py');assert.equal(h.score,byText.get(h.text));}
});

test('Caption lint and AI-tell results equal the vendored scripts (golden)',()=>{
 const cap=vendor('instagram-agent-skill/skills/ig-caption/caption.py',asset.data.caption,['-','--json']);
 assert.deepEqual(asset.data.caption_lint.checks,cap.checks);
 const ai=vendor('instagram-agent-skill/skills/ig-human/detect.py',[asset.data.script,asset.data.caption].join('\n\n'),['-','--json']);
 assert.equal(asset.data.ai_tell.human_score,ai.human_score);
 assert.ok(asset.data.beat_sheet.beats.length>0);
});

test('Every scored output carries receipts that point at unmodified vendor files',async()=>{
 for(const rec of [idea,asset]){assert.ok(rec.data.receipts.length>0);
  const rows=(await q('SELECT * FROM tool_runs WHERE id=ANY($1::uuid[])',[rec.data.receipts])).rows;
  assert.equal(rows.length,rec.data.receipts.length);
  for(const row of rows){assert.equal(row.exit_code,0,row.error);assert.equal(row.vendor_match,true,row.skill+' '+row.script);assert.equal(row.client_id,client);assert.ok(row.output_sha256);}}
});

test('Receipts are append-only',async()=>{const [rid]=idea.data.receipts;await assert.rejects(q('UPDATE tool_runs SET exit_code=1 WHERE id=$1',[rid]),/cannot be modified/);await assert.rejects(q('DELETE FROM tool_runs WHERE id=$1',[rid]),/cannot be modified/);});

test('Editing a caption re-runs the caption tools with fresh receipts',async()=>{
 const data={...asset.data,caption:'Hi guys!!! In today\'s fast-paced world, dental health is crucial. Link in bio.'};
 const r=await action({action:'save-record',id:asset.id,kind:'Asset',title:asset.title,data});assert.equal(r.status,200,JSON.stringify(r.data));
 assert.ok(r.data.data.receipts.length>0);assert.notDeepEqual(r.data.data.receipts,asset.data.receipts);
 assert.ok(r.data.data.checks.some(c=>c.source==='ig-human/detect.py'||c.source==='ig-caption/caption.py'));
});
