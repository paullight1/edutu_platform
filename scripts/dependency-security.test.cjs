const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const consumers = [
  ['backend/services/services/api', 'jest-config'],
  ['backend/services/services/api', 'fork-ts-checker-webpack-plugin'],
  ['edutu-web-app', '@rollup/plugin-node-resolve'],
];

test('backend webpack issue matcher keeps its callable matching API', () => {
  const cwd = path.resolve(__dirname, '..', 'backend/services/services/api');
  const fromScope = createRequire(path.join(cwd, 'package.json'));
  const fromChecker = createRequire(fromScope.resolve('fork-ts-checker-webpack-plugin'));
  const { createIssuePredicateFromIssueMatch } = fromChecker('./issue/issue-match');
  const predicate = createIssuePredicateFromIssueMatch(cwd, { file: '**/*.ts', severity: 'error' });
  assert.equal(predicate({ file: path.join(cwd, 'src/main.ts'), severity: 'error', code: '1' }), true);
  assert.equal(predicate({ file: path.join(cwd, 'src/main.js'), severity: 'error', code: '1' }), false);
});

for (const scope of ['backend/services/services/api', 'edutu-web-app', 'admin', 'pay-edutu-org']) {
  test(`${scope}: registry artifacts retain URL and integrity verification`, () => {
    const lock = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', scope, 'package-lock.json')));
    for (const [location, entry] of Object.entries(lock.packages)) {
      if (!location.startsWith('node_modules/') || !entry.version || entry.link || entry.inBundle) continue;
      assert.match(entry.resolved || '', /^https:\/\//, `${location} has no registry URL`);
      assert.match(entry.integrity || '', /^sha(1|256|384|512)-/, `${location} has no artifact checksum`);
      if (location.endsWith('/glob')) {
        assert.ok(Number(entry.version.split('.')[0]) >= 9, `${location} uses unsupported private minimatch internals`);
      }
    }
  });

  test(`${scope}: patched matching preserves callable and ESM legacy imports`, () => {
    const cwd = path.resolve(__dirname, '..', scope);
    const fromScope = createRequire(path.join(cwd, 'package.json'));
    const fromLegacy = createRequire(fromScope.resolve('@eslint/eslintrc'));
    const match = fromLegacy('minimatch');
    assert.equal(match('src/main.ts', '**/*.ts'), true);
    assert.equal(match('.private.ts', '*.ts'), false);
    assert.equal(match.defaults({ nocase: true })('README.MD', '*.md'), true);
    assert.equal(new match.Minimatch('**/*.ts').match('src/main.ts'), true);
    assert.deepEqual(match.match(['main.ts', 'main.js'], '*.ts'), ['main.ts']);
    // This actual consumer failed to load when the v11 override removed its
    // legacy default export. Exercise its ESM loader and pattern predicate.
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { FlatCompat } from '@eslint/eslintrc';
      import assert from 'node:assert/strict';
      import path from 'node:path';
      const config = new FlatCompat({ baseDirectory: process.cwd() }).config({
        overrides: [{ files: ['**/*.ts'], rules: { semi: 'error' } }],
      });
      assert.equal(config[0].files[0](path.resolve('src/check.ts')), true);
    `], { cwd, stdio: 'pipe' });
  });
}

for (const [scope, consumer] of consumers) {
  const fromScope = createRequire(path.resolve(__dirname, '..', scope, 'package.json'));
  const fromConsumer = createRequire(fromScope.resolve(consumer));
  const merge = fromConsumer('deepmerge');

  test(`${scope}/${consumer}: rejects source and target prototype poisoning`, () => {
    const poison = () => JSON.parse('{"__proto__":{"isAdmin":true}}');
    for (const result of [merge(Object.create(null), poison()), merge(poison(), {})]) {
      assert.equal(Object.getPrototypeOf(result), Object.prototype);
      assert.equal(result.isAdmin, undefined);
      assert.equal(Object.prototype.isAdmin, undefined);
      // Preserve legitimate JSON data without invoking the prototype setter.
      assert.equal(Object.hasOwn(result, '__proto__'), true);
      assert.equal(result.__proto__.isAdmin, true);
    }
  });

  test(`${scope}/${consumer}: preserves merge, clone and callback contracts`, () => {
    const symbol = Symbol('config');
    const date = new Date('2026-11-03T00:00:00Z');
    const source = { nested: { right: 2 }, list: [2], date, [symbol]: 'kept' };
    const result = merge({ nested: { left: 1 }, list: [1] }, source);
    assert.deepEqual(result.nested, { left: 1, right: 2 });
    assert.deepEqual(result.list, [1, 2]);
    assert.notEqual(result.nested, source.nested);
    assert.equal(result.date, date);
    assert.equal(result[symbol], 'kept');
    assert.deepEqual(merge.all([{ a: 1 }, { b: 2 }]), { a: 1, b: 2 });
    assert.deepEqual(merge({ list: [1] }, { list: [2] }, { arrayMerge: (_, next) => next }), { list: [2] });
    assert.deepEqual(merge({ label: {} }, { label: {} }, {
      customMerge: key => key === 'label' ? () => 'custom' : undefined,
    }), { label: 'custom' });
  });
}
