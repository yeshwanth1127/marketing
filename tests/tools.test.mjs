// Every declared skill tool runs through the app (run-tool) with its example input, gets a receipt that
// points at unmodified vendor files, and — for stateless tools — returns exactly what the vendored script
// returns when run directly with the same input.
import {test,after} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {handle} from '../core/api.mjs';import {q,pool,ROOT} from '../core/db/index.mjs';
import {catalog,loadModule} from '../core/runtime/index.mjs';import {buildInput} from '../core/tools/params.mjs';
after(async()=>pool.end());
let cookie,client;
async function request(route,body){const r=await handle(new Request('http://localhost:3100/api/'+route,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin:'http://localhost:3100'}:{})},body:body?JSON.stringify(body):undefined}));return {status:r.status,data:await r.json()};}
const DMP=path.join(ROOT,'core/tools/vendor-scripts/digital-marketing-pro/scripts');
// volatile fields (times, temp paths, ids) differ between any two runs
const VOLATILE=/^(generated_at|timestamp|created_at|updated_at|last_updated|path|workspace|file|input|output|out|report_id|eval_id|id|duration_ms|elapsed_ms|run_id)$/;
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!VOLATILE.test(k)).map(([k,x])=>[k,stable(x)])):typeof v==='string'?v.replace(/\/[^\s"']*exora-tool-[^\s"']*/g,'<tmp>').replace(/\/tmp\/[^\s"']*/g,'<tmp>'):v;
function direct(mod,spec,input){
 const box=fs.mkdtempSync(path.join(os.tmpdir(),'golden-'));
 try{const skillDir=path.join(ROOT,mod.group,spec.module||mod.key,'skills',spec.skill);
  const work=path.join(box,'skill');fs.cpSync(skillDir,work,{recursive:true});for(const s of spec.with_skills||[])fs.cpSync(path.join(path.dirname(skillDir),s),path.join(box,s),{recursive:true});
  const inputFile=path.join(box,spec.input_name||'input.txt');fs.writeFileSync(inputFile,input.stdin);
  const vendorScript=spec.scripts==='dmp'?path.join(ROOT,'vendor/digital-marketing-pro/scripts',spec.file):path.join(work,spec.file);
  if(spec.scripts==='dmp')fs.cpSync(DMP,path.join(box,'scripts'),{recursive:true});
  const script=spec.scripts==='dmp'?path.join(box,'scripts',spec.file):vendorScript;
  const fill=a=>String(a).replaceAll('{input_file}',inputFile).replaceAll('{skill_dir}',work);
  const r=spawnSync(process.env.EXORA_PYTHON||'python3',['-I',script,...(spec.args||[]).map(fill),...input.args.map(fill)],{cwd:spec.scripts==='dmp'?box:work,input:input.stdin,encoding:'utf8',env:{PATH:process.env.PATH,HOME:box,TMPDIR:box,LANG:'C.UTF-8',PYTHONIOENCODING:'utf-8',CLAUDE_MARKETING_HOME:path.join(box,'cm')}});
  let out=r.stdout;if(spec.output_file&&fs.existsSync(path.join(box,spec.output_file)))out=fs.readFileSync(path.join(box,spec.output_file),'utf8');
  return {status:r.status,out:spec.output==='json'?JSON.parse(out):out,err:r.stderr};
 }finally{fs.rmSync(box,{recursive:true,force:true});}
}

test('setup',async()=>{
 const r=await handle(new Request('http://localhost:3100/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({email:'admin@exora.local',password:'ExoraLocal!2026'})}));cookie=r.headers.get('set-cookie').split(';')[0];
 client=(await request('action',{action:'create-client',name:'Tools Test '+Date.now(),industry:'Dental clinic',city:'Bengaluru',languages:['English','Kannada']})).data.id;
});

const declared=catalog().flatMap(m=>(loadModule(m.key,{settings:{}}).tools?.scripts||[]).filter(t=>t.example&&Array.isArray(t.params)).map(t=>({mod:loadModule(m.key,{settings:{}}),spec:t})));
test('there are declared skill tools with examples',()=>assert.ok(declared.length>=21,String(declared.length)));
for(const {mod,spec} of declared)test(`${mod.key} · ${spec.id} (${spec.skill}/${spec.file}) runs live with a receipt`,async()=>{
 const r=await request('action',{client_id:client,action:'run-tool',module:mod.key,tool:spec.id,params:spec.example});
 assert.equal(r.status,200,JSON.stringify(r.data).slice(0,600));
 const row=(await q('SELECT * FROM tool_runs WHERE id=$1',[r.data.receipt])).rows[0];
 assert.equal(row.exit_code,0);assert.equal(row.skill,spec.skill);assert.equal(row.script,spec.file);
 assert.equal(row.vendor_match,true,'script and SKILL.md must match the pinned vendor files');
 const stateless=!(spec.args||[]).some(a=>String(a).includes('{brand}'))&&spec.state!=='persistent';
 if(stateless){const want=direct(mod,spec,buildInput(spec,spec.example));assert.equal(want.status,0,want.err);assert.deepEqual(stable(r.data.output),stable(want.out),'app output must equal a direct vendor run');}
});
test('persistent DMP state survives between runs (quality history)',async()=>{
 const log=await request('action',{client_id:client,action:'run-tool',module:'05-content',tool:'quality-log',params:{data:{content_type:'social',title:'A',scores:{composite:71},grade:'C'}}});assert.equal(log.status,200);
 const sum=await request('action',{client_id:client,action:'run-tool',module:'05-content',tool:'quality-history',params:{action:'get-summary'}});
 assert.equal(sum.status,200);assert.ok(sum.data.output.total_evals>=2,JSON.stringify(sum.data.output));
});
test('tool inputs are validated (text length, choices) before anything runs',async()=>{
 const r=await request('action',{client_id:client,action:'run-tool',module:'05-content',tool:'content-score',params:{text:'x',type:'tweet'}});assert.equal(r.status,400);
 const r2=await request('action',{client_id:client,action:'run-tool',module:'05-content',tool:'humanize',params:{text:'x'.repeat(60000)}});assert.equal(r2.status,400);
});

// ---- Batch 2: media tools (talking-head effects, soundtrack mux, audio measurement) ----
import {runToolForClient} from '../core/tools/tool-job.mjs';
import crypto from 'node:crypto';
const ffmpeg=process.env.FFMPEG_BIN||'ffmpeg';
const hasPy=m=>spawnSync(process.env.EXORA_PYTHON||'python3',['-c','import '+m]).status===0;
async function addFile(name,mime,make){const fid=crypto.randomUUID();const rel=path.join('uploads',client,fid+'-'+name);const full=path.join(ROOT,'.local',rel);fs.mkdirSync(path.dirname(full),{recursive:true});make(full);
 await q('INSERT INTO files(id,client_id,name,mime,size,storage_path) VALUES($1,$2,$3,$4,$5,$6)',[fid,client,name,mime,fs.statSync(full).size,rel]);return fid;}
let video,audio,user;
test('media fixtures',async()=>{
 user=(await q("SELECT * FROM users WHERE role='admin' LIMIT 1")).rows[0];
 video=await addFile('talk.mp4','video/mp4',f=>assert.equal(spawnSync(ffmpeg,['-y','-v','error','-f','lavfi','-i','testsrc2=size=540x960:rate=24:duration=2','-f','lavfi','-i','sine=frequency=220:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',f]).status,0));
 audio=await addFile('music.wav','audio/wav',f=>assert.equal(spawnSync(ffmpeg,['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=4','-ar','48000',f]).status,0));
});
test('media tools run in the background queue',async()=>{
 const r=await request('action',{client_id:client,action:'run-tool',module:'06-design-video',tool:'add-soundtrack',params:{video,audio}});
 assert.equal(r.status,200);assert.equal(r.data.queued,true);
 const job=(await q('SELECT * FROM jobs WHERE id=$1',[r.data.job_id])).rows[0];assert.equal(job.type,'tool');
 await q("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]); // the worker is not running in tests
});
test('add-soundtrack (real-sound mux.mjs) writes a video with sound as a client file',async()=>{
 const c=(await q('SELECT * FROM clients WHERE id=$1',[client])).rows[0];
 const mod=loadModule('06-design-video',{settings:{}});const spec=mod.tools.scripts.find(s=>s.id==='add-soundtrack');
 const {args,stdin,files}=buildInput(spec,{video,audio});
 const r=await runToolForClient({client:c,user,moduleKey:'06-design-video',toolId:'add-soundtrack',args,stdin,files});
 assert.equal(r.files.length,1);const row=(await q('SELECT * FROM files WHERE id=$1',[r.files[0].id])).rows[0];assert.equal(row.mime,'video/mp4');
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','csv=p=0',path.join(ROOT,'.local',row.storage_path)],{encoding:'utf8'}).stdout;
 assert.match(probe,/video/);assert.match(probe,/audio/);
 assert.equal((await q('SELECT vendor_match FROM tool_runs WHERE id=$1',[r.receipt])).rows[0].vendor_match,true);
});
test('talking-head effect (effects fx.py) renders an MP4',{skip:!hasPy('mediapipe')&&'mediapipe not installed (run npm run setup:python)',timeout:600000},async()=>{
 const c=(await q('SELECT * FROM clients WHERE id=$1',[client])).rows[0];
 const mod=loadModule('06-design-video',{settings:{}});const spec=mod.tools.scripts.find(s=>s.id==='talking-head-effect');
 const {args,stdin,files}=buildInput(spec,{effect:'moody',video,width:'720'});
 const r=await runToolForClient({client:c,user,moduleKey:'06-design-video',toolId:'talking-head-effect',args,stdin,files});
 assert.equal(r.files.length,1);assert.equal(r.files[0].mime,'video/mp4');
 assert.equal((await q('SELECT vendor_match FROM tool_runs WHERE id=$1',[r.receipt])).rows[0].vendor_match,true);
});
test('audio measurement and loudness (real-sound analyze.py, master.py)',{skip:!hasPy('soundfile')&&'soundfile not installed (run npm run setup:python)'},async()=>{
 for(const tool of ['audio-measure','loudness']){const r=await request('action',{client_id:client,action:'run-tool',module:'06-design-video',tool,params:{audio}});assert.equal(r.status,200,JSON.stringify(r.data).slice(0,400));assert.ok(r.data.output);}
});
test('file inputs are client-scoped and type-checked',async()=>{
 const r=await request('action',{client_id:client,action:'run-tool',module:'06-design-video',tool:'add-soundtrack',params:{video:audio,audio}});assert.equal(r.status,400);assert.match(r.data.error,/not a video/);
 const r2=await request('action',{client_id:client,action:'run-tool',module:'06-design-video',tool:'add-soundtrack',params:{video:crypto.randomUUID(),audio}});assert.equal(r2.status,400);
});
