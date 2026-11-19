import {q,fail} from '../db/index.mjs';
import {extractOneFile} from '../brand/kit-from-files.mjs';
import {openrouterChat,openrouterKey,openrouterModel,parseModelJson} from '../agent/openrouter.mjs';

const idOk=value=>/^[0-9a-f-]{36}$/i.test(String(value||''));
const text=(value,max=2000)=>typeof value==='string'?value.trim().slice(0,max):'';
const list=(value,max=20)=>Array.isArray(value)?value.map(item=>text(String(item),120)).filter(Boolean).slice(0,max):[];

const empty=kind=>({
 name:'',industry:'',city:'',region:'',tier:'',website:'',languages:[],notes:'',
 ...(kind==='product'?{brief:{description:'',category:'',sector:'',audience:'',offer:'',selling_points:[],variants:[],where_sold:'',evidence:[]}}:{}),
});

function clean(kind,input){
 const out={...empty(kind),name:text(input.name,150),industry:text(input.industry,100),city:text(input.city,100),region:text(input.region,100),tier:text(input.tier,40),website:text(input.website,1000),languages:list(input.languages,12),notes:text(input.notes,4000)};
 if(kind==='product'){
  const brief=input.brief&&typeof input.brief==='object'?input.brief:{};
  out.brief={description:text(brief.description),category:text(brief.category,200),sector:text(brief.sector,200),audience:text(brief.audience),offer:text(brief.offer),selling_points:list(brief.selling_points,40),variants:list(brief.variants,40),where_sold:text(brief.where_sold),evidence:(Array.isArray(brief.evidence)?brief.evidence:[]).map(item=>({claim:text(item?.claim,500),source:text(item?.source,500),date:text(item?.date,10)})).filter(item=>item.claim).slice(0,50)};
 }
 return out;
}

export const DETAIL_FIELDS=[
 ['name','name'],['industry','industry'],['city','city'],['region','state / region'],['website','website'],['languages','content languages'],
];
export const PRODUCT_FIELDS=[
 ['description','description'],['category','category'],['sector','sector'],['audience','who buys it'],['offer','price or offer'],['selling_points','selling points'],['variants','variants'],['where_sold','where it is sold'],['evidence','evidence for claims'],
];

function filled(value){return Array.isArray(value)?value.length>0:!!String(value||'').trim();}

export function missing(kind,data){
 const names=[];
 for(const [key,label] of DETAIL_FIELDS)if(!filled(data[key]))names.push(label);
 if(kind==='product')for(const [key,label] of PRODUCT_FIELDS)if(!filled(data.brief[key]))names.push(label);
 return names;
}

export function foundKeys(kind,data){
 const names=[];
 for(const [key,label] of DETAIL_FIELDS)if(filled(data[key]))names.push(label);
 if(kind==='product')for(const [key,label] of PRODUCT_FIELDS)if(filled(data.brief[key]))names.push(label);
 return names;
}

function labeled(source,names){
 for(const name of names){
  const re=new RegExp('(?:^|\\n)\\s*(?:'+name+')\\s*[:\\-]\\s*(.+?)\\s*(?=\\n|$)','i');
  const m=source.match(re);
  if(m)return text(m[1],400);
 }
 return '';
}

function labeledList(source,names){
 const block=new RegExp('(?:^|\\n)\\s*(?:'+names.join('|')+')\\s*[:\\-]\\s*([\\s\\S]*?)(?=\\n\\s*[A-Z][A-Za-z /]{2,30}\\s*[:\\-]|$)','i');
 const m=source.match(block);
 if(!m)return [];
 return m[1].split(/\n|;/).map(line=>line.replace(/^[-*•]\s*/,'').trim()).filter(Boolean).slice(0,40);
}

export function guessFromText(kind,source){
 const out=empty(kind);
 out.name=labeled(source,['name','company','brand','product','business']);
 out.industry=labeled(source,['industry','sector','category of business']);
 out.city=labeled(source,['city','location','town']);
 out.region=labeled(source,['state / region','state','region']);
 out.tier=labeled(source,['city tier','tier']);
 out.website=labeled(source,['website','site','url'])||(source.match(/https?:\/\/[^\s)<>"']+/i)||[''])[0].replace(/[.,;]+$/,'');
 const langs=labeled(source,['content languages','languages','language']);
 out.languages=langs?langs.split(/,|\/| and /i).map(x=>x.trim()).filter(Boolean).slice(0,12):[];
 out.notes=labeled(source,['notes','about']);
 if(kind==='product'){
  out.brief.description=labeled(source,['description','what it is','product']);
  out.brief.category=labeled(source,['category']);
  out.brief.sector=labeled(source,['sector']);
  out.brief.audience=labeled(source,['who buys it','audience','buyers']);
  out.brief.offer=labeled(source,['price or offer','price','offer']);
  out.brief.selling_points=labeledList(source,['main selling points','selling points','benefits']);
  out.brief.variants=labeledList(source,['variants']);
  out.brief.where_sold=labeled(source,['where it is sold','sold at','channels']);
  out.brief.evidence=labeledList(source,['evidence for claims','evidence','proof']).map(line=>{const [claim,src,date]=line.split('|').map(x=>x.trim());return {claim,source:src||'',date:date||''};}).filter(item=>item.claim);
 }
 return clean(kind,out);
}

function overlay(base,extra){
 const out={...base};
 for(const key of ['name','industry','city','region','tier','website','notes'])if(filled(extra[key]))out[key]=extra[key];
 if(Array.isArray(extra.languages)&&extra.languages.length)out.languages=extra.languages;
 if(base.brief&&extra.brief){
  out.brief={...base.brief};
  for(const key of Object.keys(extra.brief))if(filled(extra.brief[key]))out.brief[key]=extra.brief[key];
 }
 return out;
}

async function loadFiles(client,fileIds,userId){
 const ids=[...new Set((Array.isArray(fileIds)?fileIds:[]).filter(idOk))].slice(0,10);
 if(!ids.length)fail('Select at least one uploaded file');
 const rows=client?.id
  ?(await q('SELECT * FROM files WHERE id=ANY($1::uuid[]) AND (client_id=$2 OR (client_id IS NULL AND created_by=$3))',[ids,client.id,userId])).rows
  :(await q('SELECT * FROM files WHERE id=ANY($1::uuid[]) AND client_id IS NULL AND created_by=$2',[ids,userId])).rows;
 if(rows.length!==ids.length)fail('One or more selected files are not in this workspace');
 return rows;
}

export async function extractClientDetails(client,fileIds,{userId}={}){
 const rows=await loadFiles(client,fileIds,userId);
 const parts=[];for(const row of rows)parts.push(await extractOneFile(client||{},row));
 const source=parts.map(part=>`--- ${part.name} ---\n${part.text||''}`).join('\n\n').slice(0,40000);
 const kind=client?.node_type||'company';
 let data=guessFromText(kind,source);
 let available=!!source.trim();
 if(source.trim()&&openrouterKey())try{
  const raw=await openrouterChat({model:openrouterModel('talk'),timeoutMs:45000,prompt:`Extract details ONLY when they are explicitly stated in the supplied source files. Do not infer, guess, or use general knowledge. Return JSON only. Use empty strings or empty arrays for anything absent.
Record type: ${kind}
Schema: {"name":"","industry":"","city":"","region":"","tier":"","website":"","languages":[],"notes":""${kind==='product'?',"brief":{"description":"","category":"","sector":"","audience":"","offer":"","selling_points":[],"variants":[],"where_sold":"","evidence":[{"claim":"","source":"","date":""}]}':''}}
Source files:\n${source.slice(0,18000)}`});
  data=overlay(data,clean(kind,parseModelJson(raw)));
 }catch{}
 return {details:data,missing:missing(kind,data),found:foundKeys(kind,data),files:rows.map(row=>({id:row.id,name:row.name,mime:row.mime})),extraction_available:available};
}
