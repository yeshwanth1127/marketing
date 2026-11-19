import {test} from 'node:test';import assert from 'node:assert/strict';
import {remainingDays,buildSlots,monthInputs,normalizeDayScripts,daySlotBrief,eventsForMonth,interleaveKinds,isCompleteDayScript} from '../core/agent/month-fields.mjs';

test('remaining days for current month start today',()=>{
 const now=new Date('2026-11-17T08:00:00Z');
 const w=remainingDays('2026-11',now);
 assert.equal(w.start,17);
 assert.equal(w.days[0],'2026-11-17');
 assert.equal(w.days.at(-1),'2026-11-30');
 assert.equal(w.days.length,14);
});

test('future month starts on day 1',()=>{
 const w=remainingDays('2026-12',new Date('2026-11-17T08:00:00Z'));
 assert.equal(w.start,1);
 assert.equal(w.days[0],'2026-12-01');
});

test('date range clamps produce window',()=>{
 const now=new Date('2026-11-17T08:00:00Z');
 const inputs=monthInputs({month:'2026-11',goal:'Visits',offer:'No offer',posts:1,reels:1,carousels:0,ads:0,budget:0,from_date:'2026-11-18',to_date:'2026-11-19'},now);
 assert.equal(inputs.from_date,'2026-11-18');
 assert.equal(inputs.to_date,'2026-11-19');
 assert.equal(inputs.remaining_days,2);
 const slots=buildSlots(inputs,{region:'Karnataka',now});
 assert.equal(slots.length,2);
 assert.ok(slots.every(s=>s.date>='2026-11-18'&&s.date<='2026-11-19'));
});

test('buildSlots only uses remaining days and prefers events',()=>{
 const now=new Date('2026-11-17T08:00:00Z');
 const inputs=monthInputs({month:'2026-11',goal:'Centre visits',offer:'No offer',posts:4,reels:2,carousels:0,ads:0,budget:0},now);
 const slots=buildSlots(inputs,{region:'Karnataka',now});
 assert.ok(slots.every(s=>s.date>='2026-11-17'&&s.date<='2026-11-30'));
 assert.equal(slots.length,6);
 assert.ok(!slots.some(s=>s.date<'2026-11-17'));
});

test('isCompleteDayScript requires a delivered payoff',()=>{
 assert.equal(isCompleteDayScript({text:'Save this one question',script:'[0–3s] Save this one question\n[20s] Logo',on_screen_text:['Save this']}),false);
 assert.equal(isCompleteDayScript({
  text:"Stop guessing at 3pm — ask who's with your child",
  script:`[0–3s] Stop guessing at 3pm — ask who's with your child.\n[3–8s] You're in a meeting.\n[8–16s] PAYOFF: ask who is with my child all day.\n[16–25s] Visit us.`,
  on_screen_text:['Stop guessing at 3pm',"Ask: who's with my child all day?",'Visit'],
 }),true);
});

test('normalizeDayScripts fills three complete options with prompts',()=>{
 const hooks=normalizeDayScripts([{text:'Ask this first',score:88,script:'[0–3s] Ask this first\n[3–12s] Show proof.'}],{format:'Reel',topic:'Visit day',voiceName:'Calm narrator'});
 assert.equal(hooks.length,3);
 assert.ok(hooks[0].script.includes('Ask this first'));
 assert.ok(hooks[0].claude_prompt);
 assert.ok(hooks[0].elevenlabs_prompt.includes('SCRIPT'));
 assert.equal(hooks[0].score,88);
});

test('day brief mentions special events',()=>{
 const events=[{date:'2026-11-24',name:'Guru Nanak Jayanti'}];
 const brief=daySlotBrief({goal:'Visits',offer:'No offer'},{date:'2026-11-24',format:'Reel',topic:'Festival'},0,1,events);
 assert.match(brief,/Guru Nanak Jayanti/);
 assert.match(brief,/SPECIAL EVENT/);
});

test('eventsForMonth returns November festivals',()=>{
 const events=eventsForMonth('Karnataka','2026-11');
 assert.ok(events.some(e=>e.name.includes('Children')));
});

test('interleaveKinds mixes formats instead of blocking by type',()=>{
 const kinds=interleaveKinds(12,6,4);
 assert.equal(kinds.length,22);
 assert.equal(kinds.filter(k=>k.format==='Post').length,12);
 assert.equal(kinds.filter(k=>k.format==='Reel').length,6);
 assert.equal(kinds.filter(k=>k.format==='Carousel').length,4);
 const firstEight=kinds.slice(0,8).map(k=>k.format);
 assert.ok(firstEight.includes('Reel')||firstEight.includes('Carousel'),'early slots must include non-Post formats: '+firstEight.join(','));
 assert.ok(new Set(firstEight).size>=2,'first eight must mix at least two formats');
 // Must not be all Posts then all Reels then all Carousels
 const blocked=kinds.every((k,i)=>i===0||k.format===kinds[i-1].format||kinds.slice(0,i).every(x=>x.format===kinds[0].format)||false);
 const runs=[];let run=1;
 for(let i=1;i<kinds.length;i++){if(kinds[i].format===kinds[i-1].format)run++;else{runs.push(run);run=1;}}
 runs.push(run);
 assert.ok(Math.max(...runs)<12,'longest same-format run should be well under the full Post count');
});
