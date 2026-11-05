import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {handle} from '../core/api.mjs';
import {q,pool,id} from '../core/db/index.mjs';
import {encryptSecret,decryptSecret} from '../core/connectors/crypto.mjs';
import {executeConnector} from '../core/connectors/index.mjs';
import {setMetaFetch,refreshExpiringTokens} from '../core/connectors/meta.mjs';
import {allTools} from '../core/agent/catalog.mjs';

if(!process.env.EXORA_TOKEN_KEY)process.env.EXORA_TOKEN_KEY='ab'.repeat(32);
if(!process.env.META_APP_ID)process.env.META_APP_ID='1634505404780640';
if(!process.env.META_APP_SECRET)process.env.META_APP_SECRET='test-meta-secret';
if(!process.env.META_WEBHOOK_VERIFY_TOKEN)process.env.META_WEBHOOK_VERIFY_TOKEN='verify-test';
process.env.META_API_VERSION=process.env.META_API_VERSION||'v21.0';

let cookie,client;const stamp=Date.now();
async function request(route,body,token=cookie,{method,headers={},raw}={}){
 const r=await handle(new Request('http://127.0.0.1:3100/api/'+route,{method:method||(body||raw?'POST':'GET'),headers:{...(token?{cookie:token}:{}),...(body||raw?{'content-type':'application/json',origin:'http://127.0.0.1:3100'}:{}),...headers},body:raw??(body?JSON.stringify(body):undefined)}));
 const text=await r.text();
 let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:r.status,data,headers:r.headers,text};
}

after(async()=>{setMetaFetch(null);await pool.end();});

test('Catalog Meta tools are allowed',()=>{
 const ids=allTools().map(t=>t.id);
 assert.ok(ids.includes('connect_meta'));
 assert.ok(ids.includes('meta_status'));
 assert.ok(ids.includes('pick_meta_account'));
 assert.ok(ids.includes('pull_meta_insights'));
});

test('Token ciphertext round-trips and is not plaintext',()=>{
 const enc=encryptSecret('EAABtest-token');
 assert.notEqual(enc,'EAABtest-token');
 assert.equal(decryptSecret(enc),'EAABtest-token');
 const again=encryptSecret('EAABtest-token');
 assert.notEqual(again,enc);
});

test('Sign in and create a Meta test client',async()=>{
 const login=await request('auth/login',{email:'admin@exora.local',password:'ExoraLocal!2026'},'');
 assert.equal(login.status,200);
 cookie=login.headers.get('set-cookie').split(';')[0];
 const r=await request('action',{action:'create-client',name:'Meta '+stamp,industry:'Dental',city:'Bengaluru'});
 assert.equal(r.status,200,JSON.stringify(r.data));
 client=r.data.id;
});

test('OAuth start redirects to Facebook Login for Business',async()=>{
 const r=await request('auth/meta/start?client='+client,undefined,cookie);
 assert.equal(r.status,302);
 const loc=r.headers.get('location')||'';
 assert.match(loc,/facebook\.com\/.*dialog\/oauth/);
 assert.match(loc,/client_id=/);
 assert.match(loc,/ads_management/);
 assert.match(loc,/business_management/);
 assert.doesNotMatch(loc,/client_secret|APP_SECRET|token_enc/i);
 const row=(await q("SELECT oauth_state,status,token_enc FROM connector_accounts WHERE client_id=$1 AND provider='meta'",[client])).rows[0];
 assert.equal(row.status,'pending');
 assert.ok(row.oauth_state);
 assert.equal(row.token_enc,null);
});

test('OAuth start requires a session',async()=>{
 const r=await request('auth/meta/start?client='+client,undefined,'');
 assert.equal(r.status,401);
});

test('OAuth callback rejects a bad state without calling Graph',async()=>{
 let called=0;setMetaFetch(async()=>{called++;return new Response('{}');});
 const r=await request('auth/meta/callback?code=abc&state=deadbeefdeadbeefdeadbeefdeadbeef',undefined,'');
 assert.equal(r.status,302);
 assert.match(r.headers.get('location')||'',/meta=invalid/);
 assert.equal(called,0);
});

test('OAuth callback stores an encrypted long-lived token',async()=>{
 const state=(await q("SELECT oauth_state FROM connector_accounts WHERE client_id=$1",[client])).rows[0].oauth_state;
 setMetaFetch(async(url)=>{
  const u=String(url);
  if(u.includes('oauth/access_token')&&u.includes('code='))return jsonRes({access_token:'SHORT',expires_in:3600});
  if(u.includes('fb_exchange_token'))return jsonRes({access_token:'LONG_LIVED_TOKEN',expires_in:5184000});
  if(u.includes('/me/adaccounts'))return jsonRes({data:[{id:'act_111',name:'Clinic Ads',currency:'INR',account_status:1}]});
  if(u.includes('/me/accounts'))return jsonRes({data:[{id:'page_1',name:'Clinic Page'}]});
  if(u.includes('/me/businesses'))return jsonRes({data:[]});
  return jsonRes({data:[]});
 });
 const r=await request('auth/meta/callback?code=ok&state='+state,undefined,'');
 assert.equal(r.status,302);
 assert.match(r.headers.get('location')||'',/meta=connected/);
 const row=(await q("SELECT status,token_enc,meta FROM connector_accounts WHERE client_id=$1",[client])).rows[0];
 assert.equal(row.status,'connected');
 assert.ok(row.token_enc);
 assert.notEqual(row.token_enc,'LONG_LIVED_TOKEN');
 assert.equal(decryptSecret(row.token_enc),'LONG_LIVED_TOKEN');
 assert.equal(row.meta.ad_account_id,'act_111');
 assert.equal(row.meta.page_id,'page_1');
});

test('Bootstrap never exposes tokens or the app secret',async()=>{
 const r=await request('bootstrap?client='+client);
 assert.equal(r.status,200);
 const raw=JSON.stringify(r.data);
 assert.equal(raw.includes('LONG_LIVED_TOKEN'),false);
 assert.equal(raw.includes('token_enc'),false);
 assert.equal(raw.includes(process.env.META_APP_SECRET),false);
 const meta=r.data.connectors.find(c=>c.id==='meta');
 assert.equal(meta.status,'connected');
 assert.equal(meta.ad_account_id,'act_111');
 assert.equal(r.data.capabilities.meta,true);
});

test('Google Ads still refuses to send anything',async()=>{
 await assert.rejects(()=>executeConnector({kind:'Ad',client_id:client,title:'G',data:{platform:'Google',action:'launch',budget:500}}),/CONNECTOR_NOT_CONFIGURED/);
});

test('Approved Meta launch creates a campaign through Graph',async()=>{
 const calls=[];
 setMetaFetch(async(url,opts)=>{
  const u=String(url);
  calls.push({u,method:opts?.method,body:opts?.body});
  if(u.includes('/campaigns'))return jsonRes({id:'cmp_1'});
  if(u.includes('/adsets'))return jsonRes({id:'set_1'});
  if(u.includes('/adimages')||u.includes('/adcreatives')||u.includes('/ads'))return jsonRes({id:'ad_1',images:{x:{hash:'h'}}});
  return jsonRes({data:[]});
 });
 const result=await executeConnector({id:id(),kind:'Ad',client_id:client,title:'Traffic · test',data:{platform:'Meta',action:'launch',budget:1000,audience:'Bengaluru parents'}});
 assert.equal(result.provider,'meta');
 assert.equal(result.data.meta.campaign_id,'cmp_1');
 assert.equal(result.data.meta.adset_id,'set_1');
 assert.ok(calls.some(c=>c.u.includes('/campaigns')));
});

test('Meta launch without a connected account is blocked, not sent',async()=>{
 const other=(await request('action',{action:'create-client',name:'No Meta '+stamp,industry:'Retail',city:'Mysuru'})).data.id;
 await assert.rejects(()=>executeConnector({kind:'Ad',client_id:other,title:'x',data:{platform:'Meta',action:'launch',budget:500}}),/META_NOT_CONNECTED/);
});

test('Webhook verify challenge and signed payload',async()=>{
 const challenge=await request('webhooks/meta?hub.mode=subscribe&hub.verify_token='+encodeURIComponent(process.env.META_WEBHOOK_VERIFY_TOKEN)+'&hub.challenge=12345',undefined,'');
 assert.equal(challenge.status,200);
 assert.equal(challenge.text,'12345');
 const raw=JSON.stringify({object:'ad_account',entry:[{id:'111',changes:[{field:'campaigns'}]}]});
 const sig='sha256='+crypto.createHmac('sha256',process.env.META_APP_SECRET).update(raw).digest('hex');
 const ok=await request('webhooks/meta',undefined,'',{raw,headers:{'content-type':'application/json','x-hub-signature-256':sig}});
 assert.equal(ok.status,200,JSON.stringify(ok.data));
 const bad=await request('webhooks/meta',undefined,'',{raw,headers:{'content-type':'application/json','x-hub-signature-256':'sha256=deadbeef'}});
 assert.equal(bad.status,403);
});

test('Token refresh re-encrypts a long-lived token',async()=>{
 await q("UPDATE connector_accounts SET token_expires_at=now()+interval '2 days' WHERE client_id=$1",[client]);
 setMetaFetch(async(url)=>{
  if(String(url).includes('fb_exchange_token'))return jsonRes({access_token:'REFRESHED_TOKEN',expires_in:5184000});
  return jsonRes({});
 });
 const out=await refreshExpiringTokens();
 assert.ok(out.refreshed>=1);
 const row=(await q("SELECT token_enc FROM connector_accounts WHERE client_id=$1",[client])).rows[0];
 assert.equal(decryptSecret(row.token_enc),'REFRESHED_TOKEN');
});

test('WhatsApp without a phone number does not send',async()=>{
 await assert.rejects(()=>executeConnector({kind:'Post',client_id:client,title:'Hi',data:{platform:'WhatsApp',to:'919876543210'}}),/WHATSAPP_NOT_CONNECTED/);
});

function jsonRes(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}
