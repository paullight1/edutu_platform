/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  darkMode: 'class',
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: 'rgba(var(--background) / <alpha-value>)',
        foreground: 'rgba(var(--foreground) / <alpha-value>)',
        brand: {
          50: 'rgba(var(--brand-50) / <alpha-value>)',
          100: 'rgba(var(--brand-100) / <alpha-value>)',
          200: 'rgba(var(--brand-200) / <alpha-value>)',
          300: 'rgba(var(--brand-300) / <alpha-value>)',
          400: 'rgba(var(--brand-400) / <alpha-value>)',
          500: 'rgba(var(--brand-500) / <alpha-value>)',
          600: 'rgba(var(--brand-600) / <alpha-value>)',
          700: 'rgba(var(--brand-700) / <alpha-value>)',
          800: 'rgba(var(--brand-800) / <alpha-value>)',
          900: 'rgba(var(--brand-900) / <alpha-value>)',
          950: 'rgba(var(--brand-950) / <alpha-value>)',
        },
        accent: {
          500: 'rgba(var(--accent-500) / <alpha-value>)',
        },
        success: 'rgba(var(--success-500) / <alpha-value>)',
        warning: 'rgba(var(--warning-500) / <alpha-value>)',
        danger: 'rgba(var(--danger-500) / <alpha-value>)',
        text: {
          primary: 'rgba(var(--text-primary) / <alpha-value>)',
          secondary: 'rgba(var(--text-secondary) / <alpha-value>)',
          muted: 'rgba(var(--text-muted) / <alpha-value>)',
        },
        surface: {
          layer: 'rgba(var(--surface-layer) / <alpha-value>)',
          elevated: 'rgba(var(--surface-elevated) / <alpha-value>)',
        },
        border: {
          subtle: 'rgba(var(--border-subtle) / <alpha-value>)',
          bold: 'rgba(var(--border-bold) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        pill: '999px',
      },
    },
  },
  plugins: [],
};