const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const plugin = require('../plugins/android-widget');

test('clean prebuild generates the complete widget suite and keeps receiver registration idempotent', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'edutu-widget-prebuild-'));
  try {
    const config = plugin({ name: 'Fixture', slug: 'fixture', android: { package: 'org.example.fixture' } });
    const request = { projectRoot: temp, platformProjectRoot: temp, platform: 'android', modName: 'dangerous' };
    await config.mods.android.dangerous({ ...config, modRequest: request, modResults: {} });
    const main = path.join(temp, 'app/src/main');
    const sources = fs.readdirSync(path.join(main, 'java/org/example/fixture/widgets'));
    assert.equal(sources.filter(f => f.endsWith('WidgetProvider.kt')).length, 10);
    assert.equal(fs.readdirSync(path.join(main, 'res/layout')).length, 18);
    assert.ok(sources.includes('WidgetRefreshObserver.kt'));
    assert.match(fs.readFileSync(path.join(main, 'java/org/example/fixture/widgets/WidgetSupport.kt'), 'utf8'), /import org.example.fixture.R/);
    const manifestConfig = { ...config, modRequest: { ...request, modName: 'manifest' }, modResults: { manifest: { application: [{}] } } };
    const first = await config.mods.android.manifest(manifestConfig);
    const second = await config.mods.android.manifest(first);
    assert.equal(second.modResults.manifest.application[0].receiver.length, 10);
    const app = await config.mods.android.mainApplication({ ...config, modRequest: { ...request, modName: 'mainApplication' }, modResults: { language: 'kt', contents: 'override fun onCreate() {\n  super.onCreate()\n}' } });
    assert.match(app.modResults.contents, /org.example.fixture.widgets.WidgetRefreshObserver.start\(this\)/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('prebuild templates contain the current native sources and all picker assets', () => {
  const root = path.join(__dirname, '..');
  const template = path.join(root, 'plugins/android-widget/templates');
  function compare(dir, native) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const left = path.join(dir, entry.name), right = path.join(native, entry.name);
      if (entry.isDirectory()) compare(left, right);
      else assert.deepEqual(fs.readFileSync(left), fs.readFileSync(right), right);
    }
  }
  compare(path.join(template, 'widgets'), path.join(root, 'android/app/src/main/java/com/edutu/com/widgets'));
  compare(path.join(template, 'res'), path.join(root, 'android/app/src/main/res'));
});
