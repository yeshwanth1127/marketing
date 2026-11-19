import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const toolNames={voices:'mcp__elevenlabs__creative_list_voices',generate:'mcp__elevenlabs__creative_generate_speech',status:'mcp__elevenlabs__creative_get_flow_run_status'};
const config=JSON.stringify({mcpServers:{elevenlabs:{type:'http',url:'https://api.elevenlabs.io/v1/mcp'}}});
const cleanError=()=>new Error('ElevenLabs could not complete the request. Check the worker connection and try again.');
function extractJson(text){const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i);const candidates=[fenced?.[1],text.slice(text.indexOf('{'),text.lastIndexOf('}')+1)].filter(Boolean);for(const value of candidates){try{return JSON.parse(value);}catch{}}throw cleanError();}
function run(prompt,timeoutMs=60000){return new Promise((resolve,reject)=>{let stdout='',settled=false;const args=['-p',prompt,'--output-format','json','--strict-mcp-config','--mcp-config',config,'--allowedTools',...Object.values(toolNames),'--permission-prompts','none','--no-session-persistence','--setting-sources','user'];const child=spawn(process.env.EXORA_CLAUDE_BIN||'claude',args,{cwd:process.env.EXORA_ROOT||process.cwd(),env:{...process.env,ANTHROPIC_API_KEY:'',ANTHROPIC_AUTH_TOKEN:'',ANTHROPIC_BASE_URL:''},stdio:['ignore','pipe','ignore']});const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value)};const timer=setTimeout(()=>{child.kill('SIGTERM');finish(cleanError())},timeoutMs);child.stdout.on('data',chunk=>{stdout+=chunk.toString('utf8');if(stdout.length>1024*1024){child.kill('SIGTERM');finish(cleanError())}});child.on('error',()=>finish(cleanError()));child.on('close',code=>{if(code!==0)return finish(cleanError());try{const outer=JSON.parse(stdout);if(outer.is_error||typeof outer.result!=='string')throw cleanError();finish(null,outer.result)}catch{finish(cleanError())}})});}
function assertId(value,label){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(value))throw cleanError();return value;}
function assertText(value,label,max){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`${label} is required (maximum ${max} characters).`);return value.trim();}
export async function listVoices(){
 const {voiceCatalog}=await import('./voices.mjs');
 const types=voiceCatalog();
 return {voices:types,extra:[],live:true,total_count:types.length,has_more:false};
}
/** Direct ElevenLabs TTS when ELEVENLABS_API_KEY is set (writes MP3 bytes). */
export async function synthesizeToFile({text,voiceId,outputPath}){
 assertText(text,'Narration script',12000);assertId(voiceId,'voice');
 const key=String(process.env.ELEVENLABS_API_KEY||'').trim();
 if(!key)return null;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
 try{
  const response=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voiceId)+'?output_format=mp3_44100_128',{
   method:'POST',signal:controller.signal,redirect:'error',
   headers:{'xi-api-key':key,'Content-Type':'application/json',Accept:'audio/mpeg'},
   body:JSON.stringify({text,model_id:'eleven_multilingual_v2'}),
  });
  if(!response.ok||!response.body)throw cleanError();
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(mime&&!['audio/mpeg','application/octet-stream'].includes(mime))throw cleanError();
  fs.rmSync(outputPath,{force:true});
  const file=fs.createWriteStream(outputPath,{flags:'wx',mode:0o600});
  let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>50*1024*1024){controller.abort();throw cleanError()}if(!file.write(chunk))await new Promise((resolve,reject)=>{file.once('drain',resolve);file.once('error',reject)})}
  await new Promise((resolve,reject)=>file.end(error=>error?reject(error):resolve()));
  if(bytes<800)throw cleanError();
  return {size:bytes,mime:'audio/mpeg',via:'api'};
 }catch{fs.rmSync(outputPath,{force:true});throw cleanError();}
 finally{clearTimeout(timer)}
}
export async function generateSpeech({text,voiceId,clientName}){assertText(text,'Narration script',12000);assertText(clientName,'Client',200);assertId(voiceId,'voice');const prompt=`Call ${toolNames.generate} with prompt=${JSON.stringify(text)}, model_id="eleven_multilingual_v2", voice_id=${JSON.stringify(voiceId)}, context=${JSON.stringify(`EXORA Marketing OS narration for ${clientName}`)}. If the tool starts asynchronously, poll ${toolNames.status} with its returned flow_id and session_ids until completed, failed, or 20 polls. Return ONLY JSON with these fields: status (completed or failed), audio_url, flow_id, duration_seconds (if available). Do not include other narration, URLs beyond audio_url, or commentary.`;const result=extractJson(await run(prompt,10*60*1000));if(result.status!=='completed'||typeof result.audio_url!=='string')throw cleanError();const url=new URL(result.audio_url);if(url.protocol!=='https:'||!['elevenlabsusercontent.com','www.elevenlabsusercontent.com'].includes(url.hostname))throw cleanError();return {audioUrl:url.href,duration:Number(result.duration_seconds)||null,flowId:typeof result.flow_id==='string'?result.flow_id:null};}
export async function downloadSpeech(audioUrl,outputPath){const url=new URL(audioUrl);if(url.protocol!=='https:'||!['elevenlabsusercontent.com','www.elevenlabsusercontent.com'].includes(url.hostname))throw cleanError();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);try{const response=await fetch(url,{signal:controller.signal,redirect:'error'});if(!response.ok||!response.body)throw cleanError();const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();if(!['audio/mpeg','audio/wav','audio/mp4','audio/x-m4a','application/octet-stream'].includes(mime))throw cleanError();const file=fs.createWriteStream(outputPath,{flags:'wx',mode:0o600});let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>50*1024*1024){controller.abort();throw cleanError()}if(!file.write(chunk))await new Promise((resolve,reject)=>{file.once('drain',resolve);file.once('error',reject)})}await new Promise((resolve,reject)=>file.end(error=>error?reject(error):resolve()));if(!bytes)throw cleanError();return {size:bytes,mime:mime==='application/octet-stream'?'audio/mpeg':mime};}catch{fs.rmSync(outputPath,{force:true});throw cleanError()}finally{clearTimeout(timer)}}
/** Premade catalog preview MP3s hosted by ElevenLabs (no API key). */
export async function downloadPublicPreview(previewUrl,outputPath){
 const url=new URL(previewUrl);
 if(url.protocol!=='https:'||!['storage.googleapis.com','elevenlabsusercontent.com','www.elevenlabsusercontent.com'].includes(url.hostname))throw cleanError();
 if(url.hostname==='storage.googleapis.com'&&!url.pathname.startsWith('/eleven-public-prod/premade/voices/'))throw cleanError();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{
  const response=await fetch(url,{signal:controller.signal,redirect:'error'});
  if(!response.ok||!response.body)throw cleanError();
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(mime&&!['audio/mpeg','audio/mp3','application/octet-stream'].includes(mime))throw cleanError();
  fs.rmSync(outputPath,{force:true});
  const file=fs.createWriteStream(outputPath,{flags:'wx',mode:0o600});
  let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>10*1024*1024){controller.abort();throw cleanError()}if(!file.write(chunk))await new Promise((resolve,reject)=>{file.once('drain',resolve);file.once('error',reject)})}
  await new Promise((resolve,reject)=>file.end(error=>error?reject(error):resolve()));
  if(bytes<800)throw cleanError();
  return {size:bytes,mime:'audio/mpeg',via:'public-preview'};
 }catch{fs.rmSync(outputPath,{force:true});throw cleanError();}
 finally{clearTimeout(timer)}
}
export {cleanError as voiceoverError};
