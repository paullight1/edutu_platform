import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface AiSparkGlyphProps {
    /** Diameter of the square the glyph is drawn into, in px. */
    size?: number;
    /** Stroke/fill colour. The glyph is monochrome by design. */
    color?: string;
    /** Fills the spark instead of outlining it — for solid/filled bar buttons. */
    filled?: boolean;
}

// The Gemini-style four-pointed spark, drawn in a 24×24 box: a diamond whose
// sides bow inward toward the centre, so the points read as sharp rays rather
// than a rotated square.
const SPARK =
    'M12 2.2C12.62 7.5 16.5 11.38 21.8 12C16.5 12.62 12.62 16.5 12 21.8C11.38 16.5 7.5 12.62 2.2 12C7.5 11.38 11.38 7.5 12 2.2Z';

// A small companion spark tucked into the top-right — the detail that makes the
// mark read as "AI" rather than a generic star. Always filled: at nav size an
// outlined 5px shape turns to mush.
const SPARKLET = 'M19.3 2.6C19.5 4.3 20.3 5.1 22 5.3C20.3 5.5 19.5 6.3 19.3 8C19.1 6.3 18.3 5.5 16.6 5.3C18.3 5.1 19.1 4.3 19.3 2.6Z';

/**
 * The bottom-nav AI button's glyph. Deliberately a line illustration rather
 * than the full-colour voice orb: at 24px the orb's gradients read as a
 * coloured blob competing with the tab icons, while a monochrome spark stays
 * legible, inherits the bar's colour (accent on glass, white when filled), and
 * matches the restraint of the Lucide icons beside it.
 *
 * The colourful orb still owns voice mode and the Voice Settings picker — see
 * {@link OrbPreview}; this is only the resting nav mark.
 */
export function AiSparkGlyph({ size = 24, color = '#FFFFFF', filled = false }: AiSparkGlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d={SPARK}
                stroke={filled ? 'none' : color}
                strokeWidth={1.7}
                strokeLinejoin="round"
                fill={filled ? color : 'none'}
            />
            <Path d={SPARKLET} fill={color} opacity={filled ? 1 : 0.9} />
        </Svg>
    );
}
