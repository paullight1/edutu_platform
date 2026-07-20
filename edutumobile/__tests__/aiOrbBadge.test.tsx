import React from 'react';
import { render } from '@testing-library/react-native';
import { AiOrbBadge } from '../components/ui/AiOrbBadge';

describe('AiOrbBadge', () => {
  it.each([11, 14, 18, 24, 30])('renders at %ipx without crashing', (size) => {
    const { toJSON } = render(<AiOrbBadge size={size} />);
    expect(toJSON()).toBeTruthy();
  });

  it('composes the blue→violet gradient orb (see AI_ORB in AiOrbBadge.tsx)', () => {
    // expo-linear-gradient is mocked to a plain View in jest.setup.ts, so the
    // `colors` prop passes through to the rendered tree untouched.
    const tree = JSON.stringify(render(<AiOrbBadge size={28} />).toJSON());
    expect(tree).toContain('#5B8CFA');
    expect(tree).toContain('#6366F1');
    expect(tree).toContain('#8B5CF6');
  });

  it('draws the white spark glyph on top of the orb', () => {
    // react-native-svg is not mocked, so colour props get normalized to ARGB
    // int "payload" values on the rendered Path nodes (see aiSparkGlyph.test.tsx).
    const tree = JSON.stringify(render(<AiOrbBadge size={28} />).toJSON());
    const payloads = new Set([...tree.matchAll(/"payload":(\d+)/g)].map((m) => m[1]));
    expect([...payloads]).toEqual([String(0xffffffff)]);
  });

  it('scales the spark glyph with the badge size', () => {
    const small = JSON.stringify(render(<AiOrbBadge size={14} />).toJSON());
    const large = JSON.stringify(render(<AiOrbBadge size={30} />).toJSON());
    expect(small).not.toBe(large);
  });
});
