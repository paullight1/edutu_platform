const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../android/app/src/main/res');
const supported = new Set(['LinearLayout', 'FrameLayout', 'RelativeLayout', 'GridLayout', 'TextView', 'ImageView', 'ImageButton', 'Button', 'ViewFlipper', 'ListView', 'GridView', 'StackView', 'AdapterViewFlipper', 'ProgressBar', 'Chronometer', 'TextClock', 'ViewStub']);
for (const file of fs.readdirSync(path.join(root, 'layout')).filter(f => /edutu.*widget.*\.xml$/.test(f))) {
  test(`${file} uses RemoteViews-supported classes, including hidden empty states`, () => {
    const xml = fs.readFileSync(path.join(root, 'layout', file), 'utf8');
    const tags = [...xml.matchAll(/<([A-Za-z][\w.]*)\b/g)].map(m => m[1]);
    assert.deepEqual(tags.filter(t => !supported.has(t)), [], 'Unsupported classes cause launcher-side inflation failure');
  });
}
test('widget API uses the same production backend as the app', () => {
  const xml = fs.readFileSync(path.join(root, 'values/edutu_widget_strings.xml'), 'utf8');
  assert.match(xml, /name="edutu_widget_api_base"[^>]*>https:\/\/backend\.edutu\.org</);
});
test('every widget has a preview on launchers before Android 12', () => {
  for (const file of fs.readdirSync(path.join(root, 'xml')).filter(f => /^edutu.*widget_info.xml$/.test(f))) {
    const xml = fs.readFileSync(path.join(root, 'xml', file), 'utf8');
    assert.match(xml, /android:previewImage="@drawable\//, file);
  }
});
