import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createRequire} from 'node:module';
import {ROOT,id} from '../../core/db/index.mjs';import {pageChecks,MARGIN} from '../../core/design/checks.mjs';import {templateFrames} from '../../core/design/brand-profile.mjs';
const exec=promisify(execFile);
const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function chromeLaunchOpts(){const o={headless:true,args:['--no-sandbox','--disable-dev-shm-usage']};if(process.env.CHROME_BIN)o.executablePath=process.env.CHROME_BIN;else if(process.platform==='darwin')o.executablePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';return o;}
export async function renderAsset(asset,payload){const sizes={square:[1080,1080],portrait:[1080,1350],reel:[1080,1920],landscape:[1200,628]},[width,height]=sizes[asset.data.format]||sizes.portrait;const dir=path.join(ROOT,'.local/renders',asset.id);fs.mkdirSync(dir,{recursive:true});const browser=await chromium.launch(chromeLaunchOpts());const files=[];
try{const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});await page.route('**/*',r=>r.abort());const composed=Array.isArray(payload.html)&&payload.html.length&&asset.data.type!=='video';const brandIn={...(payload.brand||{}),logo_path:payload.logo_path||null};const client={name:payload.client_name,languages:payload.languages||[]};const engineFrames=composed?[]:templateFrames({asset,brand:brandIn,client,layout:asset.data.type==='video'?'hook':payload.layout,format:asset.data.format});const count=composed?payload.html.length:asset.data.type==='video'?1:engineFrames.length;const checkFn=eval(pageChecks),design_checks=[];
for(let i=0;i<count;i++){const html=composed?payload.html[i]:engineFrames[i];const htmlPath=path.join(dir,`slide-${i+1}.html`);fs.writeFileSync(htmlPath,html);
 await page.unroute('**/*');await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());await page.goto('file://'+htmlPath,{waitUntil:'load'});
 // engine pages fit their text after fonts load and then set body[data-ready]
 await page.waitForFunction(()=>document.body.dataset.ready==='1'||!document.querySelector('script'),null,{timeout:15000}).catch(()=>{});
 const issues=await page.evaluate(checkFn,{format:asset.data.format,margin:MARGIN[asset.data.format],banned:payload.brand?.banned_words||[]});design_checks.push({frame:i+1,issues});
 const file=path.join(dir,`slide-${i+1}.png`);await page.screenshot({path:file});files.push({id:id(),path:file,name:`${asset.data.type}-${i+1}.png`,mime:'image/png'});}
if(asset.data.type==='video'&&payload.video_dir){
 // Claude-composed HyperFrames project: render it and run HyperFrames' own check as the final gate.
 const output=path.join(dir,'reel.mp4');const require=createRequire(import.meta.url),probe=require('@ffprobe-installer/ffprobe').path;
 const project=payload.video_dir;const idx=fs.readFileSync(path.join(project,'index.html'),'utf8');
 const want=Number((idx.match(/data-composition-id="[^"]*"[^>]*data-duration="([\d.]+)"/)||idx.match(/data-duration="([\d.]+)"/)||[])[1]);
 const env={...process.env,HYPERFRAMES_NO_TELEMETRY:'1',DO_NOT_TRACK:'1',HYPERFRAMES_CONFIG_DIR:path.join(ROOT,'.local/hyperframes'),HYPERFRAMES_BROWSER_PATH:process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':chromium.executablePath()),PATH:[path.dirname(probe),path.dirname(process.env.FFMPEG_BIN||'/Users/ysw/.local/bin/ffmpeg'),process.env.PATH].join(path.delimiter)};
 const hf=path.join(ROOT,'node_modules/hyperframes/bin/hyperframes.mjs');
 let video_checks=null;
 try{const c=await exec(process.execPath,[hf,'check',project,'--json'],{env,timeout:240000,maxBuffer:20000000});video_checks=JSON.parse(c.stdout);}catch(e){try{video_checks=JSON.parse(e.stdout);}catch{video_checks={error:String(e.message).slice(0,500)};}}
 await exec(process.execPath,[hf,'render',project,'--quality','delivery','--fps','30','--skill','hyperframes','--workers','1','-o',output],{env,timeout:900000,maxBuffer:5000000});
 const metadata=JSON.parse((await exec(probe,['-v','quiet','-print_format','json','-show_format','-show_streams',output],{timeout:10000})).stdout);
 if(want&&Math.abs(Number(metadata.format.duration)-want)>.25)throw new Error(`Video duration ${metadata.format.duration}s does not match the composition's ${want}s`);
 // Licensed soundtrack built by Claude with real-sound: mux it (picture stream-copied, audio cut to the picture).
 let sound=null;const st=path.join(project,'soundtrack.wav');
 if(fs.existsSync(st)){const withSound=path.join(dir,'reel-sound.mp4');await exec(process.env.FFMPEG_BIN||'ffmpeg',['-y','-v','error','-i',output,'-i',st,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-ar','48000','-shortest',withSound],{env,timeout:300000});
  const lu=await exec(process.env.FFMPEG_BIN||'ffmpeg',['-hide_banner','-nostats','-i',withSound,'-af','ebur128=peak=true','-f','null','-'],{env,timeout:120000}).then(r=>r.stderr).catch(e=>String(e.stderr||''));
  const I=Number((lu.match(/I:\s+(-?[\d.]+) LUFS/g)||[]).pop()?.match(/-?[\d.]+/)?.[0]),TP=Number((lu.match(/Peak:\s+(-?[\d.]+) dBFS/g)||[]).pop()?.match(/-?[\d.]+/)?.[0]);
  sound={integrated_lufs:Number.isFinite(I)?I:null,true_peak_dbtp:Number.isFinite(TP)?TP:null};files.push({id:id(),path:withSound,name:'reel-with-sound.mp4',mime:'video/mp4'});}
 files.push({id:id(),path:output,name:'reel.mp4',mime:'video/mp4'});
 return {files,sound,engine:(payload.composer==='skills'?'Workspace video skills':'Claude')+' + HyperFrames + Chromium + FFmpeg'+(sound?' + real-sound':''),width,height,design_checks,video_checks,seconds:Number(metadata.format.duration)};
}
if(asset.data.type==='video'&&payload.operation==='voiceover-render'){
 const project=payload.video_dir,output=path.join(dir,'reel.mp4'),require=createRequire(import.meta.url),probe=require('@ffprobe-installer/ffprobe').path,env={...process.env,HYPERFRAMES_NO_TELEMETRY:'1',DO_NOT_TRACK:'1',HYPERFRAMES_CONFIG_DIR:path.join(ROOT,'.local/hyperframes'),HYPERFRAMES_BROWSER_PATH:process.env.CHROME_BIN||chromium.executablePath(),PATH:[path.dirname(probe),path.dirname(process.env.FFMPEG_BIN||'ffmpeg'),process.env.PATH].join(path.delimiter)};
 await exec(process.execPath,[path.join(ROOT,'node_modules/hyperframes/bin/hyperframes.mjs'),'render',project,'--quality','delivery','--fps','30','--skill','hyperframes','--workers','1','-o',output],{env,timeout:900000,maxBuffer:5000000});
 const metadata=JSON.parse((await exec(probe,['-v','error','-show_format','-show_streams','-of','json',output],{timeout:30000})).stdout),seconds=Number(metadata.format?.duration);if(!Number.isFinite(seconds)||seconds+0.1<Number(payload.narration_seconds||0))throw new Error('Rendered video is shorter than the narration. Extend the composition and try again.');files.push({id:id(),path:output,name:'reel.mp4',mime:'video/mp4'});return {files,engine:'Claude-composed HyperFrames + FFmpeg',width:metadata.streams?.find(s=>s.codec_type==='video')?.width||width,height:metadata.streams?.find(s=>s.codec_type==='video')?.height||height,seconds};
}
if(asset.data.type==='video')throw new Error('Video composition is missing. The reel could not be designed from the video skills.');
return {files,engine:asset.data.type==='video'?'EXORA design engine + HyperFrames + Chromium + FFmpeg':composed?'Claude-composed HTML (EXORA design engine) + Chromium':'EXORA design engine (fixed layout) + Chromium',width,height,design_checks};}finally{await browser.close();}}

export async function renderNarratedVideo({videoPath,voicePath,outputPath,keepOriginalAudio=true}){const {mixVoiceover}=await import('../audio/voiceover-mix.mjs');const ffprobe=createRequire(import.meta.url)('@ffprobe-installer/ffprobe').path;return mixVoiceover({videoPath,voicePath,outputPath,keepOriginalAudio,ffmpeg:process.env.FFMPEG_BIN||'ffmpeg',ffprobe:process.env.FFPROBE_BIN||ffprobe});}
