import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT,q,id,fail} from '../db/index.mjs';
import {contextRecords} from '../clients/tree.mjs';

const exec=promisify(execFile);

export const PACKAGES={
 starter:{id:'starter',label:'Starter',posts:12,reels:4,carousels:2,ads:3,seo:false,channels:['Instagram']},
 growth:{id:'growth',label:'Growth',posts:12,reels:6,carousels:4,ads:4,seo:true,channels:['Instagram','Google Ads','SEO']},
 content:{id:'content',label:'Content only',posts:12,reels:4,carousels:2,ads:0,seo:false,channels:['Instagram']},
};

export function questionnaireText(client){
 return `Hi ${client.name} team — EXORA here. To start your marketing, please reply with:

1) Main services / products (one per line)
2) Price range and any current offer (only if real)
3) Who buys from you most?
4) City / areas you serve
5) Instagram + website links
6) Who approves posts from your side? (name)
7) Anything we should never say?

Please also send: logo, brand guide or deck, 5–10 past posts, and a price list / menu if you have one.`;
}

export function parseQuestionnaire(text){
 const raw=String(text||'').trim().slice(0,8000);
 if(!raw)fail('Paste the client’s reply');
 const approval=(raw.match(/approv\w*[:\-–]\s*([^\n]+)/i)||[])[1]?.trim()||'';
 const never=(raw.match(/never say[:\-–]\s*([^\n]+)/i)||[])[1]?.trim()||'';
 return {questionnaire:raw,approval_contact:approval.slice(0,200),banned_hint:never.slice(0,500)};
}

export async function readyCheck(client){
 const records=await contextRecords(client);
 const pkg=client.settings?.package||null;
 const strategy=records.find(r=>r.kind==='Strategy');
 const items=[
  {key:'company',label:'Company details',ok:!!(client.name&&client.industry&&client.city),detail:[client.name,client.industry,client.city].filter(Boolean).join(' · ')},
  {key:'questionnaire',label:'Client answers',ok:!!client.data?.questionnaire,detail:client.data?.approval_contact?('Approver: '+client.data.approval_contact):'Paste the WhatsApp reply'},
  {key:'brand',label:'Brand kit',ok:records.some(r=>r.kind==='BrandKit'),detail:records.find(r=>r.kind==='BrandKit')?.title||'Upload logo / guide and confirm'},
  {key:'offer',label:'Offer or “no offer”',ok:!!(client.data?.brief?.offer||client.data?.questionnaire),detail:client.data?.brief?.offer||'Stated in questionnaire or product brief'},
  {key:'approver',label:'Who approves posts',ok:!!client.data?.approval_contact,detail:client.data?.approval_contact||'Missing'},
  {key:'package',label:'Monthly package',ok:!!pkg,detail:pkg?`${pkg.label||pkg.id}: ${pkg.posts} posts · ${pkg.reels} reels · ${pkg.carousels} carousels`:'Pick Starter, Growth or Content only'},
  {key:'strategy',label:'Strategy direction',ok:!!(strategy&&(strategy.status==='approved'||strategy.data?.validation_status==='confirmed')),detail:strategy?(strategy.status+(strategy.data?.validation_status?' · '+strategy.data.validation_status:'')):'Draft and confirm strategy first'},
 ];
 const ready=items.filter(i=>i.ok).length;
 return {items,ready,total:items.length,pct:Math.round(ready/items.length*100),canProduce:items.filter(i=>['company','brand','strategy'].includes(i.key)).every(i=>i.ok),package:pkg};
}

export function applyPackage(settings,id){
 const pkg=PACKAGES[id];
 if(!pkg)fail('Unknown package');
 return {...settings,package:{...pkg}};
}

function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}

export async function buildMonthPack(client,jobId){
 const records=(await q('SELECT * FROM records WHERE client_id=$1 ORDER BY created_at',[client.id])).rows;
 const tagged=jobId?records.filter(r=>r.data?.month_job===jobId):records;
 const campaign=tagged.find(r=>r.kind==='Campaign')||records.find(r=>r.kind==='Campaign');
 const ideas=tagged.filter(r=>r.kind==='Idea');
 const copies=tagged.filter(r=>r.kind==='Asset'&&(r.data?.type||'copy')==='copy');
 const visuals=tagged.filter(r=>r.kind==='Asset'&&r.data?.type&&r.data.type!=='copy');
 const ads=tagged.filter(r=>r.kind==='Ad');
 const seo=tagged.find(r=>r.kind==='Report'&&r.data?.track==='seo')||tagged.find(r=>r.kind==='Report');
 const dir=path.join(ROOT,'.local','packs',jobId||client.id);
 fs.mkdirSync(path.join(dir,'images'),{recursive:true});
 fs.mkdirSync(path.join(dir,'reels'),{recursive:true});
 const captions=copies.map(a=>`## ${a.title}\n\n${a.data.caption||a.data.script||''}\n\nCTA: ${a.data.cta||''}\n`).join('\n---\n\n');
 fs.writeFileSync(path.join(dir,'captions.txt'),captions||'No captions yet.\n');
 const cal=['date,platform,format,topic,caption,utm'];
 for(const s of campaign?.data?.slots||[]){
  const copy=copies.find(a=>a.data?.slot_date===s.date)||copies.find(a=>a.title.includes(s.topic||''));
  cal.push([s.date,s.platform,s.format,s.topic,String(copy?.data?.caption||'').replaceAll('\n',' '),campaign?.data?.utm?.campaign||''].map(csvEscape).join(','));
 }
 fs.writeFileSync(path.join(dir,'calendar.csv'),cal.join('\n')+'\n');
 const adsRows=['platform,title,budget,audience,status'];
 for(const a of ads)adsRows.push([a.data.platform,a.title,a.data.budget,a.data.audience,a.status].map(csvEscape).join(','));
 fs.writeFileSync(path.join(dir,'ads-launch-sheet.csv'),adsRows.join('\n')+'\n');
 fs.writeFileSync(path.join(dir,'seo-checklist.md'),'# SEO pack\n\n'+(seo?.data?.body||'No SEO pack in this run.')+'\n');
 const hooks=['slot,chosen,score,text'];
 for(const idea of ideas){
  const i=idea.data?.selected_hook||0,h=idea.data?.hooks?.[i]||{};
  hooks.push([idea.title,i+1,h.score??'',h.text||''].map(csvEscape).join(','));
 }
 fs.writeFileSync(path.join(dir,'hooks.csv'),hooks.join('\n')+'\n');
 const filesRoot=path.join(ROOT,'.local');
 for(const v of visuals){
  for(const f of v.data?.files||[]){
   const src=path.join(filesRoot,f.storage_path||'');
   if(!src.startsWith(filesRoot+path.sep)||!fs.existsSync(src))continue;
   const dest=path.join(dir,v.data.type==='video'?'reels':'images',f.name||path.basename(src));
   fs.copyFileSync(src,dest);
  }
 }
 const zip=path.join(dir,'..',`${(client.name||'client').replace(/[^a-zA-Z0-9]+/g,'-')}-month-pack.zip`);
 try{await exec('zip',['-qr',zip,'.'],{cwd:dir,timeout:30000});}catch{/* zip optional on some hosts */}
 return {dir,zip:fs.existsSync(zip)?zip:null,files:fs.readdirSync(dir,{recursive:true}).filter(n=>typeof n==='string')};
}
