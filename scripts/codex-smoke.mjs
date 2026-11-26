import assert from 'node:assert/strict';
import {codexState,executeCodex} from '../core/runtime/providers/codex.mjs';

const auth=codexState(true);
assert.ok(auth.connected,auth.detail+' Run codex login as the user who runs EXORA.');
const result=await executeCodex({
 prompt:'Return only the following JSON object, without any other content: {"status":"ok"}',
 timeoutMs:90000,
});
const json=result.text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
assert.deepEqual(JSON.parse(json),{status:'ok'});
console.log('Codex smoke test passed.',{duration_ms:result.duration_ms,usage:result.usage});
