// Live progress for a running job: stages plus a short log of visible actions.
// Saved to jobs.progress (throttled) so the assistant's live window can poll it.
const iso=()=>new Date().toISOString();
export function createProgress(save){
 const state={stages:[],current:null,log:[],updated_at:null};
 let timer=null,chain=Promise.resolve();
 const flush=()=>{if(timer){clearTimeout(timer);timer=null;}const snap=JSON.parse(JSON.stringify({...state,updated_at:iso()}));chain=chain.then(()=>save(snap)).catch(()=>{});return chain;};
 const soon=()=>{if(!timer)timer=setTimeout(flush,700);};
 const add=(e,stage=state.current)=>{
  const last=state.log.at(-1);
  if(last&&last.text===e.text&&last.stage===stage){last.count=(last.count||1)+1;last.at=iso();return;}
  state.log.push({at:iso(),stage,type:e.type||'note',skill:e.skill||null,text:String(e.text||'').slice(0,200)});
  if(state.log.length>60)state.log.splice(0,state.log.length-60);
 };
 const find=key=>state.stages.find(s=>s.key===key);
 return {
  state,
  plan(stages){state.stages=stages.map(s=>({status:'waiting',...s}));flush();},
  start(key){const s=find(key);if(s){s.status='running';s.started_at=iso();}state.current=key;add({type:'stage',text:'Started '+(s?.label||key)},key);flush();},
  finish(key,summary){const s=find(key);if(s){s.status='done';s.finished_at=iso();if(summary)s.summary=String(summary).slice(0,300);}add({type:'stage',text:'Finished '+(s?.label||key)},key);flush();},
  fail(key,message){const s=find(key);if(s){s.status='failed';s.finished_at=iso();s.error=String(message||'').slice(0,300);}add({type:'error',text:(s?.label||key)+' failed: '+String(message||'').slice(0,160)},key);flush();},
  reuse(key,summary){const s=find(key);if(s){s.status='done';s.reused=true;if(summary)s.summary=String(summary).slice(0,300);}add({type:'stage',text:'Reused '+(s?.label||key)+' from the earlier run'},key);flush();},
  keep(key,value){state.results=state.results||{};state.results[key]=value;flush();},
  skip(key,why){const s=find(key);if(s){s.status='skipped';s.summary=why;}flush();},
  event(e){add(e);soon();},
  flush,
 };
}
