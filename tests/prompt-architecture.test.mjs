import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPromptSpecification,renderPromptSpecification} from '../core/runtime/prompts/prompt-builder.mjs';
import {LAYER_ORDER} from '../core/runtime/prompts/prompt-types.mjs';
import {validatePrompt} from '../core/runtime/prompts/prompt-validator.mjs';
import {selectedProvider} from '../core/runtime/providers/index.mjs';
import {draftRunner} from '../core/runtime/providers/generation.mjs';
import {promptMetadata} from '../core/runtime/prompts/prompt-builder.mjs';

test('builder emits the exact ten conceptual layers in the required order',()=>{
  const spec=buildPromptSpecification({client:{id:'c1',name:'North Star',node_type:'brand',industry:'Apparel',languages:['English']},brand:{voice:'Warm, direct'},workflow:'05-content',records:[],input:{brief:'Write a carousel',format:'Carousel'},sample:[{kind:'Asset'}]});
  assert.deepEqual(spec.layers.map(x=>x.name),LAYER_ORDER);
  assert.equal(validatePrompt(spec).valid,true);
  const rendered=renderPromptSpecification(spec);
  for(let i=1;i<=10;i++)assert.ok(rendered.includes(`LAYER ${i}:`));
  assert.match(rendered,/Warm, direct/);
});

test('background context labels missing information and does not fabricate sources',()=>{
  const spec=buildPromptSpecification({client:{id:'c',name:'A'},workflow:'05-content',records:[],input:{brief:'Make it'}});
  assert.match(spec.layers[2].content,/No relevant records/);
  assert.deepEqual(spec.layers[2].sources,[]);
});

test('provider selector respects a single explicit selection and workspace default',()=>{
  assert.equal(selectedProvider('codex',{default_provider:'claude'}),'codex');
  assert.equal(selectedProvider(undefined,{default_provider:'codex'}),'codex');
  assert.throws(()=>selectedProvider('both'),/Choose Claude, Codex/);
});

test('validator rejects reordered and missing layers',()=>{
  const spec=buildPromptSpecification({client:{name:'A'},workflow:'05-content',input:{brief:'Do it'}});
  spec.layers.reverse();
  assert.equal(validatePrompt(spec).valid,false);
});

test('examples match the workflow and history is ordered and deduplicated',()=>{
  const spec=buildPromptSpecification({client:{name:'A'},workflow:'05-content',input:{brief:'Use the new voice',format:'Carousel'},examples:[{id:'reel-only',format:'Reel'}],
    history:[{id:'b',role:'assistant',content:'Updated draft',created_at:'2026-11-02'},{id:'a',role:'user',content:'Earlier request',created_at:'2026-11-01'},{id:'dup',role:'user',content:'Earlier request'}]});
  assert.deepEqual(spec.layers[4].sources,['content.cta@1']);
  assert.deepEqual(spec.layers[5].sources,['a','b']);
  assert.equal(spec.layers[6].content,'Use the new voice\n\nformat: Carousel');
  assert.doesNotMatch(JSON.stringify(promptMetadata(spec)),/Use the new voice|Earlier request/);
});

test('prefill is validated and deliberately omitted for CLI transport',()=>{
  const input={client:{name:'A'},workflow:'05-content'};
  const spec=buildPromptSpecification({...input,prefill:'PRIVATE_PREFIX'});
  assert.equal(spec.layers[9].populated,true);
  assert.doesNotMatch(renderPromptSpecification(spec),/PRIVATE_PREFIX/);
  assert.throws(()=>buildPromptSpecification({...input,prefill:{unsafe:true}}),/Prefill must/);
});

test('orchestrator persists validation metadata before running only the selected provider',async()=>{
  const calls=[];
  const runner=draftRunner('codex',{providers:{
    claude:()=>assert.fail('Unselected provider was invoked'),
    codex:(_ctx,_mod,_skills,_sample,{promptSpecification})=>{
      calls.push('codex');
      assert.equal(validatePrompt(promptSpecification).valid,true);
      throw new Error('selected provider failed');
    },
  },persistPrompt:()=>calls.push('inspection')});
  await assert.rejects(runner({client:{name:'A'},records:[],workspace:{input:{brief:'Write a caption'}}},{key:'05-content',io:{writes:['Asset']}},[],[]),/selected provider failed/);
  assert.deepEqual(calls,['inspection','codex']);
});

test('worker preserves provider and inspector and uploads enforce workspace access',{skip:!process.env.DATABASE_URL},async()=>{
  const {q,id,hash,pool}=await import('../core/db/index.mjs');
  const {handle}=await import('../core/api.mjs');
  const {runGenerateJob}=await import('../core/agent/jobs.mjs');
  const {promptAttachments}=await import('../core/runtime/prompts/context.mjs');
  const admin=(await q("SELECT id FROM users WHERE role='admin' AND active LIMIT 1")).rows[0].id;
  const reviewer=id(),client=id(),other=id(),job=id(),file=id();
  try{
    await q("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Inspector Test',$2,'unused','reviewer')",[reviewer,reviewer+'@example.test']);
    await q("INSERT INTO clients(id,name,industry,city) VALUES($1,'Prompt test','Apparel','Pune'),($2,'Separate workspace','Apparel','Pune')",[client,other]);
    await q('INSERT INTO memberships(user_id,client_id) VALUES($1,$2)',[reviewer,client]);
    await q("INSERT INTO files(id,client_id,name,mime,size,storage_path) VALUES($1,$2,'private.txt','text/plain',4,'uploads/private.txt')",[file,other]);
    await assert.rejects(promptAttachments({id:client},[file]),{status:404});
    const payload={module:'05-content',provider:'local_template',brief:'Write a fitting guide'};
    await q("INSERT INTO jobs(id,client_id,type,payload,created_by) VALUES($1,$2,'generate',$3,$4)",[job,client,payload,admin]);
    const result=await runGenerateJob({id:job,client_id:client,created_by:admin,payload});
    assert.equal(result.provider,'local_template');
    const run=result.records[0].data.run_id;
    const inspect=async(actor,workspace)=>{
      const token=id();
      await q("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[hash(token),actor]);
      return handle(new Request('http://127.0.0.1:3100/api/prompt-inspector?client='+workspace+'&run='+run,{headers:{cookie:'exora_session='+token}}));
    };
    assert.equal((await inspect(reviewer,client)).status,403);
    assert.equal((await inspect(admin,other)).status,404);
    const response=await inspect(admin,client);
    assert.equal(response.status,200);
    assert.equal((await response.json()).generation.provider,'local_template');
  }finally{await pool.end();}
});
