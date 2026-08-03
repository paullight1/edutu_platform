import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    ANIMS,
    REST,
    SCENES,
    resolvePaints,
    visibleLayers,
    type Frame,
    type Layer,
    type PaintMap,
    type SceneKey,
} from '@edutu/ux-state/scenes';
import { hueTokens } from './sceneTokens';

/** Collect a frame property across all frames, for framer-motion keyframes. */
const track = (frames: Frame[], key: keyof Frame): number[] =>
    frames.map((f) => f[key] ?? (REST[key] as number));

/** True when a property actually changes across the motion — skip it if not. */
const varies = (values: number[]): boolean => values.some((n) => n !== values[0]);

function AnimatedGroup({
    layer,
    paints,
    path,
}: {
    layer: Extract<Layer, { t: 'group' }>;
    paints: PaintMap;
    path: string;
}) {
    const reduced = useReducedMotion();
    const spec = layer.anim ? ANIMS[layer.anim] : undefined;
    const origin = layer.origin ?? [120, 90];
    const children = layer.children.map((child, i) => renderLayer(child, paints, `${path}-${i}`));

    if (!spec || reduced) {
        // Rest pose. No loop is started at all — not slowed, stopped. A
        // permanently breathing scene is the worst offender for motion
        // sensitivity, so this is a hard stop rather than a slower animation.
        const rest = spec?.rest ?? REST;
        return (
            <g
                transform={`rotate(${(layer.rotate ?? 0) + (rest.rotate ?? 0)} ${origin[0]} ${origin[1]})`}
                style={{
                    transform: `translate(${(layer.x ?? 0) + (rest.x ?? 0)}px, ${(layer.y ?? 0) + (rest.y ?? 0)}px)`,
                    opacity: rest.opacity ?? 1,
                }}
            >
                {children}
            </g>
        );
    }

    const animate: Record<string, number[]> = {};
    const x = track(spec.frames, 'x').map((n) => n + (layer.x ?? 0));
    const y = track(spec.frames, 'y').map((n) => n + (layer.y ?? 0));
    const rotate = track(spec.frames, 'rotate').map((r) => r + (layer.rotate ?? 0));
    const scale = track(spec.frames, 'scale');
    const opacity = track(spec.frames, 'opacity');

    if (varies(x) || layer.x) animate.x = x;
    if (varies(y) || layer.y) animate.y = y;
    if (varies(rotate) || layer.rotate) animate.rotate = rotate;
    if (varies(scale)) animate.scale = scale;
    if (varies(opacity)) animate.opacity = opacity;

    return (
        <motion.g
            style={{ originX: `${origin[0]}px`, originY: `${origin[1]}px` }}
            animate={animate}
            transition={{
                duration: spec.durationMs / 1000,
                delay: spec.delayMs / 1000,
                repeat: spec.loop ? Infinity : 0,
                ease: 'easeInOut',
            }}
        >
            {children}
        </motion.g>
    );
}

function renderLayer(layer: Layer, paints: PaintMap, path: string): JSX.Element {
    if (layer.t === 'group') {
        return <AnimatedGroup key={path} layer={layer} paints={paints} path={path} />;
    }

    // `cap`/`join` live only on the path variant, so they are read after
    // narrowing — reading them off the union is a type error.
    const common = {
        fill: layer.fill ? paints[layer.fill] : 'none',
        stroke: layer.stroke ? paints[layer.stroke] : undefined,
        strokeWidth: layer.sw,
        opacity: layer.op,
        strokeLinecap: ((layer.t === 'path' ? layer.cap : undefined) ?? 'round') as 'round',
        strokeLinejoin: ((layer.t === 'path' ? layer.join : undefined) ?? 'round') as 'round',
    };

    switch (layer.t) {
        case 'rect':
            return (
                <rect
                    key={path}
                    x={layer.x}
                    y={layer.y}
                    width={layer.w}
                    height={layer.h}
                    rx={layer.r ?? 0}
                    {...common}
                />
            );
        case 'circle':
            return <circle key={path} cx={layer.cx} cy={layer.cy} r={layer.r} {...common} />;
        case 'path':
            return <path key={path} d={layer.d} {...common} />;
    }
}

export interface SceneRendererProps {
    scene: SceneKey;
    /** Rendered width in px. Height follows the 240×180 aspect ratio. */
    size?: number;
    className?: string;
}

/**
 * The only place this app knows how to draw a scene.
 *
 * Geometry comes from `@edutu/ux-state/scenes`, colour from `sceneTokens`, and
 * motion from framer-motion. The mobile app renders the same geometry through
 * its own equivalent, so the two cannot drift apart.
 */
export function SceneRenderer({ scene, size = 240, className }: SceneRendererProps) {
    const spec = SCENES[scene];
    const paints = useMemo(() => resolvePaints(spec.volume, hueTokens(spec.hue)), [spec]);
    const layers = useMemo(() => visibleLayers(spec.layers, spec.volume), [spec]);
    const [vw, vh] = spec.viewBox;

    return (
        <svg
            className={className}
            width={size}
            height={(size * vh) / vw}
            viewBox={`0 0 ${vw} ${vh}`}
            // The scene never carries information the copy does not; announcing
            // it would just read the same message twice.
            aria-hidden="true"
            focusable="false"
        >
            {layers.map((layer, i) => renderLayer(layer, paints, `l${i}`))}
        </svg>
    );
}

export default SceneRenderer;
