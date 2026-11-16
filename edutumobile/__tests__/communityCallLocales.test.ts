const catalogs = {
  en: require('../lib/i18n/locales/en/community.json').calls,
  ar: require('../lib/i18n/locales/ar/community.json').calls,
  es: require('../lib/i18n/locales/es/community.json').calls,
  fr: require('../lib/i18n/locales/fr/community.json').calls,
  ha: require('../lib/i18n/locales/ha/community.json').calls,
  hi: require('../lib/i18n/locales/hi/community.json').calls,
  pt: require('../lib/i18n/locales/pt/community.json').calls,
  sw: require('../lib/i18n/locales/sw/community.json').calls,
  zh: require('../lib/i18n/locales/zh/community.json').calls,
} as const;

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') entries.push([path, child]);
    else if (child && typeof child === 'object' && !Array.isArray(child)) entries.push(...Object.entries(flatten(child as Record<string, unknown>, path)));
  }
  return Object.fromEntries(entries);
}

function interpolationTokens(value: string): string[] {
  return value.match(/{{[^}]+}}/g)?.sort() ?? [];
}

describe('community call translations', () => {
  const english = flatten(catalogs.en);

  it.each(Object.entries(catalogs).filter(([locale]) => locale !== 'en'))(
    '%s has complete call-key and interpolation parity',
    (_locale, catalog) => {
      const translated = flatten(catalog);
      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
      for (const [key, englishValue] of Object.entries(english)) {
        expect(translated[key]?.trim()).toBeTruthy();
        expect(interpolationTokens(translated[key])).toEqual(interpolationTokens(englishValue));
      }
    },
  );

  it.each(Object.entries(catalogs).filter(([locale]) => locale !== 'en'))(
    '%s is not an English call-catalog fallback',
    (_locale, catalog) => {
      const translated = flatten(catalog);
      const unchanged = Object.keys(english).filter((key) => translated[key] === english[key]);
      expect(unchanged.length / Object.keys(english).length).toBeLessThan(0.1);
      for (const key of ['scheduleTitle', 'join', 'preflightBody', 'adminOnly', 'scheduleFailed', 'status.failed']) {
        expect(translated[key]).not.toBe(english[key]);
      }
    },
  );
});
