import type {
  CVDensity,
  CVSectionType,
  CVTemplate,
  CVTemplateDesign,
} from '../types/cv';

/**
 * Template design registry.
 *
 * Templates used to differ only in name: every one of them exported the same
 * black-and-white page, because `buildCVHtml` never looked at `template_id`.
 * These specs are the fix — one object per template, consumed by the PDF
 * renderer, the in-app preview and the gallery card alike.
 *
 * The registry lives in code rather than the database on purpose: a malformed
 * admin edit would otherwise break every user's export, and the picker has to
 * work offline.
 */

const STANDARD_SECTIONS: CVSectionType[] = [
  'header',
  'summary',
  'skills',
  'experience',
  'education',
  'projects',
  'achievements',
];

export const TEMPLATE_DESIGNS: Record<string, CVTemplateDesign> = {
  /** The safe default: pure text on white, nothing an ATS parser can trip on. */
  'minimal-ats': {
    slug: 'minimal-ats',
    accent: '#111827',
    accentSoft: 'rgba(17,24,39,0.06)',
    gradient: ['#334155', '#0F172A'],
    ink: '#111827',
    muted: '#4B5563',
    bodyFont: 'sans',
    displayFont: 'sans',
    headerStyle: 'left',
    sectionRule: 'none',
    sectionCase: 'upper',
    density: 'regular',
    skillStyle: 'inline',
    atsPlain: true,
    sections: STANDARD_SECTIONS,
  },

  'modern-professional': {
    slug: 'modern-professional',
    accent: '#0F766E',
    accentSoft: 'rgba(15,118,110,0.10)',
    gradient: ['#0F766E', '#0D9488'],
    ink: '#111827',
    muted: '#4B5563',
    bodyFont: 'sans',
    displayFont: 'sans',
    headerStyle: 'left',
    sectionRule: 'underline',
    sectionCase: 'upper',
    density: 'regular',
    skillStyle: 'chips',
    atsPlain: true,
    sections: STANDARD_SECTIONS,
  },

  /**
   * Academic finally earns its description: research, publications and
   * references are real sections here, not just marketing copy.
   */
  'academic-research': {
    slug: 'academic-research',
    accent: '#1E3A8A',
    accentSoft: 'rgba(30,58,138,0.08)',
    gradient: ['#1E3A8A', '#2563EB'],
    ink: '#0F172A',
    muted: '#475569',
    bodyFont: 'serif',
    displayFont: 'serif',
    headerStyle: 'centered',
    sectionRule: 'underline',
    sectionCase: 'upper',
    density: 'roomy',
    skillStyle: 'inline',
    atsPlain: true,
    sections: [
      'header',
      'summary',
      'education',
      'research',
      'publications',
      'experience',
      'skills',
      'achievements',
      'references',
    ],
  },

  'bold-impact': {
    slug: 'bold-impact',
    accent: '#4F46E5',
    accentSoft: 'rgba(79,70,229,0.12)',
    gradient: ['#4F46E5', '#7C3AED'],
    ink: '#0F172A',
    muted: '#475569',
    bodyFont: 'sans',
    displayFont: 'sans',
    headerStyle: 'left',
    sectionRule: 'boxed',
    sectionCase: 'upper',
    density: 'regular',
    skillStyle: 'chips',
    atsPlain: false,
    sections: STANDARD_SECTIONS,
  },

  /** Pro. Projects lead, because that is what a portfolio reader opens for. */
  'creative-portfolio': {
    slug: 'creative-portfolio',
    accent: '#7C3AED',
    accentSoft: 'rgba(124,58,237,0.10)',
    gradient: ['#7C3AED', '#DB2777'],
    ink: '#1E1B4B',
    muted: '#52525B',
    bodyFont: 'sans',
    displayFont: 'sans',
    headerStyle: 'band',
    sectionRule: 'tick',
    sectionCase: 'title',
    density: 'roomy',
    skillStyle: 'chips',
    atsPlain: false,
    sections: [
      'header',
      'summary',
      'projects',
      'skills',
      'experience',
      'education',
      'achievements',
    ],
  },

  /** Pro. Dense and formal — for people whose track record is the headline. */
  executive: {
    slug: 'executive',
    accent: '#B45309',
    accentSoft: 'rgba(180,83,9,0.10)',
    gradient: ['#B45309', '#78350F'],
    ink: '#1C1917',
    muted: '#57534E',
    bodyFont: 'sans',
    displayFont: 'serif',
    headerStyle: 'split',
    sectionRule: 'underline',
    sectionCase: 'upper',
    density: 'compact',
    skillStyle: 'inline',
    atsPlain: false,
    sections: [
      'header',
      'summary',
      'experience',
      'achievements',
      'skills',
      'education',
      'projects',
    ],
  },
};

export const DEFAULT_TEMPLATE_DESIGN = TEMPLATE_DESIGNS['minimal-ats'];

/** Legacy ids from the original three mock templates, plus name-based guesses. */
const LEGACY_SLUG_ALIASES: Record<string, string> = {
  't-1': 'modern-professional',
  't-2': 'academic-research',
  't-3': 'creative-portfolio',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve the design for a template row, whatever shape it arrives in.
 *
 * Order: explicit slug → id → legacy id alias → slugified name → the ATS-plain
 * default. An unknown database row therefore renders a clean, conservative
 * document rather than crashing the export.
 */
export function resolveTemplateDesign(
  template?: Partial<CVTemplate> | null,
): CVTemplateDesign {
  if (!template) return DEFAULT_TEMPLATE_DESIGN;

  const candidates = [
    template.slug,
    template.id,
    template.id ? LEGACY_SLUG_ALIASES[template.id] : undefined,
    template.name ? slugify(template.name) : undefined,
  ];

  for (const candidate of candidates) {
    if (candidate && TEMPLATE_DESIGNS[candidate]) return TEMPLATE_DESIGNS[candidate];
  }
  return DEFAULT_TEMPLATE_DESIGN;
}

/** Same resolution, when all the caller has is the id stored on a saved CV. */
export function resolveTemplateDesignById(templateId?: string | null): CVTemplateDesign {
  return resolveTemplateDesign(templateId ? { id: templateId } : null);
}

/** Print metrics per density. Shared by the PDF and the on-screen preview. */
export interface CVDensityMetrics {
  baseFontSize: number;
  lineHeight: number;
  pagePaddingY: number;
  pagePaddingX: number;
  sectionGap: number;
  itemGap: number;
  nameSize: number;
}

const DENSITY_METRICS: Record<CVDensity, CVDensityMetrics> = {
  compact: {
    baseFontSize: 11.5,
    lineHeight: 1.42,
    pagePaddingY: 30,
    pagePaddingX: 40,
    sectionGap: 14,
    itemGap: 8,
    nameSize: 23,
  },
  regular: {
    baseFontSize: 12.5,
    lineHeight: 1.5,
    pagePaddingY: 36,
    pagePaddingX: 44,
    sectionGap: 18,
    itemGap: 10,
    nameSize: 25,
  },
  roomy: {
    baseFontSize: 13,
    lineHeight: 1.62,
    pagePaddingY: 42,
    pagePaddingX: 50,
    sectionGap: 22,
    itemGap: 12,
    nameSize: 27,
  },
};

export function getDensityMetrics(density: CVDensity): CVDensityMetrics {
  return DENSITY_METRICS[density] || DENSITY_METRICS.regular;
}

/** Print-safe stacks only — an exotic family silently substitutes in the PDF. */
export function getFontStack(family: 'sans' | 'serif'): string {
  return family === 'serif'
    ? "Georgia, 'Times New Roman', Times, serif"
    : "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
}
