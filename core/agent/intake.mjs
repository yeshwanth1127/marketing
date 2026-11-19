import {cleanBrief,validData,validProfile} from '../api.mjs';
import {fail,requireText} from '../db/index.mjs';

// Hand-written questions. Required fields are always asked. The rest are asked one at a time
// and can be skipped. Values are checked with the same validators the buttons use.
export const companyFields=[
 {key:'name',required:true,label:'Client record — what is the company / client name? This is the account, not a brand or product.'},
 {key:'industry',required:true,label:'Client record — what industry is this company in?'},
 {key:'city',required:true,label:'Client record — which city is the company based in?'},
 {key:'region',required:false,label:'Client record — which state? Karnataka, Maharashtra, Tamil Nadu, Delhi NCR, or Other. Reply skip to leave this out.'},
 {key:'website',required:false,label:'Client record — what is the company website? Reply skip if there is none.'},
 {key:'languages',required:false,label:'Client record — which languages should we post in by default? Reply skip to use English.'},
 {key:'notes',required:false,label:'Client record — any notes about the account? Reply skip if none.'},
];
export const brandFields=[
 {key:'name',required:true,label:'Brand record — what is this brand’s customer-facing name? (Not the client company, not a product.)'},
 {key:'industry',required:false,label:'Brand record — does this brand work in a different industry? Reply skip to keep the client industry.'},
 {key:'languages',required:false,label:'Brand record — which languages for this brand? Reply skip to keep the client languages.'},
 {key:'website',required:false,label:'Brand record — does this brand have its own website? Reply skip if not.'},
];
export const productFields=[
 {key:'name',required:true,label:'Product record — what is the product or service name? (This is the offer, not the brand.)'},
 {key:'description',required:true,label:'Product record — in one or two sentences, what is this product?'},
 {key:'category',required:false,label:'Product record — what category is it? Reply skip if you would rather not say.'},
 {key:'sector',required:false,label:'Product record — which sector should the ad-rules check use? Reply skip to keep the industry.'},
 {key:'audience',required:false,label:'Product record — who buys this product? Reply skip if unknown.'},
 {key:'offer',required:false,label:'Product record — what is the price or offer? Reply skip if you do not want one stated.'},
 {key:'selling_points',required:false,label:'Product record — main selling points, one per line. Reply skip if none yet.'},
 {key:'variants',required:false,label:'Product record — variants such as sizes or flavours, one per line. Reply skip if none.'},
 {key:'where_sold',required:false,label:'Product record — where is it sold? Reply skip if unknown.'},
 {key:'evidence',required:false,label:'Product record — proof for a claim, as: claim | source | date. Reply skip if there is no proof yet. I will not invent proof.'},
];
export const detailFields=[
 {key:'name',required:false,label:'What should the name be? Reply skip to keep it.'},
 {key:'industry',required:false,label:'What should the industry be? Reply skip to keep it.'},
 {key:'city',required:false,label:'What should the city be? Reply skip to keep it.'},
 {key:'region',required:false,label:'What should the state be? Reply skip to keep it.'},
 {key:'website',required:false,label:'What should the website be? Reply skip to keep it, or none to clear it.'},
 {key:'notes',required:false,label:'What notes should we keep? Reply skip to keep them, or none to clear them.'},
 {key:'languages',required:false,label:'Which languages? Reply skip to keep them.'},
];

const lines=v=>String(v||'').split('\n').map(s=>s.trim()).filter(Boolean);
const langs=v=>String(v||'').split(',').map(s=>s.trim()).filter(Boolean);

export function companyBody(args){
 const body={name:requireText(args.name,'Client name',150),industry:requireText(args.industry,'Industry',100),city:requireText(args.city,'City',100),region:args.region||'Karnataka',tier:args.tier||'Tier 1',languages:langs(args.languages).length?langs(args.languages):['English']};
 if(args.website)body.website=String(args.website).slice(0,300);
 if(args.notes)body.notes=String(args.notes).slice(0,2000);
 return body;
}
export function brandBody(args,parent){
 return {name:requireText(args.name,'Brand name',150),industry:args.industry||parent.industry,city:parent.city,region:parent.data?.region||'Karnataka',languages:langs(args.languages).length?langs(args.languages):parent.languages,website:args.website||'',parent_id:parent.id,node_type:'brand'};
}
export function productBody(args,parent){
 const evidence=lines(args.evidence).map(l=>{const [claim,source,date]=l.split('|').map(s=>s.trim());return {claim,source:source||'',date:date||''};});
 const brief=cleanBrief({description:args.description,category:args.category||'',sector:args.sector||parent.industry,audience:args.audience||'',offer:args.offer||'',selling_points:lines(args.selling_points),variants:lines(args.variants),where_sold:args.where_sold||'',evidence});
 if(!brief.description)fail('Say what the product is');
 return {name:requireText(args.name,'Product name',150),industry:parent.industry,city:parent.city,region:parent.data?.region||'Karnataka',languages:parent.languages,brief,parent_id:parent.id,node_type:'product'};
}
export function brandKitData(args){
 const colors=Array.isArray(args.colors)?args.colors:String(args.colors||'').split(/[\s,]+/).filter(Boolean);
 const data={colors,font:args.font||'Arial',voice:args.voice||'',audience:args.audience||'',banned_words:lines(args.banned_words),disclaimers:args.disclaimers||'',preferred_words:lines(args.preferred_words),profile:args.profile};
 if(args.logo_file_id)data.logo_file_id=args.logo_file_id;
 return validData('BrandKit',data);
}

// Samples the intake test runs through the real validators.
export const intakeSamples={
 company:{name:'Fabblen Clothing',industry:'Apparel',city:'Bengaluru',region:'Karnataka',tier:'Tier 1',website:'https://fabblen.example',languages:'English, Hindi',notes:'Two brands.'},
 brand:{name:'Fabblen Studio',industry:'Apparel',languages:'English, Hindi',website:'https://studio.fabblen.example'},
 product:{name:'Linen shirt',description:'A washed linen shirt for warm weather.',category:'Shirts',sector:'Apparel',audience:'Women in Bengaluru',offer:'₹2,400',selling_points:'Breathable linen',variants:'S\nM\nL',where_sold:'Website and Indiranagar store',evidence:'Woven in Tamil Nadu | Mill note | 2026-01-01'},
 brandKit:{colors:['#112233','#abcdef'],voice:'Calm and plain.',audience:'City shoppers',banned_words:'cheap',profile:{colors:{paper:'#112233',ink:'#111111',accent:'#abcdef'}}},
};

export function assertIntakeSamples(parent={industry:'Apparel',city:'Bengaluru',languages:['English'],data:{region:'Karnataka'}}){
 companyBody(intakeSamples.company);
 brandBody(intakeSamples.brand,parent);
 const product=productBody(intakeSamples.product,parent);
 cleanBrief(product.brief);
 const kit=brandKitData(intakeSamples.brandKit);
 validProfile(kit.profile);
}
