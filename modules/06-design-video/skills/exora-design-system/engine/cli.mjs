#!/usr/bin/env node
// Used inside Claude's design folder:
//   node skills/exora-design-system/engine/cli.mjs list
//   node skills/exora-design-system/engine/cli.mjs <layout> <slots.json> [format]
// Reads brand.json (full brand profile) and fonts/catalog.json; writes slides/slide-N.html as a starting
// point that Claude then refines by hand.
import fs from 'node:fs';import path from 'node:path';import {compose,describe,lintSlots} from './index.mjs';
const [cmd,slotsFile,fmt]=process.argv.slice(2);
if(!cmd||cmd==='list'){console.log(JSON.stringify(describe(),null,1));process.exit(0);}
const brand=JSON.parse(fs.readFileSync('brand.json','utf8'));const profile=brand.profile_full||brand;
const catalog=JSON.parse(fs.readFileSync('fonts/catalog.json','utf8'));
const copy=fs.existsSync('copy.json')?JSON.parse(fs.readFileSync('copy.json','utf8')):{};
const slots=JSON.parse(fs.readFileSync(slotsFile,'utf8'));
// Hard rules (campaign layout): fix every "error" in slots.json before going further. The engine still writes the slides so you can see them.
const rules=lintSlots({layout:cmd,slots});
if(rules.length){console.error(JSON.stringify({rule_check:rules,next:rules.some(r=>r.severity==='error')?'Fix the errors in slots.json and run this again.':'Warnings only.'},null,1));}
const html=compose({layout:cmd,slots,profile,catalog,format:fmt||copy.format||'portrait',fontBase:'../fonts',logoBase:'../'});
fs.mkdirSync('slides',{recursive:true});for(const f of fs.readdirSync('slides'))if(/^slide-\d+\.html$/.test(f))fs.unlinkSync(path.join('slides',f));
html.forEach((h,i)=>fs.writeFileSync(`slides/slide-${i+1}.html`,h));
console.log(JSON.stringify({layout:cmd,frames:html.length,written:html.map((_,i)=>`slides/slide-${i+1}.html`)}));
