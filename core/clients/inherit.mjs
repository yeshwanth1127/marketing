// Explicit "copy from higher level" actions: product ← brand ← client.
import fs from 'node:fs';
import path from 'node:path';
import {q,insert,audit,fail,id,ROOT} from '../db/index.mjs';
import {brandFor,chainOf,resolveFromChain} from './tree.mjs';
import {templatesFor} from '../design/templates.mjs';

function parentOf(client){
 const chain=client.chain||[];
 return chain.find(n=>n.id===client.parent_id)||chain[1]||null;
}

async function loadParentClient(client){
 const parent=parentOf(client);
 if(!parent)fail('This workspace has no parent level to inherit from');
 const chain=await chainOf(parent.id);
 return resolveFromChain(chain);
}

function cloneData(data){
 return JSON.parse(JSON.stringify(data||{}));
}

/** Duplicate a parent file into this workspace so local templates/kits can edit independently. */
async function copyFileToClient(c,user,targetClientId,fileId,sourceClientId){
 if(!fileId)return null;
 const src=(await c.query('SELECT * FROM files WHERE id=$1 AND client_id=$2',[fileId,sourceClientId])).rows[0];
 if(!src)return null;
 const root=path.join(ROOT,'.local');
 const abs=path.resolve(root,src.storage_path);
 if(!abs.startsWith(root+path.sep)||!fs.existsSync(abs))return null;
 const ext=path.extname(src.storage_path)||'.bin';
 const fid=id();
 const rel=path.join('uploads',fid+ext);
 const dest=path.join(root,rel);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.copyFileSync(abs,dest);
 await c.query('INSERT INTO files(id,client_id,name,mime,size,storage_path,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
  [fid,targetClientId,src.name,src.mime,src.size,rel.replace(/\\/g,'/'),user?.id||null]);
 return fid;
}

/** Copy the nearest parent BrandKit onto this node as its own editable kit. */
export async function inheritBrandKit(user,client){
 const parent=await loadParentClient(client);
 const kit=await brandFor(parent);
 if(!kit.record)fail(`${parent.name} has no brand kit to inherit`);
 const data=cloneData(kit.data);
 const sourceClientId=kit.record.client_id;
 data.inherited_from={id:kit.from?.id||parent.id,name:kit.from?.name||parent.name,at:new Date().toISOString()};
 data.provider=data.provider||'inherited';
 const title=`${parent.name} brand kit`;
 const existing=(await q("SELECT id FROM records WHERE client_id=$1 AND kind='BrandKit' AND status<>'archived' ORDER BY created_at DESC LIMIT 1",[client.id])).rows[0];
 const {tx}=await import('../db/index.mjs');
 const record=await tx(async c=>{
  if(data.logo_file_id){
   const copied=await copyFileToClient(c,user,client.id,data.logo_file_id,sourceClientId);
   if(copied)data.logo_file_id=copied;
  }
  if(data.source_file_id){
   const copied=await copyFileToClient(c,user,client.id,data.source_file_id,sourceClientId);
   if(copied)data.source_file_id=copied;
  }
  if(existing){
   const row=(await c.query('UPDATE records SET title=$2,data=$3,status=$4,updated_at=now() WHERE id=$1 RETURNING *',[existing.id,title,data,'draft'])).rows[0];
   await audit(c,user,client.id,'inherit:BrandKit',row.id,{from:parent.id});
   return row;
  }
  return insert(c,user,client.id,'BrandKit',title,data,'draft');
 });
 return {record,from:parent,source:kit.from};
}

/** Copy one or all DesignTemplates from the parent level onto this workspace. */
export async function inheritDesignTemplates(user,client,{template_id=null,all=false}={}){
 const parent=await loadParentClient(client);
 const parentTemplates=await templatesFor(parent);
 const ownTitles=new Set((await templatesFor(client)).filter(t=>!t.inherited).map(t=>t.title.toLowerCase()));
 let sources=parentTemplates.filter(t=>!t.inherited);
 if(template_id){
  const one=parentTemplates.find(t=>t.id===template_id);
  if(!one)fail('Choose a parent design template to inherit');
  sources=[one];
 }else if(!all){
  const pick=sources.find(t=>t.data?.is_default)||sources[0];
  if(!pick)fail(`${parent.name} has no design template to inherit`);
  sources=[pick];
 }
 if(!sources.length)fail(`${parent.name} has no design template to inherit`);
 const created=[];
 const {tx}=await import('../db/index.mjs');
 await tx(async c=>{
  for(const src of sources){
   const title=ownTitles.has(String(src.title).toLowerCase())?`${src.title} (from ${parent.name})`:src.title;
   const data=cloneData(src.data);
   data.inherited_from={id:src.client_id,name:parent.name,template_id:src.id,at:new Date().toISOString()};
   if(data.reference_image_file_id){
    const copied=await copyFileToClient(c,user,client.id,data.reference_image_file_id,src.client_id);
    if(copied)data.reference_image_file_id=copied;
    else delete data.reference_image_file_id;
   }
   if(data.is_default)await c.query("UPDATE records SET data=jsonb_set(data,'{is_default}','false'::jsonb,true) WHERE client_id=$1 AND kind='DesignTemplate' AND status<>'archived'",[client.id]);
   const row=await insert(c,user,client.id,'DesignTemplate',title,data,'draft');
   created.push(row);
   ownTitles.add(title.toLowerCase());
  }
  await audit(c,user,client.id,'inherit:DesignTemplate',created[0]?.id||null,{from:parent.id,count:created.length,template_ids:sources.map(s=>s.id)});
 });
 return {records:created,from:parent,count:created.length};
}

/** Copy market / contact / package / voice details from the parent workspace. */
export async function inheritDetails(user,client,{fields=null}={}){
 const parent=await loadParentClient(client);
 const allow=new Set(fields&&Array.isArray(fields)&&fields.length?fields:[
  'industry','city','region','tier','website','languages','approval_contact','package','voice','notes',
 ]);
 const patch={};
 const dataPatch={};
 if(allow.has('industry')&&parent.industry)patch.industry=parent.industry;
 if(allow.has('city')&&parent.city)patch.city=parent.city;
 if(allow.has('languages')&&Array.isArray(parent.languages)&&parent.languages.length)patch.languages=parent.languages;
 if(allow.has('region')&&parent.data?.region)dataPatch.region=parent.data.region;
 if(allow.has('tier')&&parent.data?.tier)dataPatch.tier=parent.data.tier;
 if(allow.has('website')&&parent.data?.website)dataPatch.website=parent.data.website;
 if(allow.has('approval_contact')&&parent.data?.approval_contact)dataPatch.approval_contact=parent.data.approval_contact;
 if(allow.has('notes')&&parent.data?.notes)dataPatch.notes=parent.data.notes;
 if(client.node_type==='product'&&parent.node_type==='brand'){
  const brief={...(client.data?.brief||{})};
  const pb=parent.data?.brief||{};
  if(!brief.sector&&(pb.sector||parent.industry))brief.sector=pb.sector||parent.industry;
  if(!brief.audience&&pb.audience)brief.audience=pb.audience;
  dataPatch.brief=brief;
 }
 const settingsPatch={};
 if(allow.has('package')&&parent.settings?.package)settingsPatch.package=parent.settings.package;
 if(allow.has('voice')&&parent.settings?.voice)settingsPatch.voice=parent.settings.voice;

 if(!Object.keys(patch).length&&!Object.keys(dataPatch).length&&!Object.keys(settingsPatch).length){
  fail(`${parent.name} has no matching details to inherit`);
 }

 const {tx}=await import('../db/index.mjs');
 await tx(async c=>{
  const nextData={...(client.data||{}),...dataPatch};
  const nextSettings={...(client.own_settings||{}),...settingsPatch};
  await c.query(
   `UPDATE clients SET
     industry=COALESCE($2,industry),
     city=COALESCE($3,city),
     languages=COALESCE($4::jsonb,languages),
     data=$5,
     settings=$6,
     version=version+1
    WHERE id=$1`,
   [client.id,patch.industry||null,patch.city||null,patch.languages?JSON.stringify(patch.languages):null,nextData,nextSettings]
  );
  await audit(c,user,client.id,'inherit:Details',client.id,{from:parent.id,fields:[...allow]});
 });
 return {from:parent,fields:[...Object.keys(patch),...Object.keys(dataPatch),...Object.keys(settingsPatch)]};
}

export function inheritTargets(client){
 const parent=parentOf(client);
 if(!parent)return null;
 const parentLabel=parent.node_type==='brand'?'brand':parent.node_type==='product'?'product':'client';
 return {parent_id:parent.id,parent_name:parent.name,parent_label:parentLabel};
}
