// Products and brands (docs/products-and-brands.md). A client can have a parent: company -> brand -> product.
// Siblings stay isolated because each node is its own client. These helpers are the ONLY place that
// follows the parent link: what passes down (brand kit, strategy, lessons, company-wide campaigns),
// effective settings, and the name used on creatives.
import {q} from '../db/index.mjs';

// self first, then parent, then grandparent
export async function chainOf(clientId,db={query:q}){
 const r=await db.query(`WITH RECURSIVE up AS (SELECT c.*,0 AS depth FROM clients c WHERE c.id=$1
  UNION ALL SELECT p.*,up.depth+1 FROM clients p JOIN up ON p.id=up.parent_id WHERE up.depth<4)
  SELECT * FROM up ORDER BY depth`,[clientId]);
 return r.rows;
}
// every node under clientId (not including itself), deepest first
export async function descendantsOf(clientId,db={query:q}){
 const r=await db.query(`WITH RECURSIVE down AS (SELECT c.*,1 AS depth FROM clients c WHERE c.parent_id=$1
  UNION ALL SELECT k.*,down.depth+1 FROM clients k JOIN down ON k.parent_id=down.id WHERE down.depth<4)
  SELECT * FROM down ORDER BY depth DESC, created_at`,[clientId]);
 return r.rows;
}

const pick=c=>({id:c.id,name:c.name,node_type:c.node_type||'company'});
// Effective view of a client: settings pass down live (a node stores only what it changes);
// brand_name = nearest brand or company, used on creatives; own fields are never rewritten.
export function resolveFromChain(chain){
 const self=chain[0];if(!self)return null;
 const settings={};for(const n of [...chain].reverse())Object.assign(settings,n.settings||{});
 const brandNode=chain.find(n=>n.node_type!=='product')||self;
 const {depth,...row}=self;
 return {...row,own_settings:self.settings||{},settings,node_type:self.node_type||'company',brand_name:brandNode.name,
  company_id:chain[chain.length-1].id,company_name:chain[chain.length-1].name,chain:chain.map(pick)};
}
export async function resolveClient(clientId,db){const chain=await chainOf(clientId,db);return resolveFromChain(chain);}

const words=v=>Array.isArray(v)?v.map(String).map(s=>s.trim()).filter(Boolean):typeof v==='string'&&v.trim()?v.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean):[];
const uniq=a=>[...new Set(a)];
// Merged brand kit for a node: the nearest node that has a kit is used whole; banned words,
// disclaimers and proof for claims are added from every level above (a child can never drop them).
// Proof comes only from this node and the levels above it, never from siblings.
export async function brandFor(client,db={query:q}){
 const chain=client.chain?client.chain:(await chainOf(client.id,db)).map(pick);
 const ids=chain.map(n=>n.id);
 const kits=(await db.query(`SELECT DISTINCT ON (client_id) * FROM records WHERE client_id=ANY($1) AND kind='BrandKit' ORDER BY client_id,created_at DESC`,[ids])).rows;
 const byNode=new Map(kits.map(k=>[k.client_id,k]));
 const briefs=(await db.query('SELECT id,name,data FROM clients WHERE id=ANY($1)',[ids])).rows;const briefOf=new Map(briefs.map(b=>[b.id,b.data?.brief||{}]));
 const winnerNode=chain.find(n=>byNode.has(n.id));const winner=winnerNode?byNode.get(winnerNode.id):null;
 const all=chain.map(n=>byNode.get(n.id)).filter(Boolean);
 const data={...(winner?.data||{})};
 data.banned_words=uniq(all.flatMap(k=>words(k.data.banned_words)));
 const disc=uniq(all.flatMap(k=>String(k.data.disclaimers||'').split('\n').map(s=>s.trim()).filter(Boolean)));if(disc.length)data.disclaimers=disc.join('\n');
 data.evidence=[...all.flatMap(k=>Array.isArray(k.data.evidence)?k.data.evidence:[]),...chain.flatMap(n=>Array.isArray(briefOf.get(n.id)?.evidence)?briefOf.get(n.id).evidence:[])];
 const file_ids=winner?[winner.data.logo_file_id,winner.data.source_file_id].filter(Boolean):[];
 return {data,record:winner,from:winnerNode||null,inherited:!!winnerNode&&winnerNode.id!==client.id,file_ids};
}

// Kinds a node reads from the levels above it. Ideas, writing, visuals, posts, ads and numbers never pass down.
export const INHERITED=['Strategy','Learning','Campaign'];
// Records a node's AI, checks, design and tools may read: one merged BrandKit first, then the node's own
// records, then Strategy / Learning / company-wide Campaigns from the levels above (marked inherited_from).
export async function contextRecords(client,{kinds=null}={},db={query:q}){
 const chain=client.chain||(await chainOf(client.id,db)).map(pick);
 const own=(await db.query('SELECT * FROM records WHERE client_id=$1 ORDER BY created_at DESC',[client.id])).rows.filter(r=>r.kind!=='BrandKit');
 const above=chain.slice(1);let inherited=[];
 if(above.length){
  const rows=(await db.query(`SELECT * FROM records WHERE client_id=ANY($1) AND kind=ANY($2) ORDER BY created_at DESC`,[above.map(n=>n.id),INHERITED])).rows;
  const nameOf=new Map(above.map(n=>[n.id,n.name]));
  inherited=rows.filter(r=>r.kind!=='Campaign'||r.data?.company_wide===true).filter(r=>!['rejected','archived'].includes(r.status)).map(r=>({...r,inherited_from:{id:r.client_id,name:nameOf.get(r.client_id)}}));
 }
 const b=await brandFor({...client,chain},db);
 const brand=b.record?[{...b.record,data:b.data,...(b.inherited?{inherited_from:{id:b.from.id,name:b.from.name}}:{})}]:[];
 const all=[...brand,...own,...inherited];
 return kinds?all.filter(r=>kinds.includes(r.kind)):all;
}
// The brief Claude gets about where this node sits.
export function nodeBrief(client){
 const path=(client.chain||[]).slice().reverse().map(n=>n.name).join(' › ');
 return {name:client.name,brand_name:client.brand_name||client.name,company:client.company_name||client.name,node_type:client.node_type||'company',path,
  industry:client.industry,city:client.city,languages:client.languages,brief:client.data?.brief||null};
}
