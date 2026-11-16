// Committed templates survive `expo prebuild --clean`, which deletes android/ first.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const native = path.join(root, 'android/app/src/main');
const templates = path.join(root, 'plugins/android-widget/templates');
fs.cpSync(path.join(native, 'java/com/edutu/com/widgets'), path.join(templates, 'widgets'), { recursive: true });
for (const folder of fs.readdirSync(path.join(native, 'res'), { withFileTypes: true }).filter(e => e.isDirectory())) {
  for (const file of fs.readdirSync(path.join(native, 'res', folder.name)).filter(f => f.includes('widget'))) {
    const target = path.join(templates, 'res', folder.name, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(native, 'res', folder.name, file), target);
  }
}
console.log('Updated complete Android widget templates.');
