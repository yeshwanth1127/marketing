import fs from 'node:fs';import path from 'node:path';import {ROOT} from '../core/db/index.mjs';
const inv=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/vendor-inventory.json'),'utf8'));
const specs=[
['01-onboard','Onboard','Client foundations','Client,BrandKit','BrandKit',false,'brand-setup,client-onboarding,region-config,language-config'],
['02-strategy','Strategy','Find the direction','Client,BrandKit,Learning','Strategy',false,'growth-plan,positioning-audit,offers'],
['03-plan','Plan','Make every slot count','Client,BrandKit,Strategy,Learning','Campaign',false,'campaign-plan,content-calendar,utm-campaign-plan'],
['04-hooks','Ideas & hooks','Earn the first three seconds','Client,BrandKit,Strategy,Campaign,Learning','Idea',false,'viral-hook-writer,ig-reel,ab-hook-tester'],
['05-content','Content','Words that move people','Client,BrandKit,Strategy,Campaign,Idea','Asset',false,'reel-scripter,on-screen-text-writer,caption-and-hashtags,cta-writer,check,verify-claims'],
['06-design-video','Design & video','Bring the brand to life','Client,BrandKit,Campaign,Asset','Asset',false,'motion-doctrine,ad-creative,hyperframes,captions-overlay'],
['07-approve','Approvals','A human behind every decision','Client,Asset,Strategy,Post,Ad','Approval',true,''],
['08-publish','Publish','The right moment, everywhere','Client,Asset,Approval','Post,Ad',true,'schedule-social'],
['09-results','Results','Turn results into the next advantage','Client,Campaign,Post,Ad,Metric','Report,Learning',false,'performance-report,social-analytics-report,continuous-improvement-loop'],
['seo','SEO & local','Be found where it matters','Client,BrandKit,Strategy,Metric','Report,Task',false,'seo-plan,local-seo,tech-seo-audit'],
['geo','AI search','Show up in the answers','Client,BrandKit,Strategy,Metric','Report,Task',false,'aeo-audit,entity-audit,ai-seo'],
['ads','Paid media','Make every rupee accountable','Client,BrandKit,Strategy,Campaign,Metric','Campaign',false,'paid-advertising,paid-social-brief,budget-tracker'],
['influencers','Influencers','The right voices for your brand','Client,BrandKit,Strategy,Campaign','Asset',false,'influencer-partnerships,ugc-creator-brief,influencer-brief'],
['managing','Team & clients','Keep the work moving','Client,Campaign,Task','Task,Report',false,'team-assign,status,exec-summary']];
const catalog=[];
for(const [key,name,tagline,reads,writes,approval,defaults] of specs){const group=/^\d/.test(key)?'modules':'tracks',dir=path.join(ROOT,group,key);for(const child of ['skills','screen'])fs.mkdirSync(path.join(dir,child),{recursive:true});const selected=[];
for(const sk of inv.module_mapping[key]||[]){if(['ig-story','ig-repurpose','ig-carousel'].includes(sk.name))continue;const source=path.join(ROOT,'vendor',sk.path),dest=path.join(dir,'skills',sk.name);fs.mkdirSync(dest,{recursive:true});if(sk.kind==='skill'){const sourceDir=path.dirname(source);fs.cpSync(sourceDir,dest,{recursive:true,filter:(s)=>!s.split(path.sep).some(x=>['.git','node_modules','.venv','dist'].includes(x))});const content=fs.readFileSync(path.join(dest,'SKILL.md'),'utf8');fs.writeFileSync(path.join(dest,'SKILL.md'),content+'\n\n<!-- EXORA source: vendor/'+sk.path+'; original preserved in vendor/ -->\n');}else{fs.writeFileSync(path.join(dest,'SKILL.md'),'---\nname: '+sk.name+'\ndescription: Paid-media specialist role\n---\n\n'+fs.readFileSync(source,'utf8')+'\n<!-- Source: vendor/'+sk.path+' -->');}selected.push({name:sk.name,source:sk.source,path:sk.path});}
fs.writeFileSync(path.join(dir,'io.yaml'),`reads: [${reads}]\nwrites: [${writes}]\napproval_required: ${approval}\n`);
if(!fs.existsSync(path.join(dir,'tools.yaml')))fs.writeFileSync(path.join(dir,'tools.yaml'),`tools: []\n# External connectors are deferred. No network, shell or SQL tool is exposed to the model.\nservices: [${key==='06-design-video'?'renderer':key==='08-publish'?'approval-queue':'record-store'}]\n`);
fs.writeFileSync(path.join(dir,'screen','index.tsx'),`export { default } from '../../../web/components/Workspace';\nexport const moduleKey = '${key}';\n`);
if(!selected.length)fs.writeFileSync(path.join(dir,'skills','.gitkeep'),'');
catalog.push({key,name,tagline,group,reads:reads.split(','),writes:writes.split(','),approval_required:approval,defaults:defaults.split(',').filter(Boolean),skills:selected});}
fs.writeFileSync(path.join(ROOT,'core/runtime/catalog.json'),JSON.stringify(catalog,null,2));console.log('14 module contracts created, primary skills copied with source attribution.');process.exit(0);
