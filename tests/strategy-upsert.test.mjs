// Strategy saves upsert the live draft for a workspace instead of stacking duplicates.
import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {handle} from '../core/api.mjs';import {q,pool} from '../core/db/index.mjs';
after(async()=>pool.end());
const stamp=Date.now();
async function request(route,body,token){const r=await handle(new Request('http://localhost:3100/api/'+route,{method:body?'POST':'GET',headers:{...(token?{cookie:token}:{}),...(body?{'content-type':'application/json',origin:'http://localhost:3100'}:{})},body:body?JSON.stringify(body):undefined}));let data=null;try{data=await r.clone().json()}catch{}return {status:r.status,data};}
const act=(client_id,body,t)=>request('action',{client_id,...body},t);
const login=async(email,password)=>{const r=await handle(new Request('http://localhost:3100/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3100'},body:JSON.stringify({email,password})}));return r.headers.get('set-cookie').split(';')[0];};

test('saving a strategy twice updates the same draft',async()=>{
 const admin=await login('admin@exora.local','ExoraLocal!2026');
 const co=(await act(null,{action:'create-client',name:'Strategy Upsert '+stamp,industry:'Education',city:'Bengaluru',languages:['English']},admin)).data.id;
 try{
  const first=await act(co,{action:'save-record',kind:'Strategy',title:'Draft A',data:{objective:'Grow',positioning:'Local',audience:'Parents',body:'v1'}},admin);
  assert.equal(first.status,200,JSON.stringify(first.data));
  const second=await act(co,{action:'save-record',kind:'Strategy',title:'Draft A · updated',data:{objective:'Grow more',positioning:'Local',audience:'Parents',body:'v2',finalized_at:new Date().toISOString(),finalized_title:'Draft A · updated'}},admin);
  assert.equal(second.status,200,JSON.stringify(second.data));
  assert.equal(second.data.id,first.data.id,'second save must update the same row');
  const third=await act(co,{action:'save-record',kind:'Strategy',id:first.data.id,title:'Draft A · again',data:{objective:'Grow more',positioning:'Local',audience:'Parents',body:'v3',finalized_at:new Date().toISOString(),finalized_title:'Draft A · again'}},admin);
  assert.equal(third.status,200);
  assert.equal(third.data.id,first.data.id);
  const rows=(await q("SELECT id,title FROM records WHERE client_id=$1 AND kind='Strategy' AND status<>'archived'",[co])).rows;
  assert.equal(rows.length,1,JSON.stringify(rows));
  assert.equal(rows[0].title,'Draft A · again');
 }finally{
  const {deleteClient}=await import('../core/clients/delete.mjs');
  const {resolveClient}=await import('../core/clients/tree.mjs');
  const adminUser=(await q("SELECT * FROM users WHERE email='admin@exora.local'")).rows[0];
  await deleteClient(adminUser,await resolveClient(co),'Strategy Upsert '+stamp);
 }
});
