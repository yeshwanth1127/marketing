import fs from 'node:fs';
import path from 'node:path';
import {ROOT,id,q,fail} from '../db/index.mjs';
import {executeCodex} from '../runtime/providers/codex.mjs';
import {buildPromptSpecification,renderPromptSpecification,promptMetadata} from '../runtime/prompts/prompt-builder.mjs';
import {defaultLayout,isProductPost} from './brand-profile.mjs';
import {MOTIONS,ALIGNS,TEXT_POSITIONS} from '../video/design.mjs';

const designSkill=()=>fs.readFileSync(path.join(ROOT,'modules/06-design-video/skills/exora-design-system/SKILL.md'),'utf8').slice(0,6600);

export async function loadDesignArtwork(clientId,fileId){
 if(!fileId)return null;
 const row=(await q("SELECT id,mime,name,storage_path,size FROM files WHERE id=$1 AND client_id=$2 AND mime IN ('image/png','image/jpeg','image/webp') AND storage_path LIKE 'uploads/%'",[fileId,clientId])).rows[0];
 if(!row||Number(row.size)>5*1024*1024)fail('Choose an uploaded PNG, JPEG or WebP image under 5 MB from this workspace.');
 const root=fs.realpathSync(path.join(ROOT,'.local','uploads'));
 const file=fs.realpathSync(path.resolve(ROOT,'.local',row.storage_path));
 const relative=path.relative(root,file);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||fs.statSync(file).size>5*1024*1024)fail('Artwork is unavailable.');
 return {id:row.id,mime:row.mime,name:row.name,file,filename:row.id+path.extname(file)};
}

const choices=values=>({type:'string',enum:values});
const strict=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});

export async function chooseCodexDesign({client,user,asset,payload,design},run=executeCodex){
 const artwork=await loadDesignArtwork(client.id,payload.artwork_file_id);
 const data=asset.data;
 const lines=Array.isArray(data.on_screen_text)?data.on_screen_text.slice(0,12).map(x=>String(x).slice(0,200)):[];
 const layouts=payload.layout?[payload.layout]:isProductPost(client,asset)?['campaign','hook']:data.type==='carousel'&&lines.length>=3?['list','hook']:[defaultLayout(asset,client)];
 const schema=design
  ?strict({motion:choices(MOTIONS),align:choices(ALIGNS),position:choices(TEXT_POSITIONS)})
  :strict({layout:choices(layouts),headline:choices(lines.map((_,i)=>String(i)).concat('original'))});
 const spec=buildPromptSpecification({
  client,brand:payload.brand,workflow:'06-design-video',taskType:'Visual design',
  input:{brief:'Design this '+data.type+' for '+data.format+'.'},
  facts:{title:asset.title,copy:lines,caption:String(data.caption||'').slice(0,900),
   theme:payload.design_template?.data,artwork:artwork?{id:artwork.id,name:artwork.name,role:'User-selected artwork'}:null,beats:design?.beats.map(b=>({label:b.label,duration:b.duration}))},
  taskRules:designSkill()+'\n\nEXORA renders the plan with its design engine. Use the skill as visual guidance only. Return a design plan using only the allowed values. Preserve the existing words and claims. For images, headline is an index into the supplied copy or original. Keep the opening for list layouts. For motion, select a readable animation, alignment and position. Do not run tools or output code.',
  outputSchema:schema,
 });
 const runId=id(),started=Date.now();
 await q("INSERT INTO runs(id,client_id,module,provider,status,created_by,prompt_metadata) VALUES($1,$2,'06-design-video','codex','running',$3,$4)",[runId,client.id,user.id,{...promptMetadata(spec),output_validation:'pending'}]);
 try{
  const result=await run({prompt:renderPromptSpecification(spec),outputSchema:schema,attachments:artwork?[artwork]:[]});
  const plan=JSON.parse(result.text);
  if(!plan||typeof plan!=='object'||Object.keys(plan).length!==schema.required.length||schema.required.some(key=>!schema.properties[key].enum.includes(plan[key])))throw new Error('Invalid design plan');
  await q("UPDATE runs SET status='completed',model=$2,usage=$3,duration_ms=$4,prompt_metadata=prompt_metadata||$5::jsonb WHERE id=$1",[runId,result.model,result.usage,Date.now()-started,{output_validation:'passed'}]);
  return {...plan,run_id:runId};
 }catch(error){
  await q("UPDATE runs SET status='failed',error=$2,duration_ms=$3,prompt_metadata=prompt_metadata||$4::jsonb WHERE id=$1",[runId,'Codex could not produce a valid design plan.',Date.now()-started,{output_validation:'did not pass'}]);
  throw new Error('Codex could not produce a valid design plan. Check the CLI connection and try again.',{cause:error});
 }
}

export function applyCodexStaticPlan(asset,plan,artwork){
 if(artwork){
  const picture='data:'+artwork.mime+';base64,'+fs.readFileSync(artwork.file).toString('base64');
  asset={...asset,data:{...asset.data,product_photo:picture,artwork_photo:true}};
 }
 const lines=asset.data.on_screen_text;
 const index=Number(plan.headline);
 if(plan.layout==='list'||plan.headline==='original'||!Number.isInteger(index)||!lines?.[index])return asset;
 return {...asset,data:{...asset.data,on_screen_text:[lines[index],...lines.filter((_,i)=>i!==index)]}};
}
