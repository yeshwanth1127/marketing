// The only path that calls a generative model for video: footage layers a design explicitly asks for.
// Typographic videos never come here (see routeVideo). Uses Creative Claw over MCP when it is configured.
import fs from 'node:fs';import path from 'node:path';
import {q,id,ROOT} from '../db/index.mjs';
import {CreativeClawClient,creativeClawConfig,jsonOf} from '../connectors/creative-claw.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const urlOf=o=>[o.url,o.video_url,o.image_url,o.output_url,o.result?.url,o.outputs?.[0]?.url,o.assets?.[0]?.url].find(u=>typeof u==='string'&&u.startsWith('https://'));
const jobOf=o=>o.job_id||o.jobId||o.id||o.generation_id||null;

export async function generateMedia({design,client,clientIds,user,progress}){
 const cfg=creativeClawConfig();
 if(!cfg.enabled)throw new Error('This design has generated footage layers, but no generative video service is configured. Remove the footage layer or set EXORA_CREATIVE_CLAW=1 and CREATIVE_CLAW_TOKEN.');
 const cc=new CreativeClawClient(cfg);
 const out=JSON.parse(JSON.stringify(design));
 for(const m of out.media.filter(x=>x.kind!=='upload'&&x.status!=='ready')){
  const video=m.kind==='generated_video';const beat=out.beats.find(b=>b.id===m.beat_id);if(!beat)throw new Error('A footage layer points at a beat that no longer exists');
  const tool=await cc.resolveTool(...(video?['generate_video']:['generate_image']));if(!tool)throw new Error(`Creative Claw does not offer ${video?'generate_video':'generate_image'} (checked tools/list)`);
  progress?.event?.({text:`Generating ${video?'footage':'an image'} for beat ${beat.id} with ${tool.name}`});
  const started=jsonOf(await cc.call(tool.name,{prompt:String(m.prompt||'').slice(0,1000),aspect_ratio:'9:16',...(video?{duration:Math.min(10,Math.ceil(beat.duration))}:{})},{paid:true}));
  let res=started,url=urlOf(res);const job=jobOf(started);
  if(!url&&job){const check=await cc.resolveTool('check_job');if(!check)throw new Error('Creative Claw started a job but has no check_job tool');
   for(let i=0;i<120&&!url;i++){await sleep(5000);res=jsonOf(await cc.call(check.name,{job_id:job}));url=urlOf(res);if(/fail|error/i.test(String(res.status||'')))throw new Error('Creative Claw generation failed: '+String(res.error||res.status).slice(0,200));progress?.event?.({text:`Footage ${beat.id}: ${res.status||'working'}`});}}
  if(!url)throw new Error('Creative Claw did not return a file for the footage layer');
  const ext=video?'.mp4':'.png',fid=id(),rel=`uploads/${fid}${ext}`,abs=path.join(ROOT,'.local',rel);fs.mkdirSync(path.dirname(abs),{recursive:true});
  const r=await fetch(url,{redirect:'follow'});if(!r.ok)throw new Error('Could not download the generated footage');const buf=Buffer.from(await r.arrayBuffer());if(buf.length>200*1024*1024)throw new Error('Generated file is too large');fs.writeFileSync(abs,buf);
  await q('INSERT INTO files(id,client_id,name,mime,size,storage_path,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[fid,client.id,`generated-${beat.id}${ext}`,video?'video/mp4':'image/png',buf.length,rel,user?.id||null]);
  m.file_id=fid;m.status='ready';beat.style={...(beat.style||{}),background:{kind:video?'video':'image',file_id:fid,dim:0.35}};
 }
 void clientIds;return out;
}
