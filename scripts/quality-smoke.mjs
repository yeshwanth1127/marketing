// Smoke test for the caption quality path. Needs the database and Python; does not need Claude.
// Usage: npm run quality:smoke   (or: docker compose exec web node scripts/quality-smoke.mjs)
// Checks, with the real linter and the real DMP quality gate:
//   1. the scorer dependencies (textstat, nltk and its data) are installed,
//   2. the quality gate scores every dimension: no WARN, no skipped content quality, brand voice or readability,
//   3. a caption with 12 hashtags comes out with five or fewer,
//   4. a caption that failed the lint reports structured findings, not "did not run".
// Exits 1 if any check fails. Saves nothing except the receipts and one throwaway test client.
import {q,pool,id} from '../core/db/index.mjs';
import {chainOf,resolveFromChain} from '../core/clients/tree.mjs';
import {loadModule} from '../core/runtime/index.mjs';
import {pythonDepsStatus} from '../core/tools/runner.mjs';
import {enrich} from '../core/tools/enrich.mjs';
import {hashtagsIn} from '../core/tools/lint-result.mjs';

let failed=0;
const ok=(cond,msg,detail='')=>{console.log((cond?'PASS  ':'FAIL  ')+msg+(cond||!detail?'':'\n      '+detail));if(!cond)failed++;};

const deps=pythonDepsStatus({force:true});
ok(deps.ok,'scorer dependencies installed (textstat, nltk, nltk data)',deps.missing.join('; '));

const user=(await q("SELECT * FROM users WHERE role='admin' LIMIT 1")).rows[0];
let row=(await q("SELECT * FROM clients WHERE name='Quality smoke test' LIMIT 1")).rows[0];
if(!row){const cid=id();await q("INSERT INTO clients(id,name,industry,city,languages,data,created_by) VALUES($1,'Quality smoke test','Menswear','Bengaluru','[\"English\"]','{}',$2)",[cid,user.id]);row=(await q('SELECT * FROM clients WHERE id=$1',[cid])).rows[0];}
const client=resolveFromChain(await chainOf(row.id));
const mod=loadModule('05-content',client);
const ctx={client,user,run:null,records:[]};
const asset=caption=>[{kind:'Asset',title:'Smoke caption',data:{type:'copy',channel:'social',caption,script:''}}];

const twelve='#WeddingSeason #WhatToWear #WeddingGuestStyle #BengaluruStyle #BengaluruFashion #MensStyleIndia #IndianWeddingOutfit #PoloShirt #SmartCasual #DressCode #OutfitCheck #fableen';
const caption=`Three polo checks before a wedding in Bengaluru: collar flat, seam on the shoulder, a colour that suits the invite. Save this for your next invite.\n\n${twelve}`;

// 12 tags, no model: the deterministic cap must bring it to five or fewer and re-lint clean.
const [out]=await enrich(ctx,mod,asset(caption),{autofix:true,revise:null});
const g=out.data.quality_gate;
ok(g&&!g.error,'quality gate ran',JSON.stringify(g)?.slice(0,300));
ok(g&&g.incomplete===false&&!(g.missing_dimensions||[]).length,'quality gate scored every dimension (no skipped content quality, brand voice or readability)',JSON.stringify({not_run:g?.not_run,missing:g?.missing_dimensions,interpretation:g?.interpretation}));
ok(!(out.data.checks||[]).some(c=>/Quality scoring is incomplete/.test(c.message)),'no "quality scoring is incomplete" warning on the record');
ok(out.data.brand_voice&&!out.data.brand_voice.error&&!out.data.brand_voice.fallback,'brand voice scorer ran for real (not fallback)',JSON.stringify(out.data.brand_voice)?.slice(0,200));
ok(out.data.content_score&&!out.data.content_score.error&&!out.data.content_score.fallback,'content quality scorer ran for real (not fallback)',JSON.stringify(out.data.content_score)?.slice(0,200));
ok(hashtagsIn(out.data.caption).length<=5,`12 hashtags became ${hashtagsIn(out.data.caption).length}`);
ok(out.data.caption_lint?.ran===true&&out.data.caption_lint.passed===true,'caption lint re-ran and passed after the fix',JSON.stringify(out.data.caption_lint)?.slice(0,300));

// A caption the linter finds issues with must come back as findings, never as "did not run".
const [warned]=await enrich(ctx,mod,asset('Three polo checks before the wedding in Bengaluru. #Polo'),{autofix:false});
const L=warned.data.caption_lint;
ok(L?.ran===true&&!L.error&&L.findings?.length>0&&L.findings.every(f=>f.finding&&f.fix),'lint findings are structured with a fix for each',JSON.stringify(L)?.slice(0,300));

console.log(failed?`\nQUALITY SMOKE FAILED: ${failed} check(s) failed.`:'\nQUALITY SMOKE OK: scorers installed, gate complete, hashtag cap enforced, lint findings structured.');
await pool.end();
process.exit(failed?1:0);
