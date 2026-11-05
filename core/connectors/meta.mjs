import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {q,tx,id,ROOT,audit,fail} from '../db/index.mjs';
import {encryptSecret,decryptSecret} from './crypto.mjs';

export const META_SCOPES='ads_management,ads_read,business_management';
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
let fetchImpl=globalThis.fetch;
export function setMetaFetch(fn){fetchImpl=fn||globalThis.fetch;}

export function metaConfigured(){return !!(process.env.META_APP_ID&&process.env.META_APP_SECRET);}
export function metaVersion(){return process.env.META_API_VERSION||'v21.0';}
export function metaRedirectUri(req){return process.env.META_REDIRECT_URI||(req?new URL(req.url).origin:'http://127.0.0.1:3100')+'/api/auth/meta/callback';}

function appId(){return String(process.env.META_APP_ID||'');}
function appSecret(){return String(process.env.META_APP_SECRET||'');}
function actId(raw){const s=String(raw||'').replace(/^act_/,'');if(!/^\d+$/.test(s))fail('Choose a Meta ad account');return 'act_'+s;}

export function accountPublic(row){
 if(!row)return {status:'not_connected'};
 const m=row.meta&&typeof row.meta==='object'?row.meta:{};
 return {
  status:row.status,
  ad_account_id:m.ad_account_id||null,
  ad_account_name:m.ad_account_name||null,
  ad_accounts:Array.isArray(m.ad_accounts)?m.ad_accounts:[],
  page_id:m.page_id||null,
  page_name:m.page_name||null,
  pages:Array.isArray(m.pages)?m.pages:[],
  whatsapp_phone_id:m.whatsapp_phone_id||null,
  whatsapp_display:m.whatsapp_display||null,
  whatsapp_phones:Array.isArray(m.whatsapp_phones)?m.whatsapp_phones:[],
  token_expires_at:row.token_expires_at||null,
  updated_at:row.updated_at||null,
 };
}

async function graph(method,pathname,{token,query={},body,form,versioned=true}={}){
 const base=versioned?'https://graph.facebook.com/'+metaVersion():'https://graph.facebook.com';
 const u=new URL(base+(pathname.startsWith('/')?pathname:'/'+pathname));
 if(token)u.searchParams.set('access_token',token);
 for(const [k,v] of Object.entries(query))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
 const headers={};
 let payload;
 if(form)payload=form;
 else if(body){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
 const res=await fetchImpl(u,{method,headers,body:payload});
 const text=await res.text();
 let data;try{data=JSON.parse(text||'{}');}catch{data={raw:text};}
 if(typeof data==='object'&&data&&!data.error&&typeof data.access_token!=='string'&&text.includes('access_token=')&&!text.trim().startsWith('{')){
  const params=new URLSearchParams(text);
  data={access_token:params.get('access_token'),expires_in:Number(params.get('expires_in')||0),token_type:params.get('token_type')};
 }
 if(!res.ok||data.error){
  const msg=data.error?.message||('Meta API '+res.status);
  const e=new Error('META_API: '+msg);e.status=502;e.code=data.error?.code;throw e;
 }
 return data;
}

async function exchangeCode(code,redirectUri){
 return graph('GET','/oauth/access_token',{query:{client_id:appId(),client_secret:appSecret(),redirect_uri:redirectUri,code},versioned:false});
}
async function exchangeLongLived(shortToken){
 return graph('GET','/oauth/access_token',{query:{grant_type:'fb_exchange_token',client_id:appId(),client_secret:appSecret(),fb_exchange_token:shortToken},versioned:false});
}

async function loadCatalog(token){
 const [accounts,pages]=await Promise.all([
  graph('GET','/me/adaccounts',{token,query:{fields:'id,account_id,name,account_status,currency,timezone_name',limit:'100'}}).catch(()=>({data:[]})),
  graph('GET','/me/accounts',{token,query:{fields:'id,name',limit:'50'}}).catch(()=>({data:[]})),
 ]);
 const ad_accounts=(accounts.data||[]).map(a=>({id:a.id||('act_'+a.account_id),name:a.name,currency:a.currency,status:a.account_status}));
 const pageList=(pages.data||[]).map(p=>({id:p.id,name:p.name}));
 let whatsapp_phones=[];
 try{
  const biz=await graph('GET','/me/businesses',{token,query:{fields:'id,name',limit:'25'}});
  for(const b of biz.data||[]){
   const wabas=await graph('GET','/'+b.id+'/owned_whatsapp_business_accounts',{token,query:{fields:'id,name'}}).catch(()=>({data:[]}));
   for(const w of wabas.data||[]){
    const nums=await graph('GET','/'+w.id+'/phone_numbers',{token,query:{fields:'id,display_phone_number,verified_name'}}).catch(()=>({data:[]}));
    for(const n of nums.data||[])whatsapp_phones.push({id:n.id,display:n.display_phone_number,name:n.verified_name,waba_id:w.id,business_id:b.id});
   }
  }
 }catch{whatsapp_phones=[];}
 return {ad_accounts,pages:pageList,whatsapp_phones};
}

function pickDefaults(cat,prev={}){
 const ad=cat.ad_accounts.find(a=>a.id===(prev.ad_account_id||''))||(cat.ad_accounts.length===1?cat.ad_accounts[0]:null);
 const page=cat.pages.find(p=>p.id===(prev.page_id||''))||(cat.pages.length===1?cat.pages[0]:null);
 const phone=cat.whatsapp_phones.find(p=>p.id===(prev.whatsapp_phone_id||''))||(cat.whatsapp_phones.length===1?cat.whatsapp_phones[0]:null);
 return {
  ...cat,
  ad_account_id:ad?.id||null,ad_account_name:ad?.name||null,
  page_id:page?.id||null,page_name:page?.name||null,
  whatsapp_phone_id:phone?.id||null,whatsapp_display:phone?.display||null,
 };
}

async function upsertPending(clientId,userId){
 const state=crypto.randomBytes(24).toString('hex');
 const rid=id();
 await q(`INSERT INTO connector_accounts(id,client_id,provider,status,oauth_state,oauth_expires_at,meta)
  VALUES($1,$2,'meta','pending',$3,now()+interval '20 minutes','{}')
  ON CONFLICT(client_id,provider) DO UPDATE SET status='pending',oauth_state=excluded.oauth_state,oauth_expires_at=excluded.oauth_expires_at,updated_at=now()`,
  [rid,clientId,state]);
 await audit({query:q},{id:userId},clientId,'meta:oauth-start',null,{});
 return state;
}

export async function handleMetaStart(req,url,user){
 if(!metaConfigured())fail('Meta app credentials are not set on the server',503);
 const {access}=await import('../auth/index.mjs');
 const client=await access(user,url.searchParams.get('client'));
 const {authorize}=await import('../auth/index.mjs');
 authorize(user);
 const state=await upsertPending(client.id,user.id);
 const redirect=metaRedirectUri(req);
 const dest=new URL('https://www.facebook.com/'+metaVersion()+'/dialog/oauth');
 dest.searchParams.set('client_id',appId());
 dest.searchParams.set('redirect_uri',redirect);
 dest.searchParams.set('state',state);
 dest.searchParams.set('scope',META_SCOPES);
 dest.searchParams.set('response_type','code');
 return Response.redirect(dest.toString(),302);
}

function bounce(path){return new Response(null,{status:302,headers:{Location:path,'Cache-Control':'no-store'}});}

export async function handleMetaCallback(req,url){
 const err=url.searchParams.get('error');
 const code=url.searchParams.get('code');
 const state=url.searchParams.get('state');
 if(err)return bounce('/ads?meta=denied');
 if(!code||!state||!/^[0-9a-f]{32,64}$/i.test(state))return bounce('/ads?meta=invalid');
 if(!metaConfigured())return bounce('/ads?meta=config');
 const row=(await q("SELECT * FROM connector_accounts WHERE oauth_state=$1 AND oauth_expires_at>now()",[state])).rows[0];
 if(!row)return bounce('/ads?meta=invalid');
 try{
  const redirect=metaRedirectUri(req);
  const shortTok=await exchangeCode(code,redirect);
  if(!shortTok.access_token)throw new Error('META_API: no access token');
  const longTok=await exchangeLongLived(shortTok.access_token).catch(()=>shortTok);
  const token=longTok.access_token||shortTok.access_token;
  const expires=Number(longTok.expires_in||shortTok.expires_in||5184000);
  const cat=pickDefaults(await loadCatalog(token),row.meta||{});
  const enc=encryptSecret(token);
  await q(`UPDATE connector_accounts SET status='connected',token_enc=$2,token_expires_at=now()+($3||' seconds')::interval,
    oauth_state=NULL,oauth_expires_at=NULL,meta=$4,updated_at=now() WHERE id=$1`,
    [row.id,enc,String(expires),JSON.stringify(cat)]);
  await audit({query:q},null,row.client_id,'meta:connected',null,{ad_accounts:cat.ad_accounts.length,pages:cat.pages.length});
  return bounce('/ads?meta=connected');
 }catch(e){
  await q("UPDATE connector_accounts SET status='error',oauth_state=NULL,oauth_expires_at=NULL,updated_at=now() WHERE id=$1",[row.id]);
  await audit({query:q},null,row.client_id,'meta:oauth-failed',null,{reason:String(e.message||'token').slice(0,200)});
  return bounce('/ads?meta=token');
 }
}

function validSig(raw,header){
 const secret=appSecret();
 if(!secret||!header)return false;
 const expected='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
 const a=Buffer.from(expected),b=Buffer.from(String(header));
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

export async function handleMetaWebhook(req,url){
 if(req.method==='GET'){
  const mode=url.searchParams.get('hub.mode');
  const token=url.searchParams.get('hub.verify_token');
  const challenge=url.searchParams.get('hub.challenge')||'';
  if(mode==='subscribe'&&token&&token===process.env.META_WEBHOOK_VERIFY_TOKEN)return new Response(challenge,{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
  return json({error:'Forbidden'},403);
 }
 if(req.method!=='POST')fail('Method not allowed',405);
 const raw=await req.text();
 if(raw.length>500000)fail('Request too large',413);
 if(!validSig(raw,req.headers.get('x-hub-signature-256')))return json({error:'Forbidden'},403);
 let payload;try{payload=JSON.parse(raw||'{}');}catch{fail('Invalid JSON');}
 const entries=Array.isArray(payload.entry)?payload.entry:[];
 for(const entry of entries.slice(0,50)){
  const account=String(entry.id||'');
  const linked=account?(await q("SELECT client_id FROM connector_accounts WHERE provider='meta' AND meta->>'ad_account_id' IN ($1,$2)",[account,'act_'+account])).rows[0]:null;
  await q('INSERT INTO connector_events(client_id,provider,kind,payload) VALUES($1,$2,$3,$4)',[linked?.client_id||null,'meta','webhook',entry]);
 }
 return json({ok:true});
}

async function connectedRow(clientId){
 const row=(await q("SELECT * FROM connector_accounts WHERE client_id=$1 AND provider='meta'",[clientId])).rows[0];
 if(!row||row.status!=='connected'||!row.token_enc){
  const e=new Error('META_NOT_CONNECTED: Connect Meta Ads for this client first.');e.status=409;throw e;
 }
 if(row.token_expires_at&&new Date(row.token_expires_at).getTime()<Date.now()){
  await q("UPDATE connector_accounts SET status='expired',updated_at=now() WHERE id=$1",[row.id]);
  const e=new Error('META_NOT_CONNECTED: The Meta token expired. Connect the account again.');e.status=409;throw e;
 }
 return row;
}

async function tokenFor(row){return decryptSecret(row.token_enc);}

export async function selectMetaField(user,client,field,value){
 const row=await connectedRow(client.id);
 const meta={...(row.meta||{})};
 if(field==='ad_account_id'){
  const acc=(meta.ad_accounts||[]).find(a=>a.id===value||a.id==='act_'+String(value).replace(/^act_/,''));
  if(!acc)fail('That ad account is not on this Meta connection');
  meta.ad_account_id=acc.id;meta.ad_account_name=acc.name;
 }else if(field==='page_id'){
  const page=(meta.pages||[]).find(p=>p.id===value);
  if(!page)fail('That Page is not on this Meta connection');
  meta.page_id=page.id;meta.page_name=page.name;
 }else if(field==='whatsapp_phone_id'){
  const phone=(meta.whatsapp_phones||[]).find(p=>p.id===value);
  if(!phone)fail('That WhatsApp number is not on this Meta connection');
  meta.whatsapp_phone_id=phone.id;meta.whatsapp_display=phone.display;
 }else fail('Unknown Meta field');
 await tx(async c=>{
  await c.query('UPDATE connector_accounts SET meta=$2,updated_at=now() WHERE id=$1',[row.id,meta]);
  await audit(c,user,client.id,'meta:select-'+field,null,{value});
 });
 return accountPublic({...row,meta});
}

export async function disconnectMeta(user,client){
 await tx(async c=>{
  await c.query("DELETE FROM connector_accounts WHERE client_id=$1 AND provider='meta'",[client.id]);
  await audit(c,user,client.id,'meta:disconnected',null,{});
 });
 return {ok:true,status:'not_connected'};
}

export async function metaInsights(client){
 const row=await connectedRow(client.id);
 const ad=row.meta?.ad_account_id;
 if(!ad)fail('Select a Meta ad account first',409);
 const token=await tokenFor(row);
 const data=await graph('GET','/'+actId(ad)+'/insights',{token,query:{fields:'impressions,clicks,spend,ctr,reach,cpc,cpm,actions',date_preset:'last_7d',level:'account'}});
 const row0=(data.data||[])[0]||{};
 const metrics=[];
 const date=new Date().toISOString().slice(0,10);
 const map={impressions:'impressions',clicks:'clicks',spend:'spend',reach:'reach'};
 for(const [k,metric] of Object.entries(map)){
  if(row0[k]===undefined)continue;
  metrics.push({metric,value:Number(row0[k])||0,label:'real',source:'Meta Ads',date,campaign:row.meta.ad_account_name||ad});
 }
 return {insights:row0,metrics,ad_account_id:ad};
}

export async function refreshExpiringTokens(){
 if(!metaConfigured())return {refreshed:0};
 const due=(await q("SELECT * FROM connector_accounts WHERE provider='meta' AND status='connected' AND token_enc IS NOT NULL AND token_expires_at<now()+interval '10 days'")).rows;
 let refreshed=0;
 for(const row of due){
  try{
   const current=decryptSecret(row.token_enc);
   const next=await exchangeLongLived(current);
   if(!next.access_token)throw new Error('no token');
   const expires=Number(next.expires_in||5184000);
   await q(`UPDATE connector_accounts SET token_enc=$2,token_expires_at=now()+($3||' seconds')::interval,status='connected',updated_at=now() WHERE id=$1`,
    [row.id,encryptSecret(next.access_token),String(expires)]);
   refreshed++;
  }catch{
   await q("UPDATE connector_accounts SET status='expired',updated_at=now() WHERE id=$1",[row.id]);
  }
 }
 return {refreshed,checked:due.length};
}

function dailyBudgetMinor(inr){return Math.max(100,Math.round(Number(inr)||0)*100);}

function fileAbs(storagePath){
 const rel=String(storagePath||'');
 const a=path.join(ROOT,'.local',rel.replace(/^\.local[\\/]/,''));
 const b=path.join(ROOT,rel);
 for(const p of [a,b])if(p.startsWith(path.join(ROOT,'.local')+path.sep)&&fs.existsSync(p))return p;
 return null;
}

async function creativeBytes(target){
 const assetId=target.data?.asset_id;
 if(!assetId)return null;
 const asset=(await q('SELECT * FROM records WHERE id=$1 AND client_id=$2',[assetId,target.client_id])).rows[0];
 const files=asset?.data?.files||[];
 const img=files.find(f=>/^image\/(png|jpeg|jpg)$/i.test(f.mime));
 const vid=files.find(f=>/^video\//i.test(f.mime));
 const pick=img||vid;
 if(!pick?.id)return null;
 const file=(await q('SELECT * FROM files WHERE id=$1 AND client_id=$2',[pick.id,target.client_id])).rows[0];
 if(!file)return null;
 const abs=fileAbs(file.storage_path);
 if(!abs)return null;
 return {mime:file.mime,name:file.name,buf:fs.readFileSync(abs),kind:img?'image':'video'};
}

async function uploadCreative(token,adAccount,file){
 const act=actId(adAccount);
 if(file.kind==='image'){
  const form=new FormData();
  form.set('bytes',file.buf.toString('base64'));
  form.set('access_token',token);
  const res=await graph('POST','/'+act+'/adimages',{form});
  const images=res.images||res;
  const first=images[Object.keys(images)[0]]||images;
  return {image_hash:first.hash||first.image_hash||null};
 }
 const form=new FormData();
 form.set('source',new Blob([file.buf],{type:file.mime}),file.name||'ad.mp4');
 form.set('access_token',token);
 const res=await graph('POST','/'+act+'/advideos',{form});
 return {video_id:res.id||null};
}

export async function executeMeta(target){
 if(target.data?.platform&&target.data.platform!=='Meta'){
  const e=new Error('CONNECTOR_NOT_CONFIGURED: external publishing is deferred. No action was sent.');throw e;
 }
 const row=await connectedRow(target.client_id);
 const adAccount=row.meta?.ad_account_id;
 if(!adAccount){
  const e=new Error('META_ACCOUNT_REQUIRED: Select a Meta ad account before launching.');e.status=409;throw e;
 }
 const token=await tokenFor(row);
 const act=actId(adAccount);
 const action=target.data.action||'launch';
 const existing=target.data.meta||{};
 if(action==='pause'){
  const targetId=existing.ad_id||existing.campaign_id;
  if(!targetId)throw new Error('META_API: this ad has no Meta campaign yet. Launch it first.');
  await graph('POST','/'+targetId,{token,body:{status:'PAUSED'}});
  return {provider:'meta',ok:true,action:'pause',id:targetId,data:{meta:{...existing,status:'PAUSED'},connector_status:'connected'}};
 }
 if(action==='change_budget'){
  const adset=existing.adset_id;
  if(!adset)throw new Error('META_API: this ad has no Meta ad set yet. Launch it first.');
  await graph('POST','/'+adset,{token,body:{daily_budget:dailyBudgetMinor(target.data.budget)}});
  return {provider:'meta',ok:true,action:'change_budget',id:adset,data:{meta:{...existing,daily_budget:target.data.budget},connector_status:'connected'}};
 }
 const name=String(target.title||'EXORA campaign').slice(0,200);
 const campaign=await graph('POST','/'+act+'/campaigns',{token,body:{name,objective:'OUTCOME_TRAFFIC',status:'ACTIVE',special_ad_categories:[]}});
 const targeting={geo_locations:{countries:['IN']},age_min:18};
 const adset=await graph('POST','/'+act+'/adsets',{token,body:{
  name:(name+' · '+(String(target.data.audience||'').trim().slice(0,80)||'set')).slice(0,200),campaign_id:campaign.id,daily_budget:dailyBudgetMinor(target.data.budget),
  billing_event:'IMPRESSIONS',optimization_goal:'LINK_CLICKS',bid_strategy:'LOWEST_COST_WITHOUT_CAP',
  targeting,status:'ACTIVE',start_time:new Date().toISOString(),
 }});
 const ids={campaign_id:campaign.id,adset_id:adset.id,status:'ACTIVE'};
 const pageId=row.meta?.page_id;
 const file=await creativeBytes(target).catch(()=>null);
 if(file&&pageId){
  const uploaded=await uploadCreative(token,adAccount,file);
  const creativeBody={name:name+' · creative',object_story_spec:{page_id:pageId,link_data:{
   message:String(target.data.audience||target.title||'').slice(0,2000),
   link:String(target.data.destination||'https://exora.solutions').slice(0,1024),
   ...(uploaded.image_hash?{image_hash:uploaded.image_hash}:{}),
  }}};
  if(uploaded.video_id){creativeBody.object_story_spec={page_id:pageId,video_data:{video_id:uploaded.video_id,message:String(target.title||'').slice(0,2000)}};}
  const creative=await graph('POST','/'+act+'/adcreatives',{token,body:creativeBody});
  const ad=await graph('POST','/'+act+'/ads',{token,body:{name,adset_id:adset.id,creative:{creative_id:creative.id},status:'ACTIVE'}});
  Object.assign(ids,{creative_id:creative.id,ad_id:ad.id,...uploaded});
 }
 return {provider:'meta',ok:true,action:'launch',id:ids.campaign_id,data:{meta:ids,connector_status:'connected'}};
}

export async function executeWhatsApp(target){
 const row=await connectedRow(target.client_id).catch(e=>{
  if(String(e.message).startsWith('META_NOT_CONNECTED')){const x=new Error('WHATSAPP_NOT_CONNECTED: Connect Meta and pick a WhatsApp number first.');x.status=409;throw x;}
  throw e;
 });
 const phone=row.meta?.whatsapp_phone_id||process.env.META_WHATSAPP_PHONE_ID||'';
 if(!phone){const e=new Error('WHATSAPP_NOT_CONNECTED: Pick a WhatsApp Business number on the connected Meta account.');e.status=409;throw e;}
 const to=String(target.data.to||'').replace(/\D/g,'');
 if(to.length<10)throw new Error('WHATSAPP_NOT_CONNECTED: This post has no recipient number.');
 const asset=target.data.asset_id?(await q('SELECT * FROM records WHERE id=$1 AND client_id=$2',[target.data.asset_id,target.client_id])).rows[0]:null;
 const body=String(asset?.data?.caption||asset?.data?.script||asset?.data?.body||target.title||'').slice(0,4096);
 const token=await tokenFor(row);
 const sent=await graph('POST','/'+phone+'/messages',{token,body:{messaging_product:'whatsapp',to,type:'text',text:{body}}});
 return {provider:'whatsapp',ok:true,id:sent.messages?.[0]?.id||sent.id,data:{whatsapp:{message_id:sent.messages?.[0]?.id||null,to},connector_status:'connected'}};
}
