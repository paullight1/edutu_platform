const { withAndroidManifest } = require('expo/config-plugins');

/** Register before notification plugins so this manifest mod runs after them. */
module.exports = function withNotificationColor(config) {
  return withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    const app = manifest.application?.[0];
    const color = app?.['meta-data']?.find(row =>
      row.$?.['android:name'] === 'com.google.firebase.messaging.default_notification_color');
    if (!color?.$?.['android:resource']) return config;
    manifest.$ = { ...manifest.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
    const replacements = new Set((color.$['tools:replace'] || '').split(',').map(value => value.trim()).filter(Boolean));
    replacements.add('android:resource');
    color.$['tools:replace'] = [...replacements].join(',');
    return config;
  });
};
