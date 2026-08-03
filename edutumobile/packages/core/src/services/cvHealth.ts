import type { CVData, CVTemplateDesign } from '../types/cv';

/**
 * CV Health — a deterministic audit of a CV against the things that actually
 * get applications rejected: missing contact details, unparseable or reversed
 * dates, achievement bullets with no numbers, a document that runs long.
 *
 * Deliberately a pure function with no network and no AI: it must be instant,
 * work offline, and produce the same answer twice so the score doesn't jitter
 * while the user types.
 */

export type CvCheckSeverity = 'critical' | 'warning' | 'info';
export type CvCheckStatus = 'pass' | 'fail';

/** Which wizard step a check's fix lives on, so "Fix" can navigate there. */
export type CvCheckStep = 'basics' | 'summary' | 'experience' | 'education' | 'extras';

export interface CvHealthCheck {
  id: string;
  status: CvCheckStatus;
  severity: CvCheckSeverity;
  /** i18n key under `health.checks.*`. */
  labelKey: string;
  /** Interpolation values for the label/detail copy. */
  values?: Record<string, string | number>;
  step: CvCheckStep;
  /** Points this check contributes when it passes. */
  weight: number;
}

export interface CvHealthReport {
  /** 0–100, weighted by how much each check matters. */
  score: number;
  band: 'weak' | 'fair' | 'strong';
  checks: CvHealthCheck[];
  /** Failing checks only, worst first — what the panel leads with. */
  issues: CvHealthCheck[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Accepts the canonical `YYYY-MM` the wizard writes, plus the looser shapes
 * older CVs contain ("2023", "Mar 2023", "03/2023"). Returns a sortable
 * number, or null when the text can't be understood at all — which is itself
 * a finding, because an unparseable date renders inconsistently in the PDF.
 */
export function parseCvDate(value?: string | null): number | null {
  const raw = (value || '').trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return Number(iso[1]) * 12 + (Number(iso[2]) - 1);

  const slash = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (slash) return Number(slash[2]) * 12 + (Number(slash[1]) - 1);

  const MONTHS = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  ];
  const named = raw.toLowerCase().match(/^([a-z]{3,})[a-z.]*\s+(\d{4})$/);
  if (named) {
    const index = MONTHS.indexOf(named[1].slice(0, 3));
    if (index >= 0) return Number(named[2]) * 12 + index;
  }

  const yearOnly = raw.match(/^(\d{4})$/);
  if (yearOnly) return Number(yearOnly[1]) * 12;

  return null;
}

/** True when a line carries a number, percentage or currency figure. */
function hasMetric(text?: string | null): boolean {
  return /\d/.test(text || '');
}

function countWords(text?: string | null): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function analyzeCv(
  data?: CVData | null,
  design?: CVTemplateDesign | null,
): CvHealthReport {
  const cv: CVData = data || {};
  const header = cv.header || { full_name: '', email: '' };
  const checks: CvHealthCheck[] = [];

  const add = (
    id: string,
    passed: boolean,
    severity: CvCheckSeverity,
    step: CvCheckStep,
    weight: number,
    values?: Record<string, string | number>,
  ) => {
    checks.push({
      id,
      status: passed ? 'pass' : 'fail',
      severity,
      labelKey: `health.checks.${id}.${passed ? 'pass' : 'fail'}`,
      values,
      step,
      weight,
    });
  };

  // ── Contact ───────────────────────────────────────────────────────────────
  add('fullName', Boolean((header.full_name || '').trim()), 'critical', 'basics', 12);
  add('email', EMAIL_RE.test((header.email || '').trim()), 'critical', 'basics', 12);
  add(
    'reachable',
    Boolean((header.phone || '').trim() || (header.location || '').trim()),
    'warning',
    'basics',
    6,
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  const summaryWords = countWords(cv.summary);
  add('summary', summaryWords >= 15, 'warning', 'summary', 10, { words: summaryWords });
  add('summaryLength', summaryWords <= 120, 'info', 'summary', 4, { words: summaryWords });

  // ── Experience ────────────────────────────────────────────────────────────
  const experience = (cv.experience || []).filter((item) => item?.role || item?.company);
  add('experience', experience.length > 0, 'critical', 'experience', 14);

  const incompleteRoles = experience.filter(
    (item) => !item.role || !item.company || !item.start_date,
  ).length;
  add('experienceComplete', incompleteRoles === 0, 'warning', 'experience', 8, {
    count: incompleteRoles,
  });

  // Bullets without a number are the single most common reason a strong
  // candidate reads as generic.
  const bulletTexts = experience.flatMap((item) => [
    item.description || '',
    ...(item.highlights || []),
  ]).map((line) => line.trim()).filter(Boolean);
  const unquantified = bulletTexts.filter((line) => !hasMetric(line)).length;
  add('quantified', bulletTexts.length === 0 || unquantified === 0, 'warning', 'experience', 10, {
    count: unquantified,
  });

  // ── Education ─────────────────────────────────────────────────────────────
  const education = (cv.education || []).filter((item) => item?.institution || item?.degree);
  add('education', education.length > 0, 'warning', 'education', 10);

  // ── Skills ────────────────────────────────────────────────────────────────
  const skills = (cv.skills || []).map((s) => (s || '').trim()).filter(Boolean);
  add('skills', skills.length >= 5, 'warning', 'summary', 8, { count: skills.length });

  // ── Dates ─────────────────────────────────────────────────────────────────
  const dated = [
    ...experience.map((item) => ({
      start: item.start_date,
      end: item.current ? null : item.end_date,
      ongoing: Boolean(item.current),
    })),
    ...education.map((item) => ({ start: item.start_date, end: item.end_date, ongoing: false })),
  ];

  const unparseable = dated.filter(
    (entry) =>
      (entry.start && parseCvDate(entry.start) === null) ||
      (entry.end && parseCvDate(entry.end) === null),
  ).length;
  add('datesParse', unparseable === 0, 'warning', 'experience', 6, { count: unparseable });

  const reversed = dated.filter((entry) => {
    const start = parseCvDate(entry.start);
    const end = entry.ongoing ? null : parseCvDate(entry.end);
    return start !== null && end !== null && end < start;
  }).length;
  add('datesOrder', reversed === 0, 'critical', 'experience', 6, { count: reversed });

  // ── Length ────────────────────────────────────────────────────────────────
  // Rough page budget: entries plus body words. One page is the target for
  // early-career applicants, which is most of this audience.
  const entryCount =
    experience.length + education.length +
    (cv.projects || []).length + (cv.achievements || []).length;
  const bodyWords = summaryWords + bulletTexts.reduce((sum, line) => sum + countWords(line), 0);
  const estimatedPages = Math.max(1, Math.ceil((entryCount * 55 + bodyWords) / 520));
  add('length', estimatedPages <= 2, 'info', 'extras', 4, { pages: estimatedPages });

  // ── Template fit ──────────────────────────────────────────────────────────
  // A template that promises Publications and gets none prints an empty
  // promise — better to warn than to silently drop the section.
  if (design) {
    const missingForTemplate: string[] = [];
    if (design.sections.includes('publications') && !(cv.publications || []).length) {
      missingForTemplate.push('publications');
    }
    if (design.sections.includes('research') && !(cv.research || []).length) {
      missingForTemplate.push('research');
    }
    if (design.sections.includes('projects') &&
        design.sections.indexOf('projects') < design.sections.indexOf('experience') &&
        !(cv.projects || []).length) {
      missingForTemplate.push('projects');
    }
    add('templateFit', missingForTemplate.length === 0, 'info', 'extras', 5, {
      sections: missingForTemplate.join(', '),
      count: missingForTemplate.length,
    });
  }

  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const earned = checks
    .filter((check) => check.status === 'pass')
    .reduce((sum, check) => sum + check.weight, 0);
  const score = totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 100);

  const SEVERITY_ORDER: Record<CvCheckSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  const issues = checks
    .filter((check) => check.status === 'fail')
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.weight - a.weight);

  return {
    score,
    band: score >= 80 ? 'strong' : score >= 55 ? 'fair' : 'weak',
    checks,
    issues,
  };
}
