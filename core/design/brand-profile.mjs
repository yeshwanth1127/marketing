// Server-side access to the EXORA design engine: font catalog, brand profiles, and HTML composition.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const ENGINE=path.join(ROOT,'modules/06-design-video/skills/exora-design-system/engine');
export const FONTS=path.join(ROOT,'exora/fonts');
import * as engine from '../../modules/06-design-video/skills/exora-design-system/engine/index.mjs';
export const {compose,normalize:normalizeRaw,audit,LAYOUTS,CANVAS,describe,css,rolesFromPalette}=engine;
let cached;export const catalog=()=>cached||(cached=JSON.parse(fs.readFileSync(path.join(FONTS,'catalog.json'),'utf8')));
// BrandKit record data (+ client) → full brand profile.
export const profileFor=(brandData={},client={})=>normalizeRaw({...brandData,client_name:client.brand_name||client.name,languages:brandData.languages||client.languages||[]},catalog());
export const brandWithTheme=(brand,theme)=>theme?{...brand,profile:{...(brand.profile||{}),colors:{...(brand.profile?.colors||{}),...(theme.colors||{}),...(Array.isArray(theme.colors?.support)?{support:theme.colors.support}:{})},type:{...(brand.profile?.type||{}),display:{...(brand.profile?.type?.display||{}),...(theme.fonts?.heading?{font:theme.fonts.heading}:{})},body:{...(brand.profile?.type?.body||{}),...(theme.fonts?.body?{font:theme.fonts.body}:{})}}},...(theme.mode?{theme_mode:theme.mode}:{})}:brand;
// Fonts a profile actually uses (for copying into a sandbox).
export function fontsUsed(pr){const t=pr.type;return [...new Set([t.display.font,t.body.font,t.label.font,...Object.values(t.scripts||{})].filter(Boolean))];}
export function catalogFor(pr){const ids=fontsUsed(pr);return {...catalog(),fonts:catalog().fonts.filter(f=>ids.includes(f.id))};}
export const fontsUrl='file://'+FONTS;

// Copy asset → layout slots, for the no-Claude path (and as Claude's starting point).
export function slotsFromAsset(asset,layout){
 const d=asset.data||{};if(d.slots&&typeof d.slots==='object')return layout==='campaign'&&d.artwork_photo?{...d.slots,photo:d.product_photo,artwork:true}:d.slots;
 const lines=(d.on_screen_text?.length?d.on_screen_text:[asset.title]).map(String);
 const sub=String(d.caption||'').split('\n')[0].slice(0,160);
 if(layout==='list')return {title:lines[0],items:lines.slice(1).map(t=>({title:t})),cta:d.cta||''};
 if(layout==='campaign'){
  // No-Claude path: a short uppercase headline from the hook, the first sentence as the support line, the CTA as one corner label.
  // Labels are never invented: only the CTA is used. Claude's composer writes the real corner labels.
  const headline=String(lines[0]||'').replace(/[.!?]+$/,'').split(/\s+/).slice(0,4).join(' ');
  const ctaWords=String(d.cta||'').trim().split(/\s+/).filter(Boolean);const cta=ctaWords.length&&ctaWords.length<=3?ctaWords.join(' '):'';// a longer call to action stays in the caption
  return {headline,support:sub.split(/(?<=[.!?])\s/)[0].slice(0,110),labels:['','','',cta],...(d.product_photo?{photo:d.product_photo,artwork:d.artwork_photo===true}:{})};
 }
 return {headline:lines[0],sub,cta:d.cta||''};
}
// Apparel and other physical products get studio campaign posts (a real product as the hero), not text cards.
const PRODUCT_INDUSTRY=/fashion|apparel|cloth|garment|menswear|womenswear|streetwear|footwear|shoe|sneaker|jewel|watch|accessor|boutique|textile|saree|denim|merch|lifestyle brand/i;
export const isProductPost=(client,asset)=>['image','carousel'].includes(asset?.data?.type)&&PRODUCT_INDUSTRY.test(String(client?.industry||''));
export const defaultLayout=(asset,client)=>asset.data?.layout&&LAYOUTS[asset.data.layout]?asset.data.layout:isProductPost(client,asset)?'campaign':asset.data?.type==='carousel'?'list':'hook';
// Deterministic frames for an asset (fixed-layout path). Fonts load from the local font library.
export function templateFrames({asset,brand,client,layout,format}){
 const l=layout&&LAYOUTS[layout]?layout:defaultLayout(asset,client);let slots=slotsFromAsset(asset,l);
 if(l==='list'&&(!slots.items||slots.items.length<2))return templateFrames({asset,brand,client,layout:'hook',format});
 const pr=profileFor(brand,client);
 if(brand.logo_path)pr.logo.file=brand.logo_path;
 return compose({layout:l,slots,profile:pr,catalog:catalog(),format:format||'portrait',fontBase:fontsUrl,logoBase:brand.logo_path?'file://':''});
}
