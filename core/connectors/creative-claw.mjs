// Minimal MCP (Streamable HTTP, JSON-RPC 2.0) client for Creative Claw, used server-side by the video pipeline.
// One shared module: auth from env, timeouts, retries with backoff for safe calls, runtime tool discovery.
// Paid generation calls are NOT retried automatically after an unclear failure, so a generation is never billed twice.
const PROTOCOL='2025-03-26';
const DEFAULT_URL='https://app.creativeclaw.co/mcp';

export function creativeClawConfig(env=process.env){
 const url=String(env.CREATIVE_CLAW_MCP_URL||DEFAULT_URL).trim();const token=String(env.CREATIVE_CLAW_TOKEN||'').trim();
 return {url,token,enabled:env.EXORA_CREATIVE_CLAW==='1'&&!!token,timeoutMs:Math.max(5000,Number(env.CREATIVE_CLAW_TIMEOUT_MS)||60000)};
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const RETRYABLE=s=>s===429||s===502||s===503||s===504;

/** Parse a JSON-RPC response that may arrive as JSON or as an SSE stream of "data:" lines. */
export function parseRpc(text,contentType=''){
 if(/text\/event-stream/.test(contentType)||/^\s*(event|data):/m.test(text)){
  const msgs=text.split(/\n\n+/).map(b=>b.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('')).filter(Boolean).map(s=>{try{return JSON.parse(s);}catch{return null;}}).filter(Boolean);
  return msgs.find(m=>m.result!==undefined||m.error!==undefined)||msgs.at(-1)||null;
 }
 try{return JSON.parse(text);}catch{return null;}
}

export class CreativeClawClient{
 constructor(cfg=creativeClawConfig(),fetchImpl=globalThis.fetch){this.cfg=cfg;this.fetch=fetchImpl;this.session=null;this.seq=0;this.tools=null;}
 async rpc(method,params,{retry=true,attempts=4}={}){
  if(!this.cfg.token)throw new Error('Creative Claw is not configured. Set CREATIVE_CLAW_TOKEN (and EXORA_CREATIVE_CLAW=1).');
  let last;
  for(let i=0;i<(retry?attempts:1);i++){
   const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),this.cfg.timeoutMs);
   try{
    const res=await this.fetch(this.cfg.url,{method:'POST',signal:ctrl.signal,redirect:'error',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer '+this.cfg.token,'MCP-Protocol-Version':PROTOCOL,...(this.session?{'Mcp-Session-Id':this.session}:{})},
     body:JSON.stringify({jsonrpc:'2.0',id:++this.seq,method,...(params?{params}:{})})});
    const sid=res.headers.get('mcp-session-id');if(sid)this.session=sid;
    if(res.status===401||res.status===403)throw Object.assign(new Error('Creative Claw rejected the credentials. Check CREATIVE_CLAW_TOKEN.'),{fatal:true});
    if(!res.ok){last=new Error(`Creative Claw returned HTTP ${res.status}`);if(RETRYABLE(res.status)&&retry){await sleep(500*2**i+Math.random()*250);continue;}throw last;}
    const msg=parseRpc(await res.text(),res.headers.get('content-type')||'');
    if(!msg)throw new Error('Creative Claw sent a response that is not JSON-RPC');
    if(msg.error)throw Object.assign(new Error('Creative Claw: '+String(msg.error.message||'error').slice(0,300)),{fatal:true});
    return msg.result;
   }catch(e){last=e;if(e.fatal||!retry)throw e;await sleep(500*2**i+Math.random()*250);}
   finally{clearTimeout(timer);}
  }
  throw last;
 }
 async connect(){
  if(this.session)return;
  await this.rpc('initialize',{protocolVersion:PROTOCOL,capabilities:{},clientInfo:{name:'exora-marketing-os',version:'1'}});
  await this.rpc('notifications/initialized',undefined,{retry:false}).catch(()=>{});
 }
 /** tools/list, cached. Names are reconciled at runtime instead of being assumed. */
 async listTools(){await this.connect();if(this.tools)return this.tools;const out=[];let cursor;do{const r=await this.rpc('tools/list',cursor?{cursor}:{});out.push(...(r.tools||[]));cursor=r.nextCursor;}while(cursor&&out.length<500);return this.tools=out;}
 /** First tool whose name matches one of the candidates (exact, then suffix match). */
 async resolveTool(...candidates){const tools=await this.listTools();for(const c of candidates){const hit=tools.find(t=>t.name===c)||tools.find(t=>t.name.endsWith('_'+c)||t.name.endsWith('__'+c));if(hit)return hit;}return null;}
 /** tools/call. paid=true disables automatic retry (never double-bill a generation). */
 async call(name,args={},{paid=false}={}){await this.connect();const r=await this.rpc('tools/call',{name,arguments:args},{retry:!paid});if(r?.isError)throw new Error('Creative Claw tool '+name+' failed: '+textOf(r).slice(0,300));return r;}
}
export const textOf=r=>(r?.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
/** Structured content first, else the first JSON object found in the text content. */
export function jsonOf(r){if(r?.structuredContent)return r.structuredContent;const t=textOf(r);try{return JSON.parse(t);}catch{}const m=t.match(/\{[\s\S]*\}/);if(m)try{return JSON.parse(m[0]);}catch{}return {};}
