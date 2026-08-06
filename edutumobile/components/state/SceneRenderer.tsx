import React, { useEffect, useMemo } from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  ANIMS,
  REST,
  SCENES,
  resolvePaints,
  visibleLayers,
  type AnimId,
  type Frame,
  type HueTokens,
  type Layer,
  type PaintMap,
  type SceneKey,
} from '@edutu/ux-state/scenes';
import { useMotion } from '../../hooks/useMotion';
import { stateStage, useStateTokens, type StateTokens } from './stateTokens';

const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * Bridge the app's live theme tokens into the shape the shared package expects.
 *
 * `soft` is the duotone's second tone. In light mode it is a tint of the hue; in
 * dark mode a tint would vanish against the surface, so it becomes a lifted
 * wash instead. Nothing here is a literal — every value traces back to
 * `useTheme()`, which is what makes all 18 palettes correct by construction.
 */
export function hueTokensFrom(t: StateTokens): HueTokens {
  return {
    hue: t.hue,
    soft: t.isDark ? t.wash : t.ring,
    plate: t.isDark ? 'rgba(255,255,255,0.06)' : t.wash,
    ink: t.title,
    inkSoft: t.body,
    surface: t.surface,
    surfaceLine: t.surfaceLine,
  };
}

interface AnimatedGroupProps {
  anim: AnimId;
  origin: [number, number];
  rotate: number;
  x: number;
  y: number;
  children: React.ReactNode;
}

/**
 * One animated group. Every named motion is implemented here and only here,
 * which is what makes scene 27 cost no animation code.
 */
function AnimatedGroup({ anim, origin, rotate, x, y, children }: AnimatedGroupProps) {
  const motion = useMotion();
  const spec = ANIMS[anim];
  const progress = useSharedValue(0);
  const { allowLoop } = motion;

  useEffect(() => {
    if (!allowLoop) {
      // Hold the rest pose. A permanently breathing scene is the single worst
      // offender for motion sensitivity, so reduced motion stops the loop dead
      // rather than merely slowing it.
      progress.value = 0;
      return;
    }

    const stepMs = spec.durationMs / Math.max(1, spec.frames.length - 1);
    const steps = spec.frames
      .slice(1)
      .map((_, i) =>
        withTiming((i + 1) / (spec.frames.length - 1), {
          duration: stepMs,
          easing: Easing.inOut(Easing.sin),
        }),
      );

    progress.value = withDelay(
      spec.delayMs,
      spec.loop ? withRepeat(withSequence(...steps), -1, false) : withSequence(...steps),
    );

    return () => {
      progress.value = 0;
    };
  }, [allowLoop, progress, spec]);

  const animatedProps = useAnimatedProps(() => {
    const frames = allowLoop ? spec.frames : [spec.rest];
    const span = Math.max(1, frames.length - 1);
    const scaled = progress.value * span;
    const lo = Math.min(Math.floor(scaled), span);
    const hi = Math.min(lo + 1, span);
    const t = scaled - lo;

    const mix = (key: keyof Frame): number => {
      const a = frames[lo]?.[key] ?? (REST[key] as number);
      const b = frames[hi]?.[key] ?? (REST[key] as number);
      return a + (b - a) * t;
    };

    const rot = rotate + mix('rotate');

    return {
      opacity: mix('opacity'),
      transform: [
        { translateX: x + mix('x') },
        { translateY: y + mix('y') },
        { translateX: origin[0] },
        { translateY: origin[1] },
        { rotate: `${rot}deg` },
        { scale: mix('scale') },
        { translateX: -origin[0] },
        { translateY: -origin[1] },
      ],
    };
  }, [allowLoop, spec, origin, rotate, x, y]);

  return <AnimatedG animatedProps={animatedProps}>{children}</AnimatedG>;
}

function renderLayer(layer: Layer, paints: PaintMap, key: string): React.ReactNode {
  if (layer.t === 'group') {
    const children = layer.children.map((child, i) => renderLayer(child, paints, `${key}-${i}`));
    const origin = layer.origin ?? [120, 90];

    if (!layer.anim) {
      const transform = `translate(${layer.x ?? 0} ${layer.y ?? 0}) rotate(${
        layer.rotate ?? 0
      } ${origin[0]} ${origin[1]})`;
      return (
        <G key={key} transform={transform}>
          {children}
        </G>
      );
    }

    return (
      <AnimatedGroup
        key={key}
        anim={layer.anim}
        origin={origin}
        rotate={layer.rotate ?? 0}
        x={layer.x ?? 0}
        y={layer.y ?? 0}
      >
        {children}
      </AnimatedGroup>
    );
  }

  // `cap`/`join` live only on the path variant, so they are read after
  // narrowing — reading them off the union is a type error.
  const common = {
    fill: layer.fill ? paints[layer.fill] : 'none',
    stroke: layer.stroke ? paints[layer.stroke] : undefined,
    strokeWidth: layer.sw,
    opacity: layer.op,
    strokeLinecap: (layer.t === 'path' ? layer.cap : undefined) ?? ('round' as const),
    strokeLinejoin: (layer.t === 'path' ? layer.join : undefined) ?? ('round' as const),
  };

  switch (layer.t) {
    case 'rect':
      return (
        <Rect
          key={key}
          x={layer.x}
          y={layer.y}
          width={layer.w}
          height={layer.h}
          rx={layer.r ?? 0}
          {...common}
        />
      );
    case 'circle':
      return <Circle key={key} cx={layer.cx} cy={layer.cy} r={layer.r} {...common} />;
    case 'path':
      return <Path key={key} d={layer.d} {...common} />;
  }
}

export interface SceneRendererProps {
  scene: SceneKey;
  /** Rendered width. Height follows the 240×180 aspect ratio. */
  size?: number;
}

/**
 * The only place this app knows how to draw a scene.
 *
 * Geometry comes from `@edutu/ux-state/scenes`, colour from `stateTokens`, and
 * motion from `useMotion()`. The web app renders the same geometry through its
 * own equivalent, so the two cannot drift apart.
 */
export function SceneRenderer({ scene, size = stateStage.hero }: SceneRendererProps) {
  const spec = SCENES[scene];
  const tokens = useStateTokens(spec.hue);

  const paints = useMemo(
    () => resolvePaints(spec.volume, hueTokensFrom(tokens)),
    [spec.volume, tokens],
  );
  const layers = useMemo(() => visibleLayers(spec.layers, spec.volume), [spec.layers, spec.volume]);

  const [vw, vh] = spec.viewBox;

  return (
    <Svg width={size} height={(size * vh) / vw} viewBox={`0 0 ${vw} ${vh}`}>
      {layers.map((layer, i) => renderLayer(layer, paints, `l${i}`))}
    </Svg>
  );
}
