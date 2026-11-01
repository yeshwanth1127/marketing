// Digital Marketing Pro adapter: its scripts read a brand profile from
// $CLAUDE_MARKETING_HOME/brands/<slug>/profile.json. We create that profile with DMP's own
// setup.py (so the schema is theirs), then fill it from our records.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// Persistent per-client DMP home: stateful DMP scripts (guidelines, team, quality history, insights) keep
// their files between runs here. Profile and evidence are refreshed from our records on every run.
export const dmpHome=clientId=>path.join(ROOT,'.local/dmp',String(clientId).replace(/[^a-zA-Z0-9-]/g,''));

export const slugify=s=>String(s||'brand').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'brand';
const REGULATED=/dental|clinic|hospital|health|medical|pharma|doctor|ayurved|wellness|finance|bank|loan|insurance|invest|education|school|coaching|real estate|property|food|nutrition/i;
const list=v=>Array.isArray(v)?v.filter(Boolean).map(String):typeof v==='string'&&v.trim()?v.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean):[];

export function prepareDmp(box,scriptsDir,python,env,ctx,{persist=false}={}){
 const home=persist?dmpHome(ctx.client.id):path.join(box,'cm');fs.mkdirSync(home,{recursive:true});
 const client=ctx.client,records=ctx.records||[];
 const latest=k=>records.find(r=>r.kind===k)?.data||{};
 const brand=latest('BrandKit'),strategy=latest('Strategy');
 const slug='c-'+String(client.id).replace(/[^a-f0-9]/gi,'').slice(0,20);
 const r=spawnSync(python,['-I',path.join(scriptsDir,'setup.py'),'--create-brand',client.brand_name||client.name,'--slug',slug],{cwd:box,env:{...env,CLAUDE_MARKETING_HOME:home},encoding:'utf8',timeout:30000});
 const profilePath=path.join(home,'brands',slug,'profile.json');
 if(!fs.existsSync(profilePath))throw new Error('DMP brand setup failed: '+(r.stdout+r.stderr).slice(-400));
 const p=JSON.parse(fs.readFileSync(profilePath,'utf8'));
 p.identity.positioning_statement=strategy.positioning||'';
 p.identity.unique_selling_proposition=strategy.offer||'';
 p.industry.primary=client.industry||'';
 p.industry.regulated=REGULATED.test(client.industry||'');
 p.industry.compliance_notes=brand.disclaimers||'';
 p.target_markets=[client.city,'India'].filter(Boolean);
 p.brand_voice.tone_keywords=list(brand.voice).slice(0,12);
 p.brand_voice.avoid_words=list(brand.banned_words);
 p.brand_voice.prefer_words=list(brand.preferred_words);
 p.brand_voice.sample_content=list(brand.sample_content).slice(0,10);
 p.channels.active=list(strategy.channels);
 p.goals.primary_objective=strategy.objective||'';
 p.goals.kpis=list(strategy.kpis);
 const langs=list(client.languages);
 p.language.primary_language=langs[0]||'English';
 p.language.content_languages=langs;
 p.language.do_not_translate=[...new Set([client.brand_name||client.name,client.name])];
 p.updated_at=new Date().toISOString();
 fs.writeFileSync(profilePath,JSON.stringify(p,null,2));
 // Evidence for claim checks: only items the team recorded (BrandKit.evidence), never invented.
 const evidence=(Array.isArray(brand.evidence)?brand.evidence:[]).filter(e=>e&&e.claim).map(e=>({claim:String(e.claim),source:String(e.source||''),date:e.date||'',verified:e.verified===true}));
 const evidenceFile=path.join(box,'evidence.json');
 fs.writeFileSync(evidenceFile,JSON.stringify({evidence}));
 return {home,slug,evidenceFile,evidenceCount:evidence.length};
}
