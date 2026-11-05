const KIND={BrandKit:'Brand',Strategy:'Strategy',Campaign:'Plan',Idea:'Idea',Asset:'Content',Approval:'Review',Post:'Post',Ad:'Ad',Metric:'Number',Report:'Report',Learning:'Lesson',Task:'Task'};

export function askText(reason){
 if(reason==='split')return 'That is two requests. Which should I do first?';
 if(reason==='act')return 'Do you want me to explain it, or do it?';
 if(reason==='forbidden')return 'I can’t approve, decline, delete, move a client, change people or settings, export, or switch client. A reviewer does that on the Review page, or you can use the existing screens.';
 if(reason==='label')return 'I need you to say whether that number is real, estimated, or inferred. I won’t pick the label.';
 if(reason==='unavailable')return 'Routing is unavailable. The steps on the left still work.';
 if(reason==='empty')return 'There is nothing in that group I can do on this client.';
 return 'I can look something up, change this client, start a draft, or talk it through. Which do you want?';
}

export function fieldQuestion(field){return field.label;}

export function confirmText(tool,args){
 const lines=Object.entries(args).filter(([k,v])=>v!==undefined&&v!==''&&!['preview','previewed','profile'].includes(k)).map(([k,v])=>k.replaceAll('_',' ')+': '+(typeof v==='object'?JSON.stringify(v):v));
 return 'Save this?\n'+lines.join('\n');
}

export function resultText(tool,result,client){
 const name=client?.name||'this client';
 if(tool.id==='set_brand_kit'){
  const colors=result.data?.colors?.length||0,fonts=result.data?.fonts_found?.length||0,sources=result.data?.source_names?.length||0;
  return `Brand kit saved successfully for ${name}.${sources?` I used ${sources} source file${sources===1?'':'s'}.`:''}${colors?` ${colors} colour${colors===1?'':'s'}`:''}${fonts?` and ${fonts} font${fonts===1?' was':'s were'} found.`:colors?` ${colors===1?'was':'were'} found.`:''}\n\nNext step: create the marketing strategy. I’ll use this brand kit automatically.`;
 }
 if(tool.id==='list_items'){
  const n=result.rows.length;
  if(result.kind==='Approval'&&result.status==='awaiting_review')return n?`${n} waiting for review for ${name}.`:`Nothing is waiting for review for ${name}.`;
  return n?`${n} ${KIND[result.kind]||result.kind} records for ${name}.`:`No ${KIND[result.kind]||result.kind} records for ${name}.`;
 }
 if(tool.id==='get_context')return `${name} · ${result.path}. You are ${result.role}. Next: ${result.missing}.`;
 if(tool.id==='ready_check'){
  const r=result.ready||{};
  const missing=(r.items||[]).filter(i=>!i.ok).map(i=>'• '+i.label+(i.detail?' — '+i.detail:'')).join('\n');
  return `${name} is ${r.pct||0}% ready (${r.ready||0}/${r.total||0}).${missing?'\nStill needed:\n'+missing:''}${r.canProduce?'\nStrategy and brand are in place — you can produce the month.':''}`;
 }
 if(tool.id==='client_questionnaire')return result.text||'Questionnaire ready to copy.';
 if(tool.id==='draft_month')return result.job_id?`Monthly production queued (job ${result.job_id}). Watch the live window. Review will show calendar, hooks, scripts, designs, ads and SEO.`:'Queued.';
 if(tool.id==='month_pack')return result.zip?'Delivery pack is ready to download.':'Pack folder written under .local/packs.';
 if(tool.id==='record_client_decision')return `Recorded client decision: ${result.decision||'saved'}.`;
 if(tool.id==='apply_package')return `Package applied: ${result.package?.label||'saved'}.`;
 if(tool.id==='connect_meta')return result.url?`Open this link to connect Meta Ads. Nothing is spent until Review.\n${result.url}`:'Meta connect URL is ready.';
 if(tool.id==='meta_status'){
  const meta=(result.connectors||[]).find(c=>c.id==='meta')||{};
  return `${name}: Meta is ${meta.status||'not_connected'}${meta.ad_account_name?' · '+meta.ad_account_name:''}. Launches still go through Review.`;
 }
 if(tool.id==='pick_meta_account')return 'Meta ad account saved. Launches still go through Review.';
 if(tool.id==='pull_meta_insights')return `Saved ${result.count||0} Meta numbers as real metrics${result.duplicates?` (${result.duplicates} duplicates skipped)`:''}.`;
 if(tool.id==='get_rollup')return result.rollup?`Totals for ${name}: ${result.rollup.totals.waiting} waiting for review, ${result.rollup.totals.leads} real leads, ₹${Math.round(result.rollup.totals.spend)} real spend.`:`${name} has no brands or products under it.`;
 if(tool.id==='results_summary')return `Real leads ${result.real.leads??0}, real spend ₹${Math.round(result.real.spend||0)}. Estimated and inferred totals are kept separate.`;
 if(result.kind==='Approval')return `Sent to Review: ${result.title||'item'}. Nothing has been posted or spent.`;
 if(result.queued||result.job_id)return `Started. Job ${result.job_id}. Nothing goes out until Review.`;
 if(result.approval)return `Sent to Review: ${result.approval.title||result.title||''}. Nothing has been posted or spent.`;
 if(result.post)return `A review item was created for the post. It is not live.`;
 if(result.ad)return `A review item was created for the ad change. Nothing has been spent.`;
 if(result.count!==undefined)return `Saved ${result.count} numbers${result.duplicates?` (${result.duplicates} duplicates skipped)`:''}.`;
 if(result.id)return `Saved successfully for ${name}.`;
 return 'Done.';
}

export function cardsFrom(result){
 const rows=result?.rows||result?.records||[];
 const one=[result?.record,result?.approval,result?.post,result?.ad,result?.asset,result?.id&&result?.kind?result:null].filter(r=>r&&r.id);
 const list=[...rows,...one];
 const seen=new Set();
 return list.filter(r=>{if(!r.id||seen.has(r.id))return false;seen.add(r.id);return true;}).slice(0,12).map(r=>({id:r.id,kind:r.kind,title:r.title||r.name||KIND[r.kind]||'Item',status:r.status||''}));
}
