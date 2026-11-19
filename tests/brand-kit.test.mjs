import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {handle} from '../core/api.mjs';import {pool,ROOT} from '../core/db/index.mjs';
import {completePalette} from '../core/brand/kit-from-files.mjs';
after(async()=>pool.end());

function pythonBin(){
 if(process.env.PYTHON_BIN)return process.env.PYTHON_BIN;
 for(const bin of ['python3','python']){
  const r=spawnSync(bin,['-c','from PIL import Image'],{encoding:'utf8'});
  if(r.status===0)return bin;
 }
 return 'python3';
}
const py=pythonBin();
function isOrange(hex){const n=parseInt(String(hex).slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;return r>150&&r>g&&r-b>40;}
function makeCard(dest){
 const script=`from PIL import Image
card=Image.new('RGB',(900,520),'#ffffff')
for x in range(80,150):
 for y in range(70,280): card.putpixel((x,y),(232,119,34))
for x in range(80,340):
 for y in range(250,280): card.putpixel((x,y),(232,119,34))
for x in range(200,820):
 for y in range(430,455): card.putpixel((x,y),(17,17,17))
shot=Image.new('RGB',(1280,820),'#0b141a')
shot.paste(card,(190,110))
shot.save(${JSON.stringify(dest)})
`;
 const r=spawnSync(py,['-c',script],{encoding:'utf8'});
 assert.equal(r.status,0,(r.stderr||r.stdout||'pillow missing').slice(0,400));
}

test('completePalette never injects the old EXORA greens',()=>{
 const one=completePalette(['#e87722']);
 assert.deepEqual(one,['#e87722']);
 assert.ok(!one.includes('#254b3b'));
 assert.ok(!one.includes('#d4ef9c'));
 const three=completePalette(['#e87722','#ffffff','#111111']);
 assert.ok(three.some(isOrange));
 assert.ok(three.includes('#ffffff'));
 assert.ok(three.includes('#111111'));
 assert.equal(completePalette(['#112233','#abcdef']).includes('#112233'),true);
});

test('extract-brand.py reads orange/black/white from a card screenshot, not default greens',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brand-'));
 const png=path.join(dir,'card.png');
 makeCard(png);
 const r=spawnSync(py,[path.join(ROOT,'scripts/extract-brand.py'),png,'image/png'],{encoding:'utf8'});
 assert.equal(r.status,0,(r.stderr||'').slice(0,400));
 const out=JSON.parse(r.stdout);
 assert.ok(out.colors.some(isOrange),JSON.stringify(out.colors));
 assert.ok(!out.colors.includes('#254b3b'));
 assert.ok(!out.colors.includes('#d4ef9c'));
 fs.rmSync(dir,{recursive:true,force:true});
});

test('apply-brand-kit preview and save keep graded colours from the file',async()=>{
 const login=await handle(new Request('http://localhost:3100/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({email:'admin@exora.local',password:'ExoraLocal!2026'})}));
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const act=async(body,token=cookie)=>{const r=await handle(new Request('http://localhost:3100/api/action',{method:'POST',headers:{cookie:token,'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};
 const client=(await act({action:'create-client',name:'Fabblen Kit '+Date.now(),industry:'Apparel',city:'Bengaluru'})).data.id;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brand-'));
 const png=path.join(dir,'card.png');makeCard(png);
 const form=new FormData();form.set('client_id',client);form.set('file',new File([fs.readFileSync(png)],'fabblen-card.png',{type:'image/png'}));
 const up=await handle(new Request('http://localhost:3100/api/upload',{method:'POST',headers:{cookie,origin:'http://localhost:3100'},body:form}));
 assert.equal(up.status,200,await up.clone().text());
 const file=await up.json();
 const preview=await act({action:'apply-brand-kit',file_ids:[file.id],preview:true});
 assert.equal(preview.status,200,JSON.stringify(preview.data));
 const colors=preview.data.colors||preview.data.data?.colors||[];
 assert.ok(colors.some(isOrange),JSON.stringify(colors));
 assert.ok(!colors.includes('#254b3b'));
 const graded=['#f7f4ef','#111111','#cc5500'];
 const saved=await act({action:'apply-brand-kit',file_ids:[file.id],colors:graded});
 assert.equal(saved.status,200,JSON.stringify(saved.data));
 assert.ok(saved.data.data.colors.includes('#cc5500'));
 assert.ok(!saved.data.data.colors.includes('#254b3b'));
 fs.rmSync(dir,{recursive:true,force:true});
});
