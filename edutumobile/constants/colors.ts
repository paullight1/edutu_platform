// Shared color tokens — mirrors apps/web design system
export const COLORS = {
    // Brand
    brand: {
        50:  '#EFF6FF',
        100: '#DBEAFE',
        200: '#BFDBFE',
        300: '#93C5FD',
        400: '#60A5FA',
        500: '#3B82F6',
        600: '#2563EB',
        700: '#1D4ED8',
        800: '#1E40AF',
        900: '#1E3A8A',
    },

    // Background (dark-first)
    bg: {
        primary:   '#0F172A', // slate-950
        secondary: '#1E293B', // slate-800
        card:      '#1E293B',
        elevated:  '#334155', // slate-700
    },

    // Text
    text: {
        primary:   '#F8FAFC', // slate-50
        secondary: '#94A3B8', // slate-400
        muted:     '#475569', // slate-600
        inverse:   '#0F172A',
    },

    // Border
    border: {
        default: '#334155',
        subtle:  '#1E293B',
    },

    // Semantic
    success: '#22C55E',
    warning: '#F59E0B',
    error:   '#EF4444',
    info:    '#06B6D4',

    // Gradients (use with LinearGradient)
    gradients: {
        brand:   ['#3B82F6', '#1D4ED8'] as [string, string],
        success: ['#22C55E', '#16A34A'] as [string, string],
        gold:    ['#F59E0B', '#D97706'] as [string, string],
        purple:  ['#3b82f6', '#1d4ed8'] as [string, string],
    },
} as const;

export type BrandShade = keyof typeof COLORS.brand;
