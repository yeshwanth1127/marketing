import sys,json,re
file,mime=sys.argv[1:3]
colors=[];fonts=[];text=''
if mime.startswith('image/'):
 from PIL import Image
 im=Image.open(file).convert('RGB');im.thumbnail((150,150));p=im.quantize(colors=6);palette=p.getpalette()
 for count,i in sorted(p.getcolors(),reverse=True):
  rgb=palette[i*3:i*3+3]
  if max(rgb)-min(rgb)>15 or min(rgb)<70: colors.append('#'+''.join(f'{c:02x}' for c in rgb))
elif mime=='application/pdf':
 from pypdf import PdfReader
 reader=PdfReader(file)
 for page in reader.pages[:30]:
  text+=(page.extract_text() or '')+'\n'
  resources=page.get('/Resources',{});resources=resources.get_object() if hasattr(resources,'get_object') else resources
  for font in resources.get('/Font',{}).get_object().values() if resources.get('/Font') else []:
   name=str(font.get_object().get('/BaseFont','')).lstrip('/').split('+')[-1]
   if name and name not in fonts: fonts.append(name)
else: text=open(file).read(30000)
colors=list(dict.fromkeys(colors+re.findall(r'#[0-9a-fA-F]{6}\b',text)))[:8]
print(json.dumps({'colors':colors,'fonts':fonts[:10],'text':text[:18000]}))
