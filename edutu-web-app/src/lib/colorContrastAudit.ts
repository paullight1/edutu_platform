/**
 * Color Contrast Audit Utility
 * 
 * Provides tools for checking WCAG 2.1 color contrast compliance
 * Supports AA and AAA conformance levels
 */

// Convert hex to RGB
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
        }
        : null;
}

// Convert RGB to relative luminance
export function getLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map((c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Calculate contrast ratio between two colors
export function getContrastRatio(color1: string, color2: string): number {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    if (!rgb1 || !rgb2) {
        throw new Error('Invalid color format. Use hex colors (e.g., #ffffff)');
    }

    const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
}

// WCAG conformance levels
export type WCAGLevel = 'AA' | 'AAA';
export type TextSize = 'normal' | 'large';

// Minimum contrast ratios per WCAG 2.1
const WCAG_RATIOS = {
    AA: {
        normal: 4.5,
        large: 3,
    },
    AAA: {
        normal: 7,
        large: 4.5,
    },
};

// Check if contrast meets WCAG requirements
export function meetsWCAG(
    foreground: string,
    background: string,
    level: WCAGLevel = 'AA',
    textSize: TextSize = 'normal'
): boolean {
    const ratio = getContrastRatio(foreground, background);
    return ratio >= WCAG_RATIOS[level][textSize];
}

// Get contrast rating
export function getContrastRating(
    foreground: string,
    background: string
): {
    ratio: number;
    level: 'Fail' | 'AA Large' | 'AA' | 'AAA';
    passes: {
        AA_normal: boolean;
        AA_large: boolean;
        AAA_normal: boolean;
        AAA_large: boolean;
    };
} {
    const ratio = getContrastRatio(foreground, background);

    let level: 'Fail' | 'AA Large' | 'AA' | 'AAA' = 'Fail';

    if (ratio >= 7) {
        level = 'AAA';
    } else if (ratio >= 4.5) {
        level = 'AA';
    } else if (ratio >= 3) {
        level = 'AA Large';
    }

    return {
        ratio: Math.round(ratio * 100) / 100,
        level,
        passes: {
            AA_normal: ratio >= 4.5,
            AA_large: ratio >= 3,
            AAA_normal: ratio >= 7,
            AAA_large: ratio >= 4.5,
        },
    };
}

// Edutu App Color Palette Contrast Audit
export const edutuColors = {
    // Primary brand colors
    primary: {
        50: '#eef2ff',
        100: '#e0e7ff',
        200: '#c7d2fe',
        300: '#a5b4fc',
        400: '#818cf8',
        500: '#6366f1',
        600: '#4f46e5',
        700: '#4338ca',
        800: '#3730a3',
        900: '#312e81',
    },
    // Dark theme backgrounds
    dark: {
        bg: '#0c0f1a',
        surface: '#141829',
        card: '#1a1f35',
        border: '#2a2f45',
        muted: '#4a4f65',
    },
    // Light theme backgrounds
    light: {
        bg: '#ffffff',
        surface: '#f8fafc',
        card: '#ffffff',
        border: '#e2e8f0',
        muted: '#94a3b8',
    },
    // Text colors
    text: {
        primary: '#ffffff',
        secondary: '#94a3b8',
        muted: '#64748b',
        dark: '#1e293b',
        darkSecondary: '#475569',
    },
    // Status colors
    status: {
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
    },
};

// Run full contrast audit on Edutu color palette
export function runContrastAudit(): {
    passed: number;
    failed: number;
    results: Array<{
        foreground: string;
        background: string;
        fgName: string;
        bgName: string;
        ratio: number;
        level: string;
        passes: boolean;
    }>;
} {
    const results: Array<{
        foreground: string;
        background: string;
        fgName: string;
        bgName: string;
        ratio: number;
        level: string;
        passes: boolean;
    }> = [];

    // Dark theme checks
    const darkBgCombinations = [
        { bg: edutuColors.dark.bg, bgName: 'dark.bg' },
        { bg: edutuColors.dark.surface, bgName: 'dark.surface' },
        { bg: edutuColors.dark.card, bgName: 'dark.card' },
    ];

    const darkFgCombinations = [
        { fg: edutuColors.text.primary, fgName: 'text.primary' },
        { fg: edutuColors.text.secondary, fgName: 'text.secondary' },
        { fg: edutuColors.primary[400], fgName: 'primary.400' },
        { fg: edutuColors.status.success, fgName: 'status.success' },
        { fg: edutuColors.status.error, fgName: 'status.error' },
    ];

    // Light theme checks
    const lightBgCombinations = [
        { bg: edutuColors.light.bg, bgName: 'light.bg' },
        { bg: edutuColors.light.surface, bgName: 'light.surface' },
        { bg: edutuColors.light.card, bgName: 'light.card' },
    ];

    const lightFgCombinations = [
        { fg: edutuColors.text.dark, fgName: 'text.dark' },
        { fg: edutuColors.text.darkSecondary, fgName: 'text.darkSecondary' },
        { fg: edutuColors.primary[600], fgName: 'primary.600' },
        { fg: edutuColors.status.success, fgName: 'status.success' },
        { fg: edutuColors.status.error, fgName: 'status.error' },
    ];

    // Dark theme audit
    for (const { bg, bgName } of darkBgCombinations) {
        for (const { fg, fgName } of darkFgCombinations) {
            const rating = getContrastRating(fg, bg);
            results.push({
                foreground: fg,
                background: bg,
                fgName,
                bgName,
                ratio: rating.ratio,
                level: rating.level,
                passes: rating.passes.AA_normal,
            });
        }
    }

    // Light theme audit
    for (const { bg, bgName } of lightBgCombinations) {
        for (const { fg, fgName } of lightFgCombinations) {
            const rating = getContrastRating(fg, bg);
            results.push({
                foreground: fg,
                background: bg,
                fgName,
                bgName,
                ratio: rating.ratio,
                level: rating.level,
                passes: rating.passes.AA_normal,
            });
        }
    }

    const passed = results.filter((r) => r.passes).length;
    const failed = results.filter((r) => !r.passes).length;

    return { passed, failed, results };
}

// Print audit results to console
export function printAuditResults(): void {
    const { passed, failed, results } = runContrastAudit();

    console.log('\n📊 WCAG 2.1 Color Contrast Audit Results');
    console.log('═'.repeat(60));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('═'.repeat(60));

    console.log('\n🎨 Detailed Results:\n');

    for (const result of results) {
        const status = result.passes ? '✅' : '❌';
        console.log(
            `${status} ${result.fgName} on ${result.bgName}: ${result.ratio}:1 (${result.level})`
        );
    }

    if (failed > 0) {
        console.log('\n⚠️ Failed combinations need attention for WCAG AA compliance');
    } else {
        console.log('\n🎉 All color combinations pass WCAG AA requirements!');
    }
}

// Suggest accessible color alternatives
export function suggestAccessibleColor(
    currentFg: string,
    background: string,
    targetLevel: WCAGLevel = 'AA'
): string {
    const rgb = hexToRgb(currentFg);
    if (!rgb) return currentFg;

    // Try lightening or darkening the foreground color
    const bgRgb = hexToRgb(background);
    if (!bgRgb) return currentFg;

    const bgLuminance = getLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
    const shouldLighten = bgLuminance < 0.5;

    let { r, g, b } = rgb;
    const step = shouldLighten ? 5 : -5;
    const targetRatio = WCAG_RATIOS[targetLevel].normal;

    for (let i = 0; i < 50; i++) {
        r = Math.max(0, Math.min(255, r + step));
        g = Math.max(0, Math.min(255, g + step));
        b = Math.max(0, Math.min(255, b + step));

        const newColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        const ratio = getContrastRatio(newColor, background);

        if (ratio >= targetRatio) {
            return newColor;
        }
    }

    return currentFg;
}

export default {
    hexToRgb,
    getLuminance,
    getContrastRatio,
    meetsWCAG,
    getContrastRating,
    runContrastAudit,
    printAuditResults,
    suggestAccessibleColor,
    edutuColors,
};
