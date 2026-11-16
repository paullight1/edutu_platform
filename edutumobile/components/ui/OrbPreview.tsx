import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { AudioLines } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { ORB_PALETTES, type OrbDesign } from '../../lib/voiceSettingsStore';

// Adds an alpha channel to a `#rrggbb` hex colour. Used only for the ring
// design's Android glow backdrop (see Fix 7 below) — every other colour comes
// straight from `ORB_PALETTES` as-is.
function withAlpha(hex: string, alpha: number): string {
    const match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match) return hex;
    const num = parseInt(match[1], 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Colourful, size-parametrized preview of each voice-mode orb design — the
 * SINGLE source of truth for "what the orb looks like". Rendered both in the
 * Voice Settings picker (at 64px) and in the bottom-nav AI button (larger,
 * bolder), so the two can never drift: the nav button always shows exactly
 * the orb the user selected.
 *
 * Pure RN views + one gradient per design (no WebView) — cheap enough to live
 * permanently in the tab bar. `ParticleOrb` remains the real animated engine
 * for the full-screen voice session; this is its faithful still.
 *
 * The only motion is a one-shot "settle" spring on mount and whenever `design`
 * changes (the user picking a new orb) — never a perpetual loop in the tab
 * bar. Skipped under `reducedMotion`.
 */
interface OrbPreviewProps {
    design: OrbDesign;
    /** Diameter in px. */
    size?: number;
    reducedMotion?: boolean;
}

export function OrbPreview({ design, size = 64, reducedMotion = false }: OrbPreviewProps) {
    const settle = useSharedValue(reducedMotion ? 1 : 0.72);

    useEffect(() => {
        if (reducedMotion) {
            settle.value = 1;
            return;
        }
        settle.value = 0.72;
        settle.value = withSpring(1, { damping: 14, stiffness: 220 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [design, reducedMotion]);

    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: settle.value }] }));

    const s = useMemo(() => makeStyles(size), [size]);

    return (
        <Animated.View style={animatedStyle}>
            <OrbShape design={design} s={s} size={size} />
        </Animated.View>
    );
}

function OrbShape({ design, s, size }: { design: OrbDesign; s: OrbStyles; size: number }) {
    // Falls back to the particles palette for an unrecognized design, mirroring
    // the switch below's `default` case (e.g. a stale persisted value).
    const palette = ORB_PALETTES[design] ?? ORB_PALETTES.particles;
    switch (design) {
        case 'ring': {
            // shadowColor/shadowRadius (used for the glow on iOS below) are a
            // no-op on Android, which has no colour-tinted shadow primitive —
            // so on Android we fake the glow with a translucent backdrop disc
            // instead of relying on the shadow props to render anything.
            const glowSize = size * 1.3;
            const glowInset = (size - glowSize) / 2;
            return (
                <View style={s.base}>
                    {Platform.OS === 'android' && (
                        <View
                            pointerEvents="none"
                            style={[
                                s.ringGlowAndroid,
                                {
                                    width: glowSize,
                                    height: glowSize,
                                    borderRadius: glowSize / 2,
                                    top: glowInset,
                                    left: glowInset,
                                    backgroundColor: withAlpha(palette.glow!, 0.4),
                                },
                            ]}
                        />
                    )}
                    <View style={[StyleSheet.absoluteFillObject, s.ring, { borderColor: palette.border, shadowColor: palette.glow }]} />
                </View>
            );
        }
        case 'bubble':
            return (
                <LinearGradient
                    colors={palette.gradient!}
                    start={{ x: 0.1, y: 0.1 }}
                    end={{ x: 0.9, y: 0.9 }}
                    style={[s.base, s.round]}
                >
                    <AudioLines size={Math.round(size * 0.34)} color={palette.iconColor} />
                </LinearGradient>
            );
        case 'crystal':
            return (
                <LinearGradient
                    colors={palette.gradient!}
                    start={{ x: 0.1, y: 0.1 }}
                    end={{ x: 0.9, y: 0.9 }}
                    style={[s.base, s.round]}
                >
                    <AudioLines size={Math.round(size * 0.375)} color={palette.iconColor} />
                </LinearGradient>
            );
        case 'glass':
            return (
                <LinearGradient
                    colors={palette.gradient!}
                    start={{ x: 0.15, y: 0.1 }}
                    end={{ x: 0.85, y: 0.95 }}
                    style={[s.base, s.round, s.glass, { borderColor: palette.border }]}
                >
                    <View style={[s.glassSwirl, { borderColor: palette.swirl }]} />
                    <View style={[s.glassSheen, { backgroundColor: palette.sheen }]} />
                </LinearGradient>
            );
        case 'blob':
            return (
                <LinearGradient
                    colors={palette.gradient!}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={[s.base, s.round, s.blobBody, { borderColor: palette.border }]}
                >
                    <View style={s.blobEyes}>
                        {/* Catchlight in each eye — the animated blob has one;
                            without it the still read as two flat slots. */}
                        <View style={[s.blobEye, { backgroundColor: palette.eye }]}>
                            <View style={s.blobEyeGlint} />
                        </View>
                        <View style={[s.blobEye, { backgroundColor: palette.eye }]}>
                            <View style={s.blobEyeGlint} />
                        </View>
                    </View>
                </LinearGradient>
            );
        case 'petals': {
            const dots = Array.from({ length: 7 });
            const [outer, mid, inner] = palette.petalColors!;
            return (
                <View style={[s.base, s.petals]}>
                    {dots.map((_, i) => {
                        const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
                        const r = size * 0.33;
                        return (
                            <View
                                key={i}
                                style={[
                                    s.petalDot,
                                    {
                                        backgroundColor: i < 3 ? outer : i < 5 ? mid : inner,
                                        transform: [
                                            { translateX: Math.cos(a) * r },
                                            { translateY: Math.sin(a) * r },
                                            { rotate: `${a + Math.PI / 2}rad` },
                                        ],
                                    },
                                ]}
                            >
                                {/* Each pebble catches the light on its upper
                                    left, as in the animated halo. */}
                                <View style={s.petalGlint} />
                            </View>
                        );
                    })}
                </View>
            );
        }
        case 'robot':
            return (
                <View style={[s.base, s.robot, { backgroundColor: palette.bodyColor }]}>
                    {/* Glossy top-left highlight on the shell, matching the
                        animated bot's radial gradient. */}
                    <View style={s.robotSheen} pointerEvents="none" />
                    <View style={[s.visor, { backgroundColor: palette.visorColor, borderColor: palette.visorAccent }]}>
                        <View style={s.visorSheen} pointerEvents="none" />
                        <View style={[s.eye, { backgroundColor: palette.visorEyeColor }]} />
                        <View style={[s.eye, { backgroundColor: palette.visorEyeColor }]} />
                    </View>
                </View>
            );
        case 'particles':
        default:
            // A FILLED point-cloud sphere (like the real orb), not a dotted
            // ring outline: fibonacci-disc distribution, brighter+larger toward
            // the centre so it reads as a 3D cloud of dots.
            return <ParticlesShape size={size} color={palette.particleColor!} />;
    }
}

function ParticlesShape({ size, color }: { size: number; color: string }) {
    const dots = useMemo(() => {
        const N = Math.min(64, Math.max(30, Math.round(size * 0.85)));
        const R = size * 0.48;
        const cx = size / 2;
        const cy = size / 2;
        const golden = Math.PI * (3 - Math.sqrt(5));
        return Array.from({ length: N }, (_, i) => {
            const r = Math.sqrt((i + 0.5) / N) * R;
            const a = i * golden;
            const t = 1 - r / R; // 1 at centre → 0 at rim
            return {
                cx: cx + Math.cos(a) * r,
                cy: cy + Math.sin(a) * r,
                rad: size * (0.027 + 0.026 * t),
                op: 0.62 + 0.38 * t,
            };
        });
    }, [size]);

    return (
        <Svg width={size} height={size}>
            {dots.map((d, i) => (
                <Circle key={i} cx={d.cx} cy={d.cy} r={d.rad} fill={color} fillOpacity={d.op} />
            ))}
        </Svg>
    );
}

type OrbStyles = ReturnType<typeof makeStyles>;

// All dimensions are proportional to `size`, so the picker (64px) and the nav
// (larger) render identically at any scale.
function makeStyles(size: number) {
    return StyleSheet.create({
        base: {
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
        },
        round: { overflow: 'hidden' },
        // Colours for every design below come from `ORB_PALETTES`
        // (lib/voiceSettingsStore.ts) via inline style overrides in
        // `OrbShape` — this StyleSheet only owns shape/geometry so there is
        // exactly one place the hex values live.
        ringGlowAndroid: {
            position: 'absolute',
        },
        ring: {
            // Without a radius this draws a SQUARE outline, not a ring — the
            // aurora ring was rendering as a pink box.
            borderRadius: size / 2,
            borderWidth: Math.max(4, size * 0.13),
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: size * 0.22,
        },
        glass: {
            borderWidth: 1,
        },
        glassSwirl: {
            position: 'absolute',
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: size * 0.36,
            borderWidth: Math.max(2, size * 0.047),
            borderLeftColor: 'transparent',
            transform: [{ rotate: '35deg' }],
        },
        glassSheen: {
            position: 'absolute',
            top: size * 0.12,
            left: size * 0.18,
            width: size * 0.22,
            height: size * 0.10,
            borderRadius: size * 0.06,
            transform: [{ rotate: '-25deg' }],
        },
        blobBody: {
            borderWidth: 1,
        },
        blobEyes: {
            flexDirection: 'row',
            gap: size * 0.18,
            marginTop: -size * 0.06,
        },
        blobEye: {
            width: size * 0.09,
            height: size * 0.14,
            borderRadius: size * 0.05,
            overflow: 'hidden',
        },
        blobEyeGlint: {
            position: 'absolute',
            top: size * 0.02,
            left: size * 0.018,
            width: size * 0.03,
            height: size * 0.03,
            borderRadius: size * 0.015,
            backgroundColor: 'rgba(255,255,255,0.9)',
        },
        petals: { position: 'relative' },
        petalDot: {
            position: 'absolute',
            width: size * 0.30,
            height: size * 0.20,
            borderRadius: size * 0.10,
            overflow: 'hidden',
        },
        petalGlint: {
            position: 'absolute',
            top: size * 0.03,
            left: size * 0.05,
            width: size * 0.11,
            height: size * 0.045,
            borderRadius: size * 0.03,
            backgroundColor: 'rgba(255,255,255,0.35)',
        },
        robot: { overflow: 'hidden' },
        robotSheen: {
            position: 'absolute',
            top: -size * 0.14,
            left: -size * 0.10,
            width: size * 0.78,
            height: size * 0.52,
            borderRadius: size * 0.39,
            backgroundColor: 'rgba(255,255,255,0.55)',
        },
        visorSheen: {
            position: 'absolute',
            top: 1,
            left: size * 0.04,
            right: size * 0.04,
            height: size * 0.08,
            borderRadius: size * 0.04,
            backgroundColor: 'rgba(255,255,255,0.12)',
        },
        visor: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Math.max(4, size * 0.094),
            width: size * 0.58,
            height: size * 0.30,
            borderRadius: size * 0.15,
            borderWidth: 2,
            overflow: 'hidden',
        },
        eye: {
            width: Math.max(5, size * 0.094),
            height: Math.max(5, size * 0.094),
            borderRadius: Math.max(2.5, size * 0.047),
        },
    });
}
