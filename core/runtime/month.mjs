import {q,id,requestContext} from '../db/index.mjs';
import {resolveClient,contextRecords} from '../clients/tree.mjs';
import {generate} from './index.mjs';
import {createProgress} from './progress.mjs';
import {claudeState} from './claude-cli.mjs';
import {monthBrief,buildSlots,visualFor,contentSkill} from '../agent/month-fields.mjs';

export const MONTH_STAGES=[
 {key:'calendar',label:'Calendar, budget, UTMs',module:'03-plan',skills:['campaign-plan','content-calendar','utm-campaign-plan']},
 {key:'hooks',label:'Hooks + scores',module:'04-hooks',skills:['viral-hook-writer','ig-reel']},
 {key:'writing',label:'Scripts & captions',module:'05-content',skills:['reel-scripter','caption-and-hashtags','check']},
 {key:'designs',label:'Designs & reels',module:'06-design-video',skills:['exora-design-system']},
 {key:'ads',label:'Ads pack',module:'ads',skills:['paid-advertising','paid-social-brief']},
 {key:'seo',label:'SEO pack',module:'seo',skills:['seo-plan','keyword-cluster','local-seo']},
];

function provider(payload){return payload.provider||process.env.EXORA_AGENT_DRAFT||(claudeState().connected?'claude':'local_template');}

async function tag(ids,jobId){
 if(!ids?.length)return;
 await q('UPDATE records SET data=coalesce(data,\'{}\'::jsonb)||$2::jsonb,updated_at=now() WHERE id=ANY($1::uuid[])',[ids,JSON.stringify({month_job:jobId})]);
}

async function patch(id,data){
 await q('UPDATE records SET data=coalesce(data,\'{}\'::jsonb)||$2::jsonb,updated_at=now() WHERE id=$1',[id,JSON.stringify(data)]);
}

export async function runMonthJob(job){
 const client=await resolveClient(job.client_id);
 const user={id:job.created_by,role:'marketer'};
 const progress=createProgress(p=>q('UPDATE jobs SET progress=$2,updated_at=now() WHERE id=$1',[job.id,p]));
 const inputs=job.payload.inputs;
 const brief=monthBrief(inputs);
 const prov=provider(job.payload);
 const prior=job.payload.resume?.results&&typeof job.payload.resume.results==='object'?job.payload.resume.results:{};
 const results={...prior};
 progress.plan(MONTH_STAGES.map(s=>({key:s.key,label:s.label,skills:s.skills})));
 const inner={event:e=>progress.event({...e,stage:progress.state.current}),plan(){},start(){},finish(){},fail(){},reuse(){},keep(){},skip(){},flush:()=>Promise.resolve()};
 const gen=async(module,extra={})=>requestContext.run({via:'month'},()=>generate(user,client,{module,provider:prov,brief,language:inputs.language||client.languages?.[0]||'English',budget:inputs.budget,month:inputs.month,...extra},{progress:inner}));
 try{
  for(const stage of MONTH_STAGES){
   if(stage.key==='seo'&&!inputs.seo&&!(inputs.channels||[]).some(c=>/seo/i.test(c))){progress.skip(stage.key,'SEO not in this package');continue;}
   if(stage.key==='ads'&&!(inputs.ads>0)){progress.skip(stage.key,'No ad variants requested');continue;}
   if(prior[stage.key]?.done){progress.reuse(stage.key,'reused');continue;}
   progress.start(stage.key);
   try{
    if(stage.key==='calendar'){
     const out=await gen('03-plan');
     const campaign=out.records.find(r=>r.kind==='Campaign');
     const slots=buildSlots(inputs).map((s,i)=>({...s,topic:campaign?.data?.slots?.[i]?.topic||s.topic||(inputs.goal||'Monthly slot')}));
     if(campaign){await patch(campaign.id,{slots,month:inputs.month,budget:inputs.budget,currency:'INR',month_job:job.id,objective:inputs.goal||campaign.data.objective});results.calendar={done:true,campaign_id:campaign.id,ids:[campaign.id]};await tag([campaign.id],job.id);}
    }else if(stage.key==='hooks'){
     const campaignId=results.calendar?.campaign_id;
     const campaign=(await q("SELECT * FROM records WHERE id=$1 AND client_id=$2",[campaignId,client.id])).rows[0];
     const slots=campaign?.data?.slots||buildSlots(inputs);
     const ids=[];
     for(const [i,slot] of slots.entries()){
      const out=await gen('04-hooks',{skill:'viral-hook-writer',brief:`${brief}\n\nSlot ${i+1}/${slots.length}: ${slot.date} ${slot.platform} ${slot.format}. Theme: ${slot.topic||inputs.goal}. Write 3 hooks for this slot only.`});
      const idea=out.records.find(r=>r.kind==='Idea');
      if(idea){
       const hooks=idea.data?.hooks||[];
       const best=hooks.reduce((b,h,idx)=>((h.score??0)>(hooks[b]?.score??-1)?idx:b),0);
       await patch(idea.id,{campaign_id:campaignId,slot_date:slot.date,slot_format:slot.format,selected_hook:Number.isInteger(idea.data?.selected_hook)?idea.data.selected_hook:best,month_job:job.id});
       ids.push(idea.id);
      }
     }
     results.hooks={done:true,ids};
    }else if(stage.key==='writing'){
     const ideas=(await q("SELECT * FROM records WHERE client_id=$1 AND kind='Idea' AND data->>'month_job'=$2 ORDER BY created_at",[client.id,job.id])).rows;
     const ids=[];
     for(const idea of ideas){
      const format=idea.data.slot_format||'Post';
      const hook=idea.data.hooks?.[idea.data.selected_hook||0]?.text||idea.title;
      const out=await gen('05-content',{skill:contentSkill(format),format,brief:`${brief}\n\nWrite from this chosen hook only: "${hook}". Slot ${idea.data.slot_date||''} ${format}.`});
      const asset=out.records.find(r=>r.kind==='Asset');
      if(asset){await patch(asset.id,{idea_id:idea.id,campaign_id:results.calendar?.campaign_id,slot_date:idea.data.slot_date,slot_format:format,month_job:job.id});ids.push(asset.id);}
     }
     results.writing={done:true,ids};
    }else if(stage.key==='designs'){
     const copies=(await q("SELECT * FROM records WHERE client_id=$1 AND kind='Asset' AND data->>'month_job'=$2 AND coalesce(data->>'type','copy')='copy' ORDER BY created_at",[client.id,job.id])).rows;
     const queued=[];
     const brand=(await contextRecords(client)).find(r=>r.kind==='BrandKit')?.data||{};
     for(const copy of copies){
      const vis=visualFor(copy.data.slot_format||copy.data.format);
      const aid=id();
      await q("INSERT INTO records(id,client_id,kind,title,status,data,created_by) VALUES($1,$2,'Asset',$3,'draft',$4,$5)",[aid,client.id,copy.title+' · '+vis.type,{...copy.data,type:vis.type,format:vis.format,source_asset_id:copy.id,files:[],render_status:'queued',month_job:job.id,checks:copy.data.checks||[]},user.id]);
      const jid=id();
      await q("INSERT INTO jobs(id,client_id,type,payload,created_by) VALUES($1,$2,'render',$3,$4)",[jid,client.id,{asset_id:aid,brand,client_name:client.brand_name||client.name,languages:client.languages||[],layout:null,composer:prov==='claude'?'claude':'template'},user.id]);
      queued.push({asset_id:aid,job_id:jid});
     }
     results.designs={done:true,queued};
    }else if(stage.key==='ads'){
     const out=await gen('ads',{skill:'paid-social-brief',brief:`${brief}\n\nProduce a paid-social brief for ${inputs.ads} ad variants. INR budget ₹${inputs.budget}. Do not launch anything.`});
     const ids=(out.records||[]).map(r=>r.id);
     await tag(ids,job.id);
     results.ads={done:true,ids};
    }else if(stage.key==='seo'){
     const out=await gen('seo',{skill:'seo-plan',brief:`${brief}\n\nLocal SEO and keyword plan for ${client.city}. Google Business Profile checklist. No live crawl.`});
     const ids=(out.records||[]).map(r=>r.id);
     await tag(ids,job.id);
     results.seo={done:true,ids};
    }
    progress.keep(stage.key,results[stage.key]);
    progress.finish(stage.key);
   }catch(e){progress.fail(stage.key,e.message);throw new Error('Stage '+stage.label+' failed: '+e.message);}
  }
  await progress.flush();
  const all=[results.calendar?.ids,results.hooks?.ids,results.writing?.ids,results.ads?.ids,results.seo?.ids].flat().filter(Boolean);
  const listed=all.length?(await q('SELECT id,kind,title,status FROM records WHERE id=ANY($1::uuid[])',[all])).rows:[];
  await q("UPDATE jobs SET status='completed',result=$2,progress=$3,updated_at=now() WHERE id=$1",[job.id,{records:listed,queued_renders:results.designs?.queued||[]},JSON.parse(JSON.stringify({...(progress.state||{}),results}))]);
 }finally{await progress.flush();}
}
