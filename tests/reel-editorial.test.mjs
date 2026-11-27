import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRail,designFromAsset,validateDesign,applyPatch} from '../core/video/design.mjs';
import {designToHtml} from '../core/video/render-html.mjs';
import {beatKey,fileIdsIn} from '../core/video/pipeline.mjs';

const art=[{d:'M15 20 L180 20 L160 175 Z',fill:'#468552'}];
const image='23fa6ca1-becc-4a9c-bfa3-a516625fefd9';
for(const [industry,title] of [['Restaurant','The lunch menu'],['SaaS','Review the dashboard'],['Fitness','Plan your next session'],['Real estate','Walk through the plan'],['Education','Explore the lesson'],['Dental','Plan your visit']]){
 test(industry+' retains its own content and one replaceable visual',()=>{
  const {design}=designFromAsset({id:'test',title,data:{format:'reel',script:title,on_screen_text:[title]}});
  const plan={concepts:[{name:title,captions:[title],scenes:[title,'Take a closer look','Find out more']}],art,skills:[],runId:'fixture'};
  const reel=applyRail(design,plan,0,{brand:industry});assert.deepEqual(validateDesign(reel),[]);
  assert.equal(reel.beats.reduce((n,b)=>n+b.duration,0),15);
  const html=designToHtml(reel);assert.ok(html.includes(title));assert.ok(!/waistband|shorts|size tag/i.test(html));assert.equal(html,designToHtml(reel));
  const edit=applyPatch(reel,[{op:'replace',path:'/layout/rail/caption',value:'Your next step'},{op:'replace',path:'/layout/rail/file_id',value:image}]);
  assert.deepEqual(fileIdsIn(edit),[image]);assert.notEqual(beatKey(reel,0),beatKey(edit,0));
  for(let i=0;i<edit.beats.length;i++){const frame=designToHtml(edit,{only:i,mode:'render'});assert.ok(frame.includes(image));if(i===0)assert.ok(frame.includes('Your next step'));}
  assert.ok(!designToHtml(design).includes('class="product-lane"'));
 });
}
import {buildRailPrompt} from '../core/video/rail-concepts.mjs';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('planner injects the actual local skills, their hashes and the supplied brief',async()=>{
 const brief={industry:'Dental',title:'Plan your visit',cta:'Book a visit'};
 const {prompt,receipts}=await buildRailPrompt(brief);
 assert.deepEqual(receipts.map(r=>r.name),['cover-thumbnail-brief','motion-doctrine','exora-design-system']);
 for(const receipt of receipts){
  const material=await fs.readFile(new URL('../modules/06-design-video/skills/'+receipt.name+'/SKILL.md',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(material).digest('hex'),receipt.sha256);
  assert.ok(prompt.includes(material));
 }
 assert.ok(prompt.endsWith(JSON.stringify(brief)));
});
