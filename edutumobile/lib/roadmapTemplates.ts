import {
    BookOpen,
    Briefcase,
    Compass,
    GraduationCap,
    PenLine,
    Play,
    Rocket,
    Users,
    Wrench,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from './i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplateIcon = typeof BookOpen;

export type ResourceType = 'youtube' | 'blog' | 'guide' | 'course' | 'tool' | 'community';

export interface TemplateResource {
    id: string;
    title: string;
    url: string;
    type: ResourceType;
}

export interface TemplateStep {
    id: string;
    week: number;
    title: string;
    guidance: string;
    duration?: string;
    phase?: string;
    deliverable?: string;
    resources: TemplateResource[];
}

export interface RoadmapTemplate {
    id: string;
    title: string;
    summary: string;
    category: string;
    difficulty: string;
    duration: string;
    coverImage?: string;
    authorName: string;
    authorRole?: string;
    authorAvatar?: string;
    rating: number;
    ratingCount: number;
    learners: number;
    featured: boolean;
    outcomes: string[];
    steps: TemplateStep[];
    resources: TemplateResource[];
}

export interface TemplateComment {
    id: string;
    // Opaque derived id of the author — used to report/block and to hide
    // blocked authors. Not the raw auth subject.
    authorId: string;
    authorName: string;
    body: string;
    rating?: number | null;
    createdAt: string;
}

// ---------------------------------------------------------------------------
// Visual metadata (category + resource types)
// ---------------------------------------------------------------------------

interface CategoryMeta {
    key: string;
    icon: TemplateIcon;
    color: string;
}

const CATEGORY_META: { match: string[]; meta: CategoryMeta }[] = [
    { match: ['scholar', 'fellow', 'grant'], meta: { key: 'scholarship', icon: GraduationCap, color: '#16A34A' } },
    { match: ['career', 'intern', 'job', 'tech'], meta: { key: 'career', icon: Briefcase, color: '#2563EB' } },
    { match: ['business', 'startup', 'entrepreneur', 'freelan'], meta: { key: 'business', icon: Rocket, color: '#F97316' } },
    { match: ['education', 'study', 'test', 'language'], meta: { key: 'education', icon: BookOpen, color: '#8B5CF6' } },
    { match: ['lead', 'community', 'network'], meta: { key: 'leadership', icon: Users, color: '#0891B2' } },
];

const DEFAULT_CATEGORY_META: CategoryMeta = { key: 'general', icon: Compass, color: '#64748B' };

export function categoryMeta(category?: string): CategoryMeta {
    const key = (category || '').toLowerCase();
    const hit = CATEGORY_META.find((entry) => entry.match.some((m) => key.includes(m)));
    return hit ? hit.meta : DEFAULT_CATEGORY_META;
}

interface ResourceMeta {
    icon: TemplateIcon;
    color: string;
    labelKey: string;
}

const RESOURCE_META: Record<ResourceType, ResourceMeta> = {
    youtube: { icon: Play, color: '#EF4444', labelKey: 'templates.resourceTypes.youtube' },
    blog: { icon: PenLine, color: '#8B5CF6', labelKey: 'templates.resourceTypes.blog' },
    guide: { icon: BookOpen, color: '#0EA5E9', labelKey: 'templates.resourceTypes.guide' },
    course: { icon: GraduationCap, color: '#16A34A', labelKey: 'templates.resourceTypes.course' },
    tool: { icon: Wrench, color: '#F59E0B', labelKey: 'templates.resourceTypes.tool' },
    community: { icon: Users, color: '#06B6D4', labelKey: 'templates.resourceTypes.community' },
};

export function resourceMeta(type?: string): ResourceMeta {
    return RESOURCE_META[(type || 'guide') as ResourceType] || RESOURCE_META.guide;
}

export function resourceHost(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return i18n.t('goals:templates.resourceFallback');
    }
}

// Deterministic avatar identity for authors/commenters without an image.
const AVATAR_COLORS = ['#2563EB', '#16A34A', '#F97316', '#8B5CF6', '#0891B2', '#DB2777', '#D97706'];

export function initialsOf(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'E';
}

export function avatarColor(name: string): string {
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function timeAgo(dateStr: string): string {
    const then = new Date(dateStr).getTime();
    if (!Number.isFinite(then)) return '';
    const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
    if (minutes < 1) return i18n.t('goals:templates.comments.justNow');
    if (minutes < 60) return i18n.t('goals:templates.comments.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return i18n.t('goals:templates.comments.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return i18n.t('goals:templates.comments.daysAgo', { count: days });
    return new Date(dateStr).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Backend mapping
// ---------------------------------------------------------------------------

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, '');

interface BackendStep {
    id?: string;
    title?: string;
    description?: string;
    duration?: string;
    resources?: string[];
    relativeDueDays?: number;
    phase?: string;
}

interface BackendResource {
    id?: string;
    title?: string;
    url?: string;
    type?: string;
}

export interface BackendRoadmap {
    id: string;
    title: string;
    description?: string;
    category?: string;
    difficulty?: string;
    estimated_duration?: string;
    outcomes?: string;
    cover_image?: string | null;
    creator_name?: string;
    author_role?: string | null;
    author_avatar?: string | null;
    rating_avg?: number | string | null;
    rating_count?: number | null;
    enrollment_count?: number | null;
    is_featured?: boolean;
    steps?: BackendStep[];
    resources?: BackendResource[];
}

// `outcomes` is a free-text column; split it into displayable bullet points.
export function parseOutcomes(outcomes?: string): string[] {
    if (!outcomes) return [];
    return outcomes
        .split(/\r?\n|•|;/)
        .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 6);
}

function normalizeRating(value?: number | string | null): number {
    const parsed = typeof value === 'string' ? parseFloat(value) : value || 0;
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    // Some rows store 48 for 4.8; clamp into the 5-star scale.
    const scaled = parsed > 5 ? parsed / 10 : parsed;
    return Math.min(5, Math.round(scaled * 10) / 10);
}

function normalizeResource(raw: BackendResource, index: number): TemplateResource | null {
    if (!raw?.url) return null;
    return {
        id: raw.id || `res-${index}`,
        title: raw.title || raw.url,
        url: raw.url,
        type: (RESOURCE_META[(raw.type || '') as ResourceType] ? raw.type : 'guide') as ResourceType,
    };
}

export function mapBackendTemplate(roadmap: BackendRoadmap): RoadmapTemplate | null {
    const rawSteps = Array.isArray(roadmap.steps) ? roadmap.steps : [];
    if (rawSteps.length === 0) return null;

    const resources = (roadmap.resources || [])
        .map((res, index) => normalizeResource(res, index))
        .filter((res): res is TemplateResource => res !== null);

    // Index roadmap-level resources so a step can reference them by id or title.
    const resourceIndex = new Map<string, TemplateResource>();
    resources.forEach((res) => {
        resourceIndex.set(res.id.toLowerCase(), res);
        resourceIndex.set(res.title.toLowerCase(), res);
    });

    const steps: TemplateStep[] = rawSteps.map((step, index) => {
        const week = typeof step.relativeDueDays === 'number' && step.relativeDueDays > 0
            ? Math.max(1, Math.ceil(step.relativeDueDays / 7))
            : index + 1;
        return {
            id: step.id || `step-${index}`,
            week,
            title: step.title || i18n.t('goals:templates.stepFallback', { number: index + 1 }),
            guidance: step.description || '',
            duration: step.duration,
            phase: step.phase,
            resources: (step.resources || [])
                .map((ref) => resourceIndex.get(String(ref).toLowerCase()))
                .filter((res): res is TemplateResource => Boolean(res)),
        };
    });

    return {
        id: roadmap.id,
        title: roadmap.title,
        summary: roadmap.description || i18n.t('goals:templates.defaultSummary'),
        category: roadmap.category || 'general',
        difficulty: roadmap.difficulty
            ? roadmap.difficulty.charAt(0).toUpperCase() + roadmap.difficulty.slice(1)
            : i18n.t('goals:templates.allLevels'),
        duration: roadmap.estimated_duration || i18n.t('goals:templates.stepPlan', { count: rawSteps.length }),
        coverImage: roadmap.cover_image || undefined,
        authorName: roadmap.creator_name || 'Edutu Team',
        authorRole: roadmap.author_role || undefined,
        authorAvatar: roadmap.author_avatar || undefined,
        rating: normalizeRating(roadmap.rating_avg),
        ratingCount: roadmap.rating_count || 0,
        learners: roadmap.enrollment_count || 0,
        featured: Boolean(roadmap.is_featured),
        outcomes: parseOutcomes(roadmap.outcomes),
        steps,
        resources,
    };
}

// ---------------------------------------------------------------------------
// Fetching + in-memory cache (list hydrates the detail screen instantly)
// ---------------------------------------------------------------------------

const templateCache = new Map<string, RoadmapTemplate>();

export function getCachedTemplate(id: string): RoadmapTemplate | undefined {
    return templateCache.get(id) || FALLBACK_TEMPLATES.find((template) => template.id === id);
}

export async function fetchTemplates(): Promise<RoadmapTemplate[]> {
    const response = await fetch(`${API_URL}/roadmaps/templates?limit=30`);
    if (!response.ok) throw new Error(`templates ${response.status}`);
    const data = await response.json();
    const mapped = (Array.isArray(data) ? data : [])
        .map(mapBackendTemplate)
        .filter((template): template is RoadmapTemplate => template !== null);
    mapped.forEach((template) => templateCache.set(template.id, template));
    return mapped;
}

export async function fetchTemplateById(id: string): Promise<RoadmapTemplate | null> {
    const response = await fetch(`${API_URL}/roadmaps/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`template ${response.status}`);
    const mapped = mapBackendTemplate(await response.json());
    if (mapped) templateCache.set(mapped.id, mapped);
    return mapped;
}

export async function fetchTemplateComments(id: string): Promise<TemplateComment[]> {
    const response = await fetch(`${API_URL}/roadmaps/${encodeURIComponent(id)}/comments`);
    if (!response.ok) throw new Error(`comments ${response.status}`);
    const data = await response.json();
    return (Array.isArray(data) ? data : []).map((item: any) => ({
        id: String(item.id),
        authorId: String(item.author_id || ''),
        authorName: item.author_name || 'Edutu learner',
        body: item.body || '',
        rating: item.rating,
        createdAt: item.created_at || new Date().toISOString(),
    }));
}

export async function postTemplateComment(
    id: string,
    token: string,
    payload: { body: string; rating?: number },
): Promise<TemplateComment | null> {
    const response = await fetch(`${API_URL}/roadmaps/${encodeURIComponent(id)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`comment ${response.status}`);
    const item = await response.json();
    return {
        id: String(item.id),
        authorId: String(item.author_id || ''),
        authorName: item.author_name || 'You',
        body: item.body || payload.body,
        rating: item.rating ?? payload.rating,
        createdAt: item.created_at || new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// UGC moderation — report / block (Apple App Store Guideline 1.2)
// ---------------------------------------------------------------------------

export type CommentReportReason = 'offensive' | 'spam' | 'harassment' | 'other';

// Mirrors the backend `toDatabaseUserId` (FNV-1a variant) so the viewer's raw
// Clerk id can be matched against a comment's derived `author_id` — used to
// hide the report/block menu on the viewer's own comments.
const DERIVED_UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashHex(input: string, seed: number): string {
    let hash = seed;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function deriveUserId(userId: string | null | undefined): string {
    if (!userId) return '';
    if (DERIVED_UUID_REGEX.test(userId)) return userId.toLowerCase();
    const hash = [
        hashHex(userId, 0x811c9dc5),
        hashHex(userId, 0x9e3779b9),
        hashHex(userId, 0x85ebca6b),
        hashHex(userId, 0xc2b2ae35),
    ].join('');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function reportTemplateComment(
    roadmapId: string,
    commentId: string,
    token: string,
    reason: CommentReportReason,
): Promise<boolean> {
    const response = await fetch(
        `${API_URL}/roadmaps/${encodeURIComponent(roadmapId)}/comments/${encodeURIComponent(commentId)}/report`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ reason }),
        },
    );
    return response.ok;
}

export async function blockCommentAuthor(
    blockedUserId: string,
    token: string,
): Promise<boolean> {
    const response = await fetch(`${API_URL}/roadmaps/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ blockedUserId }),
    });
    return response.ok;
}

// Locally-cached block list so filtering is instant and works offline; the
// server (see /roadmaps/blocked) remains the source of truth.
const BLOCKED_AUTHORS_KEY = 'roadmap.blockedAuthors.v1';

export async function getBlockedAuthorIds(): Promise<string[]> {
    try {
        const raw = await AsyncStorage.getItem(BLOCKED_AUTHORS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

export async function addBlockedAuthorId(blockedUserId: string): Promise<void> {
    if (!blockedUserId) return;
    try {
        const existing = await getBlockedAuthorIds();
        if (existing.includes(blockedUserId)) return;
        await AsyncStorage.setItem(
            BLOCKED_AUTHORS_KEY,
            JSON.stringify([...existing, blockedUserId]),
        );
    } catch {
        // Best-effort local cache; server block already persisted.
    }
}

// Hydrate the local block list from the server (cross-device source of truth).
export async function syncBlockedAuthorIds(token: string): Promise<string[]> {
    try {
        const response = await fetch(`${API_URL}/roadmaps/blocked`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return getBlockedAuthorIds();
        const data = await response.json();
        const ids = (Array.isArray(data) ? data : []).filter(
            (id: unknown): id is string => typeof id === 'string',
        );
        await AsyncStorage.setItem(BLOCKED_AUTHORS_KEY, JSON.stringify(ids));
        return ids;
    } catch {
        return getBlockedAuthorIds();
    }
}

export async function adoptTemplate(id: string, token: string): Promise<boolean> {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const adoption = await fetch(`${API_URL}/roadmaps/adopt/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
    });
    if (adoption.ok) return true;
    if (![404, 405, 501].includes(adoption.status)) return false;
    const enrollment = await fetch(`${API_URL}/roadmaps/enroll/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
    });
    return enrollment.ok;
}

// ---------------------------------------------------------------------------
// Curated fallback set — mirrors the seeded backend templates so the screen
// stays rich offline. Kept in sync with supabase seed (2026-07-08).
// ---------------------------------------------------------------------------

export const FALLBACK_TEMPLATES: RoadmapTemplate[] = [
    {
        id: 'fallback-remote-tech-job',
        title: 'Land Your First Remote Tech Job',
        summary: 'A practical 12-week path from skills audit to signed offer. Build proof-of-work projects, a remote-ready profile, and a repeatable interview system aimed at remote-first companies hiring worldwide.',
        category: 'career',
        difficulty: 'Intermediate',
        duration: '12 weeks',
        coverImage: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&q=80&auto=format&fit=crop',
        authorName: 'Kwame Osei',
        authorRole: 'Senior Software Engineer · Edutu Mentor',
        rating: 4.8,
        ratingCount: 47,
        learners: 318,
        featured: true,
        outcomes: [
            'Pick a career track and close your top skill gaps',
            'Ship 3 portfolio projects recruiters can actually open',
            'Publish a remote-ready CV, GitHub and LinkedIn profile',
            'Run an application pipeline across the best remote job boards',
            'Pass technical and behavioral interviews with confidence',
        ],
        resources: [
            { id: 'rt-r1', title: 'Developer Roadmaps', url: 'https://roadmap.sh/', type: 'guide' },
            { id: 'rt-r2', title: 'freeCodeCamp Curriculum', url: 'https://www.freecodecamp.org/learn', type: 'course' },
            { id: 'rt-r3', title: 'APIs for Beginners — Full Course', url: 'https://www.youtube.com/watch?v=GZvSYJDk-us', type: 'youtube' },
            { id: 'rt-r4', title: 'Portfolio Website Tutorial', url: 'https://www.youtube.com/watch?v=xV7S8BhIeBo', type: 'youtube' },
            { id: 'rt-r5', title: 'GitHub Skills', url: 'https://skills.github.com/', type: 'course' },
            { id: 'rt-r6', title: 'We Work Remotely', url: 'https://weworkremotely.com/', type: 'tool' },
            { id: 'rt-r7', title: 'Remote OK', url: 'https://remoteok.com/', type: 'tool' },
            { id: 'rt-r9', title: 'Tech Interview Handbook', url: 'https://www.techinterviewhandbook.org/', type: 'guide' },
        ],
        steps: [
            { id: 'rt-1', week: 1, title: 'Choose your track and audit your skills', guidance: 'Pick one lane — frontend, backend, data, or mobile — and score yourself honestly against a public skills roadmap. List the 5 biggest gaps between you and real job descriptions you want.', duration: 'Week 1', phase: 'Foundation', resources: [{ id: 'rt-r1', title: 'Developer Roadmaps', url: 'https://roadmap.sh/', type: 'guide' }, { id: 'rt-r2', title: 'freeCodeCamp Curriculum', url: 'https://www.freecodecamp.org/learn', type: 'course' }] },
            { id: 'rt-2', week: 4, title: 'Close the gaps with focused learning', guidance: 'Spend 3 focused weeks on your top gaps only. Follow one curriculum instead of hopping between courses, and practice by building tiny things every day, not just watching.', duration: 'Weeks 2-4', phase: 'Foundation', resources: [{ id: 'rt-r3', title: 'APIs for Beginners — Full Course', url: 'https://www.youtube.com/watch?v=GZvSYJDk-us', type: 'youtube' }] },
            { id: 'rt-3', week: 7, title: 'Ship three proof-of-work projects', guidance: 'Build three small but complete projects that solve real problems. Deploy each one, write a clear README with screenshots, and record a 1-minute demo. Recruiters open links, not promises.', duration: 'Weeks 5-7', phase: 'Proof of work', resources: [{ id: 'rt-r4', title: 'Portfolio Website Tutorial', url: 'https://www.youtube.com/watch?v=xV7S8BhIeBo', type: 'youtube' }, { id: 'rt-r5', title: 'GitHub Skills', url: 'https://skills.github.com/', type: 'course' }] },
            { id: 'rt-4', week: 8, title: 'Polish your CV, GitHub and LinkedIn', guidance: 'Rewrite your CV around outcomes and numbers, pin your best repos, and turn your LinkedIn headline into a promise of value. Ask two people to review everything before you apply anywhere.', duration: 'Week 8', phase: 'Positioning', resources: [{ id: 'rt-r5', title: 'GitHub Skills', url: 'https://skills.github.com/', type: 'course' }] },
            { id: 'rt-5', week: 10, title: 'Build your application pipeline', guidance: 'Apply in batches of 10-15 per week across remote boards. Track every application in a sheet, tailor the first line of each cover note, and follow up after 7 days. Treat it like a sales pipeline.', duration: 'Weeks 9-10', phase: 'Applications', resources: [{ id: 'rt-r6', title: 'We Work Remotely', url: 'https://weworkremotely.com/', type: 'tool' }, { id: 'rt-r7', title: 'Remote OK', url: 'https://remoteok.com/', type: 'tool' }] },
            { id: 'rt-6', week: 11, title: 'Prepare for interviews like an athlete', guidance: 'Drill the interview loop: coding or take-home, system questions at your level, and behavioral stories in STAR format. Do at least two mock interviews with a friend or mentor.', duration: 'Week 11', phase: 'Interviews', resources: [{ id: 'rt-r9', title: 'Tech Interview Handbook', url: 'https://www.techinterviewhandbook.org/', type: 'guide' }] },
            { id: 'rt-7', week: 12, title: 'Negotiate the offer and onboard', guidance: 'Never accept the first number on the call. Research remote salary bands for your region, ask for time to review, and negotiate at least once. Then over-communicate in your first 90 days.', duration: 'Week 12', phase: 'Offer', resources: [{ id: 'rt-r9', title: 'Tech Interview Handbook', url: 'https://www.techinterviewhandbook.org/', type: 'guide' }] },
        ],
    },
    {
        id: 'fallback-freelance-launchpad',
        title: 'Freelance Launchpad: Your First $1,000 Online',
        summary: 'Turn one skill into paying clients in 10 weeks. Build a small portfolio, set up winning profiles, pitch consistently, and deliver work that earns reviews, referrals, and repeat business.',
        category: 'business',
        difficulty: 'Beginner',
        duration: '10 weeks',
        coverImage: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200&q=80&auto=format&fit=crop',
        authorName: 'Amara Okafor',
        authorRole: 'Freelance Strategist · Edutu Mentor',
        rating: 4.7,
        ratingCount: 38,
        learners: 264,
        featured: false,
        outcomes: [
            'Choose one sellable skill and niche',
            'Publish a 3-sample portfolio clients trust',
            'Set up optimized Upwork and Fiverr profiles',
            'Send 10 tailored proposals every week',
            'Earn your first $1,000 and a set of 5-star reviews',
        ],
        resources: [
            { id: 'fl-r1', title: 'Fiverr Guides for Freelancers', url: 'https://www.fiverr.com/resources/guides', type: 'guide' },
            { id: 'fl-r2', title: 'Upwork Resources', url: 'https://www.upwork.com/resources', type: 'guide' },
            { id: 'fl-r3', title: 'Contra Blog — Freelancing Playbooks', url: 'https://contra.com/blog', type: 'blog' },
            { id: 'fl-r4', title: 'Portfolio Website Tutorial', url: 'https://www.youtube.com/watch?v=xV7S8BhIeBo', type: 'youtube' },
            { id: 'fl-r6', title: 'Notion Templates for Freelancers', url: 'https://www.notion.com/templates', type: 'tool' },
        ],
        steps: [
            { id: 'fl-1', week: 1, title: 'Pick one sellable skill', guidance: "Choose a single service you can deliver end-to-end this month — writing, design, video editing, data entry, social media, or web development. Specific beats general: 'YouTube thumbnail designer' wins against 'graphic designer'.", duration: 'Week 1', phase: 'Positioning', resources: [{ id: 'fl-r1', title: 'Fiverr Guides for Freelancers', url: 'https://www.fiverr.com/resources/guides', type: 'guide' }] },
            { id: 'fl-2', week: 3, title: 'Create three portfolio samples', guidance: 'Make three spec samples as if a dream client had hired you. Present each with a before/after or a short case note. No client permission needed — self-initiated work counts as proof.', duration: 'Weeks 2-3', phase: 'Proof of work', resources: [{ id: 'fl-r4', title: 'Portfolio Website Tutorial', url: 'https://www.youtube.com/watch?v=xV7S8BhIeBo', type: 'youtube' }, { id: 'fl-r6', title: 'Notion Templates for Freelancers', url: 'https://www.notion.com/templates', type: 'tool' }] },
            { id: 'fl-3', week: 4, title: 'Set up your freelance profiles', guidance: "Create profiles on two marketplaces maximum. Write a headline about the client's outcome, not your title, add your samples, and set a starter rate you can raise after five reviews.", duration: 'Week 4', phase: 'Setup', resources: [{ id: 'fl-r2', title: 'Upwork Resources', url: 'https://www.upwork.com/resources', type: 'guide' }] },
            { id: 'fl-4', week: 7, title: 'Pitch daily: ten proposals a week', guidance: "Send 10 tailored proposals weekly. Open with their problem in one sentence, show your most relevant sample, and end with a small first step. Track everything and iterate on what gets replies.", duration: 'Weeks 5-7', phase: 'Pipeline', resources: [{ id: 'fl-r2', title: 'Upwork Resources', url: 'https://www.upwork.com/resources', type: 'guide' }] },
            { id: 'fl-5', week: 9, title: 'Deliver, over-communicate, collect reviews', guidance: 'On your first jobs, deliver early and send progress updates before clients ask. After delivery, politely request a review and referrals. Reviews are the currency of your first year.', duration: 'Weeks 8-9', phase: 'Delivery', resources: [{ id: 'fl-r3', title: 'Contra Blog — Freelancing Playbooks', url: 'https://contra.com/blog', type: 'blog' }] },
            { id: 'fl-6', week: 10, title: 'Raise your rates and lock in a retainer', guidance: 'After five completed jobs, raise your rate 25-50% and pitch your best client a monthly retainer. Recurring income is how $200 months become $1,000 months.', duration: 'Week 10', phase: 'Growth', resources: [{ id: 'fl-r3', title: 'Contra Blog — Freelancing Playbooks', url: 'https://contra.com/blog', type: 'blog' }] },
        ],
    },
    {
        id: 'fallback-study-abroad',
        title: 'Study Abroad Blueprint: Admission to Visa',
        summary: 'The complete 20-week route to studying abroad: shortlist the right programs, map funding, prepare test scores and documents, submit strong applications, and clear the visa with confidence.',
        category: 'scholarship',
        difficulty: 'Intermediate',
        duration: '20 weeks',
        coverImage: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=1200&q=80&auto=format&fit=crop',
        authorName: 'Zainab Bello',
        authorRole: 'Global Education Advisor · Edutu Team',
        rating: 4.9,
        ratingCount: 56,
        learners: 412,
        featured: true,
        outcomes: [
            'Build a realistic shortlist of 8-12 programs across 3 countries',
            'Map tuition, living costs, and matching scholarships',
            'Hit the required English test score',
            'Prepare a document bank: SOP, LORs, transcripts, CV',
            'Submit complete applications and clear your visa interview',
        ],
        resources: [
            { id: 'sa-r1', title: 'DAAD — Study in Germany', url: 'https://www.daad.de/en/', type: 'guide' },
            { id: 'sa-r2', title: 'EducationUSA Advising', url: 'https://educationusa.state.gov/', type: 'guide' },
            { id: 'sa-r3', title: 'Opportunity Desk — Deadlines Feed', url: 'https://www.opportunitydesk.org/', type: 'blog' },
            { id: 'sa-r4', title: 'IELTS Official', url: 'https://ielts.org/', type: 'guide' },
            { id: 'sa-r6', title: 'Notion Templates — Application Tracker', url: 'https://www.notion.com/templates', type: 'tool' },
        ],
        steps: [
            { id: 'sa-1', week: 3, title: 'Define your target and shortlist programs', guidance: 'Decide degree level, field, intake year, and 3 target countries. Shortlist 8-12 programs balancing ambition and admission odds, and record deadlines in one tracker.', duration: 'Weeks 1-3', phase: 'Research', resources: [{ id: 'sa-r1', title: 'DAAD — Study in Germany', url: 'https://www.daad.de/en/', type: 'guide' }, { id: 'sa-r2', title: 'EducationUSA Advising', url: 'https://educationusa.state.gov/', type: 'guide' }] },
            { id: 'sa-2', week: 6, title: 'Map funding before you apply', guidance: 'For each program, note tuition, living costs, and every scholarship you qualify for — university, government, and private. Prioritize programs where funding is realistic.', duration: 'Weeks 4-6', phase: 'Funding', resources: [{ id: 'sa-r3', title: 'Opportunity Desk — Deadlines Feed', url: 'https://www.opportunitydesk.org/', type: 'blog' }] },
            { id: 'sa-3', week: 12, title: 'Book and prepare for your English test', guidance: 'Most programs need IELTS or TOEFL. Take a diagnostic, book the real test 8-10 weeks out, and drill your weakest band weekly. Scores are the easiest rejection to avoid.', duration: 'Weeks 6-12', phase: 'Tests', resources: [{ id: 'sa-r4', title: 'IELTS Official', url: 'https://ielts.org/', type: 'guide' }] },
            { id: 'sa-4', week: 14, title: 'Build your document bank', guidance: 'Prepare certified transcripts, a 2-page academic CV, a master statement of purpose you can adapt, and brief three recommenders early with your CV and goals.', duration: 'Weeks 10-14', phase: 'Documents', resources: [{ id: 'sa-r6', title: 'Notion Templates — Application Tracker', url: 'https://www.notion.com/templates', type: 'tool' }] },
            { id: 'sa-5', week: 17, title: 'Submit applications in waves', guidance: 'Apply to your earliest deadlines first. Adapt the SOP for each program — name the professors, labs, or modules that pull you there. Verify every upload before submitting.', duration: 'Weeks 14-17', phase: 'Applications', resources: [{ id: 'sa-r2', title: 'EducationUSA Advising', url: 'https://educationusa.state.gov/', type: 'guide' }] },
            { id: 'sa-6', week: 20, title: 'Handle offers, finances, and the visa', guidance: 'Compare offers against total funded cost, pay deposits on time, then prepare visa documents: admission letter, proof of funds, and a clear study plan for the interview.', duration: 'Weeks 18-20', phase: 'Visa', resources: [{ id: 'sa-r1', title: 'DAAD — Study in Germany', url: 'https://www.daad.de/en/', type: 'guide' }] },
        ],
    },
    {
        id: 'fallback-data-analytics',
        title: 'Data Analytics: Zero to Job-Ready',
        summary: 'Go from spreadsheets to a hireable data analyst in 16 weeks: statistics foundations, SQL, Python, dashboards, and a Kaggle-backed portfolio that proves you can turn data into decisions.',
        category: 'career',
        difficulty: 'Beginner',
        duration: '16 weeks',
        coverImage: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80&auto=format&fit=crop',
        authorName: 'Thandi Nkosi',
        authorRole: 'Data Analyst · Edutu Mentor',
        rating: 4.8,
        ratingCount: 41,
        learners: 287,
        featured: false,
        outcomes: [
            'Master spreadsheets and core statistics',
            'Query real databases confidently with SQL',
            'Clean and analyze data with Python and pandas',
            'Build dashboards people actually use',
            'Publish 2 portfolio analyses and a capstone project',
        ],
        resources: [
            { id: 'da-r1', title: 'Google Data Analytics Certificate', url: 'https://www.coursera.org/professional-certificates/google-data-analytics', type: 'course' },
            { id: 'da-r2', title: 'SQL Full Database Course', url: 'https://www.youtube.com/watch?v=HXV3zeQKqGY', type: 'youtube' },
            { id: 'da-r3', title: 'Data Analysis with Python', url: 'https://www.youtube.com/watch?v=r-uOLxNrNk8', type: 'youtube' },
            { id: 'da-r4', title: 'Tableau Crash Course', url: 'https://www.youtube.com/watch?v=TPMlZxRRaBQ', type: 'youtube' },
            { id: 'da-r5', title: 'Kaggle Learn — Free Micro-courses', url: 'https://www.kaggle.com/learn', type: 'course' },
        ],
        steps: [
            { id: 'da-1', week: 3, title: 'Foundations: spreadsheets and statistics', guidance: 'Get fast in Google Sheets or Excel — pivot tables, lookups, charts — and learn descriptive statistics: mean, median, distributions, and correlation vs causation.', duration: 'Weeks 1-3', phase: 'Foundations', resources: [{ id: 'da-r1', title: 'Google Data Analytics Certificate', url: 'https://www.coursera.org/professional-certificates/google-data-analytics', type: 'course' }] },
            { id: 'da-2', week: 6, title: "SQL: the analyst's superpower", guidance: 'Learn SELECT, JOIN, GROUP BY, subqueries, and window functions. Practice daily against a real database — SQL appears in almost every analyst interview on earth.', duration: 'Weeks 4-6', phase: 'Core skills', resources: [{ id: 'da-r2', title: 'SQL Full Database Course', url: 'https://www.youtube.com/watch?v=HXV3zeQKqGY', type: 'youtube' }, { id: 'da-r5', title: 'Kaggle Learn — Free Micro-courses', url: 'https://www.kaggle.com/learn', type: 'course' }] },
            { id: 'da-3', week: 10, title: 'Python and pandas for analysis', guidance: 'Learn Python basics then pandas for cleaning and exploring messy datasets, with matplotlib/seaborn for quick charts. Re-do one of your SQL analyses in Python to cement both.', duration: 'Weeks 7-10', phase: 'Core skills', resources: [{ id: 'da-r3', title: 'Data Analysis with Python', url: 'https://www.youtube.com/watch?v=r-uOLxNrNk8', type: 'youtube' }] },
            { id: 'da-4', week: 12, title: 'Dashboards and storytelling', guidance: 'Learn Tableau or Power BI and rebuild one analysis as an interactive dashboard. Practice presenting: one insight per view, a headline per chart, and a clear recommended action.', duration: 'Weeks 11-12', phase: 'Visualization', resources: [{ id: 'da-r4', title: 'Tableau Crash Course', url: 'https://www.youtube.com/watch?v=TPMlZxRRaBQ', type: 'youtube' }] },
            { id: 'da-5', week: 15, title: 'Portfolio: two analyses plus a capstone', guidance: 'Pick datasets you care about — mobile money, football, agriculture, health — and publish two notebook analyses plus one end-to-end capstone with a dashboard and write-up.', duration: 'Weeks 13-15', phase: 'Proof of work', resources: [{ id: 'da-r5', title: 'Kaggle Learn — Free Micro-courses', url: 'https://www.kaggle.com/learn', type: 'course' }] },
            { id: 'da-6', week: 16, title: 'Package yourself and apply', guidance: 'Rewrite your CV around your projects and measurable insights, add your portfolio links, and start applying to analyst and data-adjacent roles while continuing weekly SQL drills.', duration: 'Week 16', phase: 'Job search', resources: [{ id: 'da-r1', title: 'Google Data Analytics Certificate', url: 'https://www.coursera.org/professional-certificates/google-data-analytics', type: 'course' }] },
        ],
    },
    {
        id: 'fallback-personal-brand',
        title: 'Personal Brand & LinkedIn Growth Engine',
        summary: 'An 8-week system to become visible in your field: sharp positioning, a profile that converts, a sustainable content engine, and daily engagement habits that turn strangers into opportunities.',
        category: 'leadership',
        difficulty: 'Beginner',
        duration: '8 weeks',
        coverImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80&auto=format&fit=crop',
        authorName: 'David Adeyemi',
        authorRole: 'Career Coach · Edutu Mentor',
        rating: 4.6,
        ratingCount: 29,
        learners: 196,
        featured: false,
        outcomes: [
            'Write a one-line positioning statement people remember',
            'Turn your LinkedIn profile into a landing page',
            'Publish 3 posts a week without burning out',
            'Grow an engaged network in your target field',
            'Generate inbound messages, referrals, and interview invites',
        ],
        resources: [
            { id: 'pb-r1', title: 'HBR — Building Your Personal Brand', url: 'https://hbr.org/2023/05/a-new-approach-to-building-your-personal-brand', type: 'blog' },
            { id: 'pb-r2', title: 'Notion Templates — Content Calendar', url: 'https://www.notion.com/templates', type: 'tool' },
            { id: 'pb-r4', title: 'Canva Design School', url: 'https://www.canva.com/designschool/', type: 'course' },
            { id: 'pb-r5', title: 'Contra Blog — Networking Playbooks', url: 'https://contra.com/blog', type: 'blog' },
        ],
        steps: [
            { id: 'pb-1', week: 1, title: 'Nail your positioning', guidance: 'Answer three questions in one sentence each: who do you help, with what, and what proof do you have? This line drives your headline, bio, and every post you write.', duration: 'Week 1', phase: 'Positioning', resources: [{ id: 'pb-r1', title: 'HBR — Building Your Personal Brand', url: 'https://hbr.org/2023/05/a-new-approach-to-building-your-personal-brand', type: 'blog' }] },
            { id: 'pb-2', week: 2, title: 'Rebuild your profile as a landing page', guidance: 'Professional photo, banner with your promise, headline with keywords recruiters search, an About section that opens with a hook, and a Featured row with your best work.', duration: 'Week 2', phase: 'Profile', resources: [{ id: 'pb-r4', title: 'Canva Design School', url: 'https://www.canva.com/designschool/', type: 'course' }] },
            { id: 'pb-3', week: 4, title: 'Start your content engine', guidance: "Choose three content pillars — what you're learning, what you've built, and lessons from your field. Batch-write on Sundays and publish Monday, Wednesday, Friday.", duration: 'Weeks 3-4', phase: 'Content', resources: [{ id: 'pb-r2', title: 'Notion Templates — Content Calendar', url: 'https://www.notion.com/templates', type: 'tool' }] },
            { id: 'pb-4', week: 6, title: 'Engage 15 minutes a day', guidance: "Comment thoughtfully on 5 posts in your field daily before you post your own. Comments put your name in front of audiences you don't have yet — it's the fastest growth loop.", duration: 'Weeks 5-6', phase: 'Network', resources: [{ id: 'pb-r1', title: 'HBR — Building Your Personal Brand', url: 'https://hbr.org/2023/05/a-new-approach-to-building-your-personal-brand', type: 'blog' }] },
            { id: 'pb-5', week: 7, title: 'Network with intent', guidance: 'Send five personalized connection requests a day to peers, seniors, and hiring managers. Follow up with a genuine question, never a pitch. Book two virtual coffees a week.', duration: 'Weeks 6-7', phase: 'Network', resources: [{ id: 'pb-r5', title: 'Contra Blog — Networking Playbooks', url: 'https://contra.com/blog', type: 'blog' }] },
            { id: 'pb-6', week: 8, title: 'Audit, double down, automate', guidance: 'Review analytics monthly: which pillars earn saves and DMs? Cut what flops, double what works, and template your workflow so the engine runs in 4 hours a week.', duration: 'Week 8', phase: 'Systems', resources: [{ id: 'pb-r2', title: 'Notion Templates — Content Calendar', url: 'https://www.notion.com/templates', type: 'tool' }] },
        ],
    },
    {
        id: 'fallback-ielts-sprint',
        title: 'IELTS 7.5+ Preparation Sprint',
        summary: 'A focused 8-week sprint to a band 7.5 or higher: diagnose your baseline, drill each paper with proven techniques, build a writing system examiners reward, and peak on test day.',
        category: 'education',
        difficulty: 'Intermediate',
        duration: '8 weeks',
        coverImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&q=80&auto=format&fit=crop',
        authorName: 'Sarah Kimani',
        authorRole: 'English Proficiency Coach · Edutu Mentor',
        rating: 4.9,
        ratingCount: 62,
        learners: 353,
        featured: false,
        outcomes: [
            'Know your baseline band and your gap per paper',
            'Master listening and reading question types',
            'Write Task 1 and Task 2 answers with a repeatable structure',
            'Speak fluently for 2 minutes on any topic',
            'Walk into test day with 3 full mocks behind you',
        ],
        resources: [
            { id: 'ie-r1', title: 'IELTS Liz — Free Lessons & Tips', url: 'https://ieltsliz.com/', type: 'guide' },
            { id: 'ie-r2', title: 'E2 IELTS — Video Lessons', url: 'https://www.youtube.com/@E2IELTS', type: 'youtube' },
            { id: 'ie-r3', title: 'IELTS Official — Test Format', url: 'https://ielts.org/', type: 'guide' },
            { id: 'ie-r4', title: 'IELTS Liz on YouTube', url: 'https://www.youtube.com/@ieltsliz', type: 'youtube' },
        ],
        steps: [
            { id: 'ie-1', week: 1, title: 'Diagnose your baseline', guidance: 'Sit one full practice test under real timing in week 1. Score each paper against band descriptors, then set a per-paper target — most students need +1.0 in writing, +0.5 elsewhere.', duration: 'Week 1', phase: 'Diagnosis', resources: [{ id: 'ie-r1', title: 'IELTS Liz — Free Lessons & Tips', url: 'https://ieltsliz.com/', type: 'guide' }, { id: 'ie-r3', title: 'IELTS Official — Test Format', url: 'https://ielts.org/', type: 'guide' }] },
            { id: 'ie-2', week: 3, title: 'Listening: train prediction, not luck', guidance: 'Drill one section daily. Before audio plays, predict answer types from the question. Review every wrong answer to find the trap — distractors follow patterns you can learn.', duration: 'Weeks 2-3', phase: 'Listening', resources: [{ id: 'ie-r2', title: 'E2 IELTS — Video Lessons', url: 'https://www.youtube.com/@E2IELTS', type: 'youtube' }] },
            { id: 'ie-3', week: 4, title: 'Reading: timing and question types', guidance: "Learn the technique for each question type — True/False/Not Given, matching headings, gap fills. Practice 20 minutes per passage, hardest passage first while you're fresh.", duration: 'Weeks 2-4', phase: 'Reading', resources: [{ id: 'ie-r1', title: 'IELTS Liz — Free Lessons & Tips', url: 'https://ieltsliz.com/', type: 'guide' }] },
            { id: 'ie-4', week: 6, title: 'Writing: build a repeatable system', guidance: 'Learn one clear structure for Task 1 reports and Task 2 essays and reuse it every time. Write four timed essays a week and compare against band 8 model answers line by line.', duration: 'Weeks 3-6', phase: 'Writing', resources: [{ id: 'ie-r1', title: 'IELTS Liz — Free Lessons & Tips', url: 'https://ieltsliz.com/', type: 'guide' }] },
            { id: 'ie-5', week: 7, title: 'Speaking: fluency beats vocabulary', guidance: 'Practice Part 2 cue cards daily: two minutes, recorded, no stopping. Listen back for fillers and flat intonation. Do at least two mock interviews with a partner or coach.', duration: 'Weeks 4-7', phase: 'Speaking', resources: [{ id: 'ie-r4', title: 'IELTS Liz on YouTube', url: 'https://www.youtube.com/@ieltsliz', type: 'youtube' }] },
            { id: 'ie-6', week: 8, title: 'Mock week and test-day logistics', guidance: 'Sit two more full mocks in exam conditions during week 7. Then taper: light review only, sleep well, prepare your ID and route, and arrive 45 minutes early on test day.', duration: 'Week 8', phase: 'Test day', resources: [{ id: 'ie-r3', title: 'IELTS Official — Test Format', url: 'https://ielts.org/', type: 'guide' }] },
        ],
    },
];
