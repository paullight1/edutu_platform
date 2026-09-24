#!/usr/bin/env python3
from __future__ import annotations
import json, math, shutil, zipfile
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ROOT / 'characters'
EXPORTS = ROOT / 'exports'
PNG_DIR = EXPORTS / 'transparent-png'
PACKS = EXPORTS / 'packs'
CATALOG = EXPORTS / 'catalog'

EDUTU = {
    'forest': '#173F35', 'green': '#0A8F72', 'mint': '#42D6AD',
    'lime': '#A6E66C', 'yellow': '#F6C748', 'orange': '#F59E45',
    'cream': '#FFF9EE', 'ink': '#17312B', 'white': '#FFFFFF',
    'lavender': '#8B7CF6', 'sky': '#65B9F7', 'rose': '#F07F9C',
}
SKINS = ['#5A2F1F','#75422A','#8C5232','#A86745','#BB7954','#D0926A','#E0AA82','#F0C29E']
HAIRS = ['coils','high-puff','short-curls','locs','braids','fade','twists','bun']
TOPS = [EDUTU['green'], EDUTU['forest'], EDUTU['yellow'], EDUTU['mint'], EDUTU['lavender'], EDUTU['sky'], EDUTU['rose'], EDUTU['orange']]
SINGULAR = {'students':'student','graduates':'graduate','developers':'developer','creators':'creator','entrepreneurs':'entrepreneur','mentors':'mentor','researchers':'researcher','opportunities':'opportunity','scholarships':'scholarship','community':'community','career':'career','reactions':'reaction'}

CATEGORY_ACTIONS = {
 'students':[('reading','happy'),('studying','focused'),('notebook','curious'),('phone','excited'),('question','confused'),('idea','inspired'),('waving','friendly'),('celebrate','proud')],
 'graduates':[('certificate','proud'),('trophy','excited'),('cap','happy'),('waving','friendly'),('briefcase','confident'),('celebrate','joyful'),('star','grateful'),('pointing','confident')],
 'developers':[('laptop','focused'),('code','confident'),('bug','curious'),('idea','inspired'),('phone','happy'),('rocket','excited'),('coffee','focused'),('celebrate','proud')],
 'creators':[('camera','happy'),('palette','inspired'),('phone','excited'),('idea','curious'),('megaphone','confident'),('star','proud'),('notebook','focused'),('celebrate','joyful')],
 'entrepreneurs':[('pitch','confident'),('chart','focused'),('briefcase','proud'),('phone','happy'),('target','determined'),('idea','inspired'),('rocket','excited'),('handshake','friendly')],
 'mentors':[('pointing','confident'),('book','friendly'),('idea','inspired'),('chat','happy'),('star','proud'),('notebook','focused'),('heart','warm'),('waving','friendly')],
 'researchers':[('search','curious'),('globe','inspired'),('notebook','focused'),('laptop','focused'),('idea','excited'),('chart','confident'),('book','happy'),('trophy','proud')],
 'opportunities':[('search','curious'),('target','determined'),('calendar','focused'),('star','excited'),('globe','inspired'),('pointing','confident'),('rocket','happy'),('celebrate','joyful')],
 'scholarships':[('certificate','proud'),('book','focused'),('globe','inspired'),('star','excited'),('calendar','curious'),('trophy','joyful'),('pointing','confident'),('celebrate','happy')],
 'community':[('megaphone','confident'),('heart','warm'),('handshake','friendly'),('waving','happy'),('globe','inspired'),('phone','excited'),('star','proud'),('celebrate','joyful')],
 'career':[('briefcase','confident'),('target','determined'),('laptop','focused'),('chart','proud'),('certificate','happy'),('pointing','confident'),('calendar','curious'),('rocket','excited')],
 'reactions':[('thumbsup','happy'),('question','confused'),('idea','inspired'),('wow','surprised'),('celebrate','joyful'),('heart','warm'),('thinking','curious'),('pointing','confident')],
}

PROP_LABELS = {
 'reading':'BOOK','studying':'NOTES','notebook':'NOTES','phone':'PHONE','question':'?','idea':'IDEA','waving':'HI','celebrate':'YAY',
 'certificate':'CERT','trophy':'WIN','cap':'GRAD','briefcase':'WORK','star':'STAR','pointing':'GO','laptop':'EDUTU','code':'</>','bug':'FIX','rocket':'GO!','coffee':'CAFE',
 'camera':'CREATE','palette':'ART','megaphone':'NEWS','pitch':'PITCH','chart':'GROW','target':'GOAL','handshake':'TEAM','book':'LEARN','chat':'CHAT','heart':'LOVE',
 'search':'FIND','globe':'WORLD','calendar':'DATE','thumbsup':'YES','wow':'WOW','thinking':'...'
}
EXPR = {
 'happy':('6','M 432 364 Q 480 398 528 364'),'focused':('3','M 440 374 Q 480 382 520 374'),'curious':('5','M 446 374 Q 480 388 516 370'),
 'confused':('7','M 448 374 Q 480 354 516 374'),'inspired':('7','M 432 366 Q 480 405 528 366'),'excited':('8','M 432 362 Q 480 410 528 362'),
 'proud':('4','M 438 368 Q 480 392 522 368'),'joyful':('8','M 428 360 Q 480 414 532 360'),'confident':('4','M 440 370 Q 480 392 522 366'),
 'determined':('3','M 444 374 Q 480 384 516 374'),'friendly':('5','M 436 368 Q 480 400 524 368'),'warm':('5','M 436 366 Q 480 401 524 366'),
 'grateful':('5','M 438 368 Q 480 397 522 368'),'surprised':('8','M 466 366 Q 480 388 494 366 Q 480 350 466 366'),
}

def hair_svg(kind, color='#221814'):
    if kind == 'coils':
        return ''.join(f'<circle cx="{x}" cy="{y}" r="38" fill="{color}"/>' for x,y in [(378,242),(420,218),(465,210),(510,216),(552,244),(396,278),(548,282)])
    if kind == 'high-puff':
        return f'<circle cx="500" cy="160" r="92" fill="{color}"/><path d="M360 286 Q378 176 480 180 Q574 184 598 286 L565 272 Q548 235 480 230 Q406 232 388 280Z" fill="{color}"/>'
    if kind == 'short-curls':
        return f'<path d="M360 286 Q365 195 430 174 Q512 142 584 210 Q606 232 604 286 Q566 250 520 240 Q434 221 360 286Z" fill="{color}"/>'
    if kind == 'locs':
        return f'<path d="M365 286 Q370 190 470 174 Q580 174 596 286" fill="{color}"/><g stroke="{color}" stroke-width="22" stroke-linecap="round"><path d="M380 250 Q340 340 370 430"/><path d="M405 232 Q370 350 404 440"/><path d="M558 238 Q608 334 574 438"/><path d="M535 225 Q580 350 545 442"/></g>'
    if kind == 'braids':
        return f'<path d="M364 288 Q370 188 478 174 Q590 186 596 286Z" fill="{color}"/><g stroke="{color}" stroke-width="18" stroke-linecap="round"><path d="M382 262 Q332 366 372 492"/><path d="M405 246 Q358 378 404 510"/><path d="M555 245 Q610 370 566 504"/><path d="M578 265 Q622 382 590 474"/></g>'
    if kind == 'fade':
        return f'<path d="M366 280 Q376 204 452 180 Q536 156 594 230 L596 286 Q550 246 490 240 Q422 234 366 280Z" fill="{color}"/>'
    if kind == 'twists':
        return ''.join(f'<circle cx="{x}" cy="{y}" r="28" fill="{color}"/>' for x,y in [(380,250),(402,212),(440,190),(480,186),(520,198),(554,224),(578,260),(394,286),(566,292)])
    return f'<circle cx="480" cy="168" r="76" fill="{color}"/><path d="M366 286 Q378 198 480 190 Q580 200 596 286Z" fill="{color}"/>'

def prop_svg(action, accent):
    label = escape(PROP_LABELS.get(action, action[:8].upper()))
    if action in {'waving','pointing','celebrate','thumbsup','thinking'}:
        return f'<g><circle cx="722" cy="530" r="82" fill="#FFF" opacity=".96"/><circle cx="722" cy="530" r="82" fill="none" stroke="{accent}" stroke-width="12"/><text x="722" y="545" text-anchor="middle" font-family="Arial" font-size="34" font-weight="800" fill="#17312B">{label}</text></g>'
    if action in {'laptop','code','bug'}:
        return f'<g><rect x="330" y="600" width="300" height="174" rx="24" fill="#F2F6F4" stroke="#17312B" stroke-width="10"/><circle cx="480" cy="688" r="28" fill="{accent}"/><text x="480" y="700" text-anchor="middle" font-family="Arial" font-size="21" font-weight="800" fill="#17312B">{label}</text><path d="M295 786 H665" stroke="#17312B" stroke-width="16" stroke-linecap="round"/></g>'
    if action in {'book','reading','studying','notebook'}:
        return f'<g transform="translate(0,10)"><path d="M314 616 Q398 584 474 626 V794 Q390 754 314 782Z" fill="#FFF" stroke="#17312B" stroke-width="9"/><path d="M646 616 Q560 584 486 626 V794 Q568 754 646 782Z" fill="#FFF" stroke="#17312B" stroke-width="9"/><path d="M480 632 V792" stroke="{accent}" stroke-width="8"/><text x="480" y="710" text-anchor="middle" font-family="Arial" font-size="30" font-weight="800" fill="{accent}">{label}</text></g>'
    if action in {'certificate','calendar','briefcase','chart','target'}:
        return f'<g><rect x="336" y="612" width="288" height="184" rx="26" fill="#FFF" stroke="#17312B" stroke-width="10"/><rect x="370" y="650" width="220" height="20" rx="10" fill="{accent}" opacity=".85"/><rect x="370" y="690" width="170" height="14" rx="7" fill="#C9D8D3"/><text x="480" y="758" text-anchor="middle" font-family="Arial" font-size="30" font-weight="900" fill="#17312B">{label}</text></g>'
    if action == 'trophy':
        return f'<g><path d="M420 606 H540 V662 Q540 732 480 748 Q420 732 420 662Z" fill="{accent}" stroke="#17312B" stroke-width="10"/><path d="M420 630 H370 Q366 700 430 706 M540 630 H590 Q594 700 530 706" fill="none" stroke="#17312B" stroke-width="10"/><rect x="452" y="748" width="56" height="54" rx="10" fill="#17312B"/><text x="480" y="680" text-anchor="middle" font-family="Arial" font-size="28" font-weight="900" fill="#17312B">WIN</text></g>'
    if action == 'globe':
        return f'<g><circle cx="480" cy="700" r="102" fill="#DFF8EF" stroke="#17312B" stroke-width="10"/><path d="M382 700 H578 M480 598 Q430 700 480 802 M480 598 Q530 700 480 802" fill="none" stroke="{accent}" stroke-width="8"/><ellipse cx="480" cy="700" rx="102" ry="48" fill="none" stroke="{accent}" stroke-width="8"/></g>'
    if action in {'idea','star','rocket','heart','search','megaphone','phone','camera','palette','coffee','pitch','handshake','question','wow','cap'}:
        return f'<g><rect x="356" y="618" width="248" height="164" rx="54" fill="#FFF" stroke="#17312B" stroke-width="10"/><circle cx="480" cy="700" r="58" fill="{accent}" opacity=".2"/><text x="480" y="715" text-anchor="middle" font-family="Arial" font-size="34" font-weight="900" fill="#17312B">{label}</text></g>'
    return f'<g><circle cx="480" cy="704" r="96" fill="#FFF" stroke="{accent}" stroke-width="12"/><text x="480" y="716" text-anchor="middle" font-family="Arial" font-size="30" font-weight="900" fill="#17312B">{label}</text></g>'

def make_svg(category, action, expression, idx):
    skin = SKINS[(idx * 3 + len(category)) % len(SKINS)]
    hair = HAIRS[(idx + len(action)) % len(HAIRS)]
    top = TOPS[(idx * 2 + len(category)) % len(TOPS)]
    accent = [EDUTU['yellow'],EDUTU['mint'],EDUTU['lime'],EDUTU['sky'],EDUTU['orange']][idx % 5]
    eye_r, mouth = EXPR.get(expression, EXPR['happy'])
    title = f'Edutu {category.title()} — {action.title()} / {expression.title()}'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 960 960" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">Transparent Edutu mascot in the shared rounded youth-character visual system.</desc><defs><filter id="shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="22" stdDeviation="18" flood-color="#0B3028" flood-opacity=".18"/></filter><linearGradient id="top" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{top}"/><stop offset="1" stop-color="{EDUTU['forest']}"/></linearGradient><linearGradient id="skin" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="{skin}"/><stop offset="1" stop-color="{skin}" stop-opacity=".82"/></linearGradient></defs><g filter="url(#shadow)"><ellipse cx="480" cy="866" rx="222" ry="34" fill="#173F35" opacity=".13"/><path d="M300 828 Q312 576 480 558 Q648 576 660 828Z" fill="url(#top)"/><path d="M372 606 Q420 650 480 650 Q542 650 590 606" fill="none" stroke="#FFF" stroke-opacity=".28" stroke-width="16" stroke-linecap="round"/><rect x="432" y="488" width="96" height="118" rx="45" fill="url(#skin)"/><ellipse cx="480" cy="340" rx="142" ry="166" fill="url(#skin)"/><ellipse cx="342" cy="350" rx="26" ry="42" fill="{skin}"/><ellipse cx="618" cy="350" rx="26" ry="42" fill="{skin}"/>{hair_svg(hair)}<path d="M400 314 Q430 292 456 310" fill="none" stroke="#34231E" stroke-width="10" stroke-linecap="round"/><path d="M504 310 Q534 292 562 314" fill="none" stroke="#34231E" stroke-width="10" stroke-linecap="round"/><circle cx="430" cy="340" r="{eye_r}" fill="#17312B"/><circle cx="530" cy="340" r="{eye_r}" fill="#17312B"/><circle cx="427" cy="337" r="2.2" fill="#FFF"/><circle cx="527" cy="337" r="2.2" fill="#FFF"/><path d="M480 340 Q468 366 484 370" fill="none" stroke="#74442F" stroke-width="7" stroke-linecap="round" opacity=".7"/><path d="{mouth}" fill="none" stroke="#6E322A" stroke-width="9" stroke-linecap="round"/><circle cx="397" cy="376" r="22" fill="#EF8D83" opacity=".13"/><circle cx="564" cy="376" r="22" fill="#EF8D83" opacity=".13"/><path d="M346 630 Q268 674 274 788" fill="none" stroke="{skin}" stroke-width="42" stroke-linecap="round"/><path d="M614 630 Q692 674 686 788" fill="none" stroke="{skin}" stroke-width="42" stroke-linecap="round"/><circle cx="276" cy="796" r="31" fill="{skin}"/><circle cx="684" cy="796" r="31" fill="{skin}"/>{prop_svg(action, accent)}<circle cx="605" cy="626" r="24" fill="{EDUTU['yellow']}"/><path d="M596 626 l7 7 13-17" fill="none" stroke="#17312B" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g></svg>'''

def build():
    if CHARACTERS.exists(): shutil.rmtree(CHARACTERS)
    if EXPORTS.exists(): shutil.rmtree(EXPORTS)
    PNG_DIR.mkdir(parents=True, exist_ok=True); PACKS.mkdir(parents=True, exist_ok=True); CATALOG.mkdir(parents=True, exist_ok=True)
    manifest, global_idx = [], 0
    for category, variants in CATEGORY_ACTIONS.items():
        cat_dir = CHARACTERS/category; cat_dir.mkdir(parents=True, exist_ok=True)
        for action, expression in variants:
            global_idx += 1
            slug = f'edutu-{SINGULAR[category]}-{action}-{expression}'
            p = cat_dir/f'{slug}.svg'; p.write_text(make_svg(category,action,expression,global_idx), encoding='utf-8')
            manifest.append({'id':slug,'category':category,'action':action,'expression':expression,'svg':str(p.relative_to(ROOT)).replace('\\','/'),'png':f'exports/transparent-png/{slug}.png','size':'1200x1200','background':'transparent','tags':[category,action,expression,'edutu','social-media','mascot']})
    (ROOT/'manifest.json').write_text(json.dumps({'version':'1.0.0','count':len(manifest),'format':'SVG master + PNG export','assets':manifest}, indent=2), encoding='utf-8')
    lines=['# Edutu Mascot Catalog','',f'**{len(manifest)} reusable mascot variants** across {len(CATEGORY_ACTIONS)} categories.','', '| Category | Variants |','|---|---:|']
    for c,v in CATEGORY_ACTIONS.items(): lines.append(f'| {c.title()} | {len(v)} |')
    lines += ['', '## Naming', '', '`edutu-{persona}-{action}-{emotion}.svg`', '', 'Every master is transparent, square, vector, and can be exported to PNG at any resolution.']
    (ROOT/'CATALOG.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    import cairosvg
    from PIL import Image, ImageDraw
    for item in manifest:
        cairosvg.svg2png(url=str(ROOT/item['svg']), write_to=str(ROOT/item['png']), output_width=1200, output_height=1200)
    thumb, cols = 220, 8; rows = math.ceil(len(manifest)/cols)
    sheet = Image.new('RGB',(cols*thumb,rows*(thumb+34)), '#F4F7F5'); draw = ImageDraw.Draw(sheet)
    for i,item in enumerate(manifest):
        im=Image.open(ROOT/item['png']).convert('RGBA'); im.thumbnail((thumb-18,thumb-18)); card=Image.new('RGBA',(thumb,thumb),(255,255,255,255)); card.alpha_composite(im,((thumb-im.width)//2,(thumb-im.height)//2)); x=(i%cols)*thumb; y=(i//cols)*(thumb+34); sheet.paste(card.convert('RGB'),(x,y)); draw.text((x+8,y+thumb+7),item['id'].replace('edutu-','')[:27],fill='#17312B')
    sheet.save(CATALOG/'contact-sheet.jpg', quality=88, optimize=True)
    with zipfile.ZipFile(PACKS/'edutu-mascots-complete-pack.zip','w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(CHARACTERS.rglob('*.svg')): z.write(p,p.relative_to(ROOT))
        for p in sorted(PNG_DIR.glob('*.png')): z.write(p,p.relative_to(ROOT))
        z.write(ROOT/'manifest.json','manifest.json'); z.write(ROOT/'CATALOG.md','CATALOG.md')
    with zipfile.ZipFile(PACKS/'edutu-mascots-svg-pack.zip','w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(CHARACTERS.rglob('*.svg')): z.write(p,p.relative_to(ROOT))
        z.write(ROOT/'manifest.json','manifest.json'); z.write(ROOT/'CATALOG.md','CATALOG.md')
    category_pack_dir = PACKS/'categories'; category_pack_dir.mkdir(parents=True, exist_ok=True)
    for category in CATEGORY_ACTIONS:
        with zipfile.ZipFile(category_pack_dir/f'edutu-{category}-png-pack.zip','w',zipfile.ZIP_DEFLATED) as z:
            for item in (m for m in manifest if m['category'] == category):
                png = ROOT/item['png']; z.write(png,png.name)
    print(f'Generated {len(manifest)} SVG masters and {len(manifest)} PNG exports.')

if __name__ == '__main__':
    build()
