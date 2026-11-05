import sys,json,re,zipfile,xml.etree.ElementTree as ET
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
