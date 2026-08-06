import React from 'react';
import Svg, {
    Circle,
    Ellipse,
    G,
    Path,
    Rect,
} from 'react-native-svg';
import { useIllustrationPalette, type IllustrationProps } from './palette';

/**
 * The CV illustration set — code-drawn, theme-aware, zero bundle weight.
 *
 * All five share a 160×140 viewBox, a single accent, and the same "sheet of
 * paper" motif so they read as one family wherever they appear.
 */

const VIEW_W = 160;
const VIEW_H = 140;

function frame(size: number) {
    return { width: size, height: (size * VIEW_H) / VIEW_W };
}

/** Soft background blob every scene sits on. */
function Backdrop({ fill }: { fill: string }) {
    return <Ellipse cx={80} cy={82} rx={66} ry={50} fill={fill} />;
}

/** Repeating text lines inside a document. */
function TextLines({
    x,
    y,
    widths,
    color,
    gap = 9,
}: {
    x: number;
    y: number;
    widths: number[];
    color: string;
    gap?: number;
}) {
    return (
        <G>
            {widths.map((width, index) => (
                <Rect
                    key={index}
                    x={x}
                    y={y + index * gap}
                    width={width}
                    height={4}
                    rx={2}
                    fill={color}
                />
            ))}
        </G>
    );
}

/** No CV yet — an empty sheet with a pencil poised over it. */
export function EmptyCvIllustration({ size = 160, accent }: IllustrationProps) {
    const p = useIllustrationPalette(accent);
    return (
        <Svg {...frame(size)} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
            <Backdrop fill={p.blob} />
            <G>
                <Rect
                    x={46}
                    y={26}
                    width={68}
                    height={88}
                    rx={7}
                    fill={p.paper}
                    stroke={p.paperLine}
                    strokeWidth={1.5}
                />
                <Rect x={58} y={40} width={26} height={6} rx={3} fill={p.accent} />
                <TextLines x={58} y={54} widths={[44, 36, 40]} color={p.lineSoft} />
                <TextLines x={58} y={86} widths={[30, 42]} color={p.lineSoft} />
            </G>
            {/* Pencil */}
            <G>
                <Path
                    d="M112 84 L128 68 a6 6 0 0 1 8 8 L120 92 l-10 2 z"
                    fill={p.accent}
                />
                <Path d="M110 94 l10-2 -4-4 z" fill={p.accentLight} />
            </G>
            <Circle cx={40} cy={38} r={4} fill={p.accent} opacity={0.35} />
            <Circle cx={126} cy={36} r={2.5} fill={p.accent} opacity={0.5} />
        </Svg>
    );
}

/** Choosing a template — three sheets fanned, the middle one selected. */
export function TemplatePickIllustration({ size = 160, accent }: IllustrationProps) {
    const p = useIllustrationPalette(accent);
    return (
        <Svg {...frame(size)} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
            <Backdrop fill={p.blob} />
            {/* Back sheets, rotated out to either side */}
            <G opacity={0.55}>
                <Rect
                    x={22}
                    y={38}
                    width={52}
                    height={68}
                    rx={6}
                    fill={p.paper}
                    stroke={p.paperLine}
                    strokeWidth={1.4}
                    transform="rotate(-12 48 72)"
                />
                <Rect
                    x={86}
                    y={38}
                    width={52}
                    height={68}
                    rx={6}
                    fill={p.paper}
                    stroke={p.paperLine}
                    strokeWidth={1.4}
                    transform="rotate(12 112 72)"
                />
            </G>
            {/* Selected sheet */}
            <G>
                <Rect
                    x={54}
                    y={28}
                    width={54}
                    height={80}
                    rx={7}
                    fill={p.paper}
                    stroke={p.accent}
                    strokeWidth={2}
                />
                <Rect x={64} y={40} width={22} height={5} rx={2.5} fill={p.accent} />
                <Rect x={64} y={50} width={34} height={2.5} rx={1.25} fill={p.accent} opacity={0.5} />
                <TextLines x={64} y={60} widths={[34, 26, 30]} color={p.lineSoft} gap={8} />
                <TextLines x={64} y={88} widths={[24, 32]} color={p.lineSoft} gap={8} />
            </G>
            {/* Selection tick */}
            <G>
                <Circle cx={108} cy={34} r={11} fill={p.accent} />
                <Path
                    d="M103 34 l3.5 3.5 L114 30"
                    stroke="#FFFFFF"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
            </G>
        </Svg>
    );
}

/** Export succeeded — a finished document taking flight. */
export function ExportSuccessIllustration({ size = 160, accent }: IllustrationProps) {
    const p = useIllustrationPalette(accent);
    return (
        <Svg {...frame(size)} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
            <Backdrop fill={p.blob} />
            <G>
                <Rect
                    x={40}
                    y={30}
                    width={62}
                    height={80}
                    rx={7}
                    fill={p.paper}
                    stroke={p.paperLine}
                    strokeWidth={1.5}
                />
                <Rect x={51} y={43} width={24} height={5} rx={2.5} fill={p.accent} />
                <TextLines x={51} y={56} widths={[40, 32, 36]} color={p.lineSoft} />
                <TextLines x={51} y={86} widths={[28, 38]} color={p.lineSoft} />
            </G>
            {/* Paper plane */}
            <G>
                <Path d="M96 60 L134 44 L118 82 L110 68 z" fill={p.accent} />
                <Path d="M110 68 L134 44 L118 82 z" fill={p.accentLight} opacity={0.85} />
            </G>
            {/* Success tick */}
            <G>
                <Circle cx={48} cy={104} r={13} fill={p.accent} />
                <Path
                    d="M42 104 l4 4 L55 99"
                    stroke="#FFFFFF"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
            </G>
        </Svg>
    );
}

/** AI tailoring — a document being matched to a target. */
export function AiTailorIllustration({ size = 160, accent }: IllustrationProps) {
    const p = useIllustrationPalette(accent);
    return (
        <Svg {...frame(size)} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
            <Backdrop fill={p.blob} />
            <G>
                <Rect
                    x={30}
                    y={32}
                    width={58}
                    height={76}
                    rx={7}
                    fill={p.paper}
                    stroke={p.paperLine}
                    strokeWidth={1.5}
                />
                <Rect x={40} y={44} width={22} height={5} rx={2.5} fill={p.accent} />
                <TextLines x={40} y={57} widths={[38, 30, 34]} color={p.lineSoft} />
                <TextLines x={40} y={86} widths={[26, 34]} color={p.lineSoft} />
            </G>
            {/* Target */}
            <G>
                <Circle cx={116} cy={68} r={24} fill="none" stroke={p.accent} strokeWidth={2} opacity={0.35} />
                <Circle cx={116} cy={68} r={15} fill="none" stroke={p.accent} strokeWidth={2} opacity={0.6} />
                <Circle cx={116} cy={68} r={6} fill={p.accent} />
            </G>
            {/* Sparkles */}
            <Path
                d="M100 30 l2.6 6 6 2.6 -6 2.6 -2.6 6 -2.6 -6 -6 -2.6 6 -2.6 z"
                fill={p.accentLight}
            />
            <Path
                d="M132 100 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8 z"
                fill={p.accent}
                opacity={0.7}
            />
        </Svg>
    );
}

/** CV Health — a document under a scan line with pass/fail ticks. */
export function AtsScanIllustration({ size = 160, accent }: IllustrationProps) {
    const p = useIllustrationPalette(accent);
    return (
        <Svg {...frame(size)} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
            <Backdrop fill={p.blob} />
            <G>
                <Rect
                    x={44}
                    y={26}
                    width={72}
                    height={88}
                    rx={7}
                    fill={p.paper}
                    stroke={p.paperLine}
                    strokeWidth={1.5}
                />
                <Rect x={56} y={38} width={26} height={5} rx={2.5} fill={p.accent} />
                <TextLines x={68} y={54} widths={[36, 30]} color={p.lineSoft} />
                <TextLines x={68} y={80} widths={[34, 28]} color={p.lineSoft} />
                {/* Check marks down the margin */}
                {[54, 63, 80, 89].map((y, index) => (
                    <Path
                        key={y}
                        d={`M56 ${y + 2} l2 2 4 -5`}
                        stroke={index === 2 ? p.line : p.accent}
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                ))}
            </G>
            {/* Scan line */}
            <Rect x={36} y={68} width={88} height={3} rx={1.5} fill={p.accent} opacity={0.9} />
            <Rect x={36} y={71} width={88} height={10} rx={5} fill={p.accent} opacity={0.12} />
        </Svg>
    );
}
