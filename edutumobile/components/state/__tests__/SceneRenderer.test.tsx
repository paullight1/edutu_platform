import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SCENES, resolvePaints } from '@edutu/ux-state/scenes';
import { SceneRenderer, hueTokensFrom } from '../SceneRenderer';
import { ThemeProvider } from '../../context/ThemeContext';
import type { StateTokens } from '../stateTokens';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const KEYS = Object.keys(SCENES) as (keyof typeof SCENES)[];

describe('SceneRenderer', () => {
  it('renders every one of the 26 scenes without throwing', () => {
    expect(KEYS).toHaveLength(26);
    for (const key of KEYS) {
      const { unmount } = wrap(<SceneRenderer scene={key} />);
      unmount();
    }
  });

  it('produces a tree for a scene', async () => {
    // ThemeProvider renders null until it has hydrated the persisted theme from
    // AsyncStorage, so the tree only exists after that settles.
    const { toJSON } = wrap(<SceneRenderer scene="emptySaved" />);
    await waitFor(() => expect(toJSON()).not.toBeNull());
  });

  it('accepts a size override', () => {
    expect(() => wrap(<SceneRenderer scene="offline" size={96} />)).not.toThrow();
  });
});

/**
 * The primitive this replaces hardcoded slate hex, so it was correct in exactly
 * one of the app's 18 palettes. These assert the colours actually follow the
 * theme rather than merely looking like they might.
 */
describe('theme reactivity', () => {
  const light: StateTokens = {
    hue: '#4F46E5',
    hueLight: '#6366F1',
    wash: '#4F46E512',
    ring: '#4F46E52E',
    surface: '#F8FAFC',
    surfaceLine: '#E2E8F0',
    line: 'rgba(15,23,42,0.18)',
    lineSoft: 'rgba(15,23,42,0.08)',
    title: '#0F172A',
    body: '#64748B',
    onHue: '#FFFFFF',
    isDark: false,
  };

  const dark: StateTokens = { ...light, hue: '#6366F1', surface: '#0F172A', isDark: true };

  it('derives a different soft tone in dark mode, since a tint vanishes there', () => {
    expect(hueTokensFrom(light).soft).not.toBe(hueTokensFrom(dark).soft);
    expect(hueTokensFrom(light).plate).not.toBe(hueTokensFrom(dark).plate);
  });

  it('carries no colour of its own — every paint traces back to the theme', () => {
    const paints = resolvePaints('invite', hueTokensFrom(light));
    expect(paints.hero).toBe(light.hue);
    expect(paints.ink).toBe(light.title);
    expect(paints.surface).toBe(light.surface);
  });

  it('inverts hero and mark for a calm scene', () => {
    const invite = resolvePaints('invite', hueTokensFrom(light));
    const calm = resolvePaints('calm', hueTokensFrom(light));
    expect(calm.hero).toBe(invite.mark);
    expect(calm.mark).toBe(invite.hero);
  });
});
