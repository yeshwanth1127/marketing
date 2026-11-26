// Caption lint results as structured checks, plus the hard numeric limits the caption skill enforces.
// A linter that ran and found problems is a failed check with findings. Only a linter that could not run is an error.
export const HASHTAG_LIMIT=5;
export const CAPTION_LIMIT=2200;

// What to do about each check, shown next to the finding. The linter's own detail says what is wrong.
const FIXES={
 'LENGTH':'Shorten the caption to 2,200 characters or fewer.',
 'FIRST LINE':'Open on a plain sentence of 125 characters or fewer: no hashtag, no mention, no blank line.',
 'HOOK IS CONCRETE':'Put a number or a name in the first 125 characters.',
 'HASHTAGS':`Use at most ${HASHTAG_LIMIT} hashtags, all specific to the topic. Remove generic tags such as #viral or #fyp.`,
 'TAG PLACEMENT':'Move hashtags to the bottom, below the first 125 characters.',
 'LINKS':'Remove links from the caption. Captions are not clickable: use the bio or a DM.',
 'ONE ASK':'Keep exactly one call to action: comment a keyword, save, or DM. Remove the others.',
 'EMOJI':'Use emoji as punctuation only: at most 4 per 100 characters.',
 'SEARCH TERMS':'Write the missing search phrases into the caption as normal sentences.',
};
export const fixFor=name=>FIXES[String(name||'').toUpperCase()]||'Rewrite this part of the caption to meet the check.';

/**
 * Normalises the caption linter's JSON (exit 0 or exit 1 both carry it) to the stored shape:
 * {ran:true, verdict, passed, checks:[{check,status,detail,fix?}], findings:[{check,status,finding,fix}], source}
 * Returns null when the output has no usable checks, which the caller treats as "did not run".
 */
export function parseCaptionLint(output){
 let o=output;
 if(typeof o==='string'){try{o=JSON.parse(o);}catch{return null;}}
 if(!o||typeof o!=='object'||!Array.isArray(o.checks)||!o.checks.length)return null;
 const checks=o.checks.filter(c=>c&&c.check).map(c=>{
  const status=String(c.status||'').toUpperCase();
  const base={check:String(c.check),status,detail:String(c.detail||'')};
  return status==='PASS'?base:{...base,fix:fixFor(c.check)};
 });
 const findings=checks.filter(c=>c.status==='FAIL'||c.status==='WARN').map(c=>({check:c.check,status:c.status,finding:c.detail,fix:c.fix}));
 const fails=checks.some(c=>c.status==='FAIL');
 const verdict=String(o.verdict||(fails?'FIX':findings.length?'REVIEW':'READY')).toUpperCase();
 return {ran:true,verdict,passed:!fails,checks,findings,characters:o.characters??null,source:'ig-caption/caption.py'};
}

/** The structured form of a linter that could not run at all. */
export const lintDidNotRun=error=>({ran:false,passed:false,error:String(error||'the linter did not run').slice(0,400),checks:[],findings:[],source:'ig-caption/caption.py'});

/** FAIL findings only: what the model is asked to fix. Warnings are advice and never trigger a rewrite. */
export const failingFindings=lint=>(lint?.findings||[]).filter(f=>f.status==='FAIL');

const TAG=/(^|\s)(#[A-Za-z0-9_]+)/g;
export const hashtagsIn=text=>[...String(text||'').matchAll(TAG)].map(m=>m[2]);

/**
 * Last-resort fix for the hard hashtag cap: keep the first `max` distinct tags, drop the rest from the text.
 * Does not touch anything else. A label line that is left with no tags (for example "First comment hashtags:") is removed.
 */
export function trimHashtags(text,max=HASHTAG_LIMIT){
 const src=String(text||'');
 const seen=new Set();const keep=new Set();
 for(const t of hashtagsIn(src)){const k=t.toLowerCase();if(seen.has(k))continue;seen.add(k);if(keep.size<max)keep.add(k);}
 const emitted=new Set();
 let out=src.replace(TAG,(m,lead,tag)=>{
  const k=tag.toLowerCase();
  if(!keep.has(k))return '';
  if(emitted.has(k))return '';
  emitted.add(k);return m;
 });
 // A label that introduced removed tags, now followed by nothing, goes with them.
 out=out.replace(/^[^\S\n]*(?:first comment\s+)?hashtags?\s*:\s*$/gim,'');
 // Removed tags take their leading space with them, so no double spaces are left behind.
 out=out.replace(/[^\S\n]+$/gm,'').replace(/\n{3,}/g,'\n\n').trim();
 return out;
}
