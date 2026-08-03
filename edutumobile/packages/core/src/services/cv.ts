import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AITailorResponse,
  CVData,
  CVMatchResult,
  CVSectionType,
  CVStructure,
  CVTemplate,
  CVTemplateDesign,
  UserCV,
} from '../types/cv';
import { toSafeUUID } from '../utils/auth';
import { requestProductApi, isAiBillingError, type GetAuthToken } from './productApi';
import {
  getDensityMetrics,
  getFontStack,
  resolveTemplateDesign,
  resolveTemplateDesignById,
  TEMPLATE_DESIGNS,
  type CVDensityMetrics,
} from './templateDesigns';

const TEMPLATE_STRUCTURE: CVStructure = {
  sections: [
    { id: 'header', type: 'header', label: 'Header' },
    { id: 'summary', type: 'summary', label: 'Summary' },
    { id: 'experience', type: 'experience', label: 'Experience', repeatable: true },
    { id: 'education', type: 'education', label: 'Education', repeatable: true },
    { id: 'skills', type: 'skills', label: 'Skills' },
    { id: 'projects', type: 'projects', label: 'Projects', repeatable: true },
    { id: 'achievements', type: 'achievements', label: 'Achievements', repeatable: true },
  ],
};

const SECTION_LABELS: Record<CVSectionType, string> = {
  header: 'Header',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  achievements: 'Achievements',
  research: 'Research',
  publications: 'Publications',
  references: 'References',
  transactions: 'Transactions',
};

const REPEATABLE_SECTIONS: CVSectionType[] = [
  'experience',
  'education',
  'projects',
  'achievements',
  'research',
  'publications',
  'references',
  'transactions',
];

/** A template's structure is its design's section list — one source of truth. */
function structureFromDesign(slug: string): CVStructure {
  const design = TEMPLATE_DESIGNS[slug];
  if (!design) return TEMPLATE_STRUCTURE;
  return {
    sections: design.sections.map((type) => ({
      id: type,
      type,
      label: SECTION_LABELS[type],
      repeatable: REPEATABLE_SECTIONS.includes(type),
    })),
  };
}

function mockTemplate(
  slug: string,
  name: string,
  category: string,
  description: string,
  isPremium = false,
): CVTemplate {
  return {
    id: slug,
    slug,
    name,
    category,
    description,
    structure_json: structureFromDesign(slug),
    is_premium: isPremium,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * The shipped template set. Each one resolves to a distinct design spec in
 * templateDesigns.ts, so picking a template genuinely changes the exported
 * document — descriptions here must stay true to that spec.
 */
const MOCK_TEMPLATES: CVTemplate[] = [
  mockTemplate(
    'minimal-ats',
    'Minimal ATS',
    'General',
    'Pure black on white with no rules or fills — the safest choice when an applicant tracking system reads first.',
  ),
  mockTemplate(
    'modern-professional',
    'Modern Professional',
    'Professional',
    'Teal accent rules and skill chips. Clean and current, for scholarships, internships and early-career roles.',
  ),
  mockTemplate(
    'academic-research',
    'Academic Research',
    'Academic',
    'Serif type and a centred header. Leads with education and research, and adds Publications and References sections.',
  ),
  mockTemplate(
    'bold-impact',
    'Bold Impact',
    'Professional',
    'Oversized name and boxed section labels in indigo. Built to be remembered in a stack of applications.',
  ),
  mockTemplate(
    'creative-portfolio',
    'Creative Portfolio',
    'Creative',
    'Violet header band with Projects promoted above Experience — for design, product, media and portfolio-led work.',
    true,
  ),
  mockTemplate(
    'executive',
    'Executive',
    'Professional',
    'Serif name beside a right-aligned contact column, compact spacing and Achievements up front. For a long track record.',
    true,
  ),
];

const LOCAL_CV_KEY_PREFIX = 'edutu:user_cvs:';

/**
 * Budget for the CV AI endpoints. requestProductApi defaults to 12s, which is
 * shorter than a routed LLM takes to rewrite a whole CV — the client aborted,
 * fell back to a local heuristic, and the user never saw what they paid for.
 */
const AI_CV_TIMEOUT_MS = 60000;

function getLocalKey(userId: string) {
  return `${LOCAL_CV_KEY_PREFIX}${toSafeUUID(userId)}`;
}

function emptyCVData(): CVData {
  return {
    header: {
      full_name: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      portfolio: '',
      website: '',
    },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    projects: [],
    achievements: [],
    research: [],
    publications: [],
    references: [],
    transactions: [],
  };
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function uniq(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => String(value || '').trim()).filter(Boolean)),
  );
}

function formatDate(input?: string | null) {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

async function readLocalCVs(userId: string): Promise<UserCV[]> {
  const raw = await AsyncStorage.getItem(getLocalKey(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as UserCV[];
  } catch {
    return [];
  }
}

async function writeLocalCVs(userId: string, cvs: UserCV[]) {
  await AsyncStorage.setItem(getLocalKey(userId), JSON.stringify(cvs));
}

async function readLocalCVById(cvId: string): Promise<UserCV | null> {
  const keys = await AsyncStorage.getAllKeys();
  const cvKeys = keys.filter((key) => key.startsWith(LOCAL_CV_KEY_PREFIX));
  for (const key of cvKeys) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    try {
      const items = JSON.parse(raw) as UserCV[];
      const found = items.find((item) => item.id === cvId);
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}

function mapTemplate(row: any): CVTemplate {
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'General',
    description: row.description,
    structure_json: (row.structure_json as CVStructure) || TEMPLATE_STRUCTURE,
    is_premium: Boolean(row.is_premium),
    slug: row.slug || undefined,
    thumbnail_url: row.thumbnail_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapUserCV(row: any): UserCV {
  return {
    id: row.id,
    user_id: row.user_id,
    template_id: row.template_id,
    name: row.name,
    data_json: (row.data_json as CVData) || emptyCVData(),
    is_primary: Boolean(row.is_primary),
    match_score: Number(row.match_score || 0),
    target_opportunity_id: row.target_opportunity_id || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildSummaryFromProfile(profile: any, prompt?: string) {
  const field = profile?.field_of_study ? sentenceCase(String(profile.field_of_study)) : '';
  const level = profile?.education_level ? String(profile.education_level).trim() : '';
  const institution = profile?.institution ? sentenceCase(String(profile.institution)) : '';

  // A single, grammatical opening sentence — never "Motivated currently targeting…".
  const role = field
    ? `${field} student`
    : level
      ? `${level} student`
      : 'motivated, results-driven candidate';
  const who = field || level ? `A focused ${role}` : 'A motivated, results-driven candidate';
  const at = institution ? ` at ${institution}` : '';
  const target = prompt?.trim();

  return target
    ? `${who}${at}, currently pursuing ${target}.`
    : `${who}${at} building a strong academic and professional profile.`;
}

function sentenceCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^\w|[\.\!\?]\s+\w)/g, (match) => match.toUpperCase());
}

function cleanText(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickMeaningfulKeywords(values: Array<string | null | undefined>, limit = 8) {
  const stopwords = new Set([
    'and', 'the', 'with', 'for', 'from', 'into', 'that', 'this', 'your', 'you', 'are', 'via', 'role', 'program',
    'opportunity', 'opportunities', 'student', 'students', 'project', 'projects', 'team', 'work', 'working',
    'experience', 'skills', 'skill', 'ability', 'career', 'goal', 'goals', 'opportunity', 'support', 'build',
  ]);

  const tokens = values
    .flatMap((value) => cleanText(value).toLowerCase().split(/\W+/))
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopwords.has(token));

  return uniq(tokens).slice(0, limit);
}

async function fetchProfile(supabase: SupabaseClient, userId: string) {
  const safeId = toSafeUUID(userId);
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', safeId)
    .maybeSingle();
  return data || null;
}

async function fetchGoals(supabase: SupabaseClient, userId: string) {
  const safeId = toSafeUUID(userId);
  const { data } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', safeId)
    .limit(5);
  return data || [];
}

export async function fetchCVTemplates(
  supabase: SupabaseClient,
  options?: { category?: string; includePremium?: boolean },
): Promise<CVTemplate[]> {
  try {
    let query = supabase.from('cv_templates').select('*').order('name');
    if (!options?.includePremium) query = query.eq('is_premium', false);
    if (options?.category) query = query.eq('category', options.category);

    const { data, error } = await query;
    if (error) throw error;

    // Dedupe on the resolved design, not the row id: legacy rows (t-1/t-2/t-3)
    // alias onto shipped slugs, and showing both would put two "Modern
    // Professional" cards in the gallery. The shipped catalogue wins, because
    // its description is guaranteed to match the design it renders.
    const shipped = new Set(MOCK_TEMPLATES.map((item) => item.id));
    const fromDb = (data || [])
      .map(mapTemplate)
      .filter((item) => !shipped.has(resolveTemplateDesign(item).slug));

    const merged = [...MOCK_TEMPLATES, ...fromDb];

    return merged.filter((template) => {
      if (!options?.includePremium && template.is_premium) return false;
      if (options?.category && template.category !== options.category) return false;
      return true;
    });
  } catch {
    let mocks = MOCK_TEMPLATES;
    if (!options?.includePremium) mocks = mocks.filter((item) => !item.is_premium);
    if (options?.category) mocks = mocks.filter((item) => item.category === options.category);
    return mocks;
  }
}

export async function fetchCVTemplateById(
  supabase: SupabaseClient,
  templateId: string,
): Promise<CVTemplate | null> {
  const templates = await fetchCVTemplates(supabase, { includePremium: true });
  return templates.find((template) => template.id === templateId) || null;
}

export async function fetchUserCVs(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserCV[]> {
  try {
    // user_cvs is keyed by the raw auth id (RLS compares it to the JWT `sub`),
    // unlike profiles/goals which use the hashed UUID.
    const { data, error } = await supabase
      .from('user_cvs')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    const remote = (data || []).map(mapUserCV);
    // Keep offline-saved CVs visible until they exist in the cloud — merged,
    // not either/or, so a CV whose cloud write failed doesn't vanish from the
    // list the moment the user also has cloud CVs.
    const local = await readLocalCVs(userId);
    const remoteIds = new Set(remote.map((cv) => cv.id));
    const pending = local.filter((cv) => !remoteIds.has(cv.id));
    if (!pending.length) return remote;
    return [...pending, ...remote].sort((a, b) =>
      (b.updated_at || '').localeCompare(a.updated_at || ''),
    );
  } catch {
    return readLocalCVs(userId);
  }
}

export async function fetchUserCV(
  supabase: SupabaseClient,
  cvId: string,
): Promise<UserCV | null> {
  try {
    const { data, error } = await supabase
      .from('user_cvs')
      .select('*')
      .eq('id', cvId)
      .single();

    if (error) throw error;
    return mapUserCV(data);
  } catch {
    return readLocalCVById(cvId);
  }
}

export async function createUserCV(
  supabase: SupabaseClient,
  userId: string,
  cv: Partial<UserCV>,
): Promise<UserCV> {
  const fallback: UserCV = {
    id: createId('cv'),
    user_id: userId,
    template_id: cv.template_id,
    name: cv.name || 'Untitled CV',
    data_json: cv.data_json || emptyCVData(),
    is_primary: cv.is_primary || false,
    match_score: cv.match_score || 0,
    target_opportunity_id: cv.target_opportunity_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('user_cvs')
      .insert({
        user_id: userId,
        template_id: cv.template_id,
        name: cv.name || 'Untitled CV',
        data_json: cv.data_json || emptyCVData(),
        is_primary: cv.is_primary || false,
        match_score: cv.match_score || 0,
        target_opportunity_id: cv.target_opportunity_id,
      })
      .select()
      .single();

    if (error) throw error;
    return mapUserCV(data);
  } catch {
    const existing = await readLocalCVs(userId);
    const next = [fallback, ...existing];
    await writeLocalCVs(userId, next);
    return fallback;
  }
}

export async function updateUserCV(
  supabase: SupabaseClient,
  cvId: string,
  updates: Partial<UserCV>,
): Promise<UserCV> {
  try {
    const { data, error } = await supabase
      .from('user_cvs')
      .update({
        name: updates.name,
        data_json: updates.data_json,
        is_primary: updates.is_primary,
        match_score: updates.match_score,
        target_opportunity_id: updates.target_opportunity_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cvId)
      .select()
      .single();

    if (error) throw error;
    return mapUserCV(data);
  } catch (error) {
    const current = await readLocalCVById(cvId);
    // A cloud CV isn't in local storage: surface the real failure instead of
    // a misleading "not found".
    if (!current) throw error;
    const updated: UserCV = {
      ...current,
      ...updates,
      data_json: updates.data_json || current.data_json,
      updated_at: new Date().toISOString(),
    };
    const userCvs = await readLocalCVs(current.user_id);
    const next = userCvs.map((item) => (item.id === cvId ? updated : item));
    await writeLocalCVs(current.user_id, next);
    return updated;
  }
}

export async function deleteUserCV(
  supabase: SupabaseClient,
  cvId: string,
): Promise<void> {
  let cloudDeleted = false;
  let cloudError: unknown = null;
  try {
    // .select('id') so an RLS-blocked delete (0 rows, no error) is
    // distinguishable from a real one.
    const { data, error } = await supabase
      .from('user_cvs')
      .delete()
      .eq('id', cvId)
      .select('id');
    if (error) throw error;
    cloudDeleted = (data || []).length > 0;
  } catch (error) {
    cloudError = error;
  }

  // Always drop any offline copy too: deleting a local-only id in the cloud
  // affects zero rows without an error, and the CV would resurrect on reload.
  const current = await readLocalCVById(cvId);
  if (current) {
    const userCvs = await readLocalCVs(current.user_id);
    await writeLocalCVs(
      current.user_id,
      userCvs.filter((item) => item.id !== cvId),
    );
    return;
  }

  if (!cloudDeleted) {
    // Nothing was deleted anywhere — surface it so the UI doesn't confirm a
    // delete that reappears on reload.
    throw cloudError instanceof Error
      ? cloudError
      : new Error('CV could not be deleted');
  }
}

export async function setPrimaryCV(
  supabase: SupabaseClient,
  userId: string,
  cvId: string,
): Promise<void> {
  try {
    await supabase
      .from('user_cvs')
      .update({ is_primary: false })
      .eq('user_id', userId);

    const { error } = await supabase
      .from('user_cvs')
      .update({ is_primary: true })
      .eq('id', cvId);

    if (error) throw error;
  } catch {
    const userCvs = await readLocalCVs(userId);
    const next = userCvs.map((item) => ({
      ...item,
      is_primary: item.id === cvId,
      updated_at: item.id === cvId ? new Date().toISOString() : item.updated_at,
    }));
    await writeLocalCVs(userId, next);
  }
}

// Pro status is NOT sourced here — it comes from the single shared `useProStatus`
// hook (RevenueCat on-device + profiles.is_pro + billing_entitlements) so every
// gate in the app agrees. This only reports the CV-specific one-off free trial.
export async function getCvTrialStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ cvTrialUsed: boolean }> {
  try {
    const data = await fetchProfile(supabase, userId);
    return { cvTrialUsed: Boolean(data?.cv_trial_used ?? false) };
  } catch {
    return { cvTrialUsed: false };
  }
}

export async function useCVTrial(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  try {
    const data = await fetchProfile(supabase, userId);
    if (!data) return true;
    if (data.cv_trial_used === true) return false;
    if (typeof data.cv_trial_used === 'undefined') return true;

    const { error } = await supabase
      .from('profiles')
      .update({ cv_trial_used: true })
      .eq('user_id', toSafeUUID(userId));
    return !error;
  } catch {
    return true;
  }
}

export async function upgradeToPro(): Promise<boolean> {
  return true;
}

export async function cancelPro(): Promise<boolean> {
  return true;
}

export async function generateAICVDraft(
  supabase: SupabaseClient,
  userId: string,
  options?: {
    linkedInUrl?: string;
    prompt?: string;
    currentData?: CVData;
    /** Identity from the auth session, used when the DB profile is missing/offline. */
    profileFallback?: { full_name?: string; email?: string; location?: string };
  },
): Promise<CVData> {
  const [profile, goals] = await Promise.all([
    fetchProfile(supabase, userId),
    fetchGoals(supabase, userId),
  ]);

  const current = options?.currentData || emptyCVData();
  const fallback = options?.profileFallback;
  const goalTitles = (goals || []).map((goal: any) => goal.title).filter(Boolean);
  const linkedInUrl = options?.linkedInUrl?.trim();
  const inferredName =
    profile?.full_name ||
    profile?.fullName ||
    current.header?.full_name ||
    fallback?.full_name ||
    '';
  const summaryPrompt = options?.prompt || goalTitles.slice(0, 2).join(', ');

  // Integrity: skills must be REAL competencies from the profile — never the
  // target keywords (scholarships/internships) the user is applying for.
  const mergedSkills = uniq([
    ...(current.skills || []),
    ...((profile?.skills as string[] | undefined) || []),
    ...((profile?.interests as string[] | undefined) || []),
  ]);
  const baseSummary = buildSummaryFromProfile(profile, summaryPrompt);
  const summary = [
    baseSummary,
    profile?.headline ? cleanText(profile.headline) : '',
    mergedSkills.length ? `Core strengths: ${mergedSkills.slice(0, 4).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Integrity: NEVER fabricate employers, roles, or descriptions the user did not
  // provide. Reuse only the experience the user has actually entered; otherwise emit
  // a single, clearly-labeled placeholder the user must fill in themselves.
  const experience = current.experience?.length
    ? current.experience
    : [
      {
        id: createId('exp'),
        company: '',
        role: '',
        start_date: '',
        end_date: '',
        description: '[Add your experience here] — replace this with a real role, internship, or volunteer position, including what you actually did.',
        highlights: [],
      },
    ];

  const education = current.education?.length
    ? current.education
    : [
      {
        id: createId('edu'),
        institution: profile?.institution || '',
        degree: profile?.education_level || 'Student',
        field: profile?.field_of_study || '',
        start_date: '',
        end_date: '',
        highlights: uniq([
          ...(goalTitles.slice(0, 3)),
          ...(Array.isArray(profile?.interests) ? profile.interests.slice(0, 2) : []),
        ]),
      },
    ];

  return {
    ...emptyCVData(),
    ...current,
    header: {
      ...emptyCVData().header,
      ...current.header,
      full_name: inferredName,
      email: current.header?.email || profile?.email || fallback?.email || '',
      location: current.header?.location || profile?.country || fallback?.location || '',
      linkedin: current.header?.linkedin || linkedInUrl || '',
    },
    summary,
    skills: mergedSkills,
    experience,
    education,
    // Integrity: never invent awards/accomplishments. Keep only what the user
    // entered; otherwise a single clearly-labeled placeholder they must edit.
    achievements:
      current.achievements?.length
        ? current.achievements
        : [
          {
            id: createId('ach'),
            title: '',
            description: '[Add an achievement here] — list a real award, certification, or accomplishment you have earned.',
          },
        ],
    // Integrity: never invent project work the user did not do. Keep only real
    // entries; otherwise a single clearly-labeled placeholder they must edit.
    projects: current.projects?.length
      ? current.projects
      : [
        {
          id: createId('proj'),
          name: '',
          description: '[Add a project here] — describe a real project you built or contributed to, and what you did.',
          technologies: [],
          start_date: '',
          end_date: '',
        },
      ],
  };
}

// ─── Backend AI (real LLM) ───────────────────────────────────────────────────
// These call the platform API (Gemini-backed /cv/ai/* routes) and fall back to
// the local heuristics above when offline or unauthenticated, so every flow
// keeps working without a network.

/** Ensure every repeatable section item has an id (backend AI output has none). */
function normalizeCVData(data: CVData): CVData {
  const withIds = <T extends { id?: string }>(items: T[] | undefined, prefix: string): T[] =>
    (items || []).map((item) => ({ ...item, id: item.id || createId(prefix) }));

  const base = emptyCVData();
  return {
    ...base,
    ...data,
    header: { ...base.header, ...(data.header || {}) } as CVData['header'],
    skills: uniq(data.skills || []),
    experience: withIds(data.experience, 'exp'),
    education: withIds(data.education, 'edu'),
    projects: withIds(data.projects, 'proj'),
    achievements: withIds(data.achievements, 'ach'),
  };
}

/** Strip a CVData down to the fields the backend AI contract understands. */
function toBackendCVPayload(data: CVData) {
  return {
    header: data.header,
    summary: data.summary,
    experience: data.experience,
    education: data.education,
    skills: data.skills,
    projects: data.projects,
    achievements: data.achievements,
  };
}

function buildProfileContext(
  profile: any,
  fallback?: { full_name?: string; email?: string; location?: string },
) {
  if (!profile && !fallback) return undefined;
  const context = {
    full_name: profile?.full_name || profile?.fullName || fallback?.full_name || undefined,
    email: profile?.email || fallback?.email || undefined,
    country: profile?.country || undefined,
    location: profile?.location || profile?.country || fallback?.location || undefined,
    institution: profile?.institution || profile?.school || undefined,
    field_of_study: profile?.field_of_study || profile?.courseOfStudy || undefined,
    education_level: profile?.education_level || profile?.degree || undefined,
    interests: Array.isArray(profile?.interests) ? profile.interests : undefined,
    skills: Array.isArray(profile?.skills) ? profile.skills : undefined,
  };
  return context;
}

export interface CVDraftResult {
  cv: CVData;
  suggestions: string[];
  /** 'ai' when the backend LLM produced it, 'local' when the heuristic fallback ran. */
  source: 'ai' | 'local';
}

/**
 * Generate a CV draft with the backend LLM (profile + goals aware); falls back
 * to the local heuristic so the flow always completes.
 */
export async function generateCVDraftWithAI(
  supabase: SupabaseClient,
  userId: string,
  options?: {
    linkedInUrl?: string;
    prompt?: string;
    currentData?: CVData;
    getToken?: GetAuthToken;
    /** Identity from the auth session, used when the DB profile is missing/offline. */
    profileFallback?: { full_name?: string; email?: string; location?: string };
  },
): Promise<CVDraftResult> {
  if (options?.getToken) {
    try {
      const [profile, goals] = await Promise.all([
        fetchProfile(supabase, userId),
        fetchGoals(supabase, userId),
      ]);

      const response = await requestProductApi<{ cv?: CVData; suggestions?: string[] }>(
        '/cv/ai/draft',
        {
          method: 'POST',
          body: JSON.stringify({
            profile: buildProfileContext(profile, options.profileFallback),
            goals: (goals || []).map((goal: any) => ({
              title: goal.title,
              description: goal.description,
              progress: goal.progress,
            })),
            currentCV: options.currentData ? toBackendCVPayload(options.currentData) : undefined,
            prompt: options.prompt,
            linkedInUrl: options.linkedInUrl,
          }),
        },
        options.getToken,
        AI_CV_TIMEOUT_MS,
      );

      if (response?.cv) {
        const cv = normalizeCVData(response.cv);
        // Guarantee identity fields even if the model omitted them.
        const header: NonNullable<CVData['header']> = {
          ...(cv.header || emptyCVData().header!),
        };
        if (!header.full_name && options.profileFallback?.full_name) {
          header.full_name = options.profileFallback.full_name;
        }
        if (!header.email && options.profileFallback?.email) {
          header.email = options.profileFallback.email;
        }
        if (options.linkedInUrl && !header.linkedin) {
          header.linkedin = options.linkedInUrl.trim();
        }
        cv.header = header;
        return {
          cv,
          suggestions: Array.isArray(response.suggestions) ? response.suggestions : [],
          source: 'ai',
        };
      }
    } catch (error) {
      // Billing refusals must reach the UI (wallet/paywall CTA); anything
      // else falls through to the local heuristic.
      if (isAiBillingError(error)) throw error;
    }
  }

  const cv = await generateAICVDraft(supabase, userId, options);
  return { cv: normalizeCVData(cv), suggestions: [], source: 'local' };
}

export interface LinkedInFileImportResult {
  cv: CVData;
  /** 'export-zip' | 'export-pdf' | ... */
  source: string;
  imported: boolean;
}

/**
 * First-party LinkedIn import: upload the user's own export (profile "Save to
 * PDF" or the "Get a copy of your data" ZIP) to the backend, which parses it
 * with no third-party scraper. Uses its own multipart fetch (not
 * requestProductApi, which forces JSON + swallows error messages).
 */
export async function importLinkedInFromFile(
  file: { uri: string; name: string; mimeType?: string },
  getToken: GetAuthToken,
): Promise<LinkedInFileImportResult> {
  const base = (
    process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com'
  ).replace(/\/$/, '');
  const token = await getToken();
  if (!token) throw new Error('You need to be signed in to import.');

  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.name || 'linkedin-export',
    type: file.mimeType || 'application/octet-stream',
  } as unknown as Blob);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${base}/cv/ai/import-linkedin-file`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = Array.isArray(data?.message)
        ? data.message.join(' ')
        : data?.message;
      throw new Error(message || 'We could not read that LinkedIn export file.');
    }
    if (!data?.cv) {
      throw new Error('We could not read that LinkedIn export file.');
    }
    return {
      cv: normalizeCVData(data.cv as CVData),
      source: String(data.source || 'export'),
      imported: Boolean(data.imported),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Rewrite just the professional summary with the backend LLM, using the rest
 * of the CV as context. Local fallback composes one from what's already there.
 */
export async function improveCVSummaryWithAI(
  supabase: SupabaseClient,
  userId: string,
  currentData: CVData,
  getToken?: GetAuthToken,
): Promise<{ summary: string; source: 'ai' | 'local' }> {
  if (getToken) {
    try {
      const response = await requestProductApi<{ cv?: CVData }>(
        '/cv/ai/draft',
        {
          method: 'POST',
          body: JSON.stringify({
            currentCV: toBackendCVPayload(currentData),
            prompt:
              'Rewrite ONLY the professional summary: 2-3 confident, specific sentences grounded in the experience, education, and skills provided. Keep every other section unchanged.',
          }),
        },
        getToken,
        AI_CV_TIMEOUT_MS,
      );
      const summary = response?.cv?.summary?.trim();
      if (summary) return { summary, source: 'ai' };
    } catch (error) {
      if (isAiBillingError(error)) throw error;
      // otherwise fall through to the local composer
    }
  }

  const skills = (currentData.skills || []).slice(0, 4).join(', ');
  const topRole = currentData.experience?.[0];
  const topEdu = currentData.education?.[0];
  const summary = [
    currentData.summary?.trim() || '',
    topRole?.role ? `Experience as ${topRole.role}${topRole.company ? ` at ${topRole.company}` : ''}.` : '',
    topEdu?.field || topEdu?.degree
      ? `Background in ${topEdu?.field || topEdu?.degree}${topEdu?.institution ? ` (${topEdu.institution})` : ''}.`
      : '',
    skills ? `Core strengths: ${skills}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    summary: summary || 'Motivated candidate focused on growth, execution, and measurable results.',
    source: 'local',
  };
}

export async function matchCVToOpportunity(
  supabase: SupabaseClient,
  cvId: string,
  opportunityId: string,
): Promise<CVMatchResult> {
  const cv = await fetchUserCV(supabase, cvId);
  if (!cv) throw new Error('CV not found');

  const { data: opportunity, error: oppError } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .single();

  if (oppError) throw oppError;

  const opportunityTerms = uniq([
    opportunity.title,
    opportunity.description,
    ...(opportunity.requirements || []),
    ...(opportunity.skills || []),
    ...(opportunity.tags || []),
    opportunity.category,
    opportunity.organization,
  ]
    .join(' ')
    .toLowerCase()
    .split(/\W+/)
    .filter((word: string) => word.length > 3));

  const cvTerms = uniq([
    cv.data_json.summary,
    ...(cv.data_json.skills || []),
    ...(cv.data_json.experience || []).flatMap((item) => [
      item.role,
      item.company,
      item.description,
      ...(item.highlights || []),
    ]),
    ...(cv.data_json.projects || []).flatMap((item) => [
      item.name,
      item.description,
      ...(item.technologies || []),
    ]),
  ]
    .join(' ')
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 3));

  const matched = opportunityTerms.filter((term) => cvTerms.includes(term));
  const missing = opportunityTerms.filter((term) => !cvTerms.includes(term));
  const score = Math.round(
    (matched.length / Math.max(opportunityTerms.length, 1)) * 100,
  );

  const suggestions: string[] = [];
  if (missing.length) {
    suggestions.push(`Highlight missing keywords where truthful: ${missing.slice(0, 6).join(', ')}`);
  }
  if (!cv.data_json.summary) {
    suggestions.push('Add a short summary aligned to the opportunity goals.');
  }
  if (!(cv.data_json.experience || []).length) {
    suggestions.push('Add at least one experience entry to strengthen the application.');
  }

  return {
    score,
    matched_keywords: matched.slice(0, 12),
    missing_keywords: missing.slice(0, 12),
    suggestions,
    opportunity_id: opportunityId,
    opportunity_title: opportunity.title,
  };
}

export async function tailorCVForOpportunity(
  supabase: SupabaseClient,
  options: {
    userId: string;
    currentCVData: CVData;
    opportunityId: string;
    getToken?: GetAuthToken;
  },
): Promise<AITailorResponse> {
  const { data: opportunity, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', options.opportunityId)
    .single();

  if (error) throw error;

  // Real LLM tailoring via the platform API; heuristic below stays as fallback.
  if (options.getToken) {
    try {
      const response = await requestProductApi<AITailorResponse>(
        '/cv/ai/tailor',
        {
          method: 'POST',
          body: JSON.stringify({
            currentCV: toBackendCVPayload(options.currentCVData || emptyCVData()),
            opportunity: {
              id: opportunity.id,
              title: opportunity.title,
              organization: opportunity.organization,
              category: opportunity.category,
              description:
                typeof opportunity.description === 'string'
                  ? opportunity.description.slice(0, 4000)
                  : undefined,
              requirements: opportunity.requirements || undefined,
              skills: opportunity.skills || undefined,
              benefits: opportunity.benefits || undefined,
              tags: opportunity.tags || undefined,
              deadline: opportunity.deadline ?? null,
            },
          }),
        },
        options.getToken,
        // A full LLM CV rewrite plus the 10-item ATS checklist routinely runs
        // 20-45s. The 12s default aborted it client-side while the server kept
        // going (and charged), so every live tailor silently degraded to the
        // local heuristic below — which carries no atsChecklist, proposedTitle
        // or quantifyQuestions, and the ATS card never rendered. Real budget.
        AI_CV_TIMEOUT_MS,
      );

      if (response?.tailored_cv) {
        const atsChecklist = Array.isArray(response.atsChecklist) ? response.atsChecklist : [];
        if (__DEV__ && atsChecklist.length === 0) {
          // The backend's normalizeTailorResult guarantees 10 items on both the
          // LLM and fallback paths, so an empty checklist here means the shape
          // changed or something stripped it. Never fail silently again.
          console.warn(
            '[cv] tailor response arrived without atsChecklist — the ATS card will not render.',
            { keys: Object.keys(response) },
          );
        }
        return {
          ...response,
          tailored_cv: normalizeCVData(response.tailored_cv),
          improvements: Array.isArray(response.improvements) ? response.improvements : [],
          matched_keywords: Array.isArray(response.matched_keywords) ? response.matched_keywords : [],
          missing_keywords: Array.isArray(response.missing_keywords) ? response.missing_keywords : [],
          atsChecklist,
        };
      }
      if (__DEV__) {
        console.warn(
          '[cv] /cv/ai/tailor returned no tailored_cv — falling back to the local heuristic (no ATS checklist).',
        );
      }
    } catch (error) {
      if (isAiBillingError(error)) throw error;
      if (__DEV__) {
        console.warn('[cv] /cv/ai/tailor failed — falling back to the local heuristic.', error);
      }
      // otherwise fall through to the local heuristic
    }
  }

  const baseCv = options.currentCVData || emptyCVData();
  const opportunityKeywords = pickMeaningfulKeywords([
    ...(opportunity.skills || []),
    ...(opportunity.requirements || []),
    ...(opportunity.tags || []),
    opportunity.category,
    opportunity.organization,
    opportunity.title,
    opportunity.description,
  ], 20);

  const currentSkills = uniq(baseCv.skills || []);
  const matchedSkills = currentSkills.filter((skill) =>
    opportunityKeywords.some((term) => term.toLowerCase().includes(skill.toLowerCase())),
  );
  const missingKeywords = opportunityKeywords.filter(
    (term) =>
      !currentSkills.some((skill) => term.toLowerCase().includes(skill.toLowerCase())),
  );

  const roleHint = opportunity.category ? sentenceCase(opportunity.category) : 'this opportunity';
  const tailoredSummary = [
    `Targeting ${opportunity.title} at ${opportunity.organization || 'the organization'}.`,
    baseCv.summary || '',
    matchedSkills.length
      ? `Relevant strengths include ${matchedSkills.slice(0, 4).join(', ')}.`
      : `Position the strongest truthful experience around ${roleHint}.`,
  ]
    .filter(Boolean)
    .join(' ');

  const tailoredCv: CVData = {
    ...baseCv,
    summary: tailoredSummary.trim(),
    skills: uniq([...currentSkills, ...matchedSkills]).slice(0, 16),
    projects: (baseCv.projects || []).map((project) => ({
      ...project,
      description:
        project.description ||
        `Relevant project experience aligned with ${opportunity.title}.`,
    })),
    experience: (baseCv.experience || []).map((item) => ({
      ...item,
      description:
        item.description ||
        `Experience positioned for ${opportunity.title}, emphasizing ${matchedSkills.slice(0, 3).join(', ') || 'transferable strengths'}.`,
    })),
  };

  const matchScore = Math.min(
    100,
    Math.max(35, Math.round((matchedSkills.length / Math.max(opportunityKeywords.length, 1)) * 100) + 35),
  );

  return {
    tailored_cv: tailoredCv,
    match_score: matchScore,
    improvements: [
      `Tailored summary toward ${opportunity.title}.`,
      matchedSkills.length
        ? `Emphasized matched skills: ${matchedSkills.slice(0, 4).join(', ')}.`
        : 'Add more directly relevant skills or project keywords.',
      missingKeywords.length
        ? `Review these missing areas: ${missingKeywords.slice(0, 5).join(', ')}.`
        : 'Good keyword coverage for this opportunity.',
    ],
    matched_keywords: matchedSkills,
    missing_keywords: missingKeywords.slice(0, 10),
  };
}

/**
 * Generate a 5-paragraph, <400-word cover letter for an opportunity via the
 * backend LLM. No local fallback — callers surface errors (billing errors are
 * rethrown so the paywall CTA can appear, like the other AI flows).
 */
export async function generateCoverLetterWithAI(options: {
  opportunityId: string;
  currentCVData: CVData;
  cvId?: string;
  getToken: GetAuthToken;
}): Promise<string> {
  const response = await requestProductApi<{ coverLetter?: string }>(
    '/cv/ai/cover-letter',
    {
      method: 'POST',
      body: JSON.stringify({
        opportunityId: options.opportunityId,
        cvId: options.cvId,
        currentCV: toBackendCVPayload(options.currentCVData || emptyCVData()),
      }),
    },
    options.getToken,
    AI_CV_TIMEOUT_MS,
  );

  const letter = response?.coverLetter?.trim();
  if (!letter) throw new Error('Cover letter came back empty');
  return letter;
}

export function buildCVText(cv: Partial<UserCV>) {
  const data = cv.data_json || emptyCVData();
  const lines: string[] = [];

  lines.push(data.header?.full_name || cv.name || 'Untitled CV');
  lines.push(
    [
      data.header?.email,
      data.header?.phone,
      data.header?.location,
      data.header?.linkedin,
      data.header?.portfolio || data.header?.website,
    ]
      .filter(Boolean)
      .join(' | '),
  );

  if (data.summary) {
    lines.push('');
    lines.push('SUMMARY');
    lines.push(data.summary);
  }

  if ((data.skills || []).length) {
    lines.push('');
    lines.push('SKILLS');
    lines.push((data.skills || []).join(', '));
  }

  if ((data.experience || []).length) {
    lines.push('');
    lines.push('EXPERIENCE');
    for (const item of data.experience || []) {
      lines.push(
        `${item.role} - ${item.company} (${formatDate(item.start_date)} - ${item.current ? 'Present' : formatDate(item.end_date)})`,
      );
      if (item.location) lines.push(item.location);
      if (item.description) lines.push(item.description);
      if (item.highlights?.filter(Boolean).length) lines.push(`Highlights: ${item.highlights.filter(Boolean).join(', ')}`);
      lines.push('');
    }
  }

  if ((data.education || []).length) {
    lines.push('EDUCATION');
    for (const item of data.education || []) {
      lines.push(
        `${item.degree}${item.field ? `, ${item.field}` : ''} - ${item.institution}`,
      );
      lines.push(
        `${formatDate(item.start_date)} - ${formatDate(item.end_date)}`.trim(),
      );
      if (item.highlights?.filter(Boolean).length) lines.push(`Highlights: ${item.highlights.filter(Boolean).join(', ')}`);
      lines.push('');
    }
  }

  if ((data.projects || []).length) {
    lines.push('PROJECTS');
    for (const item of data.projects || []) {
      lines.push(item.name);
      lines.push(item.description);
      if (item.technologies?.length) lines.push(`Technologies: ${item.technologies.join(', ')}`);
      if (item.url) lines.push(item.url);
      lines.push('');
    }
  }

  if ((data.achievements || []).length) {
    lines.push('ACHIEVEMENTS');
    for (const item of data.achievements || []) {
      lines.push(`${item.title}${item.issuer ? ` - ${item.issuer}` : ''}`);
      if (item.description) lines.push(item.description);
      lines.push('');
    }
  }

  return lines.filter(Boolean).join('\n');
}

export async function shareCV(cv: Partial<UserCV>) {
  const message = buildCVText(cv);
  await Share.share({
    title: cv.name || 'My CV',
    message,
  });
}

// ─── PDF/HTML export ─────────────────────────────────────────────────────────

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dateRange(start?: string | null, end?: string | null, current?: boolean) {
  const from = formatDate(start);
  const to = current ? 'Present' : formatDate(end);
  if (!from && !to) return '';
  return [from, to].filter(Boolean).join(' – ');
}

/** Heading CSS for the four section-rule treatments. */
function sectionHeadingCss(design: CVTemplateDesign, metrics: CVDensityMetrics): string {
  const shared = `font-size: ${design.sectionCase === 'upper' ? 12 : 13.5}px; font-weight: 700; letter-spacing: ${design.sectionCase === 'upper' ? '1.4px' : '0.2px'}; text-transform: ${design.sectionCase === 'upper' ? 'uppercase' : 'none'}; margin: ${metrics.sectionGap}px 0 ${Math.round(metrics.itemGap * 0.8)}px;`;

  switch (design.sectionRule) {
    case 'underline':
      return `h2 { ${shared} color: ${design.accent}; border-bottom: 1.5px solid ${design.accent}; padding-bottom: 3px; }`;
    case 'tick':
      return `h2 { ${shared} color: ${design.accent}; border-left: 3px solid ${design.accent}; padding-left: 8px; }`;
    case 'boxed':
      return `h2 { ${shared} color: ${design.accent}; background: ${design.accentSoft}; display: inline-block; padding: 4px 10px; border-radius: 4px; }`;
    case 'none':
    default:
      return `h2 { ${shared} color: ${design.ink}; }`;
  }
}

/** Header markup + CSS for the four header treatments. */
function renderHeader(
  design: CVTemplateDesign,
  metrics: CVDensityMetrics,
  name: string,
  contactParts: string[],
): { css: string; html: string } {
  const nameHtml = `<h1>${escapeHtml(name)}</h1>`;
  const inlineContact = contactParts.map(escapeHtml).join(' &nbsp;•&nbsp; ');

  const baseCss = `h1 { font-family: ${getFontStack(design.displayFont)}; font-size: ${metrics.nameSize}px; font-weight: 700; letter-spacing: 0.2px; color: ${design.ink}; }
  .contact { margin-top: 5px; color: ${design.muted}; font-size: ${metrics.baseFontSize - 1}px; }`;

  switch (design.headerStyle) {
    case 'centered':
      return {
        css: `${baseCss}
  .hdr { text-align: center; padding-bottom: ${Math.round(metrics.sectionGap * 0.5)}px; border-bottom: 1px solid ${design.accent}; }`,
        html: `<header class="hdr">${nameHtml}${inlineContact ? `<div class="contact">${inlineContact}</div>` : ''}</header>`,
      };

    case 'band':
      // Negative margins bleed the accent band to the page edge, then restore
      // the page gutter inside it.
      return {
        css: `${baseCss}
  h1 { color: #FFFFFF; }
  .hdr { background: ${design.accent}; margin: -${metrics.pagePaddingY}px -${metrics.pagePaddingX}px ${metrics.sectionGap}px; padding: ${metrics.pagePaddingY}px ${metrics.pagePaddingX}px ${Math.round(metrics.pagePaddingY * 0.7)}px; }
  .hdr .contact { color: rgba(255,255,255,0.88); }`,
        html: `<header class="hdr">${nameHtml}${inlineContact ? `<div class="contact">${inlineContact}</div>` : ''}</header>`,
      };

    case 'split':
      return {
        css: `${baseCss}
  .hdr { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; padding-bottom: ${Math.round(metrics.sectionGap * 0.5)}px; border-bottom: 2px solid ${design.accent}; }
  .hdr .contact { margin-top: 0; text-align: right; line-height: 1.55; }
  .hdr .contact div { white-space: nowrap; }`,
        html: `<header class="hdr"><div>${nameHtml}</div>${
          contactParts.length
            ? `<div class="contact">${contactParts.map((part) => `<div>${escapeHtml(part)}</div>`).join('')}</div>`
            : ''
        }</header>`,
      };

    case 'left':
    default:
      return {
        css: baseCss,
        html: `<header class="hdr">${nameHtml}${inlineContact ? `<div class="contact">${inlineContact}</div>` : ''}</header>`,
      };
  }
}

/** Skills markup for the three skill treatments. `inline` is the ATS-safest. */
function renderSkills(design: CVTemplateDesign, skills: string[]): string {
  if (!skills.length) return '';
  switch (design.skillStyle) {
    case 'chips':
      return `<div class="skills">${skills.map((s) => `<span class="skill">${escapeHtml(s)}</span>`).join('')}</div>`;
    case 'bulleted':
      return `<ul class="skill-list">${skills.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`;
    case 'inline':
    default:
      return `<p>${skills.map(escapeHtml).join(' &nbsp;·&nbsp; ')}</p>`;
  }
}

/**
 * Renders a print-friendly resume as HTML for expo-print's printToFileAsync,
 * styled by the chosen template's design spec.
 *
 * Every template stays single-column with semantic headings so ATS parsers
 * can read it; the spec varies typography, colour, header treatment, section
 * rules, density and section order. Pass `design` explicitly when the caller
 * already resolved it (the preview does, so both agree); otherwise it is
 * derived from `cv.template_id`.
 */
export function buildCVHtml(cv: Partial<UserCV>, design?: CVTemplateDesign | null): string {
  const spec = design || resolveTemplateDesignById(cv.template_id);
  const metrics = getDensityMetrics(spec.density);
  const data = cv.data_json || emptyCVData();
  const header: NonNullable<CVData['header']> = data.header || emptyCVData().header!;

  const contactParts = [
    header.email,
    header.phone,
    header.location,
    header.linkedin,
    header.portfolio || header.website,
  ].filter(Boolean) as string[];

  const section = (title: string, body: string) =>
    body ? `<section><h2>${escapeHtml(title)}</h2>${body}</section>` : '';

  const bullets = (items?: string[] | null) => {
    const clean = (items || []).map((h) => (h || '').trim()).filter(Boolean);
    return clean.length
      ? `<ul>${clean.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
      : '';
  };

  const experience = (data.experience || [])
    .filter((item) => item.role || item.company)
    .map((item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.role || '')}</strong><span>${escapeHtml(dateRange(item.start_date, item.end_date, item.current))}</span></div>
        <div class="sub">${escapeHtml([item.company, item.location].filter(Boolean).join(' · '))}</div>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
        ${bullets(item.highlights)}
      </div>`)
    .join('');

  const education = (data.education || [])
    .filter((item) => item.institution || item.degree)
    .map((item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml([item.degree, item.field].filter(Boolean).join(', '))}</strong><span>${escapeHtml(dateRange(item.start_date, item.end_date))}</span></div>
        <div class="sub">${escapeHtml(item.institution || '')}${item.gpa ? ` · GPA ${escapeHtml(item.gpa)}` : ''}</div>
        ${bullets(item.highlights)}
      </div>`)
    .join('');

  const projects = (data.projects || [])
    .filter((item) => item.name)
    .map((item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(dateRange(item.start_date, item.end_date))}</span></div>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
        ${item.technologies?.length ? `<div class="sub">${escapeHtml(item.technologies.join(', '))}</div>` : ''}
        ${item.url ? `<div class="sub">${escapeHtml(item.url)}</div>` : ''}
      </div>`)
    .join('');

  const achievements = (data.achievements || [])
    .filter((item) => item.title)
    .map((item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.title)}</strong>${item.date ? `<span>${escapeHtml(formatDate(item.date))}</span>` : ''}</div>
        ${item.issuer ? `<div class="sub">${escapeHtml(item.issuer)}</div>` : ''}
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      </div>`)
    .join('');

  const research = (data.research || [])
    .filter((item) => item.title || item.institution)
    .map((item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.title || '')}</strong><span>${escapeHtml(dateRange(item.start_date, item.end_date))}</span></div>
        <div class="sub">${escapeHtml([item.role, item.institution].filter(Boolean).join(' · '))}</div>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      </div>`)
    .join('');

  const publications = (data.publications || [])
    .filter((item) => item.title)
    .map((item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.title)}</strong>${item.date ? `<span>${escapeHtml(formatDate(item.date))}</span>` : ''}</div>
        ${item.journal || item.coauthors?.length
          ? `<div class="sub">${escapeHtml([item.journal, (item.coauthors || []).join(', ')].filter(Boolean).join(' · '))}</div>`
          : ''}
        ${item.url ? `<div class="sub">${escapeHtml(item.url)}</div>` : ''}
      </div>`)
    .join('');

  const references = (data.references || [])
    .filter((item) => item.name)
    .map((item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.name)}</strong></div>
        <div class="sub">${escapeHtml([item.title, item.organization].filter(Boolean).join(', '))}</div>
        ${item.email || item.phone
          ? `<div class="sub">${escapeHtml([item.email, item.phone].filter(Boolean).join(' · '))}</div>`
          : ''}
      </div>`)
    .join('');

  const headerParts = renderHeader(
    spec,
    metrics,
    header.full_name || cv.name || 'Untitled CV',
    contactParts,
  );

  // Section order comes from the template spec, so "Academic" really does lead
  // with education and research while "Creative" leads with projects.
  const sectionHtml: Partial<Record<CVSectionType, string>> = {
    summary: section('Summary', data.summary ? `<p>${escapeHtml(data.summary)}</p>` : ''),
    skills: section('Skills', renderSkills(spec, (data.skills || []).filter(Boolean))),
    experience: section('Experience', experience),
    education: section('Education', education),
    projects: section('Projects', projects),
    achievements: section('Achievements', achievements),
    research: section('Research', research),
    publications: section('Publications', publications),
    references: section('References', references),
  };

  const body = spec.sections
    .filter((type) => type !== 'header')
    .map((type) => sectionHtml[type] || '')
    .join('\n  ');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${getFontStack(spec.bodyFont)}; color: ${spec.ink}; font-size: ${metrics.baseFontSize}px; line-height: ${metrics.lineHeight}; padding: ${metrics.pagePaddingY}px ${metrics.pagePaddingX}px; }
  ${headerParts.css}
  ${sectionHeadingCss(spec, metrics)}
  section { page-break-inside: auto; }
  .item { margin-bottom: ${metrics.itemGap}px; page-break-inside: avoid; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .row span { color: ${spec.muted}; font-size: ${metrics.baseFontSize - 1.5}px; white-space: nowrap; }
  .sub { color: ${spec.muted}; font-size: ${metrics.baseFontSize - 1}px; margin-top: 1px; }
  p { margin-top: 3px; }
  ul { margin: 4px 0 0 16px; }
  li { margin-bottom: 2px; }
  .skill-list { columns: 2; margin-top: 2px; }
  .skills { display: flex; flex-wrap: wrap; gap: 6px; }
  .skill { border: 1px solid ${spec.accent}; color: ${spec.accent}; background: ${spec.accentSoft}; border-radius: 999px; padding: 2px 10px; font-size: ${metrics.baseFontSize - 1.5}px; }
</style>
</head>
<body>
  ${headerParts.html}
  ${body}
</body>
</html>`;
}
