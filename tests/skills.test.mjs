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

test('DMP quality gate and claim verifier run with a DMP-format brand profile (golden)',async()=>{
 const g=await action({action:'generate',module:'05-content',provider:'local_template',brief:'Family dental care'});
 const a=g.data.records[0];
 assert.ok(a.data.quality_gate&&!a.data.quality_gate.error,JSON.stringify(a.data.quality_gate));
 assert.ok(['PASS','WARN','FAIL'].includes(a.data.quality_gate.decision));
 assert.ok(a.data.claim_check&&!a.data.claim_check.error,JSON.stringify(a.data.claim_check));
 const rows=(await q('SELECT skill,script,vendor_match,exit_code FROM tool_runs WHERE id=ANY($1::uuid[])',[a.data.receipts])).rows;
 for(const s of ['eval-runner.py','claim-verifier.py']){const row=rows.find(r=>r.script===s);assert.ok(row,s);assert.equal(row.exit_code,0);assert.equal(row.vendor_match,true);}
});

test('Unproven claims are flagged by claim-verifier; recorded evidence verifies them',async()=>{
 const brand=(await q("SELECT * FROM records WHERE client_id=$1 AND kind='BrandKit' ORDER BY created_at DESC LIMIT 1",[client])).rows[0];
 const draft={...asset.data,script:'[0-3s] Rated 4.9 by 1,200 families. 50% fewer cavities with twice-yearly visits.',caption:'Rated 4.9 by 1,200 families.'};
 let r=await action({action:'save-record',kind:'Asset',title:'Claims test',data:draft});assert.equal(r.status,200,JSON.stringify(r.data));
 assert.ok(r.data.data.checks.some(c=>c.source==='verify-claims/claim-verifier.py'&&/needs evidence/.test(c.message)));
 const s=await action({action:'save-record',id:brand.id,kind:'BrandKit',title:brand.title,data:{...brand.data,evidence:[{claim:'Rated 4.9 by 1,200 families',source:'Google reviews export',date:'2026-10-31',verified:true},{claim:'50% fewer cavities with twice-yearly visits',source:'Clinic audit 2026',date:'2026-09-30',verified:true}]}});assert.equal(s.status,200,JSON.stringify(s.data));
 r=await action({action:'save-record',kind:'Asset',title:'Claims test 2',data:draft});
 // Golden: same text + same evidence through the vendor script directly must give the same result.
 const fs=await import('node:fs');const os=await import('node:os');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gold-'));
 fs.writeFileSync(path.join(dir,'c.txt'),[draft.script,draft.caption].join('\n\n'));
 fs.writeFileSync(path.join(dir,'e.json'),JSON.stringify({evidence:[{claim:'Rated 4.9 by 1,200 families',source:'Google reviews export',date:'2026-10-31',verified:true},{claim:'50% fewer cavities with twice-yearly visits',source:'Clinic audit 2026',date:'2026-09-30',verified:true}]}));
 const exp=vendor('digital-marketing-pro/scripts/claim-verifier.py','',['--action','verify','--file',path.join(dir,'c.txt'),'--evidence',path.join(dir,'e.json')]);
 assert.deepEqual(r.data.data.claim_check.summary,exp.summary);
 assert.equal(r.data.data.claim_check.score,exp.verification_score);
});

test('Receipts and skill-coverage endpoints expose what really ran',async()=>{
 const r=await request(`receipts?client=${client}&ids=${idea.data.receipts.join(',')}`);assert.equal(r.status,200);assert.equal(r.data[0].script,'hookscore.py');
 const c=await request(`skill-coverage?client=${client}`);assert.equal(c.status,200);
 assert.ok(c.data.declared.length>=6);assert.ok(c.data.runs.some(x=>x.script==='eval-runner.py'&&x.ok>0));
});

test('Calculators run DMP scripts with validated inputs and match direct runs (golden)',async()=>{
 const p={baseline_rate:0.03,mde:0.2,mde_type:'relative',daily_traffic:800};
 const r=await action({action:'run-tool',module:'ads',tool:'sample-size',params:p,save:true});assert.equal(r.status,200,JSON.stringify(r.data));
 const exp=vendor('digital-marketing-pro/scripts/sample-size-calculator.py','',['--baseline-rate','0.03','--mde','0.2','--mde-type','relative','--daily-traffic','800']);
 assert.equal(r.data.output.sample_size_per_variant,exp.sample_size_per_variant);assert.equal(r.data.output.estimated_days,exp.estimated_days);
 assert.equal(r.data.record.kind,'Report');assert.deepEqual(r.data.record.data.receipts,[r.data.receipt]);
 const s=await action({action:'run-tool',module:'ads',tool:'significance',params:{control_visitors:4000,control_conversions:120,variant_visitors:4000,variant_conversions:156}});
 assert.equal(s.data.output.z_test.significant,true);
 const b=await action({action:'run-tool',module:'03-plan',tool:'budget-optimizer',params:{channels:[{name:'Meta',spend:20000,conversions:40,revenue:120000},{name:'Google',spend:10000,conversions:30,revenue:90000}],total_budget:30000}});
 assert.equal(b.status,200,JSON.stringify(b.data));assert.ok(b.data.output.optimized_allocation.channels.length===2);
});

test('Calculator inputs are validated before any script runs',async()=>{
 assert.equal((await action({action:'run-tool',module:'ads',tool:'nope',params:{}})).status,400);
 assert.equal((await action({action:'run-tool',module:'ads',tool:'sample-size',params:{mde:0.2}})).status,400);
 assert.equal((await action({action:'run-tool',module:'ads',tool:'sample-size',params:{baseline_rate:'abc',mde:0.2}})).status,400);
});

test('Step 9 report runs budget reallocation and creative fatigue on real metrics',async()=>{
 const rows=[];const days=['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05'];
 days.forEach((d,i)=>{rows.push({metric:'impressions',value:5000,label:'real',date:d,source:'Meta export',channel:'Meta',asset_id:'reel-1'},{metric:'clicks',value:110-i*15,label:'real',date:d,source:'Meta export',channel:'Meta',asset_id:'reel-1'});});
 rows.push({metric:'spend',value:20000,label:'real',date:'2026-10-05',source:'Meta export',channel:'Meta'},{metric:'conversions',value:40,label:'real',date:'2026-10-05',source:'Meta export',channel:'Meta'},{metric:'revenue',value:120000,label:'real',date:'2026-10-05',source:'Meta export',channel:'Meta'});
 rows.push({metric:'spend',value:10000,label:'real',date:'2026-10-05',source:'Google export',channel:'Google'},{metric:'conversions',value:30,label:'real',date:'2026-10-05',source:'Google export',channel:'Google'},{metric:'revenue',value:90000,label:'real',date:'2026-10-05',source:'Google export',channel:'Google'});
 assert.equal((await action({action:'import-metrics',metrics:rows})).status,200);
 const g=await action({action:'generate',module:'09-results',provider:'local_template'});assert.equal(g.status,200,JSON.stringify(g.data));
 const rep=g.data.records[0];
 assert.ok(rep.data.budget_reallocation&&!rep.data.budget_reallocation.error,JSON.stringify(rep.data.budget_reallocation));
 assert.equal(rep.data.creative_fatigue[0].creative_id,'reel-1');
 assert.ok(rep.data.receipts.length>=2);
});

test('Claude agent mode: skill scripts run inside the sandbox are receipted; other commands are refused',async()=>{
 process.env.EXORA_CLAUDE_BIN=path.join(ROOT,'tests/fake-claude.mjs');
 try{
  const h=await action({action:'generate',module:'04-hooks',provider:'claude',brief:'Family dental care'});assert.equal(h.status,200,JSON.stringify(h.data));
  const rec=h.data.records[0];const rows=(await q('SELECT script,exit_code,vendor_match,run_id FROM tool_runs WHERE id=ANY($1::uuid[])',[rec.data.receipts])).rows;
  assert.ok(rows.some(r=>r.script==='hookscore.py'&&r.exit_code===0&&r.vendor_match&&r.run_id),JSON.stringify(rows));
  assert.ok(!rows.some(r=>/curl/.test(r.script)));
  assert.match(rec.data.skill_notes,/fake agent/);
  const c=await action({action:'generate',module:'05-content',provider:'claude',brief:'Family dental care'});assert.equal(c.status,200,JSON.stringify(c.data));
  const crow=(await q('SELECT script,exit_code,vendor_match FROM tool_runs WHERE id=ANY($1::uuid[])',[c.data.records[0].data.receipts])).rows;
  assert.ok(crow.some(r=>r.script==='claim-verifier.py'&&r.exit_code===0&&r.vendor_match),JSON.stringify(crow));
 }finally{delete process.env.EXORA_CLAUDE_BIN;}
});

test('Claude design composition: slides are collected and the preview tool run is receipted',async()=>{
 process.env.EXORA_CLAUDE_BIN=path.join(ROOT,'tests/fake-claude.mjs');
 try{
  const {composeStatic}=await import('../core/design/compose.mjs');
  const c=(await q('SELECT * FROM clients WHERE id=$1',[client])).rows[0];const user=(await q("SELECT * FROM users WHERE role='admin' LIMIT 1")).rows[0];
  const asset={id:'00000000-0000-0000-0000-000000000001',title:'Hook',data:{type:'carousel',format:'portrait',on_screen_text:['a','b','c','d']}};
  const res=await composeStatic({client:c,user,run:null,records:[],asset,brand:{colors:['#0f3d3e','#f2c14e'],banned_words:[]}});
  assert.equal(res.html.length,4);assert.equal(res.design.notes,'fake design');
  const rows=(await q('SELECT skill,script,source FROM tool_runs WHERE id=ANY($1::uuid[])',[res.receipts])).rows;
  assert.ok(rows.some(r=>r.script==='preview.mjs'&&r.skill==='exora-design-system'&&r.source==='EXORA'),JSON.stringify(rows));
 }finally{delete process.env.EXORA_CLAUDE_BIN;}
});

test('Claude reel composition: HyperFrames project is kept and CLI runs are receipted',async()=>{
 process.env.EXORA_CLAUDE_BIN=path.join(ROOT,'tests/fake-claude.mjs');
 try{
  const fs=await import('node:fs');const os=await import('node:os');
  const {composeVideo}=await import('../core/design/compose.mjs');
  const c=(await q('SELECT * FROM clients WHERE id=$1',[client])).rows[0];const user=(await q("SELECT * FROM users WHERE role='admin' LIMIT 1")).rows[0];
  const keepDir=fs.mkdtempSync(path.join(os.tmpdir(),'keep-'));
  const asset={id:'00000000-0000-0000-0000-000000000002',title:'Hook',data:{type:'video',format:'reel',on_screen_text:['Before you book a dentist, ask this'],beat_sheet:{total_seconds:9.2,beats:[]}}};
  const res=await composeVideo({client:c,user,run:null,records:[],asset,brand:{colors:['#0f3d3e']},keepDir});
  assert.equal(res.seconds,10);assert.ok(fs.existsSync(path.join(res.dir,'index.html')));assert.ok(fs.existsSync(path.join(res.dir,'assets/gsap.min.js')));
  const rows=(await q('SELECT skill,script,source FROM tool_runs WHERE id=ANY($1::uuid[])',[res.receipts])).rows;
  assert.ok(rows.some(r=>r.skill==='hyperframes-cli'&&r.script==='hyperframes lint'&&r.source==='HF'),JSON.stringify(rows));
 }finally{delete process.env.EXORA_CLAUDE_BIN;}
});
