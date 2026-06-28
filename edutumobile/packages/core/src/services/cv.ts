import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AITailorResponse,
  CVData,
  CVMatchResult,
  CVStructure,
  CVTemplate,
  UserCV,
} from '../types/cv';
import { toSafeUUID } from '../utils/auth';

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

const MOCK_TEMPLATES: CVTemplate[] = [
  {
    id: 't-1',
    name: 'Modern Professional',
    category: 'Professional',
    description: 'Clean single-column layout for scholarships, internships, and early-career roles.',
    structure_json: TEMPLATE_STRUCTURE,
    is_premium: false,
    thumbnail_url:
      'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=500&auto=format&fit=crop&q=60',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 't-2',
    name: 'Academic Research',
    category: 'Academic',
    description: 'Stronger focus on education, research, and publications.',
    structure_json: TEMPLATE_STRUCTURE,
    is_premium: false,
    thumbnail_url:
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=500&auto=format&fit=crop&q=60',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 't-3',
    name: 'Creative Portfolio',
    category: 'Creative',
    description: 'Balanced structure for product, design, media, and portfolio-heavy work.',
    structure_json: TEMPLATE_STRUCTURE,
    is_premium: false,
    thumbnail_url:
      'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=500&auto=format&fit=crop&q=60',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const LOCAL_CV_KEY_PREFIX = 'edutu:user_cvs:';

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
  const parts: string[] = [];
  if (profile?.field_of_study) {
    parts.push(`${profile.field_of_study} student`);
  }
  if (profile?.education_level) {
    parts.push(`${profile.education_level} level`);
  }
  if (Array.isArray(profile?.skills) && profile.skills.length) {
    parts.push(`with strengths in ${profile.skills.slice(0, 4).join(', ')}`);
  }
  if (Array.isArray(profile?.interests) && profile.interests.length) {
    parts.push(`interested in ${profile.interests.slice(0, 3).join(', ')}`);
  }
  if (prompt) {
    parts.push(`currently targeting ${prompt.trim()}`);
  }
  if (!parts.length) {
    return 'Motivated student building a strong academic and professional profile.';
  }
  return `Motivated ${parts.join(' ')}.`;
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

function buildExperienceHighlights(skills: string[], goals: string[]) {
  const combined = uniq([...skills, ...goals]).slice(0, 6);
  return combined.length ? combined : ['Execution', 'Research', 'Communication'];
}

function buildProjectIdea(profile: any, prompt?: string) {
  const focus = cleanText(prompt || profile?.interests?.[0] || profile?.field_of_study || 'career growth');
  return {
    id: createId('proj'),
    name: `${sentenceCase(focus)} project`,
    description: `A focused project that demonstrates measurable progress toward ${focus}.`,
    technologies: uniq([
      ...(Array.isArray(profile?.skills) ? profile.skills : []),
      ...(Array.isArray(profile?.interests) ? profile.interests.slice(0, 2) : []),
    ]).slice(0, 4),
    start_date: '',
    end_date: '',
  };
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

    const fromDb = (data || []).map(mapTemplate);
    const merged = [...fromDb];
    for (const template of MOCK_TEMPLATES) {
      if (!merged.some((item) => item.id === template.id)) merged.push(template);
    }

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
    const { data, error } = await supabase
      .from('user_cvs')
      .select('*')
      .eq('user_id', toSafeUUID(userId))
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapUserCV);
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
    user_id: toSafeUUID(userId),
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
        user_id: toSafeUUID(userId),
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
  } catch {
    const current = await readLocalCVById(cvId);
    if (!current) throw new Error('CV not found');
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
  try {
    const { error } = await supabase.from('user_cvs').delete().eq('id', cvId);
    if (error) throw error;
  } catch {
    const current = await readLocalCVById(cvId);
    if (!current) return;
    const userCvs = await readLocalCVs(current.user_id);
    await writeLocalCVs(
      current.user_id,
      userCvs.filter((item) => item.id !== cvId),
    );
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
      .eq('user_id', toSafeUUID(userId));

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

export async function getUserProStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ isPro: boolean; cvTrialUsed: boolean }> {
  try {
    const data = await fetchProfile(supabase, userId);
    return {
      isPro: Boolean(data?.is_pro ?? true),
      cvTrialUsed: Boolean(data?.cv_trial_used ?? false),
    };
  } catch {
    return { isPro: true, cvTrialUsed: false };
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
  options?: { linkedInUrl?: string; prompt?: string; currentData?: CVData },
): Promise<CVData> {
  const [profile, goals] = await Promise.all([
    fetchProfile(supabase, userId),
    fetchGoals(supabase, userId),
  ]);

  const current = options?.currentData || emptyCVData();
  const goalTitles = (goals || []).map((goal: any) => goal.title).filter(Boolean);
  const linkedInUrl = options?.linkedInUrl?.trim();
  const inferredName =
    profile?.full_name ||
    profile?.fullName ||
    current.header?.full_name ||
    '';
  const summaryPrompt = options?.prompt || goalTitles.slice(0, 2).join(', ');

  const mergedSkills = uniq([
    ...(current.skills || []),
    ...((profile?.skills as string[] | undefined) || []),
    ...((profile?.interests as string[] | undefined) || []),
    ...pickMeaningfulKeywords([
      profile?.field_of_study,
      profile?.education_level,
      profile?.institution,
      profile?.headline,
      summaryPrompt,
      ...goalTitles,
    ]),
  ]);
  const baseSummary = buildSummaryFromProfile(profile, summaryPrompt);
  const summary = [
    baseSummary,
    profile?.headline ? cleanText(profile.headline) : '',
    mergedSkills.length ? `Core strengths: ${mergedSkills.slice(0, 4).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const experience = current.experience?.length
    ? current.experience
    : goalTitles.slice(0, 2).map((goal, index) => ({
      id: createId('exp'),
      company: 'Edutu Experience',
      role: goal ? sentenceCase(goal) : 'Student Project',
      start_date: '',
      end_date: '',
      description: `Built momentum around ${goal || 'career growth'} with a focus on execution, learning, and measurable outcomes.`,
      highlights: buildExperienceHighlights(mergedSkills.slice(index * 2, index * 2 + 3), goalTitles.slice(index, index + 2)),
    }));

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
      email: current.header?.email || profile?.email || '',
      location: current.header?.location || profile?.country || '',
      linkedin: current.header?.linkedin || linkedInUrl || '',
    },
    summary,
    skills: mergedSkills,
    experience,
    education,
    achievements:
      current.achievements?.length
        ? current.achievements
        : goalTitles.slice(0, 3).map((goal) => ({
          id: createId('ach'),
          title: sentenceCase(goal),
          description: `Pursued ${goal} through consistent planning, skill development, and steady progress.`,
        })),
    projects: current.projects?.length ? current.projects : [buildProjectIdea(profile, summaryPrompt)],
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
  },
): Promise<AITailorResponse> {
  const { data: opportunity, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', options.opportunityId)
    .single();

  if (error) throw error;

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
      if (item.highlights?.length) lines.push(`Highlights: ${item.highlights.join(', ')}`);
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
      if (item.highlights?.length) lines.push(`Highlights: ${item.highlights.join(', ')}`);
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
