# Builds exora/fonts from Google Fonts OFL sources: subsets (Latin + Latin Ext-A + ₹, or the Indic script),
# keeps variable axes and OpenType layout features, writes WOFF + OFL.txt + catalog.json.
import json,os,shutil,sys
from fontTools import subset
from fontTools.ttLib import TTFont
SRC=sys.argv[1];OUT=sys.argv[2]
LATIN='U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308,U+0327,U+2000-206F,U+2074,U+20AC,U+20B9,U+2122,U+2190-2199,U+2212,U+2215,U+2713,U+2715,U+2192,U+2197,U+25CF,U+FEFF,U+FFFD'
SCRIPT={'devanagari':'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF','kannada':'U+0C80-0CFF,U+1CD0-1CF9,U+200C-200D,U+20B9,U+25CC','tamil':'U+0B80-0BFF,U+200C-200D,U+20B9,U+25CC'}
# id, folder, family name, role, files [(file, style)], scripts, note
FONTS=[
 ('fraunces','fraunces','Fraunces','serif',[('Fraunces[SOFT,WONK,opsz,wght].ttf','normal'),('Fraunces-Italic[SOFT,WONK,opsz,wght].ttf','italic')],['latin'],'Soft, characterful variable serif with optical sizes. Warm editorial, food, wellness, kids.'),
 ('instrument-serif','instrumentserif','Instrument Serif','serif',[('InstrumentSerif-Regular.ttf','normal'),('InstrumentSerif-Italic.ttf','italic')],['latin'],'Condensed display serif. Quiet luxury, clinics, studios, architecture.'),
 ('gloock','gloock','Gloock','serif',[('Gloock-Regular.ttf','normal')],['latin'],'High-contrast heavy serif. Fashion, jewellery, statement headlines.'),
 ('dm-serif-display','dmserifdisplay','DM Serif Display','serif',[('DMSerifDisplay-Regular.ttf','normal'),('DMSerifDisplay-Italic.ttf','italic')],['latin'],'Classic display serif. Hospitality, legal, heritage.'),
 ('playfair-display','playfairdisplay','Playfair Display','serif',[('PlayfairDisplay[wght].ttf','normal'),('PlayfairDisplay-Italic[wght].ttf','italic')],['latin'],'Transitional display serif, wide weight range. Weddings, beauty, events.'),
 ('young-serif','youngserif','Young Serif','serif',[('YoungSerif-Regular.ttf','normal')],['latin'],'Chunky old-style serif. Bakeries, cafes, craft.'),
 ('bricolage-grotesque','bricolagegrotesque','Bricolage Grotesque','sans',[('BricolageGrotesque[opsz,wdth,wght].ttf','normal')],['latin'],'Expressive grotesque with width axis. Youth, education, D2C, energy.'),
 ('instrument-sans','instrumentsans','Instrument Sans','sans',[('InstrumentSans[wdth,wght].ttf','normal'),('InstrumentSans-Italic[wdth,wght].ttf','italic')],['latin'],'Precise neo-grotesque. Body and UI for premium brands.'),
 ('dm-sans','dmsans','DM Sans','sans',[('DMSans[opsz,wght].ttf','normal'),('DMSans-Italic[opsz,wght].ttf','italic')],['latin'],'Friendly geometric sans. Reliable body text.'),
 ('manrope','manrope','Manrope','sans',[('Manrope[wght].ttf','normal')],['latin'],'Modern semi-condensed sans. Fintech, SaaS, real estate.'),
 ('archivo','archivo','Archivo','sans',[('Archivo[wdth,wght].ttf','normal'),('Archivo-Italic[wdth,wght].ttf','italic')],['latin'],'Grotesque with 62–125 width axis. Condensed sale and sport headlines.'),
 ('space-grotesk','spacegrotesk','Space Grotesk','sans',[('SpaceGrotesk[wght].ttf','normal')],['latin'],'Technical grotesque. Tech, gyms, events.'),
 ('unbounded','unbounded','Unbounded','sans',[('Unbounded[wght].ttf','normal')],['latin'],'Wide rounded display. Streetwear, music, youth events.'),
 ('hanken-grotesk','hankengrotesk','Hanken Grotesk','sans',[('HankenGrotesk[wght].ttf','normal'),('HankenGrotesk-Italic[wght].ttf','italic')],['latin'],'Neutral grotesque. Body text.'),
 ('syne','syne','Syne','sans',[('Syne[wght].ttf','normal')],['latin'],'Art-school display with wide bold cuts. Galleries, creative studios.'),
 ('familjen-grotesk','familjengrotesk','Familjen Grotesk','sans',[('FamiljenGrotesk[wght].ttf','normal'),('FamiljenGrotesk-Italic[wght].ttf','italic')],['latin'],'Characterful grotesque. Lifestyle, retail.'),
 ('anybody','anybody','Anybody','sans',[('Anybody[wdth,wght].ttf','normal')],['latin'],'Ultra-flexible width (50–150). Posters, sale events.'),
 ('jetbrains-mono','jetbrainsmono','JetBrains Mono','mono',[('JetBrainsMono[wght].ttf','normal')],['latin'],'Mono for labels, indexes and data.'),
 ('ibm-plex-mono','ibmplexmono','IBM Plex Mono','mono',[('IBMPlexMono-Regular.ttf','normal'),('IBMPlexMono-Medium.ttf','normal:500')],['latin'],'Humanist mono for labels.'),
 ('noto-sans-devanagari','notosansdevanagari','Noto Sans Devanagari','sans',[('NotoSansDevanagari[wdth,wght].ttf','normal')],['devanagari'],'Hindi / Marathi body and display.'),
 ('noto-sans-kannada','notosanskannada','Noto Sans Kannada','sans',[('NotoSansKannada[wdth,wght].ttf','normal')],['kannada'],'Kannada body and display.'),
 ('noto-sans-tamil','notosanstamil','Noto Sans Tamil','sans',[('NotoSansTamil[wdth,wght].ttf','normal')],['tamil'],'Tamil body and display.'),
 ('baloo-2','baloo2','Baloo 2','sans',[('Baloo2[wght].ttf','normal')],['latin','devanagari'],'Rounded friendly Latin + Devanagari. Kids, snacks, local retail.'),
 ('tiro-devanagari-hindi','tirodevanagarihindi','Tiro Devanagari Hindi','serif',[('TiroDevanagariHindi-Regular.ttf','normal'),('TiroDevanagariHindi-Italic.ttf','italic')],['latin','devanagari'],'Literary Devanagari serif. Festive, heritage, premium Hindi.'),
]
catalog=[]
for fid,folder,family,role,files,scripts,note in FONTS:
  d=os.path.join(OUT,fid);os.makedirs(d,exist_ok=True)
  shutil.copy(os.path.join(SRC,folder,'OFL.txt'),os.path.join(d,'OFL.txt'))
  faces=[]
  for fn,style in files:
    st,_,fixed=style.partition(':')
    f=TTFont(os.path.join(SRC,folder,fn))
    axes={a.axisTag:[a.minValue,a.maxValue] for a in f['fvar'].axes} if 'fvar' in f else {}
    ranges=','.join(([LATIN] if 'latin' in scripts else ['U+0020-007E,U+00A0,U+2013-2014,U+2018-201D,U+2022,U+2026'])+[SCRIPT[s] for s in scripts if s in SCRIPT])
    opts=subset.Options();opts.flavor='woff';opts.layout_features=['*'];opts.name_IDs=['*'];opts.notdef_outline=True;opts.glyph_names=False;opts.hinting=False
    s=subset.Subsetter(opts);s.populate(unicodes=subset.parse_unicodes(ranges));s.subset(f)
    out=fn.replace('[','-').replace(']','').replace(',','-').replace('.ttf','.woff')
    f.flavor='woff';f.save(os.path.join(d,out))
    w=axes.get('wght',[int(fixed or 400)]*2)
    faces.append({'file':out,'style':st,'weight':[int(w[0]),int(w[1])],'axes':{k:v for k,v in axes.items() if k!='wght'},'unicode_range':ranges})
  catalog.append({'id':fid,'family':family,'role':role,'scripts':scripts,'note':note,'licence':'SIL Open Font License 1.1','source':'github.com/google/fonts/ofl/'+folder,'faces':faces})
json.dump({'version':1,'note':'Bundled because renders run offline. All fonts are SIL OFL 1.1; licence text in each folder. Rebuild with scripts/build-fonts.py.','fonts':catalog},open(os.path.join(OUT,'catalog.json'),'w'),indent=1,ensure_ascii=False)
print('ok',len(catalog))
