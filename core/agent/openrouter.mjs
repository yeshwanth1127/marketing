import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../db/index.mjs';

const DEFAULT_MODEL='openai/gpt-4o-mini';
let forcedOff=false;

export function setOpenRouterOff(off){forcedOff=!!off;}

function fileValue(name){
 const file=path.join(ROOT,'.env.local');
 if(!fs.existsSync(file))return '';
 for(const line of fs.readFileSync(file,'utf8').split('\n')){
  const match=line.match(/^([A-Z0-9_]+)=(.*)$/);
  if(!match||match[1]!==name)continue;
  return match[2].trim().replace(/^['"]|['"]$/g,'');
 }
 return '';
}

function setting(name,fallback=''){
 const fromFile=fileValue(name);
 if(fromFile)return fromFile;
 const fromEnv=(process.env[name]||'').trim();
 return fromEnv||fallback;
}

export function openrouterKey(){
 if(forcedOff)return '';
 return setting('OPENROUTER_API_KEY');
}

export function openrouterModel(kind='route'){
 if(kind==='talk')return setting('OPENROUTER_TALK_MODEL')||setting('OPENROUTER_MODEL',DEFAULT_MODEL);
 return setting('OPENROUTER_MODEL',DEFAULT_MODEL);
}

export function parseModelJson(text){
 const raw=String(text||'').trim();
 const fenced=raw.match(/```(?:json)?\s*([\s\S]*?)```/);
 const body=fenced?fenced[1]:raw;
 const start=body.indexOf('{'),end=body.lastIndexOf('}');
 if(start<0||end<=start)throw new Error('The model did not return JSON');
 return JSON.parse(body.slice(start,end+1));
}

export function routeAnswers(questions,parsed){
 const out={};
 for(const [key,question] of Object.entries(questions)){
  const value=parsed?.[key];
  if(question.type==='noul'){
   const n=typeof value==='number'?value:Number(value?.noul);
   out[key]={noul:Number.isFinite(n)?Math.min(1,Math.max(0,n)):0};
   continue;
  }
  const choice=typeof value==='string'?value:value?.choice;
  let confidence=Number(value?.confidence);
  if(!Number.isFinite(confidence))confidence=choice&&choice!=='ask'?0.85:0.4;
  let probabilities=value?.probabilities&&typeof value.probabilities==='object'?{...value.probabilities}:null;
  if(!probabilities||!Object.keys(probabilities).length){
   probabilities=choice?{[choice]:confidence}:{}; 
   if(question.options)for(const opt of Object.keys(question.options))if(!(opt in probabilities))probabilities[opt]=opt==='ask'?Math.max(0,1-confidence)*0.5:0.02;
  }
  out[key]={choice:choice??null,confidence,probabilities};
 }
 return out;
}

export function routePrompt(state,questions){
 const spec={};
 for(const [key,question] of Object.entries(questions)){
  spec[key]=question.type==='noul'
   ?{noul:'A number from 0 to 1. 1 means yes.',question:question.instructions}
   :{choice:'Exactly one option key',confidence:'0 to 1',probabilities:'Every option key mapped to a number. The numbers should add up to about 1.',question:question.instructions,options:question.options};
 }
 return `You route one marketing-assistant message. You do not answer it and you do not write copy.
Return one JSON object and nothing else. Use exactly these keys: ${Object.keys(questions).join(', ')}.
For every choice question include choice, confidence (0-1), and probabilities for every listed option (numbers should sum to about 1).
Pick group "talk" for: what is left, onboarding, what to do next, why, explain, compare, advice, status, or what is waiting — when they are not asking to save or draft yet.
If you are not sure, choose "ask" where that option exists and set confidence below 0.7.
Do not invent option keys.
State:
${JSON.stringify(state)}
Questions:
${JSON.stringify(spec)}`;
}

export async function openrouterChat({model,prompt,timeoutMs=25000}){
 const key=openrouterKey();
 if(!key)throw new Error('OpenRouter key is missing');
 const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{
  method:'POST',
  headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','HTTP-Referer':'http://127.0.0.1:3100','X-Title':'EXORA Marketing'},
  body:JSON.stringify({model,temperature:0,messages:[{role:'user',content:prompt}]}),
  signal:AbortSignal.timeout(timeoutMs),
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error('OpenRouter '+res.status);
 const text=data?.choices?.[0]?.message?.content;
 if(!text)throw new Error('OpenRouter returned an empty answer');
 return String(text);
}
