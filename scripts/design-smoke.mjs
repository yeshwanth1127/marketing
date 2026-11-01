// Run on the Mac (Chrome + Claude Code logged in): Claude designs a carousel, then the renderer checks it.
// Usage: npm run design:smoke
import fs from 'node:fs';import {q,pool,id} from '../core/db/index.mjs';import {composeStatic} from '../core/design/compose.mjs';import {renderAsset} from '../workers/renderer/index.mjs';
const user=(await q("SELECT * FROM users WHERE role='admin' LIMIT 1")).rows[0];
let client=(await q("SELECT * FROM clients WHERE name='Design smoke test' LIMIT 1")).rows[0];
if(!client){const cid=id();await q("INSERT INTO clients(id,name,industry,city,languages,data,created_by) VALUES($1,'Design smoke test','Family dental clinic','Bengaluru','[\"English\"]','{}',$2)",[cid,user.id]);client=(await q('SELECT * FROM clients WHERE id=$1',[cid])).rows[0];}
const brand={colors:['#0f3d3e','#f2c14e','#f7f5ef'],font:'Georgia',voice:'Warm, calm, practical',banned_words:['guaranteed']};
const asset={id:id(),title:'Before you book a dentist in Indiranagar, ask these 3 questions',data:{type:'carousel',format:'portrait',on_screen_text:['Before you book a dentist in Indiranagar, ask these 3 questions','1. Who will actually treat my child?','2. What does each visit include?','3. How do you handle a nervous patient?','Visit us — we will answer all three'],caption:'Save this for your next visit.',cta:'Message us to book a visit'}};
const run=id();await q("INSERT INTO runs(id,client_id,module,provider,status,created_by) VALUES($1,$2,'06-design-video','claude','running',$3)",[run,client.id,user.id]);
const t=Date.now();const c=await composeStatic({client,user,run,records:[],asset,brand});
const r=await renderAsset(asset,{brand,client_name:client.name,html:c.html});
const receipts=(await q('SELECT skill,script,exit_code FROM tool_runs WHERE id=ANY($1::uuid[])',[c.receipts])).rows;
console.log(JSON.stringify({seconds:Math.round((Date.now()-t)/1000),frames:c.html.length,design_notes:c.design,engine:r.engine,files:r.files.map(f=>f.path),design_checks:r.design_checks,receipts},null,1));
const errors=r.design_checks.reduce((a,f)=>a+f.issues.filter(i=>i.severity==='error').length,0);
console.log(receipts.some(x=>x.script==='preview.mjs')?`DESIGN SMOKE OK: Claude previewed its own design; ${errors} design error(s) in the final render. Open the PNGs listed above.`:'DESIGN SMOKE: Claude did not run the preview tool. Check the output above.');
await q("UPDATE runs SET status='completed' WHERE id=$1",[run]);await pool.end();
