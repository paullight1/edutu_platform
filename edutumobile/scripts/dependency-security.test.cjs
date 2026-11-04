const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

test('the existing router query parser retains callable decoding and query round trips', () => {
  const query = require('query-string');
  const parsed = query.parseUrl('edutu://opportunity/123?return=%2Fapp%2Fapplications&tags[]=a&tags[]=b', { arrayFormat: 'bracket' });
  assert.equal(parsed.url, 'edutu://opportunity/123');
  assert.equal(parsed.query.return, '/app/applications');
  assert.deepEqual(parsed.query.tags, ['a', 'b']);
  assert.deepEqual(query.parseUrl(query.stringifyUrl(parsed, { arrayFormat: 'bracket' }), { arrayFormat: 'bracket' }), parsed);
  assert.doesNotThrow(() => query.parse('q=%E0%A4%A'));
  execFileSync(process.execPath, ['-e', "require('query-string').parse('q=' + '%E0%A4'.repeat(5000));"], {
    cwd: path.resolve(__dirname, '..'), timeout: 5000, stdio: 'pipe',
  });
});

test('Expo dev-tools plugin schemas retain validation with the patched Zod', () => {
  const fromExpo = createRequire(require.resolve('expo/package.json'));
  const cliRoot = path.dirname(fromExpo.resolve('@expo/cli/package.json'));
  const { PluginSchema, DevToolsPluginOutputSchema } = require(path.join(cliRoot, 'build/src/start/server/DevToolsPlugin.schema.js'));
  const { createMCPDevToolsExtensionSchema } = require(path.join(cliRoot, 'build/src/start/server/createMCPDevToolsExtensionSchema.js'));
  const plugin = PluginSchema.parse({
    packageName: 'own-device-fixture', packageRoot: '/local/fixture',
    cliExtensions: { description: 'Fixture', entryPoint: 'fixture.js', commands: [{ name: 'check', title: 'Check', environments: ['mcp'], parameters: [{ name: 'count', type: 'number' }] }] },
  });
  const schema = createMCPDevToolsExtensionSchema(plugin);
  assert.deepEqual(schema.parse({ command: 'check', count: 2 }), { command: 'check', count: 2 });
  assert.equal(schema.safeParse({ command: 'other' }).success, false);
  assert.equal(schema.safeParse({ command: 'check', count: 'wrong' }).success, false);
  assert.equal(schema.safeParse({ command: 'check', extra: true }).success, false);
  assert.equal(DevToolsPluginOutputSchema.safeParse([{ type: 'text', text: 'ok', level: 'info' }]).success, true);
});
