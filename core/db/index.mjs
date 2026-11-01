import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const ROOT=process.env.EXORA_ROOT || (fs.existsSync(path.join(process.cwd(),'core'))?process.cwd():path.resolve(/*turbopackIgnore: true*/ process.cwd(),'..'));
if(fs.existsSync(path.join(ROOT,'.env.local'))) { for(const l of fs.readFileSync(path.join(ROOT,'.env.local'),'utf8').split('\n')){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}}
const g=globalThis;
export const pool=g.__exoraPool ||= new pg.Pool({connectionString:process.env.DATABASE_URL||'postgresql://exora@127.0.0.1:55439/exora_marketing',max:10});
export const id=()=>crypto.randomUUID();
export const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
export const q=(text,values=[])=>pool.query(text,values);
export async function tx(fn){const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function audit(c,user,client,action,entity,details={}){await c.query('INSERT INTO audit(client_id,actor_id,action,entity_id,details) VALUES($1,$2,$3,$4,$5)',[client,user?.id||null,action,entity||null,details]);}
export async function insert(c,user,client,kind,title,data={},status='draft',extra={}) {const rid=id();const r=await c.query('INSERT INTO records(id,client_id,kind,title,data,status,created_by,version,parent_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[rid,client,kind,title,data,status,user?.id||null,extra.version||1,extra.parent_id||null]);await audit(c,user,client,'create:'+kind,rid,{title,status});return r.rows[0];}
export function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
export function requireText(value,label,max=20000){if(typeof value!=='string'||!value.trim()||value.length>max)fail(label+' is required (max '+max+' characters)');return value.trim();}
