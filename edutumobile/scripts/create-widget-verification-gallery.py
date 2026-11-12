#!/usr/bin/env python3
"""Contact sheets and a local gallery from captured Android widget test artifacts."""
import html
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

folder = Path(sys.argv[1]).resolve()
font_path = '/System/Library/Fonts/Helvetica.ttc'
labels = {
    'EdutuWidgetProvider': 'Top Matches', 'DeadlineWidgetProvider': 'Deadlines',
    'TrendingWidgetProvider': 'Trending Now', 'ChatWidgetProvider': 'Ask Edutu',
    'NextStepWidgetProvider': 'Today’s Next Step', 'TrendingSpotlightWidgetProvider': 'Spotlight',
    'TrendingGridWidgetProvider': 'Trending Grid', 'TrendingTickerWidgetProvider': 'Trending Ticker',
    'TrendingThumbListWidgetProvider': 'Trending List', 'NewsWidgetProvider': 'Edutu News',
}

def sheet(paths, destination, title, dark):
    columns, cell_w, cell_h = 4, 370, 390
    background, ink = ('#151923', '#edf0f7') if dark else ('#edf1f5', '#172131')
    result = Image.new('RGB', (columns*cell_w, 70+((len(paths)+columns-1)//columns)*cell_h), background)
    draw = ImageDraw.Draw(result)
    draw.text((20, 18), title, fill=ink, font=ImageFont.truetype(font_path, 22))
    for index, path in enumerate(paths):
        x, y = index % columns*cell_w+15, 70+index//columns*cell_h
        name = path.stem
        for key, value in labels.items():
            name = name.replace(key, value)
        draw.text((x, y+3), name, fill=ink, font=ImageFont.truetype(font_path, 13))
        picture = Image.open(path).convert('RGBA')
        picture.thumbnail((340, 340))
        result.paste(picture, (x, y+30), picture)
    result.save(destination, quality=90)

cards = []
for theme in ('light', 'dark'):
    installed = folder/('installed-v23-'+theme)
    version = 'v23'
    if not installed.exists():
        installed = folder/('installed-final-'+theme)
        version = 'v22'
    if not installed.exists():
        installed = folder/('installed-v22-'+theme)
    paths = sorted(installed.glob('*.png'))
    if paths:
        sheet(paths, folder/('installed-'+theme+'.jpg'), 'Edutu installed APK '+version+' · '+theme+' · real provider captures', theme=='dark')
    for path in paths:
        label = path.stem
        for key, value in labels.items():
            label = label.replace(key, value)
        cards.append((path, label, theme, 'installed', '1.0'))
    samples = sorted((folder/'native-final').glob('*_'+theme+'.png'))
    if samples:
        sheet(samples, folder/('native-'+theme+'.jpg'), 'Edutu native layouts · '+theme+' · sample content', theme=='dark')

for path in sorted((folder/'native-final').glob('*.png')):
    if '_light' not in path.stem and '_dark' not in path.stem:
        continue
    theme = 'dark' if '_dark' in path.stem else 'light'
    scale = path.stem.split('_font')[-1] if '_font' in path.stem else '1.0'
    cards.append((path, path.stem, theme, 'sample', scale))

figures = '\n'.join(
    '<figure data-theme="'+theme+'" data-source="'+source+'" data-scale="'+scale+'">'
    '<a href="'+html.escape(str(path.relative_to(folder)))+'"><img loading="lazy" src="'+html.escape(str(path.relative_to(folder)))+'" alt="'+html.escape(label)+'"></a>'
    '<figcaption>'+html.escape(label)+'</figcaption></figure>'
    for path, label, theme, source, scale in cards
)
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edutu Android widget verification</title><style>
body{font:16px system-ui;margin:32px;background:#edf1f5;color:#172131}h1{font-size:28px}p{max-width:900px;line-height:1.6}nav{display:flex;gap:16px;flex-wrap:wrap;position:sticky;top:0;padding:16px;background:#edf1f5}select{font:inherit;padding:8px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px}figure{margin:0;padding:16px;border:1px solid #cbd3df;border-radius:16px}figure img{max-width:100%;max-height:340px;object-fit:contain}figcaption{margin-top:12px;font-size:13px;overflow-wrap:anywhere}figure[data-theme=dark]{background:#151923;color:white}figure[hidden]{display:none}
</style><h1>Edutu Android widgets</h1><p>Installed APK captures use the real Android widget providers. Public widgets show live feed/cache data; account-owned widgets show the current account state. Sample renders use production layouts and representative content to exercise every size at 100%, 160% and 200% font scale. Click any image for its full resolution.</p>
<nav><label>Theme <select id="theme"><option>light</option><option>dark</option></select></label><label>Source <select id="source"><option value="installed">Installed APK</option><option value="sample">Sample content / native layouts</option></select></label><label>Text size <select id="scale"><option value="1.0">100%</option><option value="1.6">160%</option><option value="2.0">200%</option></select></label></nav><main>'''+figures+'''</main><script>
const controls=['theme','source','scale'].map(id=>document.getElementById(id));
function filter(){document.querySelectorAll('figure').forEach(f=>f.hidden=controls.some(c=>f.dataset[c.id]!==c.value));}
controls.forEach(c=>c.addEventListener('change',filter));filter();</script></html>'''
(folder/'gallery.html').write_text(page)
print(folder/'gallery.html')
