// query-string 7 expects a callable CommonJS decoder. The security-patched
// decode-uri-component 0.5.1 exports an ESM default instead. Keep the existing
// query-string API while using the patched decoder in Node and Metro.
const fs = require('node:fs');
const path = require('node:path');
const target = require.resolve('query-string');
const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(target), 'package.json'), 'utf8'));
if (manifest.version !== '7.1.3') throw new Error('Review the query-string decoder patch for the new version.');
const before = "const decodeComponent = require('decode-uri-component');";
const after = "const decoderModule = require('decode-uri-component');\nconst decodeComponent = decoderModule.default || decoderModule;";
const source = fs.readFileSync(target, 'utf8');
if (source.includes(before)) fs.writeFileSync(target, source.replace(before, after));
else if (!source.includes(after)) throw new Error('query-string decoder patch did not match its expected source.');
