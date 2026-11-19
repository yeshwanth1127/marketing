import {q,id,requestContext} from '../db/index.mjs';
import {resolveClient,contextRecords} from '../clients/tree.mjs';
import {generate} from './index.mjs';
import {createProgress} from './progress.mjs';
import {claudeState} from './claude-cli.mjs';
import {monthBrief,daySlotBrief,buildSlots,eventsForMonth,normalizeDayScripts,isCompleteDayScript,visualFor,contentSkill} from '../agent/month-fields.mjs';
import {chooseDesignTemplate,templateForDesign} from '../design/templates.mjs';
import {cleanOnScreen} from '../design/compose.mjs';

export const MONTH_STAGES=[
 {key:'calendar',label:'Calendar, budget, UTMs',module:'03-plan',skills:['campaign-plan','content-calendar','utm-campaign-plan']},
 {key:'hooks',label:'Per-day ideas + scores',module:'04-hooks',skills:['day-script-writer','viral-hook-writer','ig-reel']},
 {key:'writing',label:'Per-day scripts & captions',module:'05-content',skills:['reel-scripter','video-script','on-screen-text-writer','cta-writer','caption-and-hashtags','check']},
 {key:'designs',label:'Designs & reels (optional)',module:'06-design-video',skills:['exora-design-system','motion-doctrine','hyperframes','captions-overlay']},
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
 const region=client.data?.region||'Karnataka';
 const monthEvents=eventsForMonth(region,inputs.month);
 const brief=monthBrief(inputs,monthEvents);
 const prov=provider(job.payload);
 const prior=job.payload.resume?.results&&typeof job.payload.resume.results==='object'?job.payload.resume.results:{};
 const results={...prior};
 const voiceName=client.settings?.voice?.name||'';
 progress.plan(MONTH_STAGES.map(s=>({key:s.key,label:s.label,skills:s.skills})));
 const inner={event:e=>progress.event({...e,stage:progress.state.current}),plan(){},start(){},finish(){},fail(){},reuse(){},keep(){},skip(){},flush:()=>Promise.resolve()};
 const gen=async(module,extra={})=>requestContext.run({via:'month'},()=>generate(user,client,{module,provider:prov,brief,language:inputs.language||client.languages?.[0]||'English',budget:inputs.budget,month:inputs.month,...extra},{progress:inner}));
 try{
  for(const stage of MONTH_STAGES){
   if(stage.key==='seo'&&!inputs.seo&&!(inputs.channels||[]).some(c=>/seo/i.test(c))){progress.skip(stage.key,'SEO not in this package');continue;}
   if(stage.key==='ads'&&!(inputs.ads>0)){progress.skip(stage.key,'No ad variants requested');continue;}
   if(stage.key==='designs'&&!inputs.with_designs){results.designs={done:true,queued:[],skipped:true};progress.skip(stage.key,'Month focused on ideas + scripts; queue designs later from Design & video');continue;}
   if(prior[stage.key]?.done){progress.reuse(stage.key,'reused');continue;}
   progress.start(stage.key);
   try{
    if(stage.key==='calendar'){
     const out=await gen('03-plan');
     const campaign=out.records.find(r=>r.kind==='Campaign');
     const built=buildSlots(inputs,{region});
     const slots=built.map((s,i)=>{
      const planned=campaign?.data?.slots?.find(x=>x.date===s.date&&x.format===s.format)||campaign?.data?.slots?.[i];
      const topic=s.event?s.topic:(planned?.topic||s.topic||inputs.goal||'Monthly slot');
      return {...s,topic};
     });
     if(campaign){await patch(campaign.id,{slots,month:inputs.month,budget:inputs.budget,currency:'INR',month_job:job.id,objective:inputs.goal||campaign.data.objective,from_date:inputs.from_date,to_date:inputs.to_date,seasonal_events:monthEvents});results.calendar={done:true,campaign_id:campaign.id,ids:[campaign.id]};await tag([campaign.id],job.id);}
    }else if(stage.key==='hooks'){
     const campaignId=results.calendar?.campaign_id;
     const campaign=(await q("SELECT * FROM records WHERE id=$1 AND client_id=$2",[campaignId,client.id])).rows[0];
     const slots=campaign?.data?.slots||buildSlots(inputs,{region});
     const ids=[];
     for(const [i,slot] of slots.entries()){
      const day=daySlotBrief(inputs,slot,i,slots.length,monthEvents);
      const out=await gen('04-hooks',{skill:'day-script-writer,viral-hook-writer',brief:`${brief}\n\n${day}\n\nFollow skills/day-script-writer and skills/viral-hook-writer.\nReturn exactly 3 UNIQUE day-script options for THIS date and ${slot.format} only.\nEach hooks[] item MUST include:\n- text: stop-scroll opening line (spoken first 1–2s)\n- script: COMPLETE timed production script with HOOK → SETUP → PAYOFF → CTA for ${slot.format==='Reel'?'~12–25s vertical':'the post/carousel'}\n- score: integer 0–100 (leave for hookscore to overwrite when available)\n- formula: short label for the angle\n- rationale / explanation: why this angle fits TODAY’s audience, event and goal (2–4 sentences)\n- caption, cta, on_screen_text (3–5 short lines that MUTE-PASS — the tip/question/list must appear)\n- claude_prompt: visual brief that lists each on-screen line AND the payoff beat\n- elevenlabs_prompt: narration direction + the full spoken script\n\nDIRECTION RULE: the video/post must go somewhere. If text promises “one question / three things / don’t…”, the script and on_screen_text MUST state that question / those things / the better move before any CTA. Ending on brand logo + “save this” with no payoff is forbidden.\n\nWRITE hooks[] .text so they PASS hookscore.py (do not invent scores — write better lines):\n- LENGTH: 5–12 words, under ~2s spoken. No greetings or “today I’m…”.\n- SPECIFICITY: include a number (three / 3pm / five) AND/OR a proper name (Bengaluru, ${client.name}, festival name).\n- STAKES: use tension words — don't / never / before / without / wrong / still / only / can't / mistake.\n- FRONTLOAD: put the number, name or stakes word in the first 1–4 words.\n- ADDRESS: say you/your OR open with Don't / Stop / Never / Save.\nThree options must differ in angle (mistake / number-list / lived moment). No [placeholder] tokens.`});
      const idea=out.records.find(r=>r.kind==='Idea');
      if(idea){
       const hooks=normalizeDayScripts(idea.data?.hooks||[],{format:slot.format,topic:slot.topic||'',voiceName}).map(h=>({...h,text:cleanOnScreen(h.text)||h.text,script:cleanOnScreen(h.script)||h.script,caption:cleanOnScreen(h.caption)||h.caption,on_screen_text:(h.on_screen_text||[]).map(cleanOnScreen).filter(Boolean)}));
       const best=hooks.reduce((b,h,idx)=>((h.score??0)>(hooks[b]?.score??-1)?idx:b),0);
       const selected=Number.isInteger(idea.data?.selected_hook)?idea.data.selected_hook:best;
       await patch(idea.id,{hooks,campaign_id:campaignId,slot_date:slot.date,slot_format:slot.format,slot_platform:slot.platform||'Instagram',slot_topic:slot.topic||'',slot_event:slot.event||'',selected_hook:selected,month_job:job.id,day_focus:true,day_scripts:true});
       if(campaignId){
        const chosen=hooks[selected]||hooks[0];
        // Re-read campaign so a mid-run calendar rearrange (format mix) is not overwritten by stale in-memory slots.
        const live=(await q('SELECT data FROM records WHERE id=$1 AND client_id=$2',[campaignId,client.id])).rows[0];
        const liveSlots=live?.data?.slots||campaign.data.slots||slots;
        const nextSlots=liveSlots.map(s=>s.date===slot.date&&s.format===slot.format?{...s,topic:chosen?.text||s.topic,selected_idea_id:idea.id,selected_hook:selected,selected_script:(chosen?.script||'').slice(0,280)}:s);
        await patch(campaignId,{slots:nextSlots});
        campaign.data={...(live?.data||campaign.data),slots:nextSlots};
       }
       ids.push(idea.id);
      }
     }
     results.hooks={done:true,ids};
    }else if(stage.key==='writing'){
     const ideas=(await q("SELECT * FROM records WHERE client_id=$1 AND kind='Idea' AND data->>'month_job'=$2 ORDER BY created_at",[client.id,job.id])).rows;
     const ids=[];
     for(const [i,idea] of ideas.entries()){
      const format=idea.data.slot_format||'Post';
      const chosen=idea.data.hooks?.[idea.data.selected_hook||0]||{};
      const hook=chosen.text||idea.title;
      const slot={date:idea.data.slot_date,time:'18:30',format,platform:idea.data.slot_platform||'Instagram',topic:idea.data.slot_topic||'',event:idea.data.slot_event||''};
      const day=daySlotBrief(inputs,slot,i,ideas.length,monthEvents);
      let asset=null;
      const complete=isCompleteDayScript(chosen);
      if(complete&&!/reel|video|carousel/i.test(format)){
       // Promote a complete static-post day-script without inventing a fourth version.
       const {tx,insert}=await import('../db/index.mjs');
       asset=await tx(c=>insert(c,user,client.id,'Asset',String(hook).slice(0,300),{
        type:'copy',format,language:inputs.language||client.languages?.[0]||'English',
        script:cleanOnScreen(chosen.script)||chosen.script,
        on_screen_text:(chosen.on_screen_text||[]).map(cleanOnScreen).filter(Boolean),
        caption:cleanOnScreen(chosen.caption)||chosen.caption||'',
        cta:chosen.cta||'',
        claude_prompt:chosen.claude_prompt||'',
        elevenlabs_prompt:chosen.elevenlabs_prompt||'',
        explanation:chosen.explanation||chosen.rationale||'',
        idea_id:idea.id,campaign_id:results.calendar?.campaign_id,slot_date:idea.data.slot_date,slot_format:format,
        month_job:job.id,day_focus:true,from_day_script:true,provider:prov,checks:[],
       }));
      }else{
       const out=await gen('05-content',{skill:contentSkill(format),format,brief:`${brief}\n\n${day}\n\nChosen opening for this day only: "${hook}".\n${chosen.script?`Draft beats to improve (keep the hook, fix direction/payoff):\n${chosen.script}\n`:''}\nProduce a FULL production pack for THIS day using reel-scripter / video-script / on-screen-text-writer / cta-writer as relevant:\n- script: complete timed spoken/on-camera script with HOOK → SETUP → PAYOFF → CTA (not a stub)\n- If the hook promises a question/list/secret, STATE it in narration and on_screen_text before the CTA\n- on_screen_text: 3–5 short lines that mute-pass (stranger understands the tip from text alone)\n- caption, cta\n- claude_prompt: design brief that includes every on-screen line and the payoff beat\n- elevenlabs_prompt: narration direction + full script\nKeep claims identical to brand kit and offer rules. If Reel, write ~12–25s vertical. Creative and specific > generic. No logo-only endings.`});
       asset=out.records.find(r=>r.kind==='Asset');
      }
      if(asset){
       const ost=(asset.data.on_screen_text||[]).map(cleanOnScreen).filter(Boolean);
       const script=cleanOnScreen(asset.data.script)||asset.data.script;
       const caption=cleanOnScreen(asset.data.caption)||asset.data.caption;
       await patch(asset.id,{...(ost.length?{on_screen_text:ost}:{}),...(script?{script}:{}),...(caption?{caption}:{}),idea_id:idea.id,campaign_id:results.calendar?.campaign_id,slot_date:idea.data.slot_date,slot_format:format,month_job:job.id,day_focus:true});
       ids.push(asset.id);
      }
     }
     results.writing={done:true,ids};
    }else if(stage.key==='designs'){
     const copies=(await q("SELECT * FROM records WHERE client_id=$1 AND kind='Asset' AND data->>'month_job'=$2 AND coalesce(data->>'type','copy')='copy' ORDER BY created_at",[client.id,job.id])).rows;
     const queued=[];
     const brand=(await contextRecords(client)).find(r=>r.kind==='BrandKit')?.data||{};
     for(const copy of copies){
      const vis=visualFor(copy.data.slot_format||copy.data.format);
      const designTemplate=await templateForDesign(await chooseDesignTemplate(client,null,vis.type));
      const aid=id();
      await q("INSERT INTO records(id,client_id,kind,title,status,data,created_by) VALUES($1,$2,'Asset',$3,'draft',$4,$5)",[aid,client.id,copy.title+' · '+vis.type,{...copy.data,type:vis.type,format:vis.format,design_template_id:designTemplate?.id||null,design_template_name:designTemplate?.title||null,source_asset_id:copy.id,files:[],render_status:'queued',month_job:job.id,checks:copy.data.checks||[],composer:vis.type==='video'?'claude':undefined},user.id]);
      const jid=id();
      await q("INSERT INTO jobs(id,client_id,type,payload,created_by) VALUES($1,$2,'render',$3,$4)",[jid,client.id,{asset_id:aid,brand,client_name:client.brand_name||client.name,languages:client.languages||[],layout:null,design_template:designTemplate?{title:designTemplate.title,data:designTemplate.data,source_name:designTemplate.source_name,reference_image_path:designTemplate.reference_image_path}:null,composer:vis.type==='video'||prov==='claude'?'claude':'template'},user.id]);
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
