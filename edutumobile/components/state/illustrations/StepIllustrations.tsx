import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useIllustrationPalette, type IllustrationProps } from './palette';

/**
 * Small spot illustrations for the CV wizard step headers — one per step, on a
 * shared 64×64 viewBox. Deliberately simpler than the full scenes: they sit
 * beside a heading, so they have to read at 56–64px.
 */

const BOX = 64;

function frame(size: number) {
    return { width: size, height: size };
}

function Disc({ fill }: { fill: string }) {
    return <Circle cx={32} cy={32} r={30} fill={fill} />;
}

/** Step 1 — who you are. */
export function StepBasicsIllustration({ size = 60, accent }: IllustrationProps) {
    const p = useIllustrationPalette(accent);
    return (
        <Svg {...frame(size)} viewBox={`0 0 ${BOX} ${BOX}`}>
            <Disc fill={p.blob} />
            <Circle cx={32} cy={26} r={9} fill={p.accent} />
            <Path
                d="M16 48 a16 16 0 0 1 32 0 z"
                fill={p.accent}
                opacity={0.55}
            />
        </Svg>
    );
}

/** Step 2 — your story in your own words. */
export function StepSummaryIllustration({ size = 60, accent }: IllustrationProps) {
    const p = useIllustrationPalette(accent);
    return (
        <Svg {...frame(size)} viewBox={`0 0 ${BOX} ${BOX}`}>
            <Disc fill={p.blob} />
            <Rect
                x={15}
                y={17}
                width={34}
                height={26}
                rx={6}
                fill={p.paper}
                stroke={p.accent}
                strokeWidth={2}
            />
            <Path d="M24 43 l0 7 8 -7 z" fill={p.accent} />
            <Rect x={21} y={25} width={22} height={3} rx={1.5} fill={p.line} />
            <Rect x={21} y={32} width={15} height={3} rx={1.5} fill={p.lineSoft} />
        </Svg>
    );
}

/** Step 3 — where you have worked. */
export function StepExperienceIllustration({ size = 60, accent }: IllustrationProps) {
    const p = useIllustrationPalette(accent);
    return (
        <Svg {...frame(size)} viewBox={`0 0 ${BOX} ${BOX}`}>
            <Disc fill={p.blob} />
            <Path
                d="M25 20 a4 4 0 0 1 4-4 h6 a4 4 0 0 1 4 4"
                stroke={p.accent}
                strokeWidth={2.6}
                fill="none"
                strokeLinecap="round"
            />
            <Rect x={14} y={20} width={36} height={26} rx={5} fill={p.accent} />
            <Rect x={14} y={30} width={36} height={3} fill="#FFFFFF" opacity={0.45} />
            <Rect x={28} y={28} width={8} height={7} rx={2} fill="#FFFFFF" opacity={0.9} />
        </Svg>
    );
}

/** Step 4 — what you studied. */
export function StepEducationIllustration({ size = 60, accent }: IllustrationProps) {
    const p = useIllustrationPalette(accent);
    return (
        <Svg {...frame(size)} viewBox={`0 0 ${BOX} ${BOX}`}>
            <Disc fill={p.blob} />
            <Path d="M32 17 L52 27 L32 37 L12 27 z" fill={p.accent} />
            <Path
                d="M20 31 v9 a12 7 0 0 0 24 0 v-9"
                fill={p.accent}
                opacity={0.5}
            />
            <Path d="M50 28 v11" stroke={p.accent} strokeWidth={2} strokeLinecap="round" />
        </Svg>
    );
}

/** Step 5 — everything else that proves it. */
export function StepExtrasIllustration({ size = 60, accent }: IllustrationProps) {
    const p = useIllustrationPalette(accent);
    return (
        <Svg {...frame(size)} viewBox={`0 0 ${BOX} ${BOX}`}>
            <Disc fill={p.blob} />
            <Path
                d="M22 16 h20 v14 a10 10 0 0 1 -20 0 z"
                fill={p.accent}
            />
            <Path
                d="M22 19 h-5 a6 6 0 0 0 6 8 M42 19 h5 a6 6 0 0 1 -6 8"
                stroke={p.accent}
                strokeWidth={2.2}
                fill="none"
                strokeLinecap="round"
            />
            <Rect x={28} y={40} width={8} height={6} fill={p.accent} opacity={0.6} />
            <Rect x={22} y={46} width={20} height={4} rx={2} fill={p.accent} />
        </Svg>
    );
}

export const STEP_ILLUSTRATIONS = {
    basics: StepBasicsIllustration,
    summary: StepSummaryIllustration,
    experience: StepExperienceIllustration,
    education: StepEducationIllustration,
    extras: StepExtrasIllustration,
} as const;

export type StepIllustrationKey = keyof typeof STEP_ILLUSTRATIONS;
