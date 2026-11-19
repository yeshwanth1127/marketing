import sys,json,re,zipfile,xml.etree.ElementTree as ET
file,mime=sys.argv[1:3]
colors=[];fonts=[];text=''

def _hex(rgb):
 return '#'+''.join(f'{max(0,min(255,int(c))):02x}' for c in rgb)

def _chroma(rgb):
 return max(rgb)-min(rgb)

def _lum(rgb):
 r,g,b=(c/255 for c in rgb)
 def f(v):
  return v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4
 return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)

def _quantize(im,n=18):
 sample=im.convert('RGB')
 sample.thumbnail((640,640))
 method=getattr(getattr(Image,'Quantize',Image),'MEDIANCUT',0)
 q=sample.quantize(colors=n,method=method)
 pal=q.getpalette() or []
 out=[]
 total=max(1,sum(c for c,_ in (q.getcolors() or [])))
 for count,i in (q.getcolors() or []):
  rgb=tuple(pal[i*3:i*3+3])
  out.append((count/total,rgb,_chroma(rgb),_lum(rgb)))
 return out

def _bright_crop(im):
 # Keep the dense white card, not a min/max box that also swallows dark chat chrome.
 w,h=im.size
 px=im.load()
 step=max(1,min(w,h)//180)
 rows=[0]*((h//step)+1)
 cols=[0]*((w//step)+1)
 hits=0
 for y in range(0,h,step):
  for x in range(0,w,step):
   if _lum(px[x,y])>=0.72:
    rows[y//step]+=1;cols[x//step]+=1;hits+=1
 if hits<40: return None
 rmax=max(rows) or 1
 cmax=max(cols) or 1
 keep_r=[i for i,n in enumerate(rows) if n>=0.28*rmax]
 keep_c=[i for i,n in enumerate(cols) if n>=0.28*cmax]
 if not keep_r or not keep_c: return None
 y0,y1=keep_r[0]*step,min(h,(keep_r[-1]+1)*step)
 x0,x1=keep_c[0]*step,min(w,(keep_c[-1]+1)*step)
 pad=int(0.02*max(w,h))
 x0,y0=max(0,x0-pad),max(0,y0-pad)
 x1,y1=min(w,x1+pad),min(h,y1+pad)
 if (x1-x0)*(y1-y0)<0.12*w*h: return None
 return im.crop((x0,y0,x1,y1))

def _bucket(rgb,step=16):
 return tuple(min(255,(c//step)*step+step//2) for c in rgb)

def _near(a,b,tol=42):
 return sum(abs(x-y) for x,y in zip(a,b))<tol

def _on_paper(px,x,y,w,h):
 # Accents on a card sit on light paper. Chat UI greens sit on dark chrome — skip those.
 bright=0
 for dx,dy in ((0,0),(-10,0),(10,0),(0,-10),(0,10),(-10,-10),(10,10)):
  nx,ny=x+dx,y+dy
  if 0<=nx<w and 0<=ny<h and _lum(px[nx,ny])>=0.62: bright+=1
 return bright>=3

def _chroma_accents(im,limit=6):
 # Median-cut on a white card spends every slot on paper/ink and drops a small logo.
 # Sample high-chroma pixels on their own so the mark colour survives.
 w,h=im.size
 px=im.load()
 step=max(1,min(w,h)//520)
 counts={}
 for y in range(0,h,step):
  for x in range(0,w,step):
   rgb=px[x,y]
   ch,lum=_chroma(rgb),_lum(rgb)
   if ch<32 or lum<0.08 or lum>0.92: continue
   if not _on_paper(px,x,y,w,h): continue
   key=_bucket(rgb)
   counts[key]=counts.get(key,0)+1
 ranked=sorted(counts.items(), key=lambda kv: kv[1]*(1+_chroma(kv[0])/18.0), reverse=True)
 out=[]
 for rgb,_n in ranked:
  if any(_near(rgb,p) for p in out): continue
  out.append(rgb)
  if len(out)>=limit: break
 return out

def palette_from_image(path):
 im=Image.open(path).convert('RGB')
 crop=_bright_crop(im) or im
 neutrals=[]
 for share,rgb,ch,lum in sorted(_quantize(crop,12), reverse=True):
  if ch>=28: continue
  if any(_near(rgb,p,36) for p in neutrals): continue
  neutrals.append(rgb)
  if len(neutrals)>=6: break
 accents=_chroma_accents(crop,3)
 paper=min(neutrals or [(247,244,239)], key=lambda c: -_lum(c))
 ink=min(neutrals or [(22,24,29)], key=_lum)
 accent=accents[0] if accents else max((neutrals or [(228,90,40)]), key=_chroma)
 ordered=[]
 for rgb in [paper,ink,accent]+accents+[c for c in neutrals if c not in (paper,ink)]:
  h=_hex(rgb)
  if h not in ordered: ordered.append(h)
 return ordered[:8]

if mime.startswith('image/'):
 from PIL import Image
 colors=palette_from_image(file)
elif mime=='application/pdf':
 from pypdf import PdfReader
 reader=PdfReader(file)
 for page in reader.pages[:30]:
  text+=(page.extract_text() or '')+'\n'
  resources=page.get('/Resources',{});resources=resources.get_object() if hasattr(resources,'get_object') else resources
  for font in resources.get('/Font',{}).get_object().values() if resources.get('/Font') else []:
   name=str(font.get_object().get('/BaseFont','')).lstrip('/').split('+')[-1]
   if name and name not in fonts: fonts.append(name)
elif mime=='application/vnd.openxmlformats-officedocument.presentationml.presentation':
 with zipfile.ZipFile(file) as deck:
  slide_names=sorted((n for n in deck.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)),key=lambda n:int(re.search(r'(\d+)',n).group(1)))
  for name in slide_names[:100]:
   root=ET.fromstring(deck.read(name))
   words=[node.text for node in root.iter() if node.tag.endswith('}t') and node.text]
   if words: text+=' '.join(words)+'\n'
  for name in ('ppt/theme/theme1.xml','ppt/presentation.xml'):
   if name not in deck.namelist(): continue
   root=ET.fromstring(deck.read(name))
   for node in root.iter():
    if node.tag.endswith(('}latin','}ea','}cs')):
     face=node.attrib.get('typeface','').strip()
     if face and not face.startswith('+') and face not in fonts: fonts.append(face)
    for value in node.attrib.values():
     if re.fullmatch(r'[0-9A-Fa-f]{6}',value): colors.append('#'+value)
elif mime=='application/vnd.openxmlformats-officedocument.wordprocessingml.document':
 with zipfile.ZipFile(file) as doc:
  root=ET.fromstring(doc.read('word/document.xml'))
  words=[node.text for node in root.iter() if node.tag.endswith('}t') and node.text]
  text=' '.join(words)
elif mime=='application/vnd.ms-powerpoint':
 raw=open(file,'rb').read()
 ascii_runs=re.findall(rb'[\x20-\x7e]{4,}',raw)
 wide_runs=re.findall(rb'(?:[\x20-\x7e]\x00){4,}',raw)
 text='\n'.join(x.decode('latin-1','ignore') for x in ascii_runs[:2000])
 text+='\n'+'\n'.join(x.decode('utf-16le','ignore') for x in wide_runs[:2000])
elif mime in ('text/plain','text/csv','application/csv') or mime.startswith('text/'): text=open(file,encoding='utf-8',errors='ignore').read(30000)
else:
 try: text=open(file,encoding='utf-8',errors='ignore').read(30000)
 except OSError: text=''
colors=list(dict.fromkeys(colors+re.findall(r'#[0-9a-fA-F]{6}\b',text)))[:8]
print(json.dumps({'colors':colors,'fonts':fonts[:10],'text':text[:18000]}))
