'use client';
import React,{useState} from 'react';
import {ArrowRight,ArrowUpRight,Check,CheckCheck,Download,Plus} from 'lucide-react';

const TABS=[
 {id:'calendar',label:'Calendar'},
 {id:'hooks',label:'Hooks + scores'},
 {id:'scripts',label:'Scripts'},
 {id:'designs',label:'Designs'},
 {id:'ads',label:'Ads'},
 {id:'seo',label:'SEO'},
] as const;

const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n||0);
const date=(s:string)=>s?new Date(s).toLocaleDateString('en-IN',{day:'numeric',month:'short',timeZone:'Asia/Kolkata'}):'—';
const badge=(s:string)=>s?.replaceAll('_',' ')||'';

function Status({value}:{value:string}){return <span className={`status ${value}`}><i/>{badge(value)}</span>}
function Empty({title,children,action}:any){return <div className="empty"><h3>{title}</h3><p>{children}</p>{action}</div>}
function Rich({text}:any){return <div className="rich">{String(text||'').split('\n').map((line:string,i:number)=>line.startsWith('## ')?<h3 key={i}>{line.slice(3)}</h3>:line.startsWith('# ')?<h2 key={i}>{line.slice(2)}</h2>:line?<p key={i}>{line}</p>:<br key={i}/>)}</div>}

export default function MonthReview({data,canEdit,busy,onProduce,onView,onAct,onChooseHook,Creative}:any){
 const records=data?.records||[],jobs=(data?.jobs||[]).filter((j:any)=>j.type==='month');
 const [jobId,setJobId]=useState(jobs[0]?.id||'');
 const [tab,setTab]=useState<(typeof TABS)[number]['id']>('calendar');
 const [note,setNote]=useState('');
 const job=jobs.find((j:any)=>j.id===jobId)||jobs[0];
 const tagged=job?records.filter((r:any)=>r.data?.month_job===job.id):[];
 const campaign=tagged.find((r:any)=>r.kind==='Campaign')||records.find((r:any)=>r.kind==='Campaign');
 const ideas=tagged.filter((r:any)=>r.kind==='Idea');
 const copies=tagged.filter((r:any)=>r.kind==='Asset'&&(r.data?.type||'copy')==='copy');
 const visuals=tagged.filter((r:any)=>r.kind==='Asset'&&r.data?.type&&r.data.type!=='copy');
 const ads=tagged.filter((r:any)=>r.kind==='Ad'||(r.kind==='Campaign'&&r.id!==campaign?.id)||(r.kind==='Report'&&!r.data?.track));
 const seo=tagged.filter((r:any)=>(r.kind==='Report'&&r.data?.track==='seo')||(r.kind==='Task'&&r.data?.module==='seo'));
 const inputs=job?.payload?.inputs||{};
 const counts={calendar:campaign?.data?.slots?.length||0,hooks:ideas.length,scripts:copies.length,designs:visuals.length,ads:ads.length,seo:seo.length};
 const brand=records.find((r:any)=>r.kind==='BrandKit');
 if(!jobs.length)return <Empty title="No monthly run yet" action={canEdit&&<button className="button primary" onClick={onProduce}><Plus size={16}/>Produce this month</button>}>Ask how many posts, reels, carousels and ads, then produce the calendar, hooks, scripts, designs, ads and SEO in one run.</Empty>;
 return <>
  <div className="section-title">
   <div className="month-control">
    <select aria-label="Month run" value={job?.id||''} onChange={e=>setJobId(e.target.value)}>
     {jobs.map((j:any)=><option key={j.id} value={j.id}>{(j.payload?.inputs?.month||date(j.created_at))+' · '+badge(j.status)}</option>)}
    </select>
    <Status value={job.status}/>
   </div>
   <div className="action-row">
    {canEdit&&<button className="button" disabled={busy} onClick={onProduce}><Plus size={16}/>Produce another month</button>}
    <button className="button primary" disabled={busy} onClick={()=>onAct({action:'month-pack',job_id:job.id},'Delivery pack ready').then((r:any)=>{if(r?.download)location.href=r.download;})}><Download size={16}/>Delivery pack</button>
   </div>
  </div>
  <div className="notice compact"><span>Will produce {inputs.posts||0} posts · {inputs.reels||0} reels · {inputs.carousels||0} carousels · {inputs.ads||0} ads{inputs.seo?' · SEO pack':''}. Goal: {inputs.goal||'—'}. Budget {money(inputs.budget||0)}.</span></div>
  {job.status==='failed'&&<div className="notice"><b>This run stopped.</b><p>{job.error}</p>{canEdit&&<button className="button" disabled={busy} onClick={()=>onAct({action:'resume-month',job_id:job.id},'Resumed from the last finished stage')}>Resume</button>}</div>}
  {job.status==='queued'||job.status==='running'?<div className="notice compact">Working in the background. This page fills in as calendar, hooks, scripts, designs, ads and SEO land.</div>:null}
  <div className="tab-row section">
   {TABS.map(t=><button key={t.id} className={tab===t.id?'selected':''} onClick={()=>setTab(t.id)}>{t.label} <span>{counts[t.id]}</span></button>)}
  </div>
  {tab==='calendar'&&<>
   {!campaign?.data?.slots?.length&&<Empty title="No calendar yet">The plan stage writes dates, platforms, topics, UTM and budget here.</Empty>}
   {campaign&&<section className="panel section"><div className="panel-title"><h2>{campaign.title}</h2><Status value={campaign.status}/></div>
    <p>{campaign.data.objective}</p>
    <div className="budget"><span>Budget</span><b>{money(campaign.data.budget)}</b></div>
    {campaign.data.channels?.map((c:any)=><div className="split-row" key={c.name}><span>{c.name}</span><b>{money(c.amount)}</b></div>)}
    {campaign.data.utm&&<p className="muted">UTM · {campaign.data.utm.source}/{campaign.data.utm.medium}/{campaign.data.utm.campaign}</p>}
    <div className="table-wrap"><table><thead><tr><th>Date</th><th>Platform</th><th>Format</th><th>Topic</th><th/></tr></thead><tbody>{(campaign.data.slots||[]).map((s:any,i:number)=><tr key={i}><td>{date(s.date)}</td><td>{s.platform}</td><td>{s.format}</td><td>{s.topic||'—'}</td><td><button className="icon-button" aria-label="Open plan" onClick={()=>onView(campaign)}><ArrowUpRight size={16}/></button></td></tr>)}</tbody></table></div>
   </section>}
  </>}
  {tab==='hooks'&&<>
   {!ideas.length&&<Empty title="No scored hooks yet">Each slot gets three opening lines with hookscore. The highest score is chosen; you can override.</Empty>}
   {ideas.map((r:any)=><section className="panel section" key={r.id}><div className="panel-title"><div><span className="eyebrow">{r.data.slot_date||date(r.created_at)} · {r.data.slot_format||'Slot'}</span><h2>{r.title}</h2></div><button className="text-button" onClick={()=>onView(r)}>Details <ArrowRight size={13}/></button></div>
    <div className="hook-grid">{r.data.hooks?.map((h:any,i:number)=><article className={`hook-card ${r.data.selected_hook===i?'chosen':''}`} key={i}><div><span className="eyebrow">Option {i+1}</span><b className="hook-score">{h.score??'—'}<small>/100</small></b></div><h3>“{h.text}”</h3><span className="tag">{h.formula}</span>{h.verdict&&<span className="tag">{h.verdict}</span>}<p>{h.rationale}</p><button className={r.data.selected_hook===i?'button primary':'button'} disabled={busy||!canEdit} onClick={()=>onChooseHook(r.id,i)}>{r.data.selected_hook===i?<Check size={15}/>:<Plus size={15}/>} {r.data.selected_hook===i?'Chosen':'Use this one'}</button></article>)}</div>
   </section>)}
  </>}
  {tab==='scripts'&&<>
   {!copies.length&&<Empty title="No scripts yet">Writing uses the chosen hook only — script, on-screen text, caption and CTA, plus checks.</Empty>}
   <div className="record-grid">{copies.map((r:any)=><article className="record-card" key={r.id}><div className="record-top"><span className="eyebrow">{r.data.slot_date||''} · {r.data.slot_format||r.data.format}</span><Status value={r.status}/></div><h3 onClick={()=>onView(r)}>{r.title}</h3><p className="clamp">{r.data.caption||r.data.script||r.data.body}</p><p className="muted">{r.data.cta?'CTA: '+r.data.cta:''}</p><button className="text-button" onClick={()=>onView(r)}>Open <ArrowUpRight size={14}/></button></article>)}</div>
  </>}
  {tab==='designs'&&<>
   {!visuals.length&&<Empty title="No designs yet">Renders queue after writing. They land here as PNG or MP4 drafts.</Empty>}
   <div className="creative-grid">{visuals.map((r:any)=><Creative key={r.id} record={r} brand={brand} onClick={()=>onView(r)}/>)}</div>
  </>}
  {tab==='ads'&&<>
   {!ads.length&&<Empty title="No ads pack">Ad variants are drafted only. Launch still needs a Review yes — nothing is spent.</Empty>}
   <div className="record-grid">{ads.map((r:any)=><article className="record-card" key={r.id}><div className="record-top"><span className="eyebrow">{r.kind}</span><Status value={r.status}/></div><h3 onClick={()=>onView(r)}>{r.title}</h3><p className="clamp">{r.data.audience||r.data.objective||r.data.body}</p><button className="text-button" onClick={()=>onView(r)}>Open <ArrowUpRight size={14}/></button></article>)}</div>
  </>}
  {tab==='seo'&&<>
   {!seo.length&&<Empty title="No SEO pack">Keyword plan, Google Business Profile checklist and tasks when the package includes SEO.</Empty>}
   {seo.map((r:any)=><section className="panel section" key={r.id}><div className="panel-title"><h2>{r.title}</h2><button className="text-button" onClick={()=>onView(r)}>Open <ArrowRight size={13}/></button></div><Rich text={r.data.body}/></section>)}
  </>}
  {canEdit&&<section className="panel section"><div className="panel-title"><h2>Client WhatsApp decision</h2><Status value={job.result?.client_decision||campaign?.data?.client_decision||'awaiting_review'}/></div>
   <p className="muted">Record what they said. This does not post or spend.</p>
   <div className="action-row">
    <input placeholder="Optional note from the message" value={note} onChange={e=>setNote(e.target.value)}/>
    {[['approved','Client approved'],['changes_requested','Asked for changes'],['rejected','Rejected']].map(([d,l])=><button key={d} className="button" disabled={busy} onClick={()=>onAct({action:'record-client-decision',id:campaign?.id||job.id,decision:d,note},l)}><CheckCheck size={15}/>{l}</button>)}
   </div>
  </section>}
 </>;
}
