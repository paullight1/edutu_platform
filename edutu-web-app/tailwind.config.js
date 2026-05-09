import defaultTheme from 'tailwindcss/defaultTheme';

const withOpacity = (variable) => {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgba(var(${variable}) / ${opacityValue})`;
    }
    return `rgb(var(${variable}))`;
  };
};

const brandPalette = {
  50: withOpacity('--color-brand-50'),
  100: withOpacity('--color-brand-100'),
  200: withOpacity('--color-brand-200'),
  300: withOpacity('--color-brand-300'),
  400: withOpacity('--color-brand-400'),
  500: withOpacity('--color-brand-500'),
  600: withOpacity('--color-brand-600'),
  700: withOpacity('--color-brand-700'),
  800: withOpacity('--color-brand-800'),
  900: withOpacity('--color-brand-900'),
  950: withOpacity('--color-brand-950'),
};

const accentPalette = {
  50: withOpacity('--color-accent-50'),
  100: withOpacity('--color-accent-100'),
  200: withOpacity('--color-accent-200'),
  300: withOpacity('--color-accent-300'),
  400: withOpacity('--color-accent-400'),
  500: withOpacity('--color-accent-500'),
  600: withOpacity('--color-accent-600'),
  700: withOpacity('--color-accent-700'),
  800: withOpacity('--color-accent-800'),
  900: withOpacity('--color-accent-900'),
  950: withOpacity('--color-accent-950'),
};

const neutralPalette = {
  0: withOpacity('--color-neutral-0'),
  50: withOpacity('--color-neutral-50'),
  100: withOpacity('--color-neutral-100'),
  200: withOpacity('--color-neutral-200'),
  300: withOpacity('--color-neutral-300'),
  400: withOpacity('--color-neutral-400'),
  500: withOpacity('--color-neutral-500'),
  600: withOpacity('--color-neutral-600'),
  700: withOpacity('--color-neutral-700'),
  800: withOpacity('--color-neutral-800'),
  900: withOpacity('--color-neutral-900'),
  950: withOpacity('--color-neutral-950'),
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Outfit"', '"Inter"', ...defaultTheme.fontFamily.sans],
        body: ['"Inter"', ...defaultTheme.fontFamily.sans],
        sans: ['"Inter"', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        primary: withOpacity('--color-brand-600'),
        'primary-foreground': 'rgb(var(--text-inverse))',
        brand: {
          DEFAULT: withOpacity('--color-brand-600'),
          ...brandPalette,
        },
        accent: {
          DEFAULT: withOpacity('--color-accent-500'),
          ...accentPalette,
        },
        'accent-foreground': 'rgb(var(--text-inverse))',
        neutral: neutralPalette,
        surface: {
          DEFAULT: 'rgb(var(--surface-layer))',
          body: 'rgb(var(--surface-body))',
          elevated: 'rgb(var(--surface-elevated))',
          brand: 'rgb(var(--surface-brand))',
          overlay: 'var(--surface-overlay)',
        },
        text: {
          DEFAULT: 'rgb(var(--text-primary))',
          primary: 'rgb(var(--text-primary))',
          secondary: 'rgb(var(--text-secondary))',
          muted: 'rgb(var(--text-muted))',
          inverse: 'rgb(var(--text-inverse))',
          link: 'rgb(var(--text-link))',
        },
        border: {
          DEFAULT: 'rgb(var(--border-default))',
          subtle: 'rgb(var(--border-subtle))',
          strong: 'rgb(var(--border-strong))',
          focus: 'var(--border-focus)',
        },
        success: withOpacity('--color-success-500'),
        warning: withOpacity('--color-warning-500'),
        danger: withOpacity('--color-danger-500'),
        info: withOpacity('--color-info-500'),
      },
      borderRadius: {
        lg: '1rem',
        xl: '1.5rem',
        '2xl': '2rem',
        '3xl': '2.5rem',
        pill: '999px',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        elevated: 'var(--shadow-elevated)',
        ring: 'var(--shadow-ring)',
        focus: 'var(--shadow-focus)',
      },
      screens: {
        xs: '475px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.6s ease-out',
        'bounce-subtle': 'bounceSubtle 2s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        spin: 'spin 1s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        pulseGlow: {
          '0%, 100%': { 'box-shadow': '0 0 0 0 rgba(99, 102, 241, 0.35)' },
          '50%': { 'box-shadow': '0 0 0 14px rgba(99, 102, 241, 0)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      maxWidth: {
        xs: '20rem',
        sm: '24rem',
        md: '28rem',
        lg: '32rem',
        xl: '36rem',
        '2xl': '42rem',
        '3xl': '48rem',
        '4xl': '56rem',
        '5xl': '64rem',
        '6xl': '72rem',
        '7xl': '80rem',
      },
    },
  },
  plugins: [
  ],
};
