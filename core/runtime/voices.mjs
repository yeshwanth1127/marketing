import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../db/index.mjs';

export const SAMPLE_LINE='Hello from EXORA. This is how this voice sounds on your ads and reels.';

export const VOICE_TYPES=[
 {key:'warm-host',name:'Warm host',gender:'Female',use:'Reels, testimonials, friendly offers',sample:'Hi — this is a warm host voice for everyday brand stories and offers.',voice_id:'21m00Tcm4TlvDq8ikWAM',provider_name:'Rachel',preview_url:'https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/dff5d82d-d16d-45b9-ae73-be2ad8850855.mp3'},
 {key:'clear-explainer',name:'Clear explainer',gender:'Male',use:'Product facts, how-tos, ads',sample:'This is a clear explainer voice for product facts and offers.',voice_id:'pNInz6obpgDQGcFmaJgB',provider_name:'Adam',preview_url:'https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/53bd2f5f-bb59-1111-8822-245b2a466c80.mp3'},
 {key:'energetic',name:'Energetic',gender:'Female',use:'Launches, festivals, calls to action',sample:'Ready to launch? This energetic voice keeps people watching.',voice_id:'AZnzlk1XvdvUeBnXmlld',provider_name:'Domi',preview_url:'https://storage.googleapis.com/eleven-public-prod/premade/voices/AZnzlk1XvdvUeBnXmlld/53bd2f5f-bb59-4146-9922-245b2a466c80.mp3'},
 {key:'calm-narrator',name:'Calm narrator',gender:'Male',use:'Brand films, longer scripts, stories',sample:'A calm narrator for longer stories and brand films.',voice_id:'ErXwobaYiN019PkySvjV',provider_name:'Antoni',preview_url:'https://storage.googleapis.com/eleven-public-prod/premade/voices/ErXwobaYiN019PkySvjV/53bd2f5f-bb59-1111-8822-225b2a466c80.mp3'},
];

export const VOICE_FLOWS=[
 {id:'script-voice-video',title:'Script → voice → video',when:'You have writing. EXORA speaks it, then makes a reel around the narration.'},
 {id:'script-video-voice',title:'Script → video → voice',when:'You already have a rendered video draft. Add ElevenLabs narration on top.'},
 {id:'upload-voice',title:'Uploaded video → voice',when:'You have an MP4 from a shoot or editor. Add narration without changing the original.'},
];

export function voiceCatalog(){
 return VOICE_TYPES.map(v=>({...v,preview:'/api/voiceover/preview?voice='+encodeURIComponent(v.voice_id),cached:!!cachedPreviewPath(v.voice_id)}));
}

export function findVoice(voiceId){
 return VOICE_TYPES.find(v=>v.voice_id===voiceId)||null;
}

export function assertVoiceId(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(value))throw Object.assign(new Error('Choose a valid ElevenLabs voice'),{status:400});
 return value;
}

export function preferredVoice(client){
 const saved=client?.settings?.voice||{};
 if(saved.voice_id&&findVoice(saved.voice_id))return {...findVoice(saved.voice_id),saved:true};
 if(saved.voice_id)return {voice_id:saved.voice_id,name:saved.name||'Saved voice',key:saved.key||null,saved:true};
 return {...VOICE_TYPES[0],saved:false};
}

const previewDir=()=>path.join(ROOT,'.local','voice-previews');
const previewLocks=new Map();

export function cachedPreviewPath(voiceId){
 const dest=path.join(previewDir(),assertVoiceId(voiceId)+'.mp3');
 return fs.existsSync(dest)&&fs.statSync(dest).size>800?dest:null;
}

export async function ensureVoicePreview(voiceId,{force=false}={}){
 const id=assertVoiceId(voiceId);
 const dest=path.join(previewDir(),id+'.mp3');
 if(!force){
  const cached=cachedPreviewPath(id);
  if(cached)return cached;
  const pending=previewLocks.get(id);
  if(pending)return pending;
 }
 const work=(async()=>{
  fs.mkdirSync(previewDir(),{recursive:true});
  const type=findVoice(id);
  const text=(type?.sample||SAMPLE_LINE).slice(0,220);
  const part=dest+'.part';
  fs.rmSync(part,{force:true});
  const {synthesizeToFile,generateSpeech,downloadSpeech,downloadPublicPreview}=await import('./elevenlabs.mjs');
  const direct=await synthesizeToFile({text,voiceId:id,outputPath:part});
  if(!direct){
   let got=false;
   if(type?.preview_url){
    try{await downloadPublicPreview(type.preview_url,part);got=true;}catch{}
   }
   if(!got){
    const narration=await generateSpeech({text,voiceId:id,clientName:'EXORA voice sample'});
    await downloadSpeech(narration.audioUrl,part);
   }
  }
  fs.renameSync(part,dest);
  return dest;
 })().finally(()=>previewLocks.delete(id));
 previewLocks.set(id,work);
 return work;
}

/** Generate and store local ElevenLabs samples for every catalog voice. */
export async function installVoicePreviews({force=false}={}){
 const results=[];
 for(const voice of VOICE_TYPES){
  const before=cachedPreviewPath(voice.voice_id);
  if(before&&!force){results.push({voice_id:voice.voice_id,key:voice.key,name:voice.name,path:before,cached:true,installed:false});continue;}
  try{
   const file=await ensureVoicePreview(voice.voice_id,{force});
   results.push({voice_id:voice.voice_id,key:voice.key,name:voice.name,path:file,cached:false,installed:true,bytes:fs.statSync(file).size});
  }catch(e){
   results.push({voice_id:voice.voice_id,key:voice.key,name:voice.name,error:String(e.message||e).slice(0,240)});
  }
 }
 return {dir:previewDir(),results,ok:results.every(r=>!r.error),ready:results.filter(r=>!r.error).length,total:VOICE_TYPES.length};
}
