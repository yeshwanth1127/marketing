// Validates user-supplied parameters for a declared calculator script and turns them into CLI args.
const bad=m=>{const e=new Error(m);e.status=400;throw e;};
export function buildArgs(spec,params={}){
 if(!Array.isArray(spec.params))bad('This tool takes no user input');
 const args=[];
 for(const p of spec.params){
  let v=params[p.name];
  if(v===undefined||v===null||v===''){if(p.required)bad(`${p.label||p.name} is required`);continue;}
  if(p.type==='number'){v=Number(v);if(!Number.isFinite(v))bad(`${p.label||p.name} must be a number`);if(p.min!==undefined&&v<p.min)bad(`${p.label||p.name} must be at least ${p.min}`);if(p.max!==undefined&&v>p.max)bad(`${p.label||p.name} must be at most ${p.max}`);v=String(v);}
  else if(p.type==='choice'){if(!(p.choices||[]).includes(v))bad(`${p.label||p.name} must be one of ${(p.choices||[]).join(', ')}`);}
  else if(p.type==='json'){try{v=JSON.stringify(typeof v==='string'?JSON.parse(v):v);}catch{bad(`${p.label||p.name} must be valid JSON`);}if(v.length>20000)bad(`${p.label||p.name} is too large`);}
  else bad('Unsupported parameter type');
  args.push(p.flag,v);
 }
 return args;
}
