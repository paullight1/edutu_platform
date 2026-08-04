/**
 * Parity guard for the `community` i18n namespace (Group Discussions, Task 8).
 *
 * Unlike `opps` (~848 keys short across eight locales — see
 * opps-locale-gap-2026-08-03), this namespace is new and must ship
 * key-identical across all nine locales from day one. This test flattens
 * each locale's JSON to dotted leaf paths and diffs against `en`, ignoring
 * i18next's count-suffix variants (`_one`, `_other`, `_zero`, `_two`,
 * `_few`, `_many`) since not every locale needs the same plural forms.
 */
import enCommunity from '../lib/i18n/locales/en/community.json';
import arCommunity from '../lib/i18n/locales/ar/community.json';
import esCommunity from '../lib/i18n/locales/es/community.json';
import frCommunity from '../lib/i18n/locales/fr/community.json';
import haCommunity from '../lib/i18n/locales/ha/community.json';
import hiCommunity from '../lib/i18n/locales/hi/community.json';
import ptCommunity from '../lib/i18n/locales/pt/community.json';
import swCommunity from '../lib/i18n/locales/sw/community.json';
import zhCommunity from '../lib/i18n/locales/zh/community.json';

const LOCALES: Record<string, unknown> = {
  en: enCommunity,
  ar: arCommunity,
  es: esCommunity,
  fr: frCommunity,
  ha: haCommunity,
  hi: hiCommunity,
  pt: ptCommunity,
  sw: swCommunity,
  zh: zhCommunity,
};

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

/** Strips a trailing i18next plural-count suffix from a leaf key, if present. */
function stripPluralSuffix(key: string): string {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) {
      return key.slice(0, -suffix.length);
    }
  }
  return key;
}

/** Flattens a nested JSON object to a sorted, de-duplicated list of dotted leaf paths. */
function leaves(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') {
    return [stripPluralSuffix(prefix)];
  }
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(...leaves(value, path));
  }
  return Array.from(new Set(out)).sort();
}

describe('community i18n namespace — nine-locale parity', () => {
  const base = leaves(LOCALES.en);

  it('has at least the vocabulary the brief requires', () => {
    expect(base.length).toBeGreaterThan(20);
  });

  for (const lang of Object.keys(LOCALES).filter((l) => l !== 'en')) {
    it(`keeps ${lang}/community.json key-identical to en (ignoring plural suffixes)`, () => {
      const cur = leaves(LOCALES[lang]);
      const missing = base.filter((k) => !cur.includes(k));
      const extra = cur.filter((k) => !base.includes(k));
      expect({ lang, missing, extra }).toEqual({ lang, missing: [], extra: [] });
    });
  }
});
