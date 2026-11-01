// Run on the Mac with Claude Code logged in: proves Claude can run a skill's own script inside the sandbox.
// Usage: npm run agent:smoke
import {q,pool,id,tx,insert} from '../core/db/index.mjs';import {loadModule} from '../core/runtime/index.mjs';import {runAgent} from '../core/runtime/agent.mjs';
const user=(await q("SELECT * FROM users WHERE role='admin' LIMIT 1")).rows[0];
let client=(await q("SELECT * FROM clients WHERE name='Agent smoke test' LIMIT 1")).rows[0];
if(!client){const cid=id();await q("INSERT INTO clients(id,name,industry,city,languages,data,created_by) VALUES($1,'Agent smoke test','Dental clinic','Bengaluru','[\"English\"]','{}',$2)",[cid,user.id]);client=(await q('SELECT * FROM clients WHERE id=$1',[cid])).rows[0];}
const mod=loadModule('04-hooks',client);const skills=mod.skills.filter(s=>s.name==='ig-reel');
const run=id();await q("INSERT INTO runs(id,client_id,module,provider,status,created_by) VALUES($1,$2,'04-hooks','claude','running',$3)",[run,client.id,user.id]);
const sample=[{kind:'Idea',title:'Hooks for a family dental clinic',data:{hooks:[{text:'…',formula:'…',rationale:'…'}]}}];
const res=await runAgent({client,user,run,records:[],workspace:{client:{name:client.name,industry:client.industry,city:client.city},input:{brief:'Write 3 hooks for a family dental clinic in Indiranagar and score them with the ig-reel scorer before choosing.'}}},mod,skills,sample,{maxTurns:12});
const rows=(await q('SELECT skill,script,exit_code,vendor_match FROM tool_runs WHERE id=ANY($1::uuid[])',[res.receipts])).rows;
console.log(JSON.stringify({outputs:res.outputs,receipts:rows,seconds:Math.round(res.duration_ms/1000)},null,2));
console.log(rows.some(r=>r.script==='hookscore.py'&&r.exit_code===0)?'AGENT SMOKE OK: Claude ran hookscore.py inside the sandbox.':'AGENT SMOKE FAILED: Claude did not run the skill script. Check the output above.');
await q("UPDATE runs SET status='completed' WHERE id=$1",[run]);await pool.end();
