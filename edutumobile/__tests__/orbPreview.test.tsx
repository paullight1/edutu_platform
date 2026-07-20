import React from 'react';
import { render } from '@testing-library/react-native';
import { OrbPreview } from '../components/ui/OrbPreview';
import { ORB_DESIGNS, ORB_PALETTES } from '../lib/voiceSettingsStore';

describe('OrbPreview', () => {
  it.each(ORB_DESIGNS)('renders the %s design without crashing', (design) => {
    const { toJSON } = render(
      <OrbPreview design={design} size={24} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders every design distinctly (no two share the same markup)', () => {
    const trees = ORB_DESIGNS.map((design) =>
      JSON.stringify(render(<OrbPreview design={design} size={24} />).toJSON()),
    );
    expect(new Set(trees).size).toBe(ORB_DESIGNS.length);
  });

  // The check above proves the rendered *props* differ, not that the designs
  // are legible at picker size — that's a visual judgment this suite can't make.
  // This does verify the thing that actually has to hold for legibility to be
  // *possible*: every design draws from its own, distinct colour set in
  // ORB_PALETTES (the single source of truth after Fix 3), so no two designs
  // can silently converge on the same palette.
  it('draws each design from a distinct ORB_PALETTES entry', () => {
    const paletteSignatures = ORB_DESIGNS.map((design) => JSON.stringify(ORB_PALETTES[design]));
    expect(new Set(paletteSignatures).size).toBe(ORB_DESIGNS.length);
  });

  it('renders the final settled state immediately under reducedMotion', () => {
    // Just a crash/shape guard — the mocked reanimated module resolves
    // withSpring synchronously either way, so this mainly documents intent.
    const { toJSON } = render(
      <OrbPreview design="robot" size={24} reducedMotion />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('falls back to the particles design for an unrecognized value', () => {
    const fallback = render(
      <OrbPreview design={'unknown' as never} size={24} />,
    ).toJSON();
    const particles = render(
      <OrbPreview design="particles" size={24} />,
    ).toJSON();
    expect(JSON.stringify(fallback)).toBe(JSON.stringify(particles));
  });
});
