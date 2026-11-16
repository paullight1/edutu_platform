const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withNotificationManifest } = require('expo-notifications/plugin/build/withNotificationsAndroid');
const pluginPath = path.join(__dirname, '../plugins/with-notification-color.js');
// Missing fix means the real Expo notification manifest mod runs unchanged.
const withFix = fs.existsSync(pluginPath) ? require(pluginPath) : config => config;
const name = 'com.google.firebase.messaging.default_notification_color';
const manifest = () => ({ manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' }, application: [{ $: { 'android:name': '.MainApplication' } }] } });
async function apply(fixture, color = '#305CF5') {
  let config = withFix({ name: 'Edutu', slug: 'hanaedutu' });
  config = withNotificationManifest(config, { color });
  return (await config.mods.android.manifest({ ...config, modRequest: { platform: 'android', modName: 'manifest' }, modResults: fixture })).modResults;
}
test('Expo notification colour explicitly overrides the Firebase library resource during manifest merging', async () => {
  const result = await apply(manifest());
  const color = result.manifest.application[0]['meta-data'].find(row => row.$['android:name'] === name).$;
  assert.equal(color['android:resource'], '@color/notification_icon_color');
  assert.equal(color['tools:replace'], 'android:resource');
  assert.equal(result.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
});
test('preserves existing merger directives and remains idempotent', async () => {
  const fixture = manifest();
  fixture.manifest.application[0]['meta-data'] = [{ $: { 'android:name': name, 'tools:replace': 'android:value' } }];
  const result = await apply(await apply(fixture));
  const color = result.manifest.application[0]['meta-data'].find(row => row.$['android:name'] === name).$;
  assert.deepEqual(new Set(color['tools:replace'].split(',')), new Set(['android:value', 'android:resource']));
  assert.equal(color['tools:replace'].split(',').length, 2);
});
test('does not add a Firebase colour override when notifications have no configured colour', async () => {
  const result = await apply(manifest(), null);
  assert.ok(!result.manifest.application[0]['meta-data']?.some(row => row.$['android:name'] === name));
});
