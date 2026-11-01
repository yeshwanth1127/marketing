// Server-side access to the EXORA design engine: font catalog, brand profiles, and HTML composition.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const ENGINE=path.join(ROOT,'modules/06-design-video/skills/exora-design-system/engine');
export const FONTS=path.join(ROOT,'exora/fonts');
const engine=await import(path.join(ENGINE,'index.mjs'));
export const {compose,normalize:normalizeRaw,audit,LAYOUTS,CANVAS,describe,css,rolesFromPalette}=engine;
let cached;export const catalog=()=>cached||(cached=JSON.parse(fs.readFileSync(path.join(FONTS,'catalog.json'),'utf8')));
// BrandKit record data (+ client) → full brand profile.
export const profileFor=(brandData={},client={})=>normalizeRaw({...brandData,client_name:client.name,languages:brandData.languages||client.languages||[]},catalog());
// Fonts a profile actually uses (for copying into a sandbox).
export function fontsUsed(pr){const t=pr.type;return [...new Set([t.display.font,t.body.font,t.label.font,...Object.values(t.scripts||{})].filter(Boolean))];}
export function catalogFor(pr){const ids=fontsUsed(pr);return {...catalog(),fonts:catalog().fonts.filter(f=>ids.includes(f.id))};}
export const fontsUrl='file://'+FONTS;

// Copy asset → layout slots, for the no-Claude path (and as Claude's starting point).
export function slotsFromAsset(asset,layout){
 const d=asset.data||{};if(d.slots&&typeof d.slots==='object')return d.slots;
 const lines=(d.on_screen_text?.length?d.on_screen_text:[asset.title]).map(String);
 const sub=String(d.caption||'').split('\n')[0].slice(0,160);
 if(layout==='list')return {title:lines[0],items:lines.slice(1).map(t=>({title:t})),cta:d.cta||''};
 return {headline:lines[0],sub,cta:d.cta||''};
}
export const defaultLayout=asset=>asset.data?.layout&&LAYOUTS[asset.data.layout]?asset.data.layout:asset.data?.type==='carousel'?'list':'hook';
// Deterministic frames for an asset (fixed-layout path). Fonts load from the local font library.
export function templateFrames({asset,brand,client,layout,format}){
 const l=layout&&LAYOUTS[layout]?layout:defaultLayout(asset);let slots=slotsFromAsset(asset,l);
 if(l==='list'&&(!slots.items||slots.items.length<2))return templateFrames({asset,brand,client,layout:'hook',format});
 const pr=profileFor(brand,client);
 if(brand.logo_path)pr.logo.file=brand.logo_path;
 return compose({layout:l,slots,profile:pr,catalog:catalog(),format:format||'portrait',fontBase:fontsUrl,logoBase:brand.logo_path?'file://':''});
}
