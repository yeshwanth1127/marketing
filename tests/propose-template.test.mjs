import assert from 'node:assert/strict';
import test from 'node:test';
import {proposeDesignTemplate,multicolourTheme,shouldUseMulticolour} from '../core/design/propose-template.mjs';

test('multicolourTheme keeps paper light and spreads vivid hues into support',()=>{
 const theme=multicolourTheme(['#0844f7','#ff6161','#41ef34','#f8c808','#ffffff','#111111']);
 assert.ok(theme.mode==='multicolour');
 // Paper must not be a saturated logo hue
 assert.ok(theme.paper==='#ffffff'||theme.paper.startsWith('#fff')||theme.paper==='#fff8ef');
 assert.match(theme.ink,/^#[0-9a-f]{6}$/i);
 assert.ok(theme.support.length>=2);
 assert.equal(shouldUseMulticolour({vibe:'playful kids',extracted:['#0844f7','#ff6161','#41ef34']}),true);
});

test('proposeDesignTemplate drafts editable theme fields from vibe',async()=>{
 const draft=await proposeDesignTemplate({name:'Sun Kids',brand_name:'Sun Kids',industry:'Education',city:'Bengaluru'},{
  title:'logo base',
  vibe:'Warm playful kids brand for parents — soft light, friendly type',
  audience:'Parents of school-age kids',
  use_brand_colors:true,
  multicolour:true,
  brand:{colors:['#fff8e7','#1a1a1a','#f8c808','#0844f7','#41ef34'],profile:{colors:{paper:'#fff8e7',ink:'#1a1a1a',accent:'#f8c808'},type:{display:{font:'fraunces'},body:{font:'instrument-sans'}}}},
 });
 assert.ok(draft.title);
 assert.match(draft.data.colors.paper,/^#[0-9a-f]{6}$/i);
 assert.match(draft.data.colors.ink,/^#[0-9a-f]{6}$/i);
 assert.match(draft.data.colors.accent,/^#[0-9a-f]{6}$/i);
 assert.equal(draft.data.mode,'multicolour');
 assert.ok(Array.isArray(draft.data.colors.support));
 assert.ok(draft.data.fonts.heading);
 assert.ok(draft.data.fonts.body);
 assert.ok(draft.data.direction.length>40);
 assert.ok(draft.data.rules.includes('\n')||draft.data.rules.length>10);
 assert.ok(draft.data.avoid.length>10);
 assert.equal(draft.data.fonts.heading,'fraunces');
});
