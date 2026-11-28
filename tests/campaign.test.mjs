// Studio campaign posts: the layout, its hard rules, product-image handling and the rendered-page checks.
import {test,after} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';import crypto from 'node:crypto';
import {chromium} from 'playwright';
import {handle,perform} from '../core/api.mjs';import {q,pool,ROOT} from '../core/db/index.mjs';
import {compose,profileFor,catalog,LAYOUTS,isProductPost,defaultLayout,templateFrames} from '../core/design/brand-profile.mjs';
import {lintSlots} from '../modules/06-design-video/skills/exora-design-system/engine/index.mjs';
import {cornerLabels} from '../modules/06-design-video/skills/exora-design-system/engine/layouts/index.mjs';
import {pageChecks,MARGIN,CANVAS} from '../core/design/checks.mjs';
import {pathToFileURL} from 'node:url';
import {chromePath,absolutize} from '../core/design/compose.mjs';
import {imageInfo,productImagesFor,manifestOf} from '../core/design/product-images.mjs';
after(async()=>pool.end());

const read=f=>JSON.parse(fs.readFileSync(new URL('../exora/brand-profiles/test/'+f+'.json',import.meta.url),'utf8'));
const samples=JSON.parse(fs.readFileSync(new URL('../exora/design-system/samples.json',import.meta.url),'utf8'));
const fashion=profileFor(read('ruh-atelier'),{name:'Ruh'});
const GOOD={headline:'Skip the polo',support:'Three pieces that carry a wedding function without trying.',labels:['Limited release','June 2026','Never basic','Shop now']};
const errors=l=>l.filter(x=>x.severity==='error').map(x=>x.type);

// A real PNG, built here, so the tests need no binary fixtures. rgba=true gives an alpha channel.
function png(w,h,{rgba=false,trns=false}={}){
 const bpp=rgba?4:3,raw=Buffer.alloc((w*bpp+1)*h);
 for(let y=0;y<h;y++){raw[y*(w*bpp+1)]=0;for(let x=0;x<w;x++){const o=y*(w*bpp+1)+1+x*bpp;raw[o]=170+x%40;raw[o+1]=165+y%40;raw[o+2]=160;if(rgba)raw[o+3]=(x>w/4&&x<3*w/4&&y>h/5)?255:0;}}
 const crcT=[...Array(256)].map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=b=>{let c=0xffffffff;for(const v of b)c=crcT[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t,'latin1'),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=rgba?6:2;
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),...(trns?[chunk('tRNS',Buffer.from([0,0,0,0,0,0]))]:[]),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

// ---- the rules of the brief, in code ----
test('a clean campaign passes its rule check; every banned thing is caught',()=>{
 assert.deepEqual(lintSlots({layout:'campaign',slots:GOOD}),[]);
 const bad=s=>errors(lintSlots({layout:'campaign',slots:{...GOOD,...s}}));
 assert.ok(bad({headline:'Elevate your wedding wardrobe today'}).includes('filler_phrase'));
 for(const w of ['Unlock','Seamless','Game-changer','Level up','Effortless','Curated','Redefine']){assert.ok(bad({support:w+' your look.'}).includes('filler_phrase'),w);}
 assert.ok(bad({support:'Wear it \u{1F525} tonight'}).includes('emoji'));
 assert.ok(bad({labels:['Shop now →','','','']}).includes('arrow'));
 assert.ok(bad({headline:'Why you should never wear a polo'}).includes('headline'),'six words');
 assert.ok(bad({headline:''}).includes('headline'));
 assert.ok(bad({support:'one two three four five six seven eight nine ten eleven twelve thirteen fourteen',headline:'Skip the polo today'}).includes('word_count'),'25 words or more');
 assert.deepEqual(errors(lintSlots({layout:'hook',slots:{headline:'Elevate'}})),[],'only the campaign layout has these rules');
 const warn=lintSlots({layout:'campaign',slots:{headline:'Polo',support:'x',labels:['a','','','']}}).filter(x=>x.severity==='warning').map(x=>x.type);
 assert.ok(warn.includes('headline')&&warn.includes('labels'),'one word and 1 of 4 labels are warnings, not errors');
});
test('corner labels accept an array or an object, come out uppercase, and are never invented',()=>{
 assert.deepEqual(cornerLabels(['limited release',' june 2026 ','','shop now']),['LIMITED RELEASE','JUNE 2026','','SHOP NOW']);
 assert.deepEqual(cornerLabels({tl:'a',br:'d'}),['A','','','D']);
 assert.deepEqual(cornerLabels(undefined),['','','','']);
});

// ---- product images ----
test('imageInfo reads size and alpha from PNG, JPEG and WebP headers',()=>{
 assert.deepEqual(imageInfo(png(40,50)),{type:'png',width:40,height:50,alpha:false});
 assert.deepEqual(imageInfo(png(40,50,{rgba:true})),{type:'png',width:40,height:50,alpha:true});
 assert.equal(imageInfo(png(8,8,{trns:true})).alpha,true,'a tRNS chunk means transparency');
 const jpg=Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x04,0,0,0xff,0xc0,0x00,0x11,0x08,0x05,0x00,0x03,0x20,0x03,1,0x22,0,2,0x11,1,3,0x11,1]);
 assert.deepEqual(imageInfo(jpg),{type:'jpeg',width:800,height:1280,alpha:false});
 assert.equal(imageInfo(Buffer.from('not an image at all, just text')),null);
});
test('absolutize points ../assets/ files at the real uploads, and leaves other paths alone',()=>{
 const html='<img src="../assets/01-look.png"><img src="../assets/02-other.png"><img src="../fonts/x.woff">';
 const out=absolutize(html,null,[{file:'assets/01-look.png',abs:path.resolve('data/uploads/abc.png')}]);
 assert.ok(out.includes('src="'+pathToFileURL(path.resolve('data/uploads/abc.png')).href+'"'));assert.match(out,/\.\.\/assets\/02-other\.png/);assert.doesNotMatch(out,/\.\.\/fonts\//);
});

// ---- which posts get the campaign layout ----
test('apparel image and carousel posts default to the campaign layout; others do not',()=>{
 const post=type=>({data:{type}});
 assert.equal(isProductPost({industry:'clothing'},post('image')),true);
 assert.equal(isProductPost({industry:'Menswear label'},post('carousel')),true);
 assert.equal(isProductPost({industry:'Dental clinic'},post('image')),false);
 assert.equal(isProductPost({industry:'clothing'},post('video')),false,'reels are composed from the video skills');
 assert.equal(defaultLayout(post('image'),{industry:'clothing'}),'campaign');
 assert.equal(defaultLayout({data:{type:'image',layout:'hook'}},{industry:'clothing'}),'hook','an explicit layout wins');
 assert.equal(defaultLayout(post('carousel'),{industry:'Dental clinic'}),'list');
});

// ---- composition ----
const doc=(slots,format='portrait',profile=fashion)=>compose({layout:'campaign',slots,profile,catalog:catalog(),format});
test('campaign has four modes: photo, cutout, typographic poster and a marked placeholder; no remote files',()=>{
 const modes={photo:{...GOOD,photo:'assets/01-look.jpg'},cutout:{...GOOD,cutout:'assets/01-look.png'},typographic:GOOD,placeholder:{...GOOD,placeholder:true}};
 for(const [m,slots] of Object.entries(modes))for(const format of ['portrait','square','reel','landscape']){
  const [h]=doc(slots,format);assert.match(h,new RegExp('m-'+m),m+' '+format);assert.doesNotMatch(h,/(?:src|href)=["']?(?:https?:)?\/\/|url\(["']?https?:/);
 }
 assert.match(doc(modes.photo)[0],/<img class="plate" src="\.\.\/assets\/01-look\.jpg"/);
 assert.match(doc(modes.cutout)[0],/class="floor"/,'a cutout gets a contact shadow');
 assert.match(doc(modes.placeholder)[0],/Product photo goes here/);
 assert.doesNotMatch(doc(modes.typographic)[0],/<img class="(?:plate|cut)"/,'no product image means nothing is drawn in its place');
 assert.doesNotMatch(doc({...GOOD,photo:'https://example.com/x.jpg'})[0],/example\.com/,'a remote image is refused');
});
test('the four corner labels, one ornament and no cards, circles, buttons or arrows are drawn',()=>{
 const [h]=doc({...GOOD,photo:'assets/01-look.jpg'});
 const body=h.replace(/<style>[\s\S]*?<\/style>/,'').replace(/<script>[\s\S]*<\/script>/,'');
 for(const k of ['tl','tr','bl','br'])assert.match(body,new RegExp('class="corner '+k+'"'));
 assert.equal((body.match(/class="orn /g)||[]).length,1,'one ornament');
 assert.match(body,/LIMITED RELEASE/);
 assert.doesNotMatch(body,/class="(?:card|cta|chip|num|item|btn)|<button|→/);
});
test('a headline cannot inject markup, in any mode',()=>{
 for(const slots of [{headline:'<img src=x onerror=alert(1)> polo'},{headline:'<b>skip</b> the polo',photo:'assets/01-look.jpg'}]){
  const body=doc({...GOOD,...slots})[0].replace(/<style>[\s\S]*?<\/style>/,'').replace(/<script>[\s\S]*<\/script>/,'');
  assert.doesNotMatch(body,/<img src=x|<b>skip/);assert.match(body,/&lt;/);
 }
});

test('a carousel is numbered 01 / 05 in a corner and keeps the same labels on every frame',()=>{
 const html=doc({labels:GOOD.labels,frames:[1,2,3].map(i=>({headline:'Look '+(i===1?'one':i===2?'two':'three'),support:'Frame '+i+' of the set.'}))});
 assert.equal(html.length,3);
 html.forEach((h,i)=>{assert.match(h,new RegExp('0'+(i+1)+' / 03'));assert.match(h,/LIMITED RELEASE/);});
});
test('the no-Claude path builds a short uppercase headline and never invents labels',()=>{
 const asset={id:crypto.randomUUID(),title:'x',data:{type:'image',format:'portrait',on_screen_text:["Don't wear a polo to every wedding function."],caption:'Three checks decide it. More in the comments.',cta:'Shop now'}};
 const frames=templateFrames({asset,brand:read('ruh-atelier'),client:{name:'Ruh',industry:'clothing'},layout:'campaign',format:'portrait'});
 assert.equal(frames.length,1);assert.match(frames[0].replace(/<br>/g,' '),/Don(?:'|&#39;)t wear a polo/i,'the typographic poster stacks the words');
 const labels=[...frames[0].matchAll(/class="corner (tl|tr|bl|br)">([^<]*)</g)].map(m=>m[2]);
 assert.deepEqual(labels,['','','','SHOP NOW'],'only the call to action is used');
 const long=templateFrames({asset:{...asset,data:{...asset.data,cta:'Save this for your next invite'}},brand:read('ruh-atelier'),client:{name:'Ruh',industry:'clothing'},layout:'campaign',format:'portrait'})[0];
 assert.deepEqual([...long.matchAll(/class="corner (?:tl|tr|bl|br)">([^<]*)</g)].map(m=>m[1]),['','','',''],'a long call to action is not cut in half; it stays in the caption');
});
test('every test brand has campaign sample copy that passes the rules',()=>{
 for(const b of ['kaveri-dental','ruh-atelier','sunkidz','preview'])assert.deepEqual(errors(lintSlots({layout:'campaign',slots:samples[b].campaign})),[],b);
 assert.ok(LAYOUTS.campaign&&Object.keys(LAYOUTS.campaign.slots).includes('photo'));
});

// ---- rendered page: the same checks the preview tool and the final renderer run ----
let browser,work,photoFile,cutFile;
test('browser and fixtures',async()=>{
 work=fs.mkdtempSync(path.join(os.tmpdir(),'campaign-'));
 photoFile=path.join(work,'look.png');fs.writeFileSync(photoFile,png(400,500));
 cutFile=path.join(work,'cut.png');fs.writeFileSync(cutFile,png(300,400,{rgba:true}));
 browser=await chromium.launch({headless:true,executablePath:chromePath(),args:['--no-sandbox']});
});
after(async()=>{await browser?.close();if(work)fs.rmSync(work,{recursive:true,force:true});});
async function check(html,format='portrait',mutate){
 const page=await browser.newPage({viewport:{width:CANVAS[format][0],height:CANVAS[format][1]}});
 try{
  const f=path.join(work,crypto.randomUUID()+'.html');fs.writeFileSync(f,html);await page.goto(pathToFileURL(f).href,{waitUntil:'load'});
  await page.waitForFunction(()=>document.body.dataset.ready==='1',null,{timeout:15000});
  if(mutate)await page.evaluate(mutate);
  return await page.evaluate(eval(pageChecks),{format,margin:MARGIN[format],banned:[]});
 }finally{await page.close();}
}
test('rendered campaign posts have no design-check errors in every placement and mode',async()=>{
 const modes={photo:{...GOOD,photo:pathToFileURL(photoFile).href},cutout:{...GOOD,cutout:pathToFileURL(cutFile).href,backdrop:'grey'},typographic:{...GOOD,backdrop:'charcoal'},placeholder:{...GOOD,placeholder:true}};
 for(const [m,slots] of Object.entries(modes))for(const format of ['portrait','square','reel','landscape']){
  const html=compose({layout:'campaign',slots,profile:fashion,catalog:catalog(),format,fontBase:pathToFileURL(path.join(ROOT,'exora/fonts')).href})[0];
  const issues=await check(html,format);
  assert.deepEqual(issues.filter(i=>i.severity==='error'),[],m+' '+format+': '+JSON.stringify(issues.filter(i=>i.severity==='error')));
  if(m==='typographic'&&format==='portrait')assert.ok(issues.some(i=>i.type==='campaign_no_product'),'a typographic poster is flagged as needing a photo');
  if(m==='photo'||m==='cutout')assert.ok(!issues.some(i=>i.type==='campaign_no_product'));
 }
});
test('the page check fails slop: filler, emoji, arrows, cards, numbered circles, buttons, a second headline',async()=>{
 const html=compose({layout:'campaign',slots:{...GOOD,photo:pathToFileURL(photoFile).href},profile:fashion,catalog:catalog(),format:'portrait',fontBase:pathToFileURL(path.join(ROOT,'exora/fonts')).href})[0];
 const types=async mutate=>(await check(html,'portrait',mutate)).filter(i=>i.severity==='error').map(i=>i.type);
 assert.deepEqual(await types(),[],'the clean post has none');
 assert.ok((await types(()=>{document.querySelector('.support').textContent='Elevate your look, seamlessly.';})).includes('campaign_filler_phrase'));
 assert.ok((await types(()=>{document.querySelector('.support').textContent='Wear it \u{1F525} now';})).includes('campaign_emoji_or_arrow'));
 assert.ok((await types(()=>{document.querySelector('.support').textContent='Shop now →';})).includes('campaign_emoji_or_arrow'));
 assert.ok((await types(()=>{document.body.insertAdjacentHTML('beforeend','<div style="position:absolute;left:100px;top:600px;border:2px solid #000;padding:10px">Invite says casual</div>');})).includes('campaign_bordered_box'));
 assert.ok((await types(()=>{document.body.insertAdjacentHTML('beforeend','<div style="position:absolute;left:100px;top:700px;width:60px;height:60px;border-radius:50%;background:#3f3;color:#000;text-align:center">1</div>');})).includes('campaign_numbered_circle'));
 assert.ok((await types(()=>{document.body.insertAdjacentHTML('beforeend','<span class="cta" style="position:absolute;left:100px;top:800px">Save this</span>');})).includes('campaign_fake_button'));
 assert.ok((await types(()=>{document.body.insertAdjacentHTML('beforeend','<h2 style="position:absolute;left:100px;top:900px">Another headline</h2>');})).includes('campaign_headline'));
 assert.ok((await types(()=>{document.querySelector('.support').textContent=Array(30).fill('word').join(' ');})).includes('campaign_word_count'));
});
test('other layouts are not held to the campaign rules',async()=>{
 const html=compose({layout:'list',slots:samples['kaveri-dental'].list,profile:fashion,catalog:catalog(),format:'portrait',fontBase:pathToFileURL(path.join(ROOT,'exora/fonts')).href})[0];
 assert.ok(!(await check(html)).some(i=>String(i.type).startsWith('campaign_')));
});

// ---- product photos from the client's uploads, and the designer's folder ----
let client,user,cookie;
test('setup: an apparel client',async()=>{
 const r=await handle(new Request('http://localhost:3100/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({email:'admin@exora.local',password:'ExoraLocal!2026'})}));cookie=r.headers.get('set-cookie').split(';')[0];
 const made=await handle(new Request('http://localhost:3100/api/action',{method:'POST',headers:{cookie,'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({action:'create-client',name:'Campaign Test '+Date.now(),industry:'clothing',city:'Bengaluru',languages:['English']})}));
 client=(await q('SELECT * FROM clients WHERE id=$1',[(await made.json()).id])).rows[0];user=(await q("SELECT * FROM users WHERE role='admin' LIMIT 1")).rows[0];
});
async function upload(name,buf,area='uploads'){
 const id=crypto.randomUUID(),rel=`${area}/${id}.png`,full=path.join(ROOT,'.local',rel);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,buf);
 await q('INSERT INTO files(id,client_id,name,mime,size,storage_path) VALUES($1,$2,$3,$4,$5,$6)',[id,client.id,name,'image/png',buf.length,rel]);return id;
}
test('editing a picture creates a new draft and a repeated save returns that version',async()=>{
 const original=await upload('original.png',png(64,80));
 const edited=await upload('edited.png',png(64,80,{rgba:true}));
 const save=async body=>{const r=await perform(user,{client_id:client.id,...body});return {status:r.status,data:await r.json()};};
 const draft=await save({action:'save-record',kind:'Asset',title:'Picture edit',data:{type:'image',files:[{id:original,name:'original.png',mime:'image/png'}]}});
 assert.equal(draft.status,200);
 const action={action:'save-picture-version',id:draft.data.id,source_file_id:original,file_id:edited};
 const version=await save(action);assert.equal(version.status,200,JSON.stringify(version.data));
 assert.equal(version.data.parent_id,draft.data.id);assert.equal(version.data.version,draft.data.version+1);
 assert.equal(version.data.data.files[0].id,edited);assert.equal((await save(action)).data.id,version.data.id);
 const previous=(await q('SELECT data FROM records WHERE id=$1',[draft.data.id])).rows[0];
 assert.equal(previous.data.files[0].id,original);
 assert.equal((await save({...action,file_id:crypto.randomUUID()})).status,400);
});

test('only real product photos are offered: not brand guides, banners, diagrams or earlier renders',async()=>{
 const look=await upload('product-polo.png',png(60,80));const cut=await upload('hoodie cutout.png',png(60,80,{rgba:true}));
 await upload('Fabblen hero banner.png',png(60,80));await upload('mermaid-diagram.png',png(60,80));await upload('logo-product.png',png(60,80));
 await upload('image-1.png',png(60,80),'renders');await upload('product-render.png',png(60,80),'renders');
 // Finished ads carry their own baked-in text: a real job stalled when one was offered as the product photo.
 await upload('Streetwear New Collection Social Media Ad Design.jpg',png(60,80));await upload('collection-poster.png',png(60,80));await upload('shirt_ad.png',png(60,80));
 const brandSource=await upload('Collection lookbook.png',png(60,80));
 const notSources=await productImagesFor({...client,chain:[{id:client.id}]},{data:{}},{exclude:['Collection lookbook.png']});
 assert.ok(!notSources.some(g=>g.id===brandSource),'a file the brand kit was read from is never the product');
 await q('DELETE FROM files WHERE id=$1',[brandSource]);
 const got=await productImagesFor({...client,chain:[{id:client.id}]},{data:{}});
 assert.deepEqual(got.map(g=>g.name).sort(),['hoodie cutout.png','product-polo.png']);
 const byName=Object.fromEntries(got.map(g=>[g.name,g]));assert.equal(byName['hoodie cutout.png'].alpha,true);assert.equal(byName['product-polo.png'].alpha,false);
 assert.match(got[0].file,/^assets\/\d\d-/);assert.ok(fs.existsSync(got[0].abs));
 const m=manifestOf(got);assert.ok(m.every(x=>x.file&&x.width===60&&x.height===80&&typeof x.has_alpha_channel==='boolean'&&x.use));
 const explicit=await upload('IMG_2041.png',png(60,80));
 const picked=await productImagesFor({...client,chain:[{id:client.id}]},{data:{product_image_file_ids:[explicit]}});
 assert.deepEqual(picked.map(p=>p.id),[explicit],'an explicit choice wins over the name rule, even for an unhelpful file name');
 void look;void cut;
});
test('composeStatic picks the campaign layout for an apparel post, copies the product photos in, and says when none exist',async()=>{
 process.env.EXORA_CLAUDE_BIN=path.join(ROOT,'tests/fake-claude.mjs');
 try{
  const {composeStatic}=await import('../core/design/compose.mjs');
  const asset={id:crypto.randomUUID(),title:'Skip the polo',data:{type:'image',format:'portrait',on_screen_text:['Skip the polo'],caption:'c',cta:'Shop now'}};
  const withPhotos=await composeStatic({client,user,run:null,records:[],asset,brand:{colors:['#16181d','#f7f4ef','#c45c26'],banned_words:[]}});
  assert.equal(withPhotos.design.layout,'campaign');assert.ok(withPhotos.design.product_images.length>=2,'the uploads reached the designer');
  assert.equal(withPhotos.design.saw_assets,withPhotos.design.product_images.length,'assets.json and assets/ were in its folder');
  assert.equal(withPhotos.design.needs_product_image,false);
  await q('DELETE FROM files WHERE client_id=$1',[client.id]);
  const none=await composeStatic({client,user,run:null,records:[],asset,brand:{colors:['#16181d','#f7f4ef','#c45c26'],banned_words:[]}});
  assert.equal(none.design.needs_product_image,true,'no photo: the team is asked for one, nothing is faked');
  const forced=await composeStatic({client,user,run:null,records:[],asset,layout:'hook',brand:{colors:['#16181d','#f7f4ef','#c45c26'],banned_words:[]}});
  assert.equal(forced.design.layout,undefined,'an explicit other layout is respected');
 }finally{delete process.env.EXORA_CLAUDE_BIN;}
});
test('a campaign whose slots break the rules is not shipped',async()=>{
 process.env.EXORA_CLAUDE_BIN=path.join(ROOT,'tests/fake-claude.mjs');process.env.FAKE_CAMPAIGN_SLOTS=JSON.stringify({...GOOD,support:'Elevate your wedding look, seamlessly.'});
 try{
  const {composeStatic}=await import('../core/design/compose.mjs');
  const asset={id:crypto.randomUUID(),title:'Skip the polo',data:{type:'image',format:'portrait',on_screen_text:['Skip the polo'],caption:'c'}};
  await assert.rejects(()=>composeStatic({client,user,run:null,records:[],asset,brand:{colors:['#16181d','#f7f4ef','#c45c26'],banned_words:[]}}),/breaks its design rules.*Filler phrase/);
 }finally{delete process.env.EXORA_CLAUDE_BIN;delete process.env.FAKE_CAMPAIGN_SLOTS;}
});
