export const MONTH_FIELDS=[
 {key:'month',required:true,label:'Which month should we produce? Use YYYY-MM.'},
 {key:'goal',required:true,label:'What is the measurable goal this month?'},
 {key:'offer',required:true,label:'What offer may we use? Reply “No offer” if none — I will not invent one.'},
 {key:'posts',required:true,type:'number',label:'How many static image posts?'},
 {key:'reels',required:true,type:'number',label:'How many reels / videos?'},
 {key:'carousels',required:true,type:'number',label:'How many carousels?'},
 {key:'ads',required:true,type:'number',label:'How many ad variants?'},
 {key:'budget',required:true,type:'number',label:'Paid budget in rupees (INR) for the month? Reply 0 if none.'},
 {key:'language',required:false,label:'Which language? Reply skip to use the client default.'},
 {key:'channels',required:false,label:'Which channels? Instagram, Google Ads, SEO. Reply skip to use the package.'},
];

const n=(v,max)=>Math.max(0,Math.min(max,Number.parseInt(String(v??'0'),10)||0));

export function monthInputs(raw={}){
 const month=/^\d{4}-\d{2}$/.test(String(raw.month||''))?String(raw.month):new Date().toISOString().slice(0,7);
 const posts=n(raw.posts,30),reels=n(raw.reels,20),carousels=n(raw.carousels,20),ads=n(raw.ads,20);
 if(posts+reels+carousels<1)throw Object.assign(new Error('Ask for at least one post, reel or carousel'),{status:400});
 const budget=Number(String(raw.budget||'0').replace(/[^\d.]/g,''))||0;
 const channels=(Array.isArray(raw.channels)?raw.channels.map(String):String(raw.channels||'').split(/[,/]| and /i)).map(s=>s.trim()).filter(Boolean);
 return {
  month,goal:String(raw.goal||'').trim().slice(0,500),offer:String(raw.offer||'').trim().slice(0,500),
  posts,reels,carousels,ads,budget,language:String(raw.language||'').trim(),
  channels,seo:channels.some(c=>/seo/i.test(c)),
 };
}

export function monthBrief(inputs){
 return [
  `Monthly production for ${inputs.month}.`,
  inputs.goal&&`Goal: ${inputs.goal}`,
  inputs.offer&&inputs.offer.toLowerCase()!=='no offer'?`Offer (client-confirmed): ${inputs.offer}`:'No offer stated — do not invent prices or promotions.',
  `Counts: ${inputs.posts} static posts, ${inputs.reels} reels, ${inputs.carousels} carousels, ${inputs.ads} ad variants.`,
  `Budget: ₹${inputs.budget} INR.`,
  inputs.language&&`Language: ${inputs.language}`,
  inputs.channels?.length&&`Channels: ${inputs.channels.join(', ')}`,
  'Do not invent proof, prices or numbers. Use the brand kit, signed strategy and saved records only.',
 ].filter(Boolean).join('\n');
}

export function buildSlots(inputs){
 const [y,m]=inputs.month.split('-').map(Number);
 const days=new Date(y,m,0).getDate();
 const kinds=[
  ...Array.from({length:inputs.posts},()=>({format:'Post',visual:'image',platform:'Instagram'})),
  ...Array.from({length:inputs.reels},()=>({format:'Reel',visual:'video',platform:'Instagram'})),
  ...Array.from({length:inputs.carousels},()=>({format:'Carousel',visual:'carousel',platform:'Instagram'})),
 ];
 const n=Math.max(kinds.length,1);
 return kinds.map((k,i)=>{
  const day=Math.min(days,1+Math.floor(i*(days-1)/Math.max(n-1,1)));
  return {date:`${inputs.month}-${String(day).padStart(2,'0')}`,time:'18:30',format:k.format,platform:k.platform,visual:k.visual,topic:'',status:'idea'};
 });
}

export function visualFor(format){
 if(/reel|video/i.test(format||''))return {type:'video',format:'reel'};
 if(/carousel/i.test(format||''))return {type:'carousel',format:'portrait'};
 return {type:'image',format:'portrait'};
}

export function contentSkill(format){
 if(/reel|video/i.test(format||''))return 'reel-scripter';
 if(/carousel/i.test(format||''))return 'carousel-builder';
 return 'caption-and-hashtags';
}
