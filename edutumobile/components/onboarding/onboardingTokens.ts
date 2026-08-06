import { Platform } from 'react-native';

/**
 * One type + surface scale shared by the splash, the four onboarding slides and
 * the Get Started page. Before this existed each screen hardcoded its own
 * `Avenir Next` stack and picked button heights ad hoc (64 here, 66 there),
 * which is why the flow never felt like one product.
 *
 * We deliberately do NOT set a fontFamily: leaving it undefined resolves to the
 * platform UI font (SF Pro on iOS, Roboto on Android), both of which are far
 * better tuned for tight display sizes than Avenir Next.
 */

export const onboardingType = {
  display: {
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500' as const,
    letterSpacing: -0.1,
  },
  cta: {
    fontSize: 17,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  skip: {
    fontSize: 15,
    fontWeight: '600' as const,
    letterSpacing: -0.1,
  },
  /** Small all-caps label, e.g. "OPPORTUNITIES FROM". */
  eyebrow: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
  },
};

export const onboardingLayout = {
  gutter: 24,
  ctaHeight: 58,
  ctaRadius: 29,
};

export interface OnboardingPalette {
  /** Page background gradient, top to bottom. */
  backdrop: [string, string, string];
  text: string;
  textMuted: string;
  /** Fill for glass cards floating over the backdrop. */
  glass: string;
  glassBorder: string;
  /** Primary CTA — inverted against the backdrop. */
  ctaBg: string;
  ctaText: string;
  /** Secondary/ghost button. */
  softBg: string;
  ring: string;
  shadow: string;
}

export function getOnboardingPalette(isDark: boolean): OnboardingPalette {
  return isDark
    ? {
        backdrop: ['#0A0B10', '#12141D', '#08090D'],
        text: '#F7F8FA',
        textMuted: 'rgba(247,248,250,0.58)',
        glass: 'rgba(255,255,255,0.055)',
        glassBorder: 'rgba(255,255,255,0.10)',
        ctaBg: '#FFFFFF',
        ctaText: '#0A0B10',
        softBg: 'rgba(255,255,255,0.08)',
        ring: 'rgba(255,255,255,0.09)',
        shadow: '#000000',
      }
    : {
        backdrop: ['#FFFFFF', '#F5F7FC', '#EEF1F8'],
        text: '#0C0E14',
        textMuted: 'rgba(12,14,20,0.56)',
        glass: 'rgba(255,255,255,0.92)',
        glassBorder: 'rgba(12,14,20,0.07)',
        ctaBg: '#0C0E14',
        ctaText: '#FFFFFF',
        softBg: 'rgba(12,14,20,0.05)',
        ring: 'rgba(12,14,20,0.07)',
        shadow: '#1B2340',
      };
}

/**
 * Each slide owns a hue. The backdrop is a dark base lifted by that hue so the
 * flow moves through colour as you page, and the slide's accent is reused by
 * its visual (bars, glows, active states) so the screen reads as one idea.
 *
 * The coach slide is deliberately amber, NOT the violet/indigo that every AI
 * product defaults to.
 */
export interface SlideTheme {
  accent: string;
  accentSoft: string;
  backdrop: [string, string, string];
}

export const slideThemes: Record<string, { dark: SlideTheme; light: SlideTheme }> = {
  discover: {
    dark: {
      accent: '#60A5FA',
      accentSoft: 'rgba(96,165,250,0.16)',
      backdrop: ['#0B1226', '#111A33', '#070A14'],
    },
    light: {
      accent: '#2563EB',
      accentSoft: 'rgba(37,99,235,0.10)',
      backdrop: ['#FFFFFF', '#EEF3FE', '#E6EDFB'],
    },
  },
  match: {
    dark: {
      accent: '#34D399',
      accentSoft: 'rgba(52,211,153,0.16)',
      backdrop: ['#06140F', '#0C2119', '#04100C'],
    },
    light: {
      accent: '#059669',
      accentSoft: 'rgba(5,150,105,0.10)',
      backdrop: ['#FFFFFF', '#EAF7F1', '#DFF2E9'],
    },
  },
  coach: {
    dark: {
      accent: '#FBBF24',
      accentSoft: 'rgba(251,191,36,0.16)',
      backdrop: ['#17100A', '#241708', '#100A05'],
    },
    light: {
      accent: '#D97706',
      accentSoft: 'rgba(217,119,6,0.10)',
      backdrop: ['#FFFFFF', '#FDF3E5', '#FBEBD6'],
    },
  },
  deadlines: {
    dark: {
      accent: '#FB7185',
      accentSoft: 'rgba(251,113,133,0.16)',
      backdrop: ['#1A0A11', '#26101A', '#12070C'],
    },
    light: {
      accent: '#E11D48',
      accentSoft: 'rgba(225,29,72,0.10)',
      backdrop: ['#FFFFFF', '#FDEEF1', '#FBE2E7'],
    },
  },
};

export function getSlideTheme(id: string, isDark: boolean): SlideTheme {
  const entry = slideThemes[id] ?? slideThemes.discover;
  return isDark ? entry.dark : entry.light;
}

/** Layered shadow used by every floating card, so depth reads consistently. */
export const cardShadow = Platform.select({
  ios: {
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
  },
  default: { elevation: 10 },
});
