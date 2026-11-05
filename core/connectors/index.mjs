import {q} from '../db/index.mjs';
import {accountPublic,executeMeta,executeWhatsApp,metaConfigured} from './meta.mjs';

export const connectors=[
{id:'meta',name:'Meta Ads',category:'Advertising',description:'Campaigns, ad sets, budgets and performance',permissions:'Read + write',status:'not_connected'},
{id:'google-ads',name:'Google Ads',category:'Advertising',description:'Search, display and YouTube campaigns',permissions:'Read + write',status:'not_connected'},
{id:'instagram',name:'Instagram',category:'Publishing',description:'Reels, carousels, comments and messages',permissions:'Read + write',status:'not_connected'},
{id:'facebook',name:'Facebook',category:'Publishing',description:'Pages, posts and community replies',permissions:'Read + write',status:'not_connected'},
{id:'whatsapp',name:'WhatsApp Business',category:'Messaging',description:'Approved broadcasts and inbound conversations',permissions:'Read + write',status:'not_connected'},
{id:'youtube',name:'YouTube',category:'Publishing',description:'Video uploads and channel performance',permissions:'Read + write',status:'not_connected'},
{id:'ga4',name:'Google Analytics 4',category:'Measurement',description:'Traffic, events and conversion reporting',permissions:'Read only',status:'not_connected'},
{id:'gsc',name:'Search Console',category:'Measurement',description:'Queries, pages and search visibility',permissions:'Read only',status:'not_connected'},
{id:'cms',name:'Website / CMS',category:'Publishing',description:'Approved articles and landing pages',permissions:'Write',status:'not_connected'}];

export async function connectorStatuses(clientId){
 if(!clientId)return {};
 const row=(await q("SELECT * FROM connector_accounts WHERE client_id=$1 AND provider='meta'",[clientId])).rows[0];
 const meta=accountPublic(row);
 const waConnected=!!meta.whatsapp_phone_id&&meta.status==='connected';
 return {
  meta:{...meta,configured:metaConfigured(),detail:meta.status==='connected'?(meta.ad_account_name||'Connected, pick an ad account'):meta.status==='pending'?'Waiting for Meta approval':meta.status==='expired'?'Reconnect Meta':metaConfigured()?'Not connected':'Set META_APP_ID on the server'},
  whatsapp:{status:waConnected?'connected':meta.status==='connected'?'not_connected':'not_connected',whatsapp_phone_id:meta.whatsapp_phone_id,whatsapp_display:meta.whatsapp_display,whatsapp_phones:meta.whatsapp_phones,detail:waConnected?(meta.whatsapp_display||'Connected'):meta.status==='connected'?'Pick a WhatsApp number on the Meta connection':'Connect Meta Ads first'},
 };
}

export async function liveConnectors(clientId){
 const live=await connectorStatuses(clientId);
 return connectors.map(c=>{
  const extra=live[c.id];
  if(!extra)return {...c};
  const {status,detail,...rest}=extra;
  return {...c,status:status||c.status,detail:detail||null,...pickPublic(rest)};
 });
}

function pickPublic(rest){
 const out={};
 for(const k of ['ad_account_id','ad_account_name','ad_accounts','page_id','page_name','pages','whatsapp_phone_id','whatsapp_display','whatsapp_phones','token_expires_at','configured','updated_at'])if(rest[k]!==undefined)out[k]=rest[k];
 return out;
}

export async function executeConnector(target){
 if(target?.kind==='Ad'&&target.data?.platform==='Meta')return executeMeta(target);
 if(target?.kind==='Post'&&target.data?.platform==='WhatsApp')return executeWhatsApp(target);
 throw new Error('CONNECTOR_NOT_CONFIGURED: external publishing is deferred. No action was sent.');
}

export {metaConfigured};
export {refreshExpiringTokens} from './meta.mjs';
