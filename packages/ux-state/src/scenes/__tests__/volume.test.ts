import { describe, expect, it } from 'vitest';
import type { HueTokens, Layer } from '../types';
import { resolvePaints, visibleLayers } from '../volume';

const tokens: HueTokens = {
  hue: '#4F46E5',
  soft: '#E0E7FF',
  plate: '#EEF2FF',
  ink: '#0F172A',
  inkSoft: '#64748B',
  surface: '#FFFFFF',
  surfaceLine: '#E2E8F0',
};

describe('resolvePaints', () => {
  it('gives the saturated hue to the hero shape when inviting', () => {
    const p = resolvePaints('invite', tokens);
    expect(p.hero).toBe('#4F46E5');
    expect(p.mark).toBe('#E0E7FF');
  });

  it('inverts hero and mark when calm, so failures stop shouting', () => {
    const p = resolvePaints('calm', tokens);
    expect(p.hero).toBe('#E0E7FF');
    expect(p.mark).toBe('#4F46E5');
  });

  it('leaves the non-duotone roles alone in both volumes', () => {
    for (const v of ['invite', 'calm'] as const) {
      const p = resolvePaints(v, tokens);
      expect(p.plate).toBe('#EEF2FF');
      expect(p.ink).toBe('#0F172A');
      expect(p.inkSoft).toBe('#64748B');
      expect(p.surface).toBe('#FFFFFF');
      expect(p.surfaceLine).toBe('#E2E8F0');
    }
  });
});

describe('visibleLayers', () => {
  const layers: Layer[] = [
    { t: 'rect', x: 0, y: 0, w: 10, h: 10, fill: 'hero' },
    { t: 'circle', cx: 5, cy: 5, r: 3, fill: 'plate', decor: true },
    {
      t: 'group',
      children: [
        { t: 'circle', cx: 1, cy: 1, r: 1, fill: 'mark' },
        { t: 'circle', cx: 2, cy: 2, r: 1, fill: 'plate', decor: true },
      ],
    },
  ];

  it('keeps every layer when inviting', () => {
    const out = visibleLayers(layers, 'invite');
    expect(out).toHaveLength(3);
    expect((out[2] as { children: Layer[] }).children).toHaveLength(2);
  });

  it('drops decorative layers when calm, including inside groups', () => {
    const out = visibleLayers(layers, 'calm');
    expect(out).toHaveLength(2);
    expect((out[1] as { children: Layer[] }).children).toHaveLength(1);
  });

  it('does not mutate the input', () => {
    visibleLayers(layers, 'calm');
    expect(layers).toHaveLength(3);
    expect((layers[2] as { children: Layer[] }).children).toHaveLength(2);
  });
});
