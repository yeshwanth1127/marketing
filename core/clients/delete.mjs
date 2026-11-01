// Delete a client and everything stored for it: database rows and files on disk.
// Admin only, needs the client's exact name typed as confirmation, and refuses while background work runs.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,q,tx,audit,fail} from '../db/index.mjs';
import {authorize} from '../auth/index.mjs';
import {dmpHome} from '../tools/dmp.mjs';

const LOCAL=path.join(ROOT,'.local');
// The purge permission lives in migration 003. Apply it here too (idempotent), so delete works even if
// the app was updated without a restart and the migration hasn't run yet.
let schemaReady=null;
const ensureSchema=()=>schemaReady||=q(fs.readFileSync(path.join(ROOT,'core/db/003-client-delete.sql'),'utf8')).catch(e=>{schemaReady=null;throw e;});
// only ever remove paths inside .local/, never the folder itself
function removeInside(p){const abs=path.resolve(ROOT,p);if(!abs.startsWith(LOCAL+path.sep))return false;if(!fs.existsSync(abs))return false;fs.rmSync(abs,{recursive:true,force:true});return true;}

export async function clientFootprint(clientId){
  const one=async(sql)=>(await q(sql,[clientId])).rows[0].n;
  return {
    records:await one('SELECT count(*)::int n FROM records WHERE client_id=$1'),
    files:await one('SELECT count(*)::int n FROM files WHERE client_id=$1'),
    jobs:await one('SELECT count(*)::int n FROM jobs WHERE client_id=$1'),
    running_jobs:await one("SELECT count(*)::int n FROM jobs WHERE client_id=$1 AND status='running'"),
    receipts:await one('SELECT count(*)::int n FROM tool_runs WHERE client_id=$1'),
    history:await one('SELECT count(*)::int n FROM audit WHERE client_id=$1'),
  };
}

export async function deleteClient(user,client,confirmName){
  authorize(user,['admin']);
  if(typeof confirmName!=='string'||confirmName.trim()!==client.name.trim())fail('Type the client’s name exactly to confirm');
  await ensureSchema();
  const before=await clientFootprint(client.id);
  if(before.running_jobs)fail('Background work is running for this client. Wait for it to finish, then delete.',409);
  const disk=await tx(async c=>{
    // lock the client row so nothing new is added for it while we delete
    const locked=await c.query('SELECT id FROM clients WHERE id=$1 FOR UPDATE',[client.id]);if(!locked.rowCount)fail('Client not found',404);
    if((await c.query("SELECT 1 FROM jobs WHERE client_id=$1 AND status='running'",[client.id])).rowCount)fail('Background work is running for this client. Wait for it to finish, then delete.',409);
    const recordIds=(await c.query('SELECT id FROM records WHERE client_id=$1',[client.id])).rows.map(r=>r.id);
    const receiptIds=(await c.query('SELECT id FROM tool_runs WHERE client_id=$1',[client.id])).rows.map(r=>r.id);
    const filePaths=(await c.query('SELECT storage_path FROM files WHERE client_id=$1',[client.id])).rows.map(r=>r.storage_path);
    await c.query("SELECT set_config('exora.purge_client',$1,true)",[client.id]);
    for(const t of ['tool_runs','jobs','runs','files','records','audit','memberships'])await c.query(`DELETE FROM ${t} WHERE client_id=$1`,[client.id]);
    await c.query('DELETE FROM clients WHERE id=$1',[client.id]);
    // one line of history remains, with no client data in it: who deleted which client id, when, and how much
    await audit(c,user,null,'delete:Client',client.id,{records:before.records,files:before.files,receipts:before.receipts,history:before.history});
    return {recordIds,receiptIds,filePaths};
  });
  // files go only after the database commit succeeded
  let removed=0;
  for(const p of disk.filePaths)if(removeInside(p))removed++;
  for(const p of [path.join('.local/uploads',client.id),path.relative(ROOT,dmpHome(client.id)),...disk.recordIds.map(r=>path.join('.local/renders',r)),...disk.receiptIds.map(r=>path.join('.local/tool-output',String(r)))])if(removeInside(p))removed++;
  return {ok:true,deleted:before,disk_paths_removed:removed};
}
