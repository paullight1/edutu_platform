/* eslint-disable no-restricted-globals */
export interface CvDocument {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  dataUrl: string | null;
  textContent: string;
  stats: CvStats;
  jobTarget?: string;
  jobDescription?: string;
  analysis?: AtsReport;
  optimization?: OptimizationResult;
  generated?: boolean;
}

export interface CvStats {
  wordCount: number;
  sentenceCount: number;
  readability: number;
  contact: ContactDetails;
  experienceYears: number;
  sectionCoverage: SectionCoverage[];
  keywordMatches: KeywordMatch[];
}

export interface ContactDetails {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
}

export interface SectionCoverage {
  section: string;
  present: boolean;
  weight: number;
}

export interface KeywordMatch {
  keyword: string;
  found: boolean;
  weight: number;
}

export interface AtsReport {
  score: number;
  keywordsMatched: KeywordMatch[];
  missingKeywords: string[];
  recommendedActions: string[];
  sectionRecommendations: SectionCoverage[];
  readability: number;
  evaluatedAt: string;
}

export interface OptimizationResult {
  summarySuggestions: string[];
  bulletSuggestions: string[];
  keywordRecommendations: string[];
  formattingTips: string[];
  raisedScore?: number;
  updatedAt: string;
}

export interface UploadCvPayload {
  file: File;
  jobTarget?: string;
  jobDescription?: string;
  customKeywords?: string[];
}

export interface AtsAnalysisPayload {
  cvId: string;
  jobTarget?: string;
  jobDescription?: string;
  customKeywords?: string[];
}

export interface OptimizationPayload {
  cvId: string;
  emphasizeSections?: string[];
  customKeywords?: string[];
}

export interface CvGenerationPayload {
  fullName: string;
  targetRole: string;
  summary: string;
  experience: Array<{
    role: string;
    company: string;
    duration: string;
    achievements: string[];
  }>;
  education: Array<{
    school: string;
    credential: string;
    year: string;
  }>;
  skills: string[];
  certifications?: string[];
  projects?: Array<{
    title: string;
    description: string;
    impact?: string;
  }>;
}

export interface CvGenerationResult {
  record: CvDocument;
  draft: string;
}

const STORAGE_KEY = 'edutu.cv.records';

const DEFAULT_KEYWORDS = [
  'leadership',
  'project management',
  'strategic planning',
  'communication',
  'stakeholder',
  'collaboration',
  'analytics',
  'data-driven',
  'results',
  'innovation',
  'cross-functional',
  'operational excellence',
  'continuous improvement',
  'coaching',
  'mentoring',
  'customer experience',
  'sales',
  'marketing',
  'growth',
  'risk management',
  'compliance',
  'automation',
  'budgeting',
  'forecasting',
  'agile',
  'kpi',
  'performance',
  'roadmap',
  'product',
  'delivery'
];

const JOB_DESCRIPTION_STOP_WORDS = new Set([
  'with',
  'from',
  'that',
  'will',
  'your',
  'this',
  'these',
  'those',
  'have',
  'ability',
  'strong',
  'using',
  'skills',
  'experience',
  'about',
  'other',
  'team',
  'work',
  'across',
  'role',
  'drive',
  'needs',
  'must'
]);

const SECTION_MARKERS: Array<{ label: string; aliases: RegExp; weight: number }> = [
  { label: 'Summary', aliases: /summary|profile|overview|objective/i, weight: 0.15 },
  { label: 'Experience', aliases: /experience|employment|work history|professional background/i, weight: 0.3 },
  { label: 'Education', aliases: /education|academics|qualifications/i, weight: 0.18 },
  { label: 'Skills', aliases: /skills|competencies|capabilities/i, weight: 0.18 },
  { label: 'Projects', aliases: /projects|portfolio|case studies|assignments/i, weight: 0.09 },
  { label: 'Certifications', aliases: /certifications|licenses|accreditations/i, weight: 0.1 }
];

const hasWindow = typeof window !== 'undefined';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getLocalStorageRecords = (): CvDocument[] => {
  if (!hasWindow) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as CvDocument[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const persistRecords = (records: CvDocument[]) => {
  if (!hasWindow) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

const upsertRecord = (record: CvDocument) => {
  const records = getLocalStorageRecords();
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    records[index] = record;
  } else {
    records.unshift(record);
  }
  persistRecords(records);
  return record;
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(reader.result);
        resolve(sanitizeText(decoded));
        return;
      }
      resolve(reader.result ? sanitizeText(String(reader.result)) : '');
    };
    reader.onerror = () => reject(reader.error);
    if (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('xml')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });

const sanitizeText = (text: string): string =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const deriveTitleFromContent = (fileName: string, text: string): string => {
  const namePart = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const probableName = lines.find((line) => /^[A-Za-z ,.'-]{4,40}$/.test(line));
  if (probableName) {
    return `${probableName} - ${namePart}`;
  }
  return `${namePart} CV`;
};

const extractContactDetails = (text: string): ContactDetails => {
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
  const linkedinMatch = text.match(/linkedin\.com\/[A-Za-z0-9/_-]+/i);
  const webMatch = text.match(/https?:\/\/(www\.)?[A-Za-z0-9._-]+\.[A-Za-z]{2,}/i);
  const locationMatch = text.match(/\b[A-Za-z]+(?:\s+[A-Za-z]+){0,2},?\s+[A-Za-z]{2,}\b/);

  const firstLine = text.split('\n')[0]?.trim();
  const probableName = /^[A-Za-z ,.'-]{4,40}$/.test(firstLine) ? firstLine : undefined;

  return {
    name: probableName,
    email: emailMatch?.[0]?.trim(),
    phone: phoneMatch?.[0]?.trim(),
    location: locationMatch?.[0]?.trim(),
    linkedin: linkedinMatch ? `https://${linkedinMatch[0].replace(/^https?:\/\//, '')}` : undefined,
    website: webMatch?.[0]?.trim()
  };
};

const countWords = (text: string) => {
  const matches = text.trim().match(/\b[\w'-]+\b/g);
  return matches ? matches.length : 0;
};

const countSentences = (text: string) => {
  const matches = text.split(/[.!?]+/).map((segment) => segment.trim()).filter(Boolean);
  return matches.length || 1;
};

const estimateSyllables = (word: string) => {
  const sanitized = word.toLowerCase();
  if (sanitized.length <= 3) {
    return 1;
  }
  const matches = sanitized.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
};

const computeReadability = (text: string): number => {
  const words = text.match(/\b[\w'-]+\b/g) ?? [];
  const sentences = countSentences(text);
  const syllables = words.reduce((total, word) => total + estimateSyllables(word), 0);
  const flesch = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / Math.max(words.length, 1));
  return Math.max(0, Math.min(100, Math.round(flesch)));
};

const estimateExperienceYears = (text: string): number => {
  const yearMatches = text.match(/\b(19|20)\d{2}\b/g);
  if (!yearMatches || yearMatches.length < 2) {
    return yearMatches && yearMatches.length > 0 ? 1 : 0;
  }
  const years = yearMatches.map((year) => parseInt(year, 10)).sort((a, b) => a - b);
  const span = years[years.length - 1] - years[0];
  if (span <= 0) {
    return years.length;
  }
  return Math.max(1, Math.min(40, span + 1));
};

const computeSectionCoverage = (text: string): SectionCoverage[] =>
  SECTION_MARKERS.map((marker) => ({
    section: marker.label,
    present: marker.aliases.test(text),
    weight: marker.weight
  }));

const uniqueKeywords = (keywords: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  keywords.forEach((keyword) => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return;
    }
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(trimmed);
  });
  return result;
};

const computeKeywordMatches = (text: string, keywords: string[]): KeywordMatch[] => {
  const lowered = text.toLowerCase();
  const list = uniqueKeywords(keywords);
  return list.map((keyword) => {
    const pattern = new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`, 'i');
    const found = pattern.test(lowered);
    const weight = keyword.length >= 12 || keyword.includes(' ') ? 2 : 1;
    return { keyword, found, weight };
  });
};

const buildKeywordCatalogue = (payload?: {
  jobTarget?: string;
  jobDescription?: string;
  customKeywords?: string[];
}) => {
  const catalogue = [...DEFAULT_KEYWORDS];
  if (payload?.jobTarget) {
    catalogue.push(...payload.jobTarget.split(/\s+/));
  }
  if (payload?.jobDescription) {
    const highValueWords = payload.jobDescription
      .toLowerCase()
      .match(/\b[a-z]{4,}\b/g)
      ?.filter((word) => !JOB_DESCRIPTION_STOP_WORDS.has(word)) ?? [];
    const frequency = new Map<string, number>();
    highValueWords.forEach((word) => {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    });
    Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .forEach(([word]) => catalogue.push(word));
  }
  if (payload?.customKeywords) {
    catalogue.push(...payload.customKeywords);
  }
  return catalogue;
};

const buildStats = (
  text: string,
  keywordContext?: { jobTarget?: string; jobDescription?: string; customKeywords?: string[] }
): CvStats => {
  const wordCount = countWords(text);
  const sentenceCount = countSentences(text);
  const readability = computeReadability(text);
  const contact = extractContactDetails(text);
  const experienceYears = estimateExperienceYears(text);
  const sections = computeSectionCoverage(text);
  const catalogue = buildKeywordCatalogue(keywordContext);
  const keywordMatches = computeKeywordMatches(text, catalogue);

  return {
    wordCount,
    sentenceCount,
    readability,
    contact,
    experienceYears,
    sectionCoverage: sections,
    keywordMatches
  };
};

const computeAtsScore = (stats: CvStats): AtsReport => {
  const totalKeywordWeight = stats.keywordMatches.reduce((total, match) => total + match.weight, 0) || 1;
  const matchedKeywordWeight = stats.keywordMatches
    .filter((match) => match.found)
    .reduce((total, match) => total + match.weight, 0);

  const keywordScore = (matchedKeywordWeight / totalKeywordWeight) * 60;

  const sectionWeightTotal = stats.sectionCoverage.reduce((total, section) => total + section.weight, 0) || 1;
  const sectionScore =
    (stats.sectionCoverage.filter((section) => section.present).reduce((total, section) => total + section.weight, 0) /
      sectionWeightTotal) *
    25;

  const readabilityScore = stats.readability >= 60 ? 10 : stats.readability >= 45 ? 7 : 4;

  const contactCompleteness =
    (stats.contact.email ? 1 : 0) +
    (stats.contact.phone ? 1 : 0) +
    (stats.contact.linkedin ? 1 : 0) +
    (stats.contact.location ? 1 : 0);
  const contactScore = Math.min(contactCompleteness * 2, 12);

  const rawScore = Math.round(35 + keywordScore + sectionScore + readabilityScore + contactScore);
  const cappedScore = Math.max(30, Math.min(100, rawScore));

  const missingKeywords = stats.keywordMatches.filter((match) => !match.found).slice(0, 12).map((match) => match.keyword);

  const recommendedActions: string[] = [];
  if (stats.readability < 55) {
    recommendedActions.push('Balance sentence length to improve readability');
  }
  if (contactCompleteness < 3) {
    recommendedActions.push('Include complete contact details with LinkedIn and location');
  }
  if (missingKeywords.length > 0) {
    recommendedActions.push('Incorporate missing target keywords into relevant achievements');
  }
  if (!stats.sectionCoverage.find((section) => section.section === 'Projects' && section.present)) {
    recommendedActions.push('Add a projects or accomplishments section to highlight impact');
  }

  return {
    score: cappedScore,
    keywordsMatched: stats.keywordMatches,
    missingKeywords,
    recommendedActions,
    sectionRecommendations: stats.sectionCoverage,
    readability: stats.readability,
    evaluatedAt: new Date().toISOString()
  };
};

const buildOptimizationPlan = (record: CvDocument, report: AtsReport, payload?: OptimizationPayload): OptimizationResult => {
  const focusSections = payload?.emphasizeSections ?? [];
  const missingKeywords = report.missingKeywords.slice(0, 10);
  const keywordRecommendations = missingKeywords.map(
    (keyword) => `Add quantified achievement statements that naturally include "${keyword}"`
  );

  const bulletSuggestions = [
    'Start each bullet with an action verb and end with impact metrics',
    'Group similar accomplishments to reduce repetition',
    'Limit each bullet to 1-2 lines for better ATS parsing'
  ];

  if (record.stats.experienceYears < 2) {
    bulletSuggestions.push('Highlight academic projects or internships to demonstrate practical experience');
  }

  const summarySuggestions = [
    'Align your summary with the target role and highlight top skills within 3 sentences',
    'Mention years of experience and industry domain to give quick context',
    'Call out standout achievements using quantifiable impact'
  ];

  if (focusSections.includes('Projects') && !record.stats.sectionCoverage.find((s) => s.section === 'Projects' && s.present)) {
    summarySuggestions.push('Introduce a projects section to showcase portfolio work that supports the target role');
  }

  return {
    summarySuggestions,
    bulletSuggestions,
    keywordRecommendations,
    formattingTips: [
      'Use a single column layout with consistent heading hierarchy',
      'Align bullet points and dates for easy scanning',
      'Ensure font size is at least 10pt and avoid text boxes or graphics'
    ],
    raisedScore: Math.min(100, report.score + Math.max(6, Math.round(missingKeywords.length * 0.8))),
    updatedAt: new Date().toISOString()
  };
};

const toDataUrlFromText = async (text: string) => {
  const blob = new Blob([text], { type: 'text/plain' });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

const buildDraftFromGenerationPayload = (payload: CvGenerationPayload): string => {
  const lines: string[] = [];
  lines.push(payload.fullName);
  lines.push(payload.targetRole);
  lines.push('');
  lines.push('SUMMARY');
  lines.push(payload.summary);
  lines.push('');
  lines.push('CORE SKILLS');
  lines.push(payload.skills.join(' • '));
  lines.push('');
  if (payload.experience.length > 0) {
    lines.push('PROFESSIONAL EXPERIENCE');
    payload.experience.forEach((job) => {
      lines.push(`${job.role} • ${job.company} • ${job.duration}`);
      job.achievements.forEach((achievement) => lines.push(`- ${achievement}`));
      lines.push('');
    });
  }
  if (payload.projects && payload.projects.length > 0) {
    lines.push('PROJECTS');
    payload.projects.forEach((project) => {
      lines.push(`${project.title}${project.impact ? ` • ${project.impact}` : ''}`);
      lines.push(`- ${project.description}`);
      lines.push('');
    });
  }
  if (payload.certifications && payload.certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    payload.certifications.forEach((certification) => lines.push(`- ${certification}`));
    lines.push('');
  }
  if (payload.education.length > 0) {
    lines.push('EDUCATION');
    payload.education.forEach((edu) => lines.push(`${edu.credential} • ${edu.school} • ${edu.year}`));
  }
  return lines.join('\n').trim();
};

export const listCvDocuments = async (): Promise<CvDocument[]> => {
  await delay(120);
  return getLocalStorageRecords();
};

export const uploadCvDocument = async (payload: UploadCvPayload): Promise<CvDocument> => {
  const { file, jobDescription, jobTarget, customKeywords } = payload;
  const [dataUrl, textContent] = await Promise.all([
    readFileAsDataUrl(file).catch(() => null),
    readFileAsText(file).catch(() => '')
  ]);

  const stats = buildStats(textContent, { jobDescription, jobTarget, customKeywords });
  const record: CvDocument = {
    id: createId(),
    title: deriveTitleFromContent(file.name, textContent),
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
    dataUrl,
    textContent,
    stats,
    jobDescription,
    jobTarget
  };

  upsertRecord(record);
  await delay(150);
  return record;
};

export const getCvDocument = async (cvId: string): Promise<CvDocument | undefined> => {
  await delay(80);
  return getLocalStorageRecords().find((record) => record.id === cvId);
};

export const getCvDownloadUrl = async (cvId: string): Promise<string> => {
  const record = await getCvDocument(cvId);
  if (!record) {
    throw new Error('CV document not found');
  }

  if (record.dataUrl) {
    return record.dataUrl;
  }

  const blob = new Blob([record.textContent ?? ''], { type: record.mimeType || 'text/plain' });
  return URL.createObjectURL(blob);
};

export const analyzeCvDocument = async (payload: AtsAnalysisPayload): Promise<AtsReport> => {
  await delay(240);
  const records = getLocalStorageRecords();
  const record = records.find((item) => item.id === payload.cvId);
  if (!record) {
    throw new Error('CV document not found');
  }

  const updatedStats = buildStats(record.textContent, {
    jobDescription: payload.jobDescription ?? record.jobDescription,
    jobTarget: payload.jobTarget ?? record.jobTarget,
    customKeywords: payload.customKeywords
  });
  const analysis = computeAtsScore(updatedStats);

  const updatedRecord: CvDocument = {
    ...record,
    stats: updatedStats,
    jobDescription: payload.jobDescription ?? record.jobDescription,
    jobTarget: payload.jobTarget ?? record.jobTarget,
    analysis
  };

  upsertRecord(updatedRecord);
  return analysis;
};

export const optimizeCvDocument = async (payload: OptimizationPayload): Promise<OptimizationResult> => {
  await delay(260);
  const records = getLocalStorageRecords();
  const record = records.find((item) => item.id === payload.cvId);
  if (!record) {
    throw new Error('CV document not found');
  }
  const analysis = record.analysis ?? computeAtsScore(record.stats);
  const optimization = buildOptimizationPlan(record, analysis, payload);
  const updatedRecord: CvDocument = { ...record, optimization };
  upsertRecord(updatedRecord);
  return optimization;
};

export const deleteCvDocument = async (cvId: string): Promise<void> => {
  await delay(80);
  const remaining = getLocalStorageRecords().filter((record) => record.id !== cvId);
  persistRecords(remaining);
};

export const generateCvDocument = async (payload: CvGenerationPayload): Promise<CvGenerationResult> => {
  await delay(300);
  const draft = buildDraftFromGenerationPayload(payload);
  const dataUrl = await toDataUrlFromText(draft).catch(() => null);
  const stats = buildStats(draft, {
    jobTarget: payload.targetRole,
    customKeywords: payload.skills
  });
  const record: CvDocument = {
    id: createId(),
    title: `${payload.fullName} - ${payload.targetRole}`,
    fileName: `${payload.fullName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.txt`,
    fileSize: draft.length,
    mimeType: 'text/plain',
    uploadedAt: new Date().toISOString(),
    dataUrl,
    textContent: draft,
    stats,
    jobTarget: payload.targetRole,
    generated: true
  };

  upsertRecord(record);
  return { record, draft };
};

export const resetCvDocuments = async (): Promise<void> => {
  await delay(50);
  persistRecords([]);
};
