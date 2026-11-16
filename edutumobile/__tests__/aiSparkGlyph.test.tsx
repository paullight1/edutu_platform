import React from 'react';
import { render } from '@testing-library/react-native';
import { AiSparkGlyph } from '../components/ui/AiSparkGlyph';

describe('AiSparkGlyph', () => {
  it('renders at the requested size', () => {
    const tree = JSON.stringify(render(<AiSparkGlyph size={30} color="#111827" />).toJSON());
    expect(tree).toContain('30');
  });

  // The whole point of the nav change: the glyph is monochrome and takes the
  // bar's colour, so no other colour may leak into the markup.
  it('draws only in the colour it is given', () => {
    const tree = JSON.stringify(render(<AiSparkGlyph size={24} color="#0EA5E9" />).toJSON());
    // react-native-svg normalizes colours to ARGB ints: 0xFF0EA5E9.
    const payloads = new Set([...tree.matchAll(/"payload":(\d+)/g)].map((m) => m[1]));
    expect([...payloads]).toEqual([String(0xff0ea5e9)]);
  });

  it('outlines on glass and fills when the button is solid', () => {
    const outlined = JSON.stringify(render(<AiSparkGlyph size={24} color="#111827" />).toJSON());
    const filled = JSON.stringify(render(<AiSparkGlyph size={24} color="#111827" filled />).toJSON());
    expect(outlined).not.toBe(filled);
    expect(outlined).toContain('stroke');
  });
});
