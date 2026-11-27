export const EXACT_DIRECTION = 'Replicate the attached reference exactly: same layout, composition, typography, colour placement, spacing and graphic elements. Replace only the text, logo and subject with this brand’s content. Do not reinterpret, restyle or add elements.';
export const referenceFidelity = data => data?.reference_fidelity || (data?.reference_image_file_id ? 'exact' : 'inspired');
export const isExactReference = template => !!template && referenceFidelity(template.data) === 'exact';

const slotKinds = ['headline','body','cta','brand','logo','subject'];
const colour = /^#[0-9a-f]{6}$/i;
const choice = (value, values, fallback) => values.includes(value) ? value : fallback;
const number = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max,Math.max(min,value)) : fallback;

export function normalizeDesignSpec(input, dimensions) {
 const {width,height} = dimensions || input?.canvas || {};
 if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 24000000) throw new Error('Choose a reference image under 24 megapixels.');
 if (!Array.isArray(input?.slots) || input.slots.length > 32) throw new Error('The design spec must have a slots array with up to 32 entries.');
 const slots = input.slots.map((s,index) => {
  if (!s || !slotKinds.includes(s.kind)) throw new Error('Choose a valid content slot type.');
  const bounds = ['x','y','width','height'].map(key => s[key]);
  if (!bounds.every(v => typeof v === 'number' && Number.isFinite(v)) || s.x < 0 || s.y < 0 || s.width <= 0 || s.height <= 0 || s.x+s.width > 100.01 || s.y+s.height > 100.01) throw new Error('Slot bounds must be percentages within the reference canvas.');
  return {
   kind:s.kind, x:s.x, y:s.y, width:s.width, height:s.height,
   z:number(s.z,0,100,index), row:Number.isInteger(s.row) && s.row >= 0 && s.row <= 8 ? s.row : 0,
   color:colour.test(s.color) ? s.color.toLowerCase() : '#111111',
   fill:colour.test(s.fill) ? s.fill.toLowerCase() : null,
   brand_color:choice(s.brand_color,['paper','ink','accent'],null),
   font:/^[\w .,'-]{1,64}$/.test(s.font || '') ? s.font : 'sans-serif',
   size:number(s.size,0.2,50,Math.min(s.height,5)),
   weight:number(s.weight,100,900,400), italic:s.italic === true,
   align:choice(s.align,['left','center','right'],'left'),
   case:choice(s.case,['uppercase','lowercase','capitalize'],'none'),
   letter_spacing:number(s.letter_spacing,-5,20,0),
   line_height:number(s.line_height,0.7,2,1),
   radius:number(s.radius,0,50,0),
   fit:choice(s.fit,['contain','cover'],s.kind==='logo'?'contain':'cover'),
   crop_x:number(s.crop_x,0,100,50), crop_y:number(s.crop_y,0,100,50),
  };
 });
 return {
  version:1, canvas:{width,height}, slots,
  grid:String(input.grid||'').slice(0,400),
  regions:Array.isArray(input.regions) ? input.regions.slice(0,32).filter(r=>r&&typeof r==='object').map(r=>({
   label:String(r.label||'').slice(0,80), color:colour.test(r.color)?r.color.toLowerCase():null,
   x:number(r.x,0,100,0),y:number(r.y,0,100,0),width:number(r.width,0,100,100),height:number(r.height,0,100,100),
   details:String(r.details||'').slice(0,250),
  })) : [],
  palette:Array.isArray(input.palette) ? input.palette.filter(c=>colour.test(c)).slice(0,16) : [],
  analysis:choice(input.analysis,['vision','ocr','manual'],'manual'),
 };
}
