import assert from 'node:assert/strict';
import test from 'node:test';
import {VOICE_TYPES,VOICE_FLOWS,voiceCatalog,findVoice,assertVoiceId,preferredVoice,cachedPreviewPath} from '../core/runtime/voices.mjs';

test('Four voice types are always offered with sample copy',()=>{
 assert.ok(VOICE_TYPES.length>=4);
 for(const voice of VOICE_TYPES){
  assert.match(voice.voice_id,/^[A-Za-z0-9_-]+$/);
  assert.ok(voice.name);
  assert.ok(voice.sample.length>20);
  assert.ok(voice.use);
 }
 assert.equal(new Set(VOICE_TYPES.map(v=>v.voice_id)).size,VOICE_TYPES.length);
 assert.equal(typeof voiceCatalog()[0].cached,'boolean');
 assert.equal(cachedPreviewPath('zzzzMissingVoiceId999'),null);
});

test('The three narration flows stay named and distinct',()=>{
 assert.deepEqual(VOICE_FLOWS.map(f=>f.id),['script-voice-video','script-video-voice','upload-voice']);
});

test('Workspace default voice prefers a saved catalog voice',()=>{
 const rachel=VOICE_TYPES[0].voice_id;
 assert.equal(preferredVoice({settings:{voice:{voice_id:rachel}}}).voice_id,rachel);
 assert.equal(preferredVoice({settings:{}}).key,'warm-host');
 assert.equal(findVoice(rachel).name,'Warm host');
 assert.equal(voiceCatalog()[0].preview.includes(rachel),true);
 assert.throws(()=>assertVoiceId('bad voice'));
});
