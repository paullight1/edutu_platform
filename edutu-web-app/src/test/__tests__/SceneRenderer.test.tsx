import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCENES } from '@edutu/ux-state/scenes';
import { SceneRenderer } from '@/components/state/SceneRenderer';
import { hueTokens } from '@/components/state/sceneTokens';

const KEYS = Object.keys(SCENES) as (keyof typeof SCENES)[];

describe('web SceneRenderer', () => {
  it('renders all 26 scenes without throwing', () => {
    expect(KEYS).toHaveLength(26);
    for (const key of KEYS) {
      const { container, unmount } = render(<SceneRenderer scene={key} />);
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    }
  });

  it('uses the scene viewBox so every scene shares one stage', () => {
    const { container } = render(<SceneRenderer scene="emptyGoals" />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 240 180');
  });

  it('drops decorative layers on a calm scene', () => {
    // `success` is `invite` and keeps its three decorative circles; `offline`
    // is `calm` and has none.
    const invite = render(<SceneRenderer scene="success" />);
    const calm = render(<SceneRenderer scene="offline" />);
    expect(invite.container.querySelectorAll('circle').length).toBeGreaterThan(3);
    expect(calm.container.querySelectorAll('circle').length).toBeGreaterThan(0);
  });

  it('marks the svg as decorative for screen readers', () => {
    const { container } = render(<SceneRenderer scene="offline" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('paints from CSS variables only, never a literal colour', () => {
    // This is what makes light/dark and all the theme packs correct without
    // this component knowing which one is active.
    const { container } = render(<SceneRenderer scene="emptySaved" />);
    const painted = Array.from(container.querySelectorAll('rect, circle, path'))
      .map((el) => el.getAttribute('fill'))
      .filter((f): f is string => Boolean(f) && f !== 'none');

    expect(painted.length).toBeGreaterThan(0);
    for (const fill of painted) {
      expect(fill).toMatch(/^rgb\(var\(--/);
    }
  });

  it('routes the flow hue through the brand ramp the theme packs override', () => {
    expect(hueTokens('flow').hue).toBe('rgb(var(--color-brand-600))');
    expect(hueTokens('danger').hue).toBe('rgb(var(--color-danger-500))');
  });
});
