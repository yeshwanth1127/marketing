// Validates user-supplied parameters for a declared skill tool and turns them into CLI args (+ stdin).
// Types: number, choice, json, string (short), text (long; to stdin or the run's input file), flag (boolean switch).
const bad=m=>{const e=new Error(m);e.status=400;throw e;};
export function buildInput(spec,params={}){
 if(!Array.isArray(spec.params))bad('This tool takes no user input');
 const args=[];let stdin='';
 for(const p of spec.params){
  let v=params[p.name];const name=p.label||p.name;
  if(v===undefined||v===null||v===''||(p.type==='flag'&&!v)){if(p.required)bad(`${name} is required`);continue;}
  if(p.type==='number'){v=Number(v);if(!Number.isFinite(v))bad(`${name} must be a number`);if(p.min!==undefined&&v<p.min)bad(`${name} must be at least ${p.min}`);if(p.max!==undefined&&v>p.max)bad(`${name} must be at most ${p.max}`);v=String(v);}
  else if(p.type==='choice'){if(!(p.choices||[]).includes(v))bad(`${name} must be one of ${(p.choices||[]).join(', ')}`);}
  else if(p.type==='json'){try{v=JSON.stringify(typeof v==='string'?JSON.parse(v):v);}catch{bad(`${name} must be valid JSON`);}if(v.length>(p.max_length||20000))bad(`${name} is too large`);}
  else if(p.type==='string'){v=String(v);if(v.length>(p.max_length||500))bad(`${name} is too long`);if(/[\0]/.test(v))bad(`${name} contains invalid characters`);}
  else if(p.type==='text'){v=String(v);if(v.length>(p.max_length||50000))bad(`${name} is too long`);
   if(p.to==='stdin'||p.to==='file'){stdin=v;if(p.to==='file')args.push(...(p.flag?[p.flag]:[]),'{input_file}');continue;}}
  else if(p.type==='flag'){args.push(p.flag);continue;}
  else bad('Unsupported parameter type');
  if(p.positional)args.push(v);else args.push(p.flag,v);
 }
 return {args,stdin};
}
export const buildArgs=(spec,params)=>buildInput(spec,params).args;
