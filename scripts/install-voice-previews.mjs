#!/usr/bin/env node
// Install local ElevenLabs samples for the four catalog voices into .local/voice-previews/
import {installVoicePreviews,VOICE_TYPES} from '../core/runtime/voices.mjs';

const force=process.argv.includes('--force');
console.log(`Installing ${VOICE_TYPES.length} ElevenLabs voice samples${force?' (force)':''}…`);
const out=await installVoicePreviews({force});
for(const r of out.results){
 if(r.error)console.error(`  ✗ ${r.name}: ${r.error}`);
 else if(r.cached)console.log(`  · ${r.name}: already cached`);
 else console.log(`  ✓ ${r.name}: ${r.bytes} bytes`);
}
console.log(`Ready ${out.ready}/${out.total} in ${out.dir}`);
process.exit(out.ok?0:1);
