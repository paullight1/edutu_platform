#!/usr/bin/env python3
from pathlib import Path
import json, zipfile, xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
errors = []
manifest_path = ROOT / 'manifest.json'
if not manifest_path.exists():
    errors.append('manifest.json missing')
if errors:
    print('FAIL:', *errors, sep='\n- ')
    raise SystemExit(1)

data = json.loads(manifest_path.read_text())
assets = data.get('assets', [])
if len(assets) < 96:
    errors.append(f'expected >=96 assets, found {len(assets)}')
if len({a['id'] for a in assets}) != len(assets):
    errors.append('duplicate asset ids')
categories = {a['category'] for a in assets}
if len(categories) < 12:
    errors.append(f'expected >=12 categories, found {len(categories)}')

for a in assets:
    sp, pp = ROOT / a['svg'], ROOT / a['png']
    if not sp.exists():
        errors.append(f'missing {sp}')
    else:
        try:
            ET.parse(sp)
        except Exception as exc:
            errors.append(f'invalid SVG {sp}: {exc}')
    if not pp.exists():
        errors.append(f'missing {pp}')
    else:
        with Image.open(pp) as im:
            if im.size != (1200, 1200):
                errors.append(f'bad PNG size {pp}: {im.size}')
            if im.mode not in ('RGBA', 'LA'):
                errors.append(f'PNG lacks alpha {pp}: {im.mode}')

for req in ['README.md','CATALOG.md','reference/style-guide.md','manifest.json','exports/catalog/contact-sheet.jpg','exports/packs/edutu-mascots-complete-pack.zip','exports/packs/edutu-mascots-svg-pack.zip']:
    if not (ROOT / req).exists():
        errors.append(f'missing required {req}')

pack = ROOT / 'exports/packs/edutu-mascots-complete-pack.zip'
if pack.exists():
    with zipfile.ZipFile(pack) as z:
        svg_count = sum(n.endswith('.svg') for n in z.namelist())
        png_count = sum(n.endswith('.png') for n in z.namelist())
        if svg_count != len(assets) or png_count != len(assets):
            errors.append(f'pack mismatch svg={svg_count} png={png_count}')

category_packs = list((ROOT/'exports/packs/categories').glob('*.zip')) if (ROOT/'exports/packs/categories').exists() else []
if len(category_packs) != 12:
    errors.append(f'expected 12 category packs, found {len(category_packs)}')

if errors:
    print('FAIL:', *errors[:50], sep='\n- ')
    raise SystemExit(1)
print(f'PASS: {len(assets)} assets, {len(categories)} categories, SVG+PNG+packs verified')
