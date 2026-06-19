import { productApiRequest } from './productApi';

export interface CvStats {
  wordCount: number;
  sentenceCount: number;
  readability: number;
  contact: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    website?: string;
  };
  sectionCoverage: Array<{
    section: string;
    present: boolean;
    weight: number;
  }>;
  keywordMatches: Array<{
    keyword: string;
    found: boolean;
    weight: number;
  }>;
  experienceYears: number;
}

export interface CvRecord {
  id: string;
  title: string;
  fileName: string;
  file_name?: string;
  fileSize: number;
  file_size?: number;
  mimeType: string;
  mime_type?: string;
  uploadedAt: string;
  uploaded_at?: string;
  updatedAt?: string | null;
  updated_at?: string | null;
  textContent: string;
  text_content?: string;
  stats: CvStats | Record<string, unknown>;
  jobTarget?: string | null;
  job_target?: string | null;
  jobDescription?: string | null;
  job_description?: string | null;
  analysis?: Record<string, unknown> | null;
  optimization?: Record<string, unknown> | null;
  generated?: boolean;
}

export interface SaveCvRecordInput {
  title: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  textContent: string;
  stats?: CvStats;
  jobTarget?: string | null;
  jobDescription?: string | null;
  analysis?: Record<string, unknown> | null;
  optimization?: Record<string, unknown> | null;
  generated?: boolean;
}

export interface CVData {
  header?: {
    full_name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    portfolio?: string;
    website?: string;
  };
  summary?: string;
  experience?: Array<{
    company?: string;
    role?: string;
    start_date?: string;
    end_date?: string;
    description?: string;
    highlights?: string[];
  }>;
  education?: Array<{
    institution?: string;
    degree?: string;
    field?: string;
    start_date?: string;
    end_date?: string;
    highlights?: string[];
  }>;
  skills?: string[];
  projects?: Array<{
    name?: string;
    description?: string;
    technologies?: string[];
  }>;
  achievements?: Array<{
    title?: string;
    description?: string;
    issuer?: string;
    date?: string;
  }>;
}

export interface GenerateCVDraftInput {
  prompt?: string;
  linkedInUrl?: string;
  currentCV?: CVData;
  profile?: Record<string, unknown>;
  goals?: Array<Record<string, unknown>>;
}

export interface GenerateCVDraftResponse {
  cv: CVData;
  suggestions: string[];
}

const keywordCatalog = [
  'leadership',
  'research',
  'communication',
  'project management',
  'collaboration',
  'analysis',
  'scholarship',
  'internship',
  'community',
  'impact',
  'data',
  'strategy',
  'writing',
  'presentation',
  'volunteer',
];

function countWords(text: string) {
  return text.trim().match(/\b[\w'-]+\b/g)?.length ?? 0;
}

function countSentences(text: string) {
  return text.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length || 1;
}

function estimateReadability(text: string) {
  const words = countWords(text);
  const sentences = countSentences(text);
  if (!words) return 0;
  const averageSentenceLength = words / sentences;
  return Math.max(0, Math.min(100, Math.round(100 - averageSentenceLength * 2.2)));
}

function extractContact(text: string): CvStats['contact'] {
  const firstLine = text.split('\n').find((line) => line.trim())?.trim();
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/)?.[0];
  const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[A-Za-z0-9/_-]+/i)?.[0];

  return {
    name: firstLine && /^[A-Za-z ,.'-]{4,50}$/.test(firstLine) ? firstLine : undefined,
    email,
    phone,
    linkedin: linkedin ? (linkedin.startsWith('http') ? linkedin : `https://${linkedin}`) : undefined,
  };
}

export function buildCvStats(text: string): CvStats {
  const normalized = text.toLowerCase();
  const sectionCoverage = [
    { section: 'Summary', present: /summary|profile|objective/.test(normalized), weight: 0.15 },
    { section: 'Experience', present: /experience|employment|work history/.test(normalized), weight: 0.3 },
    { section: 'Education', present: /education|degree|university|school/.test(normalized), weight: 0.18 },
    { section: 'Skills', present: /skills|competencies|tools/.test(normalized), weight: 0.18 },
    { section: 'Projects', present: /projects|portfolio|case study/.test(normalized), weight: 0.09 },
    { section: 'Achievements', present: /awards|achievements|honors|certifications/.test(normalized), weight: 0.1 },
  ];

  return {
    wordCount: countWords(text),
    sentenceCount: countSentences(text),
    readability: estimateReadability(text),
    contact: extractContact(text),
    sectionCoverage,
    keywordMatches: keywordCatalog.map((keyword) => ({
      keyword,
      found: normalized.includes(keyword),
      weight: keyword.includes(' ') ? 2 : 1,
    })),
    experienceYears: 0,
  };
}

export function cvDataToText(cv: CVData) {
  const lines: string[] = [];
  const header = cv.header || {};
  if (header.full_name) lines.push(header.full_name);
  if ([header.email, header.phone, header.location].filter(Boolean).length) {
    lines.push([header.email, header.phone, header.location].filter(Boolean).join(' | '));
  }
  if ([header.linkedin, header.portfolio, header.website].filter(Boolean).length) {
    lines.push([header.linkedin, header.portfolio, header.website].filter(Boolean).join(' | '));
  }
  if (cv.summary) lines.push('', 'SUMMARY', cv.summary);
  if (cv.skills?.length) lines.push('', 'SKILLS', cv.skills.join(', '));
  if (cv.experience?.length) {
    lines.push('', 'EXPERIENCE');
    cv.experience.forEach((item) => {
      lines.push([item.role, item.company, item.start_date, item.end_date].filter(Boolean).join(' | '));
      if (item.description) lines.push(item.description);
      item.highlights?.forEach((highlight) => lines.push(`- ${highlight}`));
    });
  }
  if (cv.education?.length) {
    lines.push('', 'EDUCATION');
    cv.education.forEach((item) => {
      lines.push([item.degree, item.field, item.institution].filter(Boolean).join(' | '));
      item.highlights?.forEach((highlight) => lines.push(`- ${highlight}`));
    });
  }
  if (cv.projects?.length) {
    lines.push('', 'PROJECTS');
    cv.projects.forEach((item) => {
      if (item.name) lines.push(item.name);
      if (item.description) lines.push(item.description);
      if (item.technologies?.length) lines.push(`Tools: ${item.technologies.join(', ')}`);
    });
  }
  if (cv.achievements?.length) {
    lines.push('', 'ACHIEVEMENTS');
    cv.achievements.forEach((item) => {
      lines.push([item.title, item.issuer, item.date].filter(Boolean).join(' | '));
      if (item.description) lines.push(item.description);
    });
  }

  return lines.join('\n').trim();
}

export function normalizeCvRecord(record: CvRecord): CvRecord {
  return {
    ...record,
    fileName: record.fileName || record.file_name || 'cv.txt',
    fileSize: Number(record.fileSize ?? record.file_size ?? record.textContent?.length ?? record.text_content?.length ?? 0),
    mimeType: record.mimeType || record.mime_type || 'text/plain',
    uploadedAt: record.uploadedAt || record.uploaded_at || new Date().toISOString(),
    updatedAt: record.updatedAt || record.updated_at || null,
    textContent: record.textContent || record.text_content || '',
    jobTarget: record.jobTarget ?? record.job_target ?? null,
    jobDescription: record.jobDescription ?? record.job_description ?? null,
  };
}

function unwrapCvRecord(response: { record?: CvRecord } | CvRecord) {
  if ('record' in response && response.record) return response.record;
  return response as CvRecord;
}

export async function listCvRecords(token: string) {
  const response = await productApiRequest<{ records?: CvRecord[] } | CvRecord[]>('/cv', token);
  const records = Array.isArray(response) ? response : response.records ?? [];
  return records.map(normalizeCvRecord);
}

export async function getCvRecord(id: string, token: string) {
  const response = await productApiRequest<{ record?: CvRecord } | CvRecord>(
    `/cv/${encodeURIComponent(id)}`,
    token,
  );
  return normalizeCvRecord(unwrapCvRecord(response));
}

export async function saveCvRecord(input: SaveCvRecordInput, token: string) {
  const response = await productApiRequest<{ record?: CvRecord } | CvRecord>('/cv', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeCvRecord(unwrapCvRecord(response));
}

export async function deleteCvRecord(id: string, token: string) {
  await productApiRequest<{ success: true }>(`/cv/${encodeURIComponent(id)}`, token, {
    method: 'DELETE',
  });
}

export async function generateCvDraft(input: GenerateCVDraftInput, token: string) {
  return productApiRequest<GenerateCVDraftResponse>('/cv/ai/draft', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
