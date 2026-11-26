// Caption quality pipeline: structured lint results, the check-and-revise loop, honest quality-gate reporting,
// and the pipeline-run HyperFrames checks. The lint tests use the real vendored linter when Python is available.
import {test,after} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {handle} from '../core/api.mjs';import {q,pool} from '../core/db/index.mjs';
import {chainOf,resolveFromChain} from '../core/clients/tree.mjs';
import {loadModule} from '../core/runtime/index.mjs';
import {python,pythonDepsStatus} from '../core/tools/runner.mjs';
import {enrich,gateSummary} from '../core/tools/enrich.mjs';
import {parseCaptionLint,lintDidNotRun,failingFindings,trimHashtags,hashtagsIn,HASHTAG_LIMIT} from '../core/tools/lint-result.mjs';
import {reviseCaption,cleanRevision,revisePrompt} from '../core/runtime/revise.mjs';
import {ensureHyperframesChecks} from '../core/design/compose.mjs';
after(async()=>pool.end());

const TWELVE='#WeddingSeason #WhatToWear #WeddingGuestStyle #BengaluruStyle #BengaluruFashion #MensStyleIndia #IndianWeddingOutfit #PoloShirt #SmartCasual #DressCode #OutfitCheck #fableen';
const CAPTION=`Don't wear a polo to every wedding function. Three checks decide it: casual invite, a polo works; traditional invite, skip it; unsure, ask the host. Save this for your next invite.\n\n${TWELVE}`;
const pyOk=spawnSync(python(),['-c','pass']).status===0;

// A linter report the way caption.py prints it, with the verdict it would give.
const report=(checks,verdict)=>({characters:300,limit:2200,checks,verdict});
const HASHTAG_FAIL=report([{check:'LENGTH',status:'PASS',detail:'300 / 2200 characters'},{check:'HASHTAGS',status:'FAIL',detail:"12 tags, over Instagram's cap of 5"},{check:'ONE ASK',status:'WARN',detail:'2 asks (save this, share this)'}],'FIX');

// ---- structured lint results ----
test('a linter report with failures parses to structured checks, findings and the fix for each',()=>{
 const l=parseCaptionLint(HASHTAG_FAIL);
 assert.equal(l.ran,true);assert.equal(l.verdict,'FIX');assert.equal(l.passed,false);
 assert.deepEqual(l.checks.map(c=>c.check),['LENGTH','HASHTAGS','ONE ASK']);
 assert.equal(l.checks[0].fix,undefined,'a passing check needs no fix');
 assert.deepEqual(l.findings.map(f=>[f.check,f.status]),[['HASHTAGS','FAIL'],['ONE ASK','WARN']]);
 for(const f of l.findings){assert.ok(f.finding&&f.fix,'every finding names the problem and the fix');}
 assert.match(l.findings[0].fix,/at most 5 hashtags/i);
 assert.deepEqual(failingFindings(l).map(f=>f.check),['HASHTAGS'],'only FAIL triggers a rewrite; warnings are advice');
});
test('a JSON string and a report with only warnings parse the same way (REVIEW is not a failure)',()=>{
 const l=parseCaptionLint(JSON.stringify(report([{check:'ONE ASK',status:'WARN',detail:'no call to action'}],'REVIEW')));
 assert.equal(l.ran,true);assert.equal(l.passed,true);assert.equal(l.verdict,'REVIEW');assert.equal(failingFindings(l).length,0);
});
test('output with no usable checks is not a lint result, and "did not run" is its own shape',()=>{
 for(const bad of [null,'','not json','{"verdict":"FIX"}',{checks:[]},'{"checks":[]}'])assert.equal(parseCaptionLint(bad),null,JSON.stringify(bad));
 const n=lintDidNotRun('python missing');assert.equal(n.ran,false);assert.equal(n.passed,false);assert.match(n.error,/python missing/);assert.deepEqual(n.findings,[]);
});

// ---- deterministic hashtag cap ----
test('trimHashtags keeps the first five distinct tags and leaves the rest of the text alone',()=>{
 const out=trimHashtags(CAPTION,5);
 assert.equal(hashtagsIn(out).length,5);
 assert.deepEqual(hashtagsIn(out),['#WeddingSeason','#WhatToWear','#WeddingGuestStyle','#BengaluruStyle','#BengaluruFashion']);
 assert.ok(out.startsWith("Don't wear a polo to every wedding function."));
 assert.doesNotMatch(out,/ {2}/,'no double spaces left where tags were removed');
});
test('trimHashtags counts a repeated tag once, is a no-op under the cap, and drops an emptied label line',()=>{
 assert.equal(trimHashtags('Hello. #a #A #b',5),'Hello. #a #b','a repeat in another case is one tag');
 assert.equal(trimHashtags('Short one. #a #b #c',5),'Short one. #a #b #c');
 const out=trimHashtags('Body line.\n\nFirst comment hashtags: #a #b #c #d #e #f #g',5);
 assert.deepEqual(hashtagsIn(out),['#a','#b','#c','#d','#e']);assert.match(out,/First comment hashtags: #a/);
 const emptied=trimHashtags('Body.\nHashtags:\n#a #b',0);assert.doesNotMatch(emptied,/hashtags:/i);
});
test('cleanRevision strips fences, a heading and wrapping quotes; the prompt carries each finding and its fix',()=>{
 assert.equal(cleanRevision('```\nHello #a\n```'),'Hello #a');
 assert.equal(cleanRevision('Revised caption: Hello #a'),'Hello #a');
 assert.equal(cleanRevision('"Hello #a"'),'Hello #a');
 assert.equal(cleanRevision('He said "hi" to me'),'He said "hi" to me');
 const p=revisePrompt({caption:'x',findings:failingFindings(parseCaptionLint(HASHTAG_FAIL)),language:'Hindi'});
 assert.match(p,/HASHTAGS: 12 tags, over Instagram's cap of 5/);assert.match(p,/at most 5 hashtags/i);assert.match(p,/Hindi/);
});

// ---- the revise loop (injected linter and reviser, so each branch is exact) ----
const countingLint=(sequence)=>{let i=0;const seen=[];const fn=async text=>{seen.push(text);return sequence[Math.min(i++,sequence.length-1)](text);};fn.seen=seen;return fn;};
const lintByTags=async text=>{const n=hashtagsIn(text).length;return parseCaptionLint(report([{check:'HASHTAGS',status:n>HASHTAG_LIMIT?'FAIL':'PASS',detail:`${n} tags`}],n>HASHTAG_LIMIT?'FIX':'READY'));};

test('revise loop: the failing finding is sent to the model, the revision is re-linted, and it ends clean',async()=>{
 let got;
 const revise=async({caption,findings,attempt})=>{got={caption,findings,attempt};return caption.split('\n\n')[0]+'\n\n'+hashtagsIn(caption).slice(0,4).join(' ');};
 const r=await reviseCaption({caption:CAPTION,lint:lintByTags,revise,max:3});
 assert.equal(got.attempt,1);assert.equal(got.findings[0].check,'HASHTAGS');assert.match(got.findings[0].finding,/12 tags/);
 assert.equal(r.resolved,true);assert.ok(hashtagsIn(r.caption).length<=5);assert.equal(r.lint.passed,true);
 assert.equal(r.attempts.length,1);assert.equal(r.attempts[0].kept,true);assert.deepEqual(r.attempts[0].remaining,[]);
});
test('revise loop: stops at the attempt cap, then applies the deterministic hashtag cap as a last resort',async()=>{
 let calls=0;const revise=async({caption})=>{calls++;return caption+' ';};// "revision" that fixes nothing
 const r=await reviseCaption({caption:CAPTION,lint:lintByTags,revise,max:2});
 assert.equal(calls,2,'never more than the cap');
 assert.equal(r.attempts.at(-1).fallback,'trim_hashtags');assert.equal(r.resolved,true);assert.equal(hashtagsIn(r.caption).length,5);
});
test('revise loop: a model error does not lose the draft; the hashtag cap still applies',async()=>{
 const r=await reviseCaption({caption:CAPTION,lint:lintByTags,revise:async()=>{throw new Error('Claude timed out');},max:3});
 assert.match(r.attempts[0].error,/timed out/);assert.equal(r.resolved,true);assert.equal(hashtagsIn(r.caption).length,5);
});
test('revise loop: with no model at all the hashtag cap still applies, and nothing else is rewritten',async()=>{
 const r=await reviseCaption({caption:CAPTION,lint:lintByTags,revise:null});
 assert.equal(hashtagsIn(r.caption).length,5);assert.ok(r.caption.startsWith("Don't wear a polo to every wedding function."));assert.equal(r.attempts.length,1);
});
test('revise loop: a revision that makes things worse is discarded, and the best draft is returned with its findings',async()=>{
 const stuck=report([{check:'LENGTH',status:'FAIL',detail:'2500 / 2200 characters, 300 over the limit'}],'FIX');
 const worse=report([{check:'LENGTH',status:'FAIL',detail:'x'},{check:'FIRST LINE',status:'FAIL',detail:'y'}],'FIX');
 const lint=countingLint([async()=>parseCaptionLint(stuck),async()=>parseCaptionLint(worse)]);// every revision lints as worse
 const r=await reviseCaption({caption:'original',lint,revise:async()=>'changed',max:2});
 assert.equal(r.caption,'original','the worse revision was not kept');assert.equal(r.resolved,false);
 assert.deepEqual(failingFindings(r.lint).map(f=>f.check),['LENGTH'],'unresolved findings come back attached');
 assert.equal(r.attempts[0].kept,false);
});
test('revise loop: an unchanged reply is logged, not treated as progress; a linter that cannot run stops the loop',async()=>{
 const same=await reviseCaption({caption:CAPTION,lint:lintByTags,revise:async({caption})=>caption,max:2});
 assert.equal(same.attempts[0].changed,false);
 let called=false;
 const dead=await reviseCaption({caption:CAPTION,lint:async()=>lintDidNotRun('no python'),revise:async()=>{called=true;return 'x';}});
 assert.equal(dead.not_run,true);assert.equal(dead.lint.ran,false);assert.equal(called,false);
});
test('revise loop: text a person wrote is reported on, never rewritten (fix:false)',async()=>{
 let called=false;
 const r=await reviseCaption({caption:CAPTION,lint:lintByTags,revise:async()=>{called=true;return 'x';},fix:false});
 assert.equal(called,false);assert.equal(r.caption,CAPTION);assert.equal(r.resolved,false);assert.equal(failingFindings(r.lint).length,1);
});

// ---- quality gate: an incomplete score is reported as incomplete ----
test('gateSummary flags a gate where content quality, brand voice or readability did not run',()=>{
 const partial=gateSummary({decision:'WARN',composite_score:95.4,grade:'B',missing_dimensions:['content_quality','brand_voice','readability'],issues:[]});
 assert.equal(partial.incomplete,true);assert.deepEqual(partial.not_run,['content_quality','brand_voice','readability']);
 const skipped=gateSummary({decision:'PASS',missing_dimensions:[],skipped_dimensions:['readability','claims']});
 assert.equal(skipped.incomplete,true);assert.deepEqual(skipped.not_run,['readability'],'only the three required scorers count');
 const full=gateSummary({decision:'PASS',composite_score:88,grade:'B+',missing_dimensions:[],skipped_dimensions:['claims']});
 assert.equal(full.incomplete,false);assert.deepEqual(full.not_run,[]);
});

// ---- through enrich, with the real linter, tool receipts and database ----
let client,user,mod;
test('setup',async()=>{
 const r=await handle(new Request('http://localhost:3100/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({email:'admin@exora.local',password:'ExoraLocal!2026'})}));
 const cookie=r.headers.get('set-cookie').split(';')[0];
 const made=await handle(new Request('http://localhost:3100/api/action',{method:'POST',headers:{cookie,'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({action:'create-client',name:'Quality Test '+Date.now(),industry:'Menswear',city:'Bengaluru',languages:['English']})}));
 const id=(await made.json()).id;
 client=resolveFromChain(await chainOf(id));
 user=(await q("SELECT * FROM users WHERE role='admin' LIMIT 1")).rows[0];
 mod=loadModule('05-content',client);
});
const asset=caption=>[{kind:'Asset',title:'Test caption',data:{type:'copy',channel:'social',caption,script:''}}];
const ctx=()=>({client,user,run:null,records:[]});
const lastLintRun=async()=>(await q("SELECT * FROM tool_runs WHERE client_id=$1 AND skill='ig-caption' ORDER BY created_at DESC LIMIT 1",[client.id])).rows[0];

test('a caption with 12 hashtags is revised to five or fewer and re-checked by the real linter',{skip:!pyOk&&'Python is not available'},async()=>{
 let findingsSeen;
 const revise=async({caption,findings})=>{findingsSeen=findings;return caption.split('\n\n')[0]+'\n\n'+hashtagsIn(caption).slice(0,5).join(' ');};
 const [out]=await enrich(ctx(),mod,asset(CAPTION),{autofix:true,revise});
 assert.ok(findingsSeen.some(f=>f.check==='HASHTAGS'&&/12 tags/.test(f.finding)),JSON.stringify(findingsSeen));
 assert.ok(hashtagsIn(out.data.caption).length<=5);assert.equal(out.data.caption_original,CAPTION);
 const L=out.data.caption_lint;assert.equal(L.ran,true);assert.equal(L.passed,true);assert.equal(L.revised,true);assert.equal(L.revisions[0].kept,true);
 assert.equal(L.checks.find(c=>c.check==='HASHTAGS').status,'PASS');
 assert.ok(!(out.data.checks||[]).some(c=>c.severity==='error'&&/HASHTAGS/.test(c.message)),'a fixed problem is not left on the record');
});
test('with no model the hashtag cap is applied and the record says what was done',{skip:!pyOk&&'Python is not available'},async()=>{
 const [out]=await enrich(ctx(),mod,asset(CAPTION),{autofix:true,revise:null});
 assert.equal(hashtagsIn(out.data.caption).length,5);assert.equal(out.data.caption_lint.passed,true);assert.equal(out.data.caption_lint.revisions.at(-1).fallback,'trim_hashtags');
});
test('a caption that cannot be fixed comes back with structured findings and a blocking check, not a silent pass',{skip:!pyOk&&'Python is not available'},async()=>{
 const long='Polo checks before a wedding. '+'Three quick checks for a polo. '.repeat(90)+'Save this for later.\n\n#Polo #Wedding';// over 2,200 characters
 const [out]=await enrich(ctx(),mod,asset(long),{autofix:true,revise:async({caption})=>caption});
 const L=out.data.caption_lint;
 assert.equal(L.ran,true);assert.equal(L.passed,false);assert.equal(L.error,undefined);
 const f=L.findings.find(x=>x.check==='LENGTH');assert.ok(f&&f.status==='FAIL'&&f.fix&&/over the limit/.test(f.finding),JSON.stringify(L.findings));
 const blocking=out.data.checks.find(c=>c.severity==='error'&&c.check==='LENGTH');assert.ok(blocking&&blocking.fix&&blocking.source==='ig-caption/caption.py',JSON.stringify(out.data.checks));
});
test('a linter that ran and found issues (exit 1) is a result with findings, not an error',{skip:!pyOk&&'Python is not available'},async()=>{
 const [out]=await enrich(ctx(),mod,asset('Three polo checks before the wedding in Bengaluru. #Polo'),{autofix:false});
 const L=out.data.caption_lint;
 assert.equal(L.ran,true,JSON.stringify(L).slice(0,300));assert.equal(L.error,undefined);
 assert.ok(L.findings.some(f=>f.check==='ONE ASK'&&f.status==='WARN'),'the "no call to action" finding is shown');
 const row=await lastLintRun();assert.equal(row.exit_code,1,'the receipt keeps the real exit code');assert.equal(row.error,null,'and is not stored as an error');
});
test('a manual caption is linted and reported but its text is never rewritten',{skip:!pyOk&&'Python is not available'},async()=>{
 let called=false;
 const [out]=await enrich(ctx(),mod,asset(CAPTION),{autofix:false,revise:async()=>{called=true;return 'x';}});
 assert.equal(called,false);assert.equal(out.data.caption,CAPTION);assert.equal(out.data.caption_original,undefined);
 assert.equal(out.data.caption_lint.passed,false);assert.ok(out.data.caption_lint.findings.some(f=>f.check==='HASHTAGS'&&f.status==='FAIL'));
});
test('"did not run" is only for a linter that could not execute',async()=>{
 const saved=process.env.EXORA_PYTHON;process.env.EXORA_PYTHON='/nonexistent/python-for-test';
 try{
  const [out]=await enrich(ctx(),mod,asset(CAPTION),{autofix:true,revise:async()=>'x'});
  const L=out.data.caption_lint;
  assert.equal(L.ran,false);assert.ok(L.error,'a reason is given');assert.deepEqual(L.findings,[]);assert.equal(out.data.caption,CAPTION,'nothing is changed when the check could not run');
 }finally{if(saved===undefined)delete process.env.EXORA_PYTHON;else process.env.EXORA_PYTHON=saved;}
});
test('when the scorer dependencies are installed, the quality gate scores all six dimensions',{skip:!pyOk&&'Python is not available'},async t=>{
 const deps=pythonDepsStatus({force:true});
 if(!deps.ok)return t.skip('scorer dependencies are not installed here: '+deps.missing.join(', '));
 const [out]=await enrich(ctx(),mod,asset('Three polo checks before a wedding in Bengaluru: collar flat, seam on the shoulder, colour that suits the invite. Save this for your next invite.\n\n#Polo #Wedding'),{autofix:false});
 const g=out.data.quality_gate;
 assert.ok(g&&!g.error,JSON.stringify(g));assert.equal(g.incomplete,false,'not_run: '+JSON.stringify(g.not_run));assert.deepEqual(g.missing_dimensions,[]);
 assert.ok(!(out.data.checks||[]).some(c=>/Quality scoring is incomplete/.test(c.message)));
});

// ---- video: the pipeline runs the HyperFrames checks Claude skipped ----
test('ensureHyperframesChecks runs only the missing check and records a real receipt for it',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hf-test-'));const fake=path.join(dir,'hyperframes.mjs');
 fs.writeFileSync(fake,"console.log('fake hyperframes '+process.argv.slice(2).join(' '));");
 try{
  const vmod=loadModule('06-design-video',client);
  const rows=[{skill:'hyperframes-cli',script:'hyperframes lint'}];// Claude ran lint but skipped check
  const r=await ensureHyperframesChecks({dir,rows,client,user,run:null,mod:vmod,hfBin:fake,hfVersion:'0.0.0-test'});
  assert.deepEqual(r.ran.map(x=>x.check),['check']);assert.equal(r.ids.length,1);
  assert.ok(rows.some(x=>/hyperframes\s+check/.test(x.script)),'the gate now sees both receipts');
  const row=(await q('SELECT * FROM tool_runs WHERE id=$1',[r.ids[0]])).rows[0];
  assert.equal(row.skill,'hyperframes-cli');assert.equal(row.script,'hyperframes check');assert.equal(row.exit_code,0);assert.equal(row.error,null);
  const both=await ensureHyperframesChecks({dir,rows:[],client,user,run:null,mod:vmod,hfBin:fake,hfVersion:'0.0.0-test'});
  assert.deepEqual(both.ran.map(x=>x.check),['lint','check']);
  const none=await ensureHyperframesChecks({dir,rows:[{skill:'hyperframes-cli',script:'hyperframes lint'},{skill:'hyperframes-cli',script:'hyperframes check'}],client,user,run:null,mod:vmod,hfBin:fake,hfVersion:'0.0.0-test'});
  assert.deepEqual(none.ran,[],'nothing is re-run when Claude already did both');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('a failing HyperFrames check is recorded as failed, not hidden',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hf-test-'));const fake=path.join(dir,'hyperframes.mjs');
 fs.writeFileSync(fake,"console.error('missing_timeline_registry');process.exit(1);");
 try{
  const r=await ensureHyperframesChecks({dir,rows:[{skill:'hyperframes-cli',script:'hyperframes check'}],client,user,run:null,mod:loadModule('06-design-video',client),hfBin:fake,hfVersion:'0.0.0-test'});
  assert.equal(r.ran[0].ok,false);assert.equal(r.ran[0].exit_code,1);assert.match(r.ran[0].summary,/missing_timeline_registry/);
  const row=(await q('SELECT * FROM tool_runs WHERE id=$1',[r.ids[0]])).rows[0];assert.equal(row.exit_code,1);assert.match(row.error,/missing_timeline_registry/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
