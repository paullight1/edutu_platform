"""Generate deterministic Android picker artwork. These are sample previews, not device screenshots."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import textwrap

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / 'android/app/src/main/res'
OUT = ROOT / 'docs/widget-previews'
OUT.mkdir(parents=True, exist_ok=True)
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
S = 2
TITLES = ['Global scholarship opportunities', 'Student leadership programme', 'International internship', 'Research fellowship', 'Future leaders programme', 'Graduate study award']

def render(kind, w, h, dark=False):
    bg, ink, sub, accent, inset = ('#171A4F', '#FFFFFF', '#C3CBEE', '#9DB4FF', '#232866') if dark else ('#FFFFFF', '#101828', '#475467', '#3563E9', '#EEF2FF')
    im = Image.new('RGBA', (w*S, h*S))
    d = ImageDraw.Draw(im)
    def rect(box, fill, radius=0):
        b = tuple(round(x*S) for x in box)
        if radius: d.rounded_rectangle(b, radius*S, fill)
        else: d.rectangle(b, fill)
    def text(x, y, value, size=12, color=ink, bold=False, width=None, lines=1):
        f = ImageFont.truetype(BOLD if bold else FONT, size*S)
        words = value.split(); rows=[]; row=''
        for word in words:
            candidate = (row+' '+word).strip()
            if width and d.textlength(candidate, font=f) > width*S and row:
                rows.append(row); row=word
            else: row=candidate
        if row: rows.append(row)
        if len(rows)>lines:
            rows=rows[:lines]; row=rows[-1]
            while row and width and d.textlength(row+'…',font=f)>width*S: row=row[:-1]
            rows[-1]=row.rstrip()+'…'
        for i,row in enumerate(rows): d.text((x*S,(y+i*(size+3))*S),row,font=f,fill=color)
    def logo(x=14,y=14,size=20):
        source=Image.open(RES/'drawable-nodpi/edutu_widget_logo.png').convert('RGBA')
        source.thumbnail((size*S,size*S),Image.Resampling.LANCZOS)
        im.alpha_composite(source,(x*S,y*S))
    def header(label):
        logo(); text(42,16,label,13,bold=True,width=w-56)
    def chip(x,y,label):
        rect((x,y,x+72,y+23),'#E2EAFF',10);text(x+9,y+5,label,10,'#173B8F',True)
    rect((0,0,w,h),bg,18)
    def mascot(box):
        x,y,mw,mh=box
        source=Image.open(ROOT/'assets/mascot/edutu-guide.png').convert('RGBA')
        source.thumbnail((mw*S,mh*S),Image.Resampling.LANCZOS)
        im.alpha_composite(source,(int(x*S+(mw*S-source.width)/2),int(y*S+(mh*S-source.height)/2)))
    if kind=='nextstep':
        text(14,18,'TODAY’S NEXT STEP',9,accent,True,width=w-56)
        mascot((w-46,10,32,32))
        text(14,44,'Review your personal statement',14 if w<220 else 16 if h<260 else 18,bold=True,width=w-28,lines=2 if h<260 else 3)
        if w>=220:
            text(14,86,'Global scholarship · 1 of 3 steps complete',11,sub,width=w-28,lines=1)
            if h>=260:
                rect((14,132,w-14,136),inset,2);rect((14,132,14+(w-28)/3,136),accent,2)
                text(14,147,'Due tomorrow',10,sub)
                rect((14,h-133,w-14,h-69),inset,12)
                text(25,h-123,'Up next',10,sub)
                text(25,h-105,'Prepare your reference letter',12,bold=True,width=w-50,lines=2)
        rect((14,h-58,w-14,h-14),inset,12)
        text((w-72)/2,h-43,'Continue >',12,accent,True)
    elif kind=='chat':
        if w>=260:
            text(14,15,'YOUR OPPORTUNITY COACH',9,accent,True,width=w-138)
            text(14,36,'Ask Edutu AI',18,bold=True,width=w-138)
            text(14,64,'What should I focus on next?',11,sub,width=w-138,lines=2)
            mascot((w-118,14,104,h-28))
            rect((14,h-54,w-126,h-14),inset,12)
            text(33,h-40,'Ask Edutu >',12,accent,True)
        else:
            mascot((w/2-32,10,64,64))
            text(w/2-47,78,'Ask Edutu AI',15,bold=True)
            text(16,99,'Your opportunity coach',9,sub,width=w-32)
            rect((12,h-52,w-12,h-12),inset,12)
            text(w/2-36,h-38,'Ask Edutu >',12,accent,True)
    elif kind in ('spotlight','ticker','news'):
        rect((0,0,w,h),'#171A4F',18)
        # Branded gradient fallback represents the no-photo state shipped in the layouts.
        for y in range(20,h-12):
            a=y/h
            c=tuple(int(v*(1-a)+t*a) for v,t in zip((45,61,109),(10,14,38)))
            d.line((1*S,y*S,(w-1)*S,y*S),fill=c,width=S)
        if kind!='ticker':
            rect((14,14,97,36),'#334166',11);text(24,20,'NEWS' if kind=='news' else 'Scholarship',10,'#FFFFFF',True)
        ty=h-67 if kind!='spotlight' else h-92
        text(14,ty,'Opportunity news & tips' if kind=='news' else TITLES[0],16,'#FFFFFF',True,width=w-28,lines=2)
        text(14,h-26,'Edutu insights · Today' if kind=='news' else 'Edutu · Open now',11,'#DCE2FF',width=w-28)
    elif kind=='grid':
        cols=1 if w<220 else 2; rows=1 if h<220 else 2
        tw=(w-12)/cols;th=(h-12)/rows
        for i in range(cols*rows):
            x=6+(i%cols)*tw;y=6+(i//cols)*th
            rect((x+4,y+4,x+tw-4,y+th-4),'#232866',8)
            text(x+13,y+th-67,TITLES[i],12,'#FFFFFF',True,width=tw-26,lines=2)
            text(x+13,y+th-27,'Open now',10,'#E2EAFF',True)
    elif kind in ('trending','deadlines','list'):
        narrow=w<220
        header('Next deadline' if kind=='deadlines' and narrow else 'Deadlines' if kind=='deadlines' else 'Trending now')
        if narrow:
            if kind=='deadlines':
                text(14,45,'12',40,accent,True);text(67,71,'days left',11,sub)
                text(14,98,TITLES[0],12,bold=True,width=w-28,lines=2)
            else:
                text(14,48,TITLES[0],14,bold=True,width=w-28,lines=3)
                text(14,h-29,'Open now',11,accent,True)
        else:
            count=max(1,min(4 if kind=='list' else 5,int((h-48)/52)))
            rh=(h-48)/count
            for i in range(count):
                y=40+i*rh+8;tx=14
                if kind=='list':
                    rect((14,y,58,y+44),inset,8);text(29,y+13,str(i+1),14,accent,True);tx=68
                elif kind=='deadlines':
                    rect((14,y,47,y+36),inset,8);text(20,y+2,'DEC',8,sub,True);text(22,y+14,str(16+i),16,bold=True);tx=57
                else:
                    text(14,y+7,str(i+1),15,accent,True);tx=43
                text(tx,y+2,TITLES[i],13,bold=True,width=w-tx-87)
                if kind!='list' or w>=280:text(tx,y+20,'Matched for you',10,sub,width=w-tx-87)
                text(w-77,y+12,'Open now',11,'#34D399' if dark else '#047857',True)
    else:
        logo()
        if h>=240 and w>=220:
            text(42,16,'Top matches for you',14,bold=True)
            count=min(6,int((h-48)/52));rh=(h-48)/count
            for i in range(count):
                y=45+i*rh;rect((18,y+5,27,y+14),accent,2)
                text(42,y,TITLES[i],14,bold=True,width=w-134,lines=2)
                text(42,y+37,'Open now · Edutu',10,sub,width=w-134)
                rect((w-78,y-3,w-14,y+41),inset,12);text(w-61,y+12,'Save',12,accent,True)
        else:
            if w>=220:chip(w-87,14,'Top pick')
            text(14,46,TITLES[0],14 if w<220 else 16,bold=True,width=w-28,lines=3 if w<220 else 2)
            if w>=220:text(14,92,'Edutu',12,sub)
            rect((14,h-38,103,h-14),'#475569',12);text(25,h-32,'Open now',11,'#FFFFFF',True)
            if w>=220:
                rect((w-78,h-58,w-14,h-14),inset,12);text(w-61,h-43,'Save',12,accent,True)
    return im

variants=[('nextstep_small','Today’s Next Step · small','nextstep',160,160),('nextstep_medium','Today’s Next Step · medium','nextstep',340,160),('nextstep_large','Today’s Next Step · large','nextstep',340,340),('chat_medium','Ask Edutu · medium','chat',340,160),('matches_small','Top Matches · small','matches',160,160),('matches_medium','Top Matches · medium','matches',340,160),('matches_large','Top Matches · large','matches',340,340),('deadlines_small','Deadlines · small','deadlines',160,160),('deadlines_medium','Deadlines · medium','deadlines',340,160),('deadlines_large','Deadlines · large','deadlines',340,340),('trending_small','Trending · small','trending',160,160),('trending_medium','Trending · medium','trending',340,160),('trending_large','Trending · large','trending',340,340),('spotlight','Trending Spotlight','spotlight',160,160),('grid','Trending Grid','grid',300,300),('ticker','Trending Ticker','ticker',340,110),('list','Trending List','list',340,260),('news','News','news',340,110),('chat','Ask Edutu','chat',160,160)]
assets={'nextstep_small':'edutu_next_step_widget_info','matches_medium':'edutu_widget_info','deadlines_medium':'edutu_deadline_widget_info','trending_medium':'edutu_trending_widget_info','spotlight':'edutu_trending_spotlight_widget_info','grid':'edutu_trending_grid_widget_info','ticker':'edutu_trending_ticker_widget_info','list':'edutu_trending_thumblist_widget_info','news':'edutu_news_widget_info','chat':'edutu_chat_widget_info'}
for dark in (False,True):
    sheet=Image.new('RGB',(1200,2940),'#0D1225' if dark else '#EFF2F7'); sd=ImageDraw.Draw(sheet)
    titlecolor='#FFFFFF' if dark else '#101828'
    sd.text((30,20),'Edutu widget size previews'+(' · Dark' if dark else ' · Light'),font=ImageFont.truetype(BOLD,27),fill=titlecolor)
    sd.text((30,62),'Picker artwork · Sample data · Device screenshots pending',font=ImageFont.truetype(FONT,16),fill='#8B96AB' if dark else '#475467')
    for i,(key,label,kind,w,h) in enumerate(variants):
        image=render(kind,w,h,dark)
        image.save(OUT/f'{key}{"-dark" if dark else ""}.png')
        x=30+(i%3)*390;y=110+(i//3)*400
        sd.text((x,y),label+f' ({w}×{h})',font=ImageFont.truetype(BOLD,15),fill=titlecolor)
        thumb=image.resize((w,h),Image.Resampling.LANCZOS)
        sheet.paste(thumb,(x,y+30),thumb)
        if key in assets:
            target=RES/('drawable-night-nodpi' if dark else 'drawable-nodpi')
            target.mkdir(exist_ok=True)
            resource='edutu_widget_preview_'+key
            image.save(target/f'{resource}.png')
            p=RES/'xml'/f'{assets[key]}.xml';s=p.read_text()
            if 'android:previewImage=' not in s:s=s.replace('  android:previewLayout=',f'  android:previewImage="@drawable/{resource}"\n  android:previewLayout=')
            p.write_text(s)
    sheet.save(OUT/f'contact-sheet{"-dark" if dark else ""}.png')
for dark in (False,True):
    sheet=Image.new('RGB',(1200,1380),'#0D1225' if dark else '#EFF2F7');sd=ImageDraw.Draw(sheet)
    color='#FFFFFF' if dark else '#101828'
    sd.text((30,20),'Edutu · Actions & companion widgets'+(' · Dark' if dark else ' · Light'),font=ImageFont.truetype(BOLD,25),fill=color)
    sd.text((30,60),'Sample picker artwork · Native screenshots pending',font=ImageFont.truetype(FONT,16),fill='#8B96AB' if dark else '#475467')
    wanted=['nextstep_small','nextstep_medium','nextstep_large','matches_small','matches_medium','matches_large','chat','chat_medium']
    for i,key in enumerate(wanted):
        _,label,kind,w,h=next(v for v in variants if v[0]==key)
        x=30+(i%3)*390;y=110+(i//3)*410
        sd.text((x,y),label+f' ({w}×{h})',font=ImageFont.truetype(BOLD,15),fill=color)
        image=render(kind,w,h,dark).resize((w,h),Image.Resampling.LANCZOS);sheet.paste(image,(x,y+30),image)
    sheet.save(OUT/f'actions-sheet{"-dark" if dark else ""}.png')
print(f'Generated {len(variants)} size previews in light/dark, and ten Android picker images per theme: {OUT}')
