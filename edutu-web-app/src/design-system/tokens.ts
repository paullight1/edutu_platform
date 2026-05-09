export type SemanticColorToken =
  | 'brand'
  | 'accent'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'surface'
  | 'text'
  | 'border';

export interface PaletteScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

export interface SemanticPalette {
  brand: PaletteScale;
  accent: PaletteScale;
  neutral: PaletteScale & { 0: string };
  success: PaletteScale;
  warning: PaletteScale;
  danger: PaletteScale;
  info: PaletteScale;
  surface: {
    body: string;
    layer: string;
    elevated: string;
    overlay: string;
    brandTint: string;
    borderSubtle: string;
    borderBold: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverted: string;
    link: string;
  };
  border: {
    subtle: string;
    default: string;
    strong: string;
    focus: string;
  };
}

export interface TypographyScale {
  fontFamilies: {
    display: string[];
    body: string[];
    mono: string[];
  };
  sizes: {
    xs: [fontSize: string, lineHeight: string];
    sm: [fontSize: string, lineHeight: string];
    base: [fontSize: string, lineHeight: string];
    lg: [fontSize: string, lineHeight: string];
    xl: [fontSize: string, lineHeight: string];
    '2xl': [fontSize: string, lineHeight: string];
    '3xl': [fontSize: string, lineHeight: string];
    '4xl': [fontSize: string, lineHeight: string];
  };
  tracking: {
    tight: string;
    normal: string;
    wide: string;
  };
  weight: {
    regular: number;
    medium: number;
    semibold: number;
    bold: number;
  };
}

export interface SpatialScale {
  radius: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    pill: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
  };
  shadows: {
    soft: string;
    elevated: string;
    focus: string;
    ring: string;
  };
}

export interface DesignTokens {
  semantic: SemanticPalette;
  typography: TypographyScale;
  spatial: SpatialScale;
}

const baseTypography: TypographyScale = {
  fontFamilies: {
    display: ['"Outfit"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
    body: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
    mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
  },
  sizes: {
    xs: ['0.75rem', '1rem'],
    sm: ['0.875rem', '1.25rem'],
    base: ['1rem', '1.5rem'],
    lg: ['1.125rem', '1.75rem'],
    xl: ['1.25rem', '1.8rem'],
    '2xl': ['1.5rem', '2rem'],
    '3xl': ['1.875rem', '2.3rem'],
    '4xl': ['2.25rem', '2.6rem'],
  },
  tracking: {
    tight: '-0.02em',
    normal: '0',
    wide: '0.05em',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

const baseSpatial: SpatialScale = {
  radius: {
    xs: '0.375rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1.25rem',
    xl: '1.75rem',
    pill: '999px',
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
  },
  shadows: {
    soft: '0 12px 24px -16px rgba(15, 23, 42, 0.15)',
    elevated: '0 18px 36px -18px rgba(15, 23, 42, 0.18)',
    focus: '0 0 0 3px rgba(99, 102, 241, 0.35)',
    ring: '0 0 0 4px rgba(99, 102, 241, 0.18)',
  },
};

export const lightTokens: DesignTokens = {
  semantic: {
    brand: {
      50: '#EEF2FF',
      100: '#E0E7FF',
      200: '#C7D2FE',
      300: '#A5B4FC',
      400: '#818CF8',
      500: '#6366F1',
      600: '#4F46E5',
      700: '#4338CA',
      800: '#3730A3',
      900: '#312E81',
      950: '#1E1B4B',
    },
    accent: {
      50: '#ECFEFF',
      100: '#CFFAFE',
      200: '#A5F3FC',
      300: '#67E8F9',
      400: '#22D3EE',
      500: '#06B6D4',
      600: '#0891B2',
      700: '#0E7490',
      800: '#155E75',
      900: '#164E63',
      950: '#083344',
    },
    neutral: {
      0: '#FCFCFD',
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5F5',
      400: '#94A3B8',
      500: '#64748B',
      600: '#475569',
      700: '#334155',
      800: '#1E293B',
      900: '#0F172A',
      950: '#020617',
    },
    success: {
      50: '#ECFDF5',
      100: '#D1FAE5',
      200: '#A7F3D0',
      300: '#6EE7B7',
      400: '#34D399',
      500: '#10B981',
      600: '#059669',
      700: '#047857',
      800: '#065F46',
      900: '#064E3B',
      950: '#022C22',
    },
    warning: {
      50: '#FFFBEB',
      100: '#FEF3C7',
      200: '#FDE68A',
      300: '#FCD34D',
      400: '#FBBF24',
      500: '#F59E0B',
      600: '#D97706',
      700: '#B45309',
      800: '#92400E',
      900: '#78350F',
      950: '#451A03',
    },
    danger: {
      50: '#FEF2F2',
      100: '#FEE2E2',
      200: '#FECACA',
      300: '#FCA5A5',
      400: '#F87171',
      500: '#EF4444',
      600: '#DC2626',
      700: '#B91C1C',
      800: '#991B1B',
      900: '#7F1D1D',
      950: '#450A0A',
    },
    info: {
      50: '#ECFEFF',
      100: '#CFFAFE',
      200: '#A5F3FC',
      300: '#67E8F9',
      400: '#22D3EE',
      500: '#06B6D4',
      600: '#0891B2',
      700: '#0E7490',
      800: '#155E75',
      900: '#164E63',
      950: '#082F49',
    },
    surface: {
      body: '#F8FAFC',
      layer: '#FFFFFF',
      elevated: '#F1F5F9',
      overlay: 'rgba(15, 23, 42, 0.48)',
      brandTint: '#EEF2FF',
      borderSubtle: '#E2E8F0',
      borderBold: '#CBD5F5',
    },
    text: {
      primary: '#0F172A',
      secondary: '#334155',
      muted: '#64748B',
      inverted: '#F8FAFC',
      link: '#4338CA',
    },
    border: {
      subtle: '#E2E8F0',
      default: '#CBD5F5',
      strong: '#94A3B8',
      focus: 'rgba(99, 102, 241, 0.45)',
    },
  },
  typography: baseTypography,
  spatial: baseSpatial,
};

export const darkTokens: DesignTokens = {
  semantic: {
    brand: lightTokens.semantic.brand,
    accent: lightTokens.semantic.accent,
    neutral: {
      0: '#080B18',
      50: '#0C0F1A',
      100: '#111622',
      200: '#171E2C',
      300: '#1D2638',
      400: '#242F46',
      500: '#2F3D59',
      600: '#425272',
      700: '#647A9C',
      800: '#94ABCD',
      900: '#CFDAEE',
      950: '#F1F5F9',
    },
    success: lightTokens.semantic.success,
    warning: lightTokens.semantic.warning,
    danger: lightTokens.semantic.danger,
    info: lightTokens.semantic.info,
    surface: {
      body: '#0C0F1A',
      layer: '#141926',
      elevated: '#1B2234',
      overlay: 'rgba(8, 12, 24, 0.7)',
      brandTint: 'rgba(79, 70, 229, 0.2)',
      borderSubtle: '#20283A',
      borderBold: '#2B364C',
    },
    text: {
      primary: '#F1F5F9',
      secondary: '#94A3B8',
      muted: '#64748B',
      inverted: '#F1F5F9',
      link: '#818CF8',
    },
    border: {
      subtle: '#20283A',
      default: '#2B364C',
      strong: '#47556D',
      focus: 'rgba(79, 70, 229, 0.5)',
    },
  },
  typography: baseTypography,
  spatial: {
    ...baseSpatial,
    shadows: {
      soft: '0 12px 24px -16px rgba(4, 7, 16, 0.5)',
      elevated: '0 18px 36px -18px rgba(6, 12, 24, 0.6)',
      focus: '0 0 0 3px rgba(6, 182, 212, 0.45)',
      ring: '0 0 0 1px rgba(79, 70, 229, 0.4)',
    },
  },
};

export const designTokens = {
  light: lightTokens,
  dark: darkTokens,
};

export type ThemeName = keyof typeof designTokens;
