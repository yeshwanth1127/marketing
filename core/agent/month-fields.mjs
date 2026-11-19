import {seasonal} from '../runtime/seasonal.mjs';

export const MONTH_FIELDS=[
 {key:'month',required:true,label:'Which month should we produce? Use YYYY-MM.'},
 {key:'goal',required:true,label:'What is the measurable goal this month?'},
 {key:'offer',required:true,label:'What offer may we use? Reply “No offer” if none — I will not invent one.'},
 {key:'posts',required:true,type:'number',label:'How many static image posts?'},
 {key:'reels',required:true,type:'number',label:'How many reels / videos?'},
 {key:'carousels',required:true,type:'number',label:'How many carousels?'},
 {key:'ads',required:true,type:'number',label:'How many ad variants?'},
 {key:'budget',required:true,type:'number',label:'Paid budget in rupees (INR) for the month? Reply 0 if none.'},
 {key:'language',required:false,label:'Which language? Reply skip to use the client default.'},
 {key:'channels',required:false,label:'Which channels? Instagram, Google Ads, SEO. Reply skip to use the package.'},
];

const n=(v,max)=>Math.max(0,Math.min(max,Number.parseInt(String(v??'0'),10)||0));
const todayKey=(d=new Date())=>d.toISOString().slice(0,10);
const monthKey=(d=new Date())=>d.toISOString().slice(0,7);

const dayOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));

/** Remaining calendar days for a YYYY-MM window (from today when month is current). */
export function remainingDays(month,now=new Date(),range={}){
 const m=/^\d{4}-\d{2}$/.test(String(month||''))?String(month):monthKey(now);
 const [y,mo]=m.split('-').map(Number);
 const last=new Date(y,mo,0).getDate();
 const earliest=m===monthKey(now)?Math.min(Math.max(Number(todayKey(now).slice(8,10)),1),last):1;
 let from=earliest,to=last;
 if(dayOk(range.from_date)&&String(range.from_date).startsWith(m+'-')){
  from=Math.max(earliest,Number(String(range.from_date).slice(8,10))||earliest);
 }
 if(dayOk(range.to_date)&&String(range.to_date).startsWith(m+'-')){
  to=Math.min(last,Number(String(range.to_date).slice(8,10))||last);
 }
 if(to<from)to=from;
 const days=[];
 for(let d=from;d<=to;d++)days.push(`${m}-${String(d).padStart(2,'0')}`);
 return {month:m,start:from,last:to,month_last:last,days,earliest};
}

export function eventsForMonth(region,month){
 try{return seasonal(region||'Karnataka',month)?.events||[];}catch{return [];}
}

export function monthInputs(raw={},now=new Date()){
 const month=/^\d{4}-\d{2}$/.test(String(raw.month||''))?String(raw.month):monthKey(now);
 const posts=n(raw.posts,30),reels=n(raw.reels,20),carousels=n(raw.carousels,20),ads=n(raw.ads,20);
 if(posts+reels+carousels<1)throw Object.assign(new Error('Ask for at least one post, reel or carousel'),{status:400});
 const budget=Number(String(raw.budget||'0').replace(/[^\d.]/g,''))||0;
 const channels=(Array.isArray(raw.channels)?raw.channels.map(String):String(raw.channels||'').split(/[,/]| and /i)).map(s=>s.trim()).filter(Boolean);
 const window=remainingDays(month,now,{from_date:raw.from_date,to_date:raw.to_date});
 if(!window.days.length)throw Object.assign(new Error('No days left in that date range to plan'),{status:400});
 return {
  month,goal:String(raw.goal||'').trim().slice(0,500),offer:String(raw.offer||'').trim().slice(0,500),
  posts,reels,carousels,ads,budget,language:String(raw.language||'').trim(),
  channels,seo:channels.some(c=>/seo/i.test(c)),
  with_designs:raw.with_designs===true||raw.with_designs==='true'||raw.with_designs===1||raw.with_designs==='1',
  from_date:window.days[0],to_date:window.days[window.days.length-1],remaining_days:window.days.length,
 };
}

export function monthBrief(inputs,events=[]){
 const eventLine=events.length
  ?`Special days in this window: ${events.map(e=>`${e.date.slice(8)} ${e.name}`).join('; ')}. Build at least one slot around each relevant day — do not ignore them.`
  :'No major festival/event in this date window — still use weekday/weekend and local seasonality.';
 return [
  `Monthly production for ${inputs.month} — ONLY ${inputs.from_date} → ${inputs.to_date} (${inputs.remaining_days} day(s)). Do not plan outside this range.`,
  inputs.goal&&`Goal: ${inputs.goal}`,
  inputs.offer&&inputs.offer.toLowerCase()!=='no offer'?`Offer (client-confirmed): ${inputs.offer}`:'No offer stated — do not invent prices or promotions.',
  `Counts: ${inputs.posts} static posts, ${inputs.reels} reels, ${inputs.carousels} carousels, ${inputs.ads} ad variants — placed inside the selected date range only.`,
  `Budget: ₹${inputs.budget} INR.`,
  inputs.language&&`Language: ${inputs.language}`,
  inputs.channels?.length&&`Channels: ${inputs.channels.join(', ')}`,
  eventLine,
  'Formats: interleave Post / Reel / Carousel across days — never dump all posts then all reels then carousels.',
  'SCRIPT DOCTRINE (non-negotiable): every option must HOOK → SETUP → PAYOFF → CTA. If the hook promises a question, list, secret or “don’t”, the script and on_screen_text MUST deliver it before the CTA. A hook with no payoff is a failed script.',
  'Priority: for EACH slot, three unique full script options (scored /100) with stop-scroll openers that feel personal and local — not generic brand fluff.',
  'Hook writing (earn the score — do not invent it): 5–12 words; include a number or proper name; include a stakes word (don\'t/never/stop/still/without/before/only/can\'t/mistake); front-load that payload; address you/your or open with Don\'t/Stop/Never/Save.',
  'Relativity: name the city, parent pain, school routine, festival, or weekday moment when it fits. Specific beats generic.',
  'Mute-pass: reading on_screen_text alone must still convey the tip/question/list. Do not end on logo + vague CTA.',
  'Do not invent proof, prices or numbers. Use the brand kit, signed strategy and saved records only.',
  'Never write placeholder tokens like [landmark], [name], or [offer] — use real brand/city facts or omit.',
 ].filter(Boolean).join('\n');
}

export function daySlotBrief(inputs,slot,index,total,events=[]){
 const weekday=slot.date?new Date(slot.date+'T12:00:00').toLocaleDateString('en-IN',{weekday:'long'}):'';
 const dayEvents=events.filter(e=>e.date===slot.date);
 const eventNote=dayEvents.length
  ?`SPECIAL EVENT TODAY: ${dayEvents.map(e=>e.name).join(', ')}. The script MUST acknowledge this day naturally (not a forced hashtag dump) and connect it to the brand promise.`
  :slot.event?`SPECIAL EVENT TODAY: ${slot.event}. Script must use it.`:'No festival today — lean on weekday/weekend reality for this audience.';
 return [
  `THIS DAY ONLY — slot ${index+1}/${total}.`,
  `Date: ${slot.date||'unscheduled'}${weekday?` (${weekday})`:''} · ${slot.time||'18:30'} IST.`,
  `Platform: ${slot.platform||'Instagram'} · Format: ${slot.format||'Post'}.`,
  slot.topic?`Calendar topic: ${slot.topic}`:`Theme from monthly goal: ${inputs.goal||'brand awareness'}.`,
  eventNote,
  inputs.offer&&inputs.offer.toLowerCase()!=='no offer'?`Offer allowed: ${inputs.offer}`:'No offer — do not invent a discount or price.',
  'Write only for this day. Do not batch other dates into this draft.',
  'Make it feel lived-in: specific parent/customer moment, sensory detail, and a clear next step — not a brochure paragraph.',
  'Opening line must earn hookscore: SPECIFICITY (number or place/brand name) + STAKES (don\'t/never/stop/still/without/before…) + ADDRESS (you/your or Don\'t/Stop) + FRONTLOAD in first 1–4 words. Soft brochure openers are not acceptable.',
  'COMPLETE ARC: hook promise must be paid off in the middle beats. State the actual question / list / better move on-screen. CTA comes last, after the payoff — never instead of it.',
 ].join('\n');
}

/**
 * Spread posts/reels/carousels across the selected date range.
 * Prefer pinning special-event days when present.
 */
export function buildSlots(inputs,{region='Karnataka',now=new Date()}={}){
 const window=remainingDays(inputs.month,now,{from_date:inputs.from_date,to_date:inputs.to_date});
 if(!window.days.length)throw Object.assign(new Error('No days left in that date range to plan'),{status:400});
 const events=eventsForMonth(region,inputs.month).filter(e=>window.days.includes(e.date));
 const eventByDate=new Map(events.map(e=>[e.date,e.name]));
 // Mix formats across the calendar (Post / Reel / Carousel), never dump all of one type first.
 const kinds=interleaveKinds(inputs.posts,inputs.reels,inputs.carousels);
 const days=[...window.days];
 // Prefer event days first in the placement order, then the rest chronologically.
 const preferred=[...days].sort((a,b)=>{
  const ae=eventByDate.has(a)?0:1,be=eventByDate.has(b)?0:1;
  return ae-be||a.localeCompare(b);
 });
 const n=Math.max(kinds.length,1);
 return kinds.map((k,i)=>{
  const day=preferred[Math.min(preferred.length-1,Math.floor(i*(preferred.length)/n))]||preferred[preferred.length-1];
  const event=eventByDate.get(day)||'';
  return {
   date:day,time:'18:30',format:k.format,platform:k.platform,visual:k.visual,
   topic:event?`${event} · ${inputs.goal||'brand moment'}`.slice(0,120):'',
   event:event||undefined,status:'idea',
  };
 }).sort((a,b)=>a.date.localeCompare(b.date)||String(a.time).localeCompare(String(b.time)));
}

/** Fair mix of formats so the calendar never reads as "all posts, then all reels, then carousels". */
export function interleaveKinds(posts=0,reels=0,carousels=0){
 const groups=[
  Array.from({length:posts},()=>({format:'Post',visual:'image',platform:'Instagram'})),
  Array.from({length:reels},()=>({format:'Reel',visual:'video',platform:'Instagram'})),
  Array.from({length:carousels},()=>({format:'Carousel',visual:'carousel',platform:'Instagram'})),
 ];
 const total=groups.reduce((a,g)=>a+g.length,0);
 const out=[];
 const cursors=[0,0,0];
 for(let n=0;n<total;n++){
  let best=-1,bestScore=-Infinity;
  for(let i=0;i<groups.length;i++){
   if(cursors[i]>=groups[i].length)continue;
   const ideal=(n+1)*(groups[i].length/total);
   const score=ideal-cursors[i];
   if(score>bestScore){bestScore=score;best=i;}
  }
  out.push(groups[best][cursors[best]++]);
 }
 return out;
}

export function visualFor(format){
 if(/reel|video/i.test(format||''))return {type:'video',format:'reel'};
 if(/carousel/i.test(format||''))return {type:'carousel',format:'portrait'};
 return {type:'image',format:'portrait'};
}

export function contentSkill(format){
 if(/reel|video/i.test(format||''))return 'reel-scripter,video-script,on-screen-text-writer,cta-writer';
 if(/carousel/i.test(format||''))return 'carousel-builder,on-screen-text-writer,cta-writer';
 return 'caption-and-hashtags,cta-writer,check';
}

/** True when a day script actually delivers a middle payoff, not just hook + CTA. */
export function isCompleteDayScript(hook={}){
 const script=String(hook.script||'');
 const ost=(hook.on_screen_text||[]).map(String).join(' ');
 const blob=`${script}\n${ost}`.toLowerCase();
 if(script.trim().length<80)return false;
 const hasBeats=/\[[^\]]*\d/.test(script)||script.split(/\n/).filter(Boolean).length>=3;
 const payoffCue=/(who('|’)s|who is|ask |question:|one:|two:|three:|don('|’)t |never |instead |here('|’)s |the answer|save this:)/i.test(blob);
 const notJustHook=blob.replace(String(hook.text||'').toLowerCase(),'').trim().length>40;
 return hasBeats&&payoffCue&&notJustHook;
}

/** Normalize Idea hooks into 3 scored day-script options. */
export function normalizeDayScripts(hooks=[],{format='Post',topic='',voiceName=''}={}){
 const clean=s=>String(s||'').replace(/\[[^\]]+\]/g,' ').replace(/\s+/g,' ').trim();
 const list=(Array.isArray(hooks)?hooks:[]).slice(0,3).map((h,i)=>{
  const text=clean(h.text||h.hook||'')||`Option ${i+1}`;
  const script=clean(h.script)||[
   `[0–3s] ${text}`,
   `[3–10s] Lived setup — name the moment (commute, 3pm, dinner, visit).`,
   `[10–18s] PAYOFF — deliver the promised question / list / better move in plain words.`,
   `[18–25s] One clear CTA — visit, WhatsApp, or save — after the payoff, never instead of it.`,
  ].join('\n');
  const on_screen=Array.isArray(h.on_screen_text)?h.on_screen_text.map(clean).filter(Boolean).slice(0,5):[text,'The actual tip / question','WhatsApp to visit'];
  const score=Number.isFinite(Number(h.score))?Math.max(0,Math.min(100,Math.round(Number(h.score)))):null;
  return {
   text,script,score,
   formula:String(h.formula||'Stop-scroll + payoff').slice(0,80),
   rationale:clean(h.rationale||h.explanation)||'Specific to this day, audience and format.',
   explanation:clean(h.explanation||h.rationale)||'Why this angle wins today for this audience.',
   caption:clean(h.caption)||`${text}\n\nSave this if it helps. Reply when you are ready to talk.`,
   cta:clean(h.cta)||'Message us on WhatsApp',
   on_screen_text:on_screen.length?on_screen:[text],
   claude_prompt:clean(h.claude_prompt)||`Create a ${format} visual for: "${text}". Topic: ${topic||'brand story'}. Show the PAYOFF on screen (the real tip/question/list), not only the hook. Brand colours. No invented prices. Vertical if reel.`,
   elevenlabs_prompt:clean(h.elevenlabs_prompt)||`Narrate this ${format} script in a warm, clear ${voiceName||'local'} voice. Natural pauses. Deliver the payoff clearly before the CTA.\n\nSCRIPT:\n${script}`,
   verdict:h.verdict||null,weakest:h.weakest||null,score_checks:h.score_checks||null,score_flags:h.score_flags||[],scored_by:h.scored_by||null,
  };
 });
 while(list.length<3){
  const i=list.length;
  const text=`Don't skip this ${topic||'today'} check`;
  const script=`[0–3s] ${text}\n[3–10s] Name the lived moment.\n[10–18s] PAYOFF — state the concrete tip or question.\n[18–25s] Clear next step — no invented price.`;
  list.push({
   text,script,score:null,formula:'Fresh angle',rationale:'Fills a missing option so every day still has three choices.',
   explanation:'Generated filler so the day always offers three unique picks — score left for hookscore.',caption:`${text}\n\nReply when ready.`,cta:'Message us',
   on_screen_text:[text,'Concrete tip here','Talk to us'],
   claude_prompt:`Create a ${format} visual for: "${text}". Topic: ${topic||'brand story'}. Show the payoff on screen. Brand colours. No invented prices.`,
   elevenlabs_prompt:`Narrate clearly. Deliver the payoff before the CTA.\n\nSCRIPT:\n${script}`,
   verdict:null,weakest:null,score_checks:null,score_flags:[],scored_by:null,
  });
 }
 return list.slice(0,3);
}
