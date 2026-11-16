import { useId } from 'react';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * A soft radial glow.
 *
 * A plain translucent circle was tried first: it reads as a flat disc with a
 * hard edge no matter how low the alpha, because there is no falloff. This
 * paints an actual radial gradient instead.
 *
 * The gradient id is generated per instance — react-native-svg resolves
 * `url(#id)` against a shared document, so a hardcoded id makes every glow on
 * screen pick up whichever one mounted last.
 */
export function Glow({
  size,
  color,
  intensity = 0.55,
}: {
  size: number;
  color: string;
  intensity?: number;
}) {
  const id = `glow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <Svg width={size} height={size} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={intensity} />
          <Stop offset="45%" stopColor={color} stopOpacity={intensity * 0.33} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}
