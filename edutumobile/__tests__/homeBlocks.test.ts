import {
  normaliseHomeLayout,
  normaliseCustomFeatures,
  customFeaturesForPlacement,
  findCustomFeature,
} from '../lib/homeBlocks';

describe('normaliseHomeLayout', () => {
  it('returns [] for non-array / junk payloads (fail-open)', () => {
    expect(normaliseHomeLayout(undefined)).toEqual([]);
    expect(normaliseHomeLayout(null)).toEqual([]);
    expect(normaliseHomeLayout('nope')).toEqual([]);
    expect(normaliseHomeLayout({})).toEqual([]);
  });

  it('keeps valid blocks and defaults props', () => {
    const blocks = normaliseHomeLayout([
      { id: 'a', type: 'announcement', props: { title: 'Hi' } },
      { id: 'b', type: 'categories' },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      id: 'a',
      type: 'announcement',
      props: { title: 'Hi' },
      enabled: true,
    });
    expect(blocks[1].props).toEqual({});
  });

  it('drops blocks missing id/type, disabled blocks, and malformed entries', () => {
    const blocks = normaliseHomeLayout([
      { id: '', type: 'announcement' },
      { id: 'x', type: '' },
      { id: 'y', type: 'info_card', enabled: false },
      null,
      42,
      { id: 'z', type: 'promo_banner' },
    ]);
    expect(blocks.map((b) => b.id)).toEqual(['z']);
  });

  it('preserves unknown block types (forward-compat for EAS updates)', () => {
    const blocks = normaliseHomeLayout([{ id: 'a', type: 'future_widget' }]);
    expect(blocks[0].type).toBe('future_widget');
  });
});

describe('normaliseCustomFeatures', () => {
  it('returns [] for junk payloads', () => {
    expect(normaliseCustomFeatures(undefined)).toEqual([]);
    expect(normaliseCustomFeatures({ nope: true })).toEqual([]);
  });

  it('keeps valid features and defaults optional fields', () => {
    const features = normaliseCustomFeatures([
      { id: 'f1', title: 'Community', url: 'https://edutu.org/community' },
    ]);
    expect(features).toHaveLength(1);
    expect(features[0]).toEqual({
      id: 'f1',
      title: 'Community',
      subtitle: '',
      icon: '',
      url: 'https://edutu.org/community',
      openMode: 'webview',
      placement: 'tools',
      enabled: true,
    });
  });

  it('drops features missing id/title/url and disabled ones', () => {
    const features = normaliseCustomFeatures([
      { id: 'f1', title: 'No url', url: '' },
      { id: '', title: 'No id', url: 'https://x.io' },
      { id: 'f2', title: 'Off', url: 'https://x.io', enabled: false },
      { id: 'f3', title: 'Good', url: 'https://x.io' },
    ]);
    expect(features.map((f) => f.id)).toEqual(['f3']);
  });

  it('falls back to safe openMode/placement for invalid values', () => {
    const [feature] = normaliseCustomFeatures([
      {
        id: 'f1',
        title: 'X',
        url: 'https://x.io',
        openMode: 'iframe',
        placement: 'sidebar',
      },
    ]);
    expect(feature.openMode).toBe('webview');
    expect(feature.placement).toBe('tools');
  });
});

describe('customFeaturesForPlacement + findCustomFeature', () => {
  const features = normaliseCustomFeatures([
    { id: 'home1', title: 'Home', url: 'https://x.io', placement: 'home' },
    { id: 'tools1', title: 'Tools', url: 'https://x.io', placement: 'tools' },
    { id: 'both1', title: 'Both', url: 'https://x.io', placement: 'both' },
  ]);

  it('includes both-placement features in each surface', () => {
    expect(customFeaturesForPlacement(features, 'home').map((f) => f.id)).toEqual([
      'home1',
      'both1',
    ]);
    expect(customFeaturesForPlacement(features, 'tools').map((f) => f.id)).toEqual([
      'tools1',
      'both1',
    ]);
  });

  it('finds a feature by id and returns null for misses', () => {
    expect(findCustomFeature(features, 'both1')?.title).toBe('Both');
    expect(findCustomFeature(features, 'missing')).toBeNull();
    expect(findCustomFeature(null, 'home1')).toBeNull();
  });
});
