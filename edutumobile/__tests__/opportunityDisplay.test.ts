import {
  MATCH_TIER_KEY,
  cleanLocation,
  decodeHtmlEntities,
  decodeMaybe,
  getMatchTier,
  previewText,
} from '../lib/opportunityDisplay';

describe('opportunity display helpers', () => {
  describe('getMatchTier', () => {
    it('buckets scores into tiers, never percentages', () => {
      expect(getMatchTier(91)).toBe('strong');
      expect(getMatchTier(80)).toBe('strong');
      expect(getMatchTier(79)).toBe('solid');
      expect(getMatchTier(60)).toBe('solid');
      expect(getMatchTier(40)).toBe('possible');
      expect(getMatchTier(12)).toBe('stretch');
    });

    it('returns null for an unranked opportunity rather than judging it', () => {
      // 0 / missing means "we never scored this", not "bad fit" — labelling it
      // "Stretch" would be a claim we did not make.
      expect(getMatchTier(0)).toBeNull();
      expect(getMatchTier(undefined)).toBeNull();
      expect(getMatchTier(null)).toBeNull();
      expect(getMatchTier(Number.NaN)).toBeNull();
    });

    it('maps every tier to an i18n key, so no English leaks from this module', () => {
      (['strong', 'solid', 'possible', 'stretch'] as const).forEach((tier) => {
        expect(MATCH_TIER_KEY[tier].label).toMatch(/^detail\.fit\.tiers\./);
        expect(MATCH_TIER_KEY[tier].blurb).toMatch(/^detail\.fit\.tiers\./);
      });
    });
  });

  describe('decodeHtmlEntities', () => {
    it('decodes the numeric entities that survive scraping', () => {
      expect(decodeHtmlEntities('Lagos &#038; Abuja')).toBe('Lagos & Abuja');
      expect(decodeHtmlEntities('Intern &#8211; 2026')).toBe('Intern – 2026');
      expect(decodeHtmlEntities('A &#x26; B')).toBe('A & B');
    });

    it('decodes named entities and leaves unknown ones intact', () => {
      expect(decodeHtmlEntities('R&amp;D &quot;lab&quot;')).toBe('R&D "lab"');
      expect(decodeHtmlEntities('&notanentity;')).toBe('&notanentity;');
    });

    it('tolerates null and undefined via decodeMaybe', () => {
      expect(decodeMaybe(null)).toBe('');
      expect(decodeMaybe(undefined)).toBe('');
      expect(decodeMaybe('Plain')).toBe('Plain');
    });
  });

  describe('cleanLocation', () => {
    it('strips a deadline fragment folded into the location column', () => {
      expect(cleanLocation('Abuja Deadline: 3rd August')).toBe('Abuja');
      expect(cleanLocation('Ogun Deadline: 19th June')).toBe('Ogun');
      expect(cleanLocation('Nigeria — Application deadline 12 Sept')).toBe('Nigeria');
    });

    it('strips other scraped label runs from the tail', () => {
      expect(cleanLocation('Borno Duration: 6 months Deadline: 29th')).toBe('Borno');
      expect(cleanLocation('Abuja Work Mode: Full Time (8am to 4:30p')).toBe('Abuja');
    });

    it('leaves a legitimate location untouched', () => {
      expect(cleanLocation('Lagos, Nigeria')).toBe('Lagos, Nigeria');
      expect(cleanLocation('Worldwide ')).toBe('Worldwide');
      expect(cleanLocation('Remote (Africa)')).toBe('Remote (Africa)');
    });

    it('decodes entities on the way through and handles empties', () => {
      expect(cleanLocation('Lagos &#038; Abuja')).toBe('Lagos & Abuja');
      expect(cleanLocation(null)).toBe('');
      expect(cleanLocation('   ')).toBe('');
    });
  });

  describe('previewText', () => {
    it('collapses whitespace and truncates on a word boundary', () => {
      expect(previewText('  a   short   line ')).toBe('a short line');
      const long = 'word '.repeat(60).trim();
      const preview = previewText(long, 40);
      expect(preview.length).toBeLessThanOrEqual(41);
      expect(preview.endsWith('…')).toBe(true);
    });
  });
});
