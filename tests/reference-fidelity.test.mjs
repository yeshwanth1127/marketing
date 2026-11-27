// Run against the built app: node --test tests/reference-fidelity.test.mjs
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {promisify} from 'node:util';
import test from 'node:test';
import pg from 'pg';
import {chromium} from 'playwright';

const exec = promisify(execFile);
const base = 'http://127.0.0.1:3110';
const password = 'ReferenceTests!2026';
const evidence = process.env.REFERENCE_EVIDENCE_DIR;

function fixture(background, foreground, accent, width, height, arrangement, serif) {
 const x = [9,38,12,8,47][arrangement];
 const y = [48,25,60,34,38][arrangement];
 const right = arrangement%2===1;
 const font = serif?'Georgia':'Arial';
 const align = right?'right':'left';
 const left = right ? 6 : x;
 const rightEdge = right ? (100-x) : 91;
 const slots = [
  {kind:'logo',x:9,y:8,width:29,height:6,fill:background,fit:'contain'},
  {kind:'headline',x:left,y,width:rightEdge-left,height:10,font,size:6,weight:700,align,color:foreground,fill:background},
  {kind:'body',x:left,y:y+11,width:rightEdge-left,height:6,font,size:2.7,align,color:foreground,fill:background},
  {kind:'cta',x:12,y:83,width:21,height:4,font:'Arial',size:2.1,weight:700,align:'center',color:background,fill:accent},
 ];
 const html = `<style>
 body{margin:0;background:${background};color:${foreground}}.item{display:flex;align-items:center;position:absolute}
 .line{position:absolute;left:8%;right:8%;top:${y-5}%;height:2px;background:${accent}}
 .graphic{position:absolute;right:9%;bottom:${arrangement%2?10:20}%;width:18%;height:12%;border:3px solid ${accent};border-radius:${arrangement*12}%}
 .button{position:absolute;left:9%;width:27%;top:81%;height:8%;border-radius:${arrangement*5+6}px;background:${accent}}
 </style><div class="graphic"></div><div class="line"></div><div class="button"></div>`+
 slots.map((s,i)=>`<div class="item" style="left:${s.x}%;top:${s.y}%;width:${s.width}%;height:${s.height}%;justify-content:${s.align==='center'?'center':s.align==='right'?'end':'start'};font-family:${s.font||'Arial'};font-size:${(s.size||3)*height/100}px;font-weight:${s.weight||700};color:${s.color||foreground}">${['OLD MARK','Original headline','Words from the source','Learn more'][i]}</div>`).join('');
 return {html,canvas:{width,height},slots};
}

test('references are uploaded, previewed, saved and rendered into locked layouts', {timeout:240000}, async () => {
 const dbUrl = new URL(process.env.DATABASE_URL);
 const dbName = 'reference_test_'+randomUUID().replaceAll('-','');
 dbUrl.pathname = '/postgres';
 const admin = new pg.Client({connectionString:dbUrl.toString()});
 let browser, worker, web, database;
 await admin.connect();
 try {
  await admin.query('CREATE DATABASE '+dbName);
  dbUrl.pathname='/'+dbName;
  const env = {...process.env,DATABASE_URL:dbUrl.toString(),EXORA_INITIAL_PASSWORD:password,OPENROUTER_API_KEY:'',EXORA_CLAUDE_BIN:'/nonexistent'};
  for (const script of ['scripts/migrate.mjs','scripts/seed.mjs']) await exec(process.execPath,[script],{env});
  web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','web','--hostname','127.0.0.1','--port','3110'],{env,stdio:'ignore'});
  worker=spawn(process.execPath,['scripts/worker.mjs'],{env,stdio:['ignore','ignore','inherit']});
  let healthy=false;
  for (let i=0;i<80&&!healthy;i++) {
   healthy=await fetch(base+'/api/health').then(r=>r.ok).catch(()=>false);
   if(!healthy)await sleep(250);
  }
  assert.ok(healthy,'Test web instance is healthy');
  let cookie;
  async function request(route, body) {
   const form = body instanceof FormData;
   const response = await fetch(base+'/api/'+route,{
    method:body?'POST':'GET',headers:{origin:base,...(cookie?{cookie}:{}),...(body&&!form?{'content-type':'application/json'}:{})},
    body:body?(form?body:JSON.stringify(body)):undefined,
   });
   if(!response.ok)assert.fail(route+' '+response.status+' '+await response.text());
   if(route==='auth/login')cookie=response.headers.get('set-cookie').split(';')[0];
   return response;
  }
  const json = async (route,body) => (await request(route,body)).json();
  await json('auth/login',{email:'admin@exora.local',password});
  const {client,records} = await json('bootstrap');
  const action = (action,fields) => json('action',{action,client_id:client.id,...fields});
  async function upload(name,bytes) {
   const body=new FormData();
   body.set('client_id',client.id);
   body.set('file',new Blob([bytes],{type:'image/png'}),name);
   return json('upload',body);
  }
  browser=await chromium.launch({args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:175,height:44}});
  await page.setContent('<body style="margin:0;background:transparent;color:#ffecae;font:bold 25px Arial">NOVA STUDIO</body>');
  const baselineLogo=evidence?await fs.readFile(path.join(evidence,'brand-logo.png')).catch(()=>null):null;
  const logoBytes=baselineLogo||await page.screenshot({omitBackground:true});
  const logo=await upload('nova-logo.png',logoBytes);
  await action('save-record',{kind:'BrandKit',title:'Nova Studio brand',data:{colors:['#c11f61','#ffffff','#0d1d24'],logo_file_id:logo.id}});
  database=new pg.Client({connectionString:dbUrl.toString()});
  await database.connect();
  const source=records.find(r=>r.kind==='Asset'&&r.data.type==='copy');
  await database.query("UPDATE records SET data=data||$2 WHERE id=$1",[source.id,{on_screen_text:['A brighter start'],caption:'Thoughtful design for everyday work.',cta:'Explore now'}]);

  async function make(templateId,type='image') {
   const {asset,job_id}=await action('render',{asset_id:source.id,type,format:'portrait',composer:'template',...(templateId?{design_template_id:templateId}:{})});
   for(let i=0;i<120;i++){
    const snapshot=await json('bootstrap');
    const job=snapshot.jobs.find(j=>j.id===job_id);
    if(job?.status==='failed')assert.fail(job.error);
    if(job?.status==='completed')return snapshot.records.find(r=>r.id===asset.id);
    await sleep(250);
   }
   assert.fail('Render timed out');
  }
  const image = async visual => Buffer.from(await (await request('files/'+visual.data.files.find(f=>f.mime==='image/png').id)).arrayBuffer());
  const palettes=[
   ['#193c2c','#fff1c7','#f8d898',800,1000,0,true],
   ['#fff6dd','#412302','#f6bd60',760,760,1,false],
   ['#121725','#f4e9f3','#c0b0fa',640,850,2,true],
   ['#fce8f6','#4c1950','#c9f26e',850,600,3,true],
   ['#09304d','#dcf7ff','#77d7f6',640,850,4,false],
  ];
  const made=[];
  for(const [i,palette] of palettes.entries()){
   const sample=fixture(...palette);
   await page.setViewportSize(sample.canvas);
   await page.setContent(sample.html);
   const baseline=i===0&&evidence?await fs.readFile(path.join(evidence,'reference.png')).catch(()=>null):null;
   const original=baseline||await page.screenshot();
   if(baseline)sample.slots=[
    {kind:'logo',x:9,y:8,width:29,height:6,fill:'#193c2c',fit:'contain'},
    {kind:'headline',x:9,y:47,width:81,height:10,font:'Georgia',size:7,weight:700,color:'#fff1c7',fill:'#193c2c'},
    {kind:'body',x:9,y:63,width:81,height:5,font:'Georgia',size:2.8,color:'#fff1c7',fill:'#193c2c'},
    {kind:'cta',x:12,y:79.7,width:18,height:3.5,font:'Arial',size:2.4,weight:700,color:'#193c2c',fill:'#f8d898'},
   ];
   const uploaded=await upload(`reference-${i+1}.png`,original);
   const draft=await action('propose-design-template',{title:`Exact fixture ${i+1}`,reference_image_file_id:uploaded.id});
   assert.equal(draft.data.reference_fidelity,'exact');
   assert.equal(draft.data.design_spec.analysis,'ocr');
   assert.ok(draft.data.design_spec.slots.some(slot=>slot.kind==='headline'));
   assert.deepEqual(draft.data.design_spec.canvas,sample.canvas);
   const template=await action('save-record',{kind:'DesignTemplate',title:draft.title,data:{
    ...draft.data,is_default:i===0,design_spec:{...draft.data.design_spec,slots:sample.slots,analysis:'manual'},
   }});
   const visual=await make(i===0?null:template.id);
   const result=visual.data.reference_fidelity;
   assert.equal(visual.data.composer,'exact');
   assert.equal(visual.data.design_template_id,template.id);
   assert.deepEqual(visual.data.dimensions,[sample.canvas.width,sample.canvas.height]);
   assert.equal(result.reference_image_file_id,uploaded.id);
   assert.ok(result.prompt);
   assert.equal(result.spec.slots.length,4);
   assert.ok(result.score>=85,`Fixture ${i+1}: ${result.score}%`);
   assert.deepEqual(result.warnings,[]);
   assert.ok(result.frames[0].structure>=99.5,JSON.stringify(result.frames));
   const output=await image(visual);
   assert.notDeepEqual(original,output);
   const displayedReference=await request('visual-reference-image?id='+visual.id+'&client='+client.id);
   assert.deepEqual(original,Buffer.from(await displayedReference.arrayBuffer()));
   made.push({template,uploaded,output,visual});
   console.log(`Reference ${i+1}: ${result.score}% design similarity, ${result.frames[0].structure}% outside content slots`);
  }
  const first=made[0];
  for(let i=0;i<2;i++)assert.deepEqual(await image(await make(first.template.id)),first.output);
  console.log('Three Exact renders produced byte-identical PNGs.');
  const inspired=await action('propose-design-template',{title:'Inspired fixture',vibe:'botanical and editorial',reference_image_file_id:first.uploaded.id,reference_fidelity:'inspired'});
  const savedInspired=await action('save-record',{kind:'DesignTemplate',title:inspired.title,data:inspired.data});
  const loose=await make(savedInspired.id);
  assert.equal(loose.data.composer,'template');
  assert.notDeepEqual(await image(loose),first.output);
  const reel=await make(first.template.id,'video');
  assert.equal(reel.data.files[0].mime,'video/mp4');
  assert.ok(reel.data.reference_fidelity.score>=85);
  const preview=await action('preview-design-template',{data:first.template.data});
  assert.match(preview.image,/^data:image\/png;base64,/);
  const changedPalette={...first.template.data,colors:{...first.template.data.colors,accent:'#e93588'}};
  assert.equal((await action('preview-design-template',{data:changedPalette})).image,preview.image);
  const brandColourSpec={...changedPalette.design_spec,slots:changedPalette.design_spec.slots.map(slot=>slot.kind==='headline'?{...slot,brand_color:'accent'}:slot)};
  assert.notEqual((await action('preview-design-template',{data:{...changedPalette,design_spec:brandColourSpec}})).image,preview.image);
  const strict=await action('save-record',{kind:'DesignTemplate',title:'Strict fidelity test',data:{...first.template.data,is_default:false,fidelity_threshold:100}});
  const strictOutput=await make(strict.id);
  assert.equal(strictOutput.data.reference_fidelity.low_fidelity,true);
  assert.equal(strictOutput.data.reference_fidelity.frames[0].attempts,3);
  await page.setViewportSize({width:1280,height:920});
  await page.goto(base+'/01-onboard');
  await page.locator('input[type=email]').fill('admin@exora.local');
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('tab',{name:'More',exact:true}).click();
  await page.getByRole('article').filter({hasText:first.template.title}).getByRole('button',{name:'Edit',exact:true}).click();
  const browserPreview=page.getByRole('img',{name:'Exact output with sample brand copy'});
  await browserPreview.waitFor();
  assert.equal(await browserPreview.getAttribute('src'),preview.image);
  if(evidence) {
   await fs.mkdir(evidence,{recursive:true});
   await fs.writeFile(path.join(evidence,'after.png'),first.output);
   await fs.writeFile(path.join(evidence,'tested-reference.png'),Buffer.from(await (await request('files/'+first.uploaded.id)).arrayBuffer()));
   await page.screenshot({path:path.join(evidence,'theme-preview.png')});
  }
  console.log('Inspired mode, Exact video and the saved theme browser preview passed.');
 } finally {
  if(browser)await browser.close();
  for (const child of [web,worker]) {
   if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
  }
  if(database) {
   const local=path.resolve('.local');
   const paths=(await database.query('SELECT storage_path FROM files')).rows;
   for(const {storage_path} of paths){
    const stored=path.resolve(local,storage_path);
    if(stored.startsWith(local+path.sep))await fs.rm(stored,{force:true});
   }
   await database.end();
  }
  await admin.query('DROP DATABASE IF EXISTS '+dbName+' WITH (FORCE)');
  await admin.end();
 }
});
