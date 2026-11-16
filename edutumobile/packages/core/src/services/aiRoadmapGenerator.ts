import { Opportunity } from '../types/opportunity';
import { isAiBillingError, throwIfBillingResponse, type GetAuthToken } from './productApi';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, '');

export interface RoadmapMilestone {
  id: string;
  title: string;
  description?: string;
  date: string;
}

export interface RoadmapDailyAction {
  id: string;
  day: number;
  date: string;
  title: string;
  description: string;
  focus: 'research' | 'documents' | 'writing' | 'review' | 'submission' | 'interview' | 'follow-up';
  durationMinutes: number;
}

export interface RoadmapResource {
  id: string;
  title: string;
  type: 'official' | 'youtube' | 'pdf' | 'template' | 'community' | 'mentor';
  description: string;
  url?: string;
}

/** Applicant snapshot sent to the backend so the plan targets THIS user. */
export interface ApplicantProfile {
  country?: string;
  pursuit?: string;
  gradeLevel?: string;
  schoolName?: string;
  isGraduate?: boolean;
  interests?: string[];
  ambitions?: string[];
}

export interface RequirementAction {
  requirement: string;
  action: string;
}

export interface ProfileGap {
  gap: string;
  action: string;
}

export interface AIGeneratedRoadmap {
  milestones: RoadmapMilestone[];
  dailyPlan: RoadmapDailyAction[];
  weeklyGoals: {
    week: number;
    title: string;
    tasks: string[];
    deadline: string;
  }[];
  checklist: {
    id: string;
    title: string;
    category: 'document' | 'preparation' | 'application' | 'interview' | 'follow-up';
    completed: boolean;
  }[];
  reminders: {
    id: string;
    title: string;
    date: string;
    type: 'milestone' | 'deadline' | 'checklist';
  }[];
  resources: RoadmapResource[];
  supportActions: string[];
  deadline: string;
  submissionTargetDate: string;
  daysUntilDeadline: number;
  daysUntilSubmissionTarget: number;
  winningStrategy: string;
  summary: string;
  totalWeeks: number;
  /** Each listed requirement mapped to a concrete action that satisfies it. */
  requirementActions: RequirementAction[];
  /** Weaknesses in the applicant's profile for THIS opportunity, with fixes. */
  profileGaps: ProfileGap[];
  /** Tactics past winners of this kind of opportunity used. */
  bestPractices: string[];
  /** True when backend LLM enrichment was applied (vs. the deterministic scaffold). */
  personalized?: boolean;
}

function weeksBetween(start: Date, end: Date): number {
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (7 * 24 * 60 * 60 * 1000)));
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

function clampDate(date: Date, min: Date, max: Date): Date {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function daysBetween(start: Date, end: Date): number {
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.ceil((endDay.getTime() - startDay.getTime()) / 86400000));
}

function buildSearchUrl(base: string, query: string): string {
  return `${base}${encodeURIComponent(query)}`;
}

export function generateRoadmapFromOpportunity(
  opportunity: Opportunity,
  startDate: Date = new Date(),
  profile?: ApplicantProfile
): AIGeneratedRoadmap {
  const parsedDeadline = opportunity.deadline ? new Date(opportunity.deadline) : null;
  const deadline = parsedDeadline && !Number.isNaN(parsedDeadline.getTime()) ? parsedDeadline : addDays(startDate, 90);
  const daysUntilDeadline = daysBetween(startDate, deadline);
  const submissionBufferDays = daysUntilDeadline > 60 ? 7 : daysUntilDeadline > 21 ? 4 : 2;
  const submissionTarget = clampDate(addDays(deadline, -submissionBufferDays), startDate, deadline);
  const daysUntilSubmissionTarget = daysBetween(startDate, submissionTarget);
  const totalWeeks = weeksBetween(startDate, submissionTarget);
  const category = opportunity.category?.toLowerCase() || '';

  const milestones = generateMilestones(opportunity, startDate, deadline, submissionTarget);
  const dailyPlan = generateDailyPlan(opportunity, startDate, submissionTarget);
  const weeklyGoals = generateWeeklyGoals(opportunity, startDate, submissionTarget, totalWeeks, category);
  const checklist = generateChecklist(opportunity, category);
  const resources = generateResources(opportunity, category);
  const reminders = generateReminders(milestones, deadline, startDate);
  const supportActions = generateSupportActions(opportunity, category);
  const winningStrategy = generateWinningStrategy(opportunity, daysUntilDeadline, submissionBufferDays, category);
  const summary = generateSummary(opportunity, totalWeeks, category, daysUntilDeadline, submissionTarget);
  const requirementActions = generateRequirementActions(opportunity);
  const profileGaps = generateProfileGaps(opportunity, category, profile);
  const bestPractices = generateBestPractices(category);

  return {
    milestones,
    dailyPlan,
    weeklyGoals,
    checklist,
    reminders,
    resources,
    supportActions,
    deadline: formatDate(deadline),
    submissionTargetDate: formatDate(submissionTarget),
    daysUntilDeadline,
    daysUntilSubmissionTarget,
    winningStrategy,
    summary,
    totalWeeks,
    requirementActions,
    profileGaps,
    bestPractices,
    personalized: false,
  };
}

export interface RoadmapGenerationOptions {
  startDate?: Date;
  hoursPerWeek?: number;
  currentLevel?: 'beginner' | 'intermediate' | 'advanced';
  /** Applicant snapshot — personalizes both the local plan and the AI prompt. */
  profile?: ApplicantProfile;
  signal?: AbortSignal;
  /**
   * Clerk session token getter — /roadmaps/ai/* endpoints are authenticated
   * and credit-metered server-side, so the bearer token is required for the
   * AI enrichment step (without it, only the deterministic plan is returned).
   */
  getAuthToken?: GetAuthToken;
}

interface OpportunityPlanEnrichment {
  summary?: string;
  winningStrategy?: string;
  milestones?: Array<{ id: string; title: string; description: string }>;
  checklist?: string[];
  supportActions?: string[];
  requirementActions?: RequirementAction[];
  profileGaps?: ProfileGap[];
  bestPractices?: string[];
  generatedBy?: 'ai' | 'fallback';
}

/**
 * Fetches AI-authored narrative enrichment for a roadmap from the backend LLM.
 * Returns null on any failure so callers can fall back to the deterministic plan.
 */
export async function fetchOpportunityPlanEnrichment(
  opportunity: Opportunity,
  milestones: RoadmapMilestone[],
  options: Pick<RoadmapGenerationOptions, 'hoursPerWeek' | 'currentLevel' | 'profile' | 'signal' | 'getAuthToken'> = {}
): Promise<OpportunityPlanEnrichment | null> {
  try {
    // /roadmaps/ai/* is authenticated + credit-metered server-side.
    const token = options.getAuthToken ? await options.getAuthToken() : null;
    const response = await fetch(`${API_URL}/roadmaps/ai/opportunity-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        // Lets the server ground the plan on the verified opportunity row
        // instead of trusting these client-side fields. UUID-gated: some
        // cached/legacy items carry non-uuid ids the backend would reject.
        opportunityId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          opportunity.id ?? ''
        )
          ? opportunity.id
          : undefined,
        title: opportunity.title,
        organization: opportunity.organization,
        category: opportunity.category,
        deadline: opportunity.deadline ?? undefined,
        description: opportunity.description?.slice(0, 4000),
        hoursPerWeek: options.hoursPerWeek,
        currentLevel: options.currentLevel,
        milestones: milestones.map((milestone) => ({ id: milestone.id, title: milestone.title })),
        // Older backend deployments strip these unknown keys harmlessly.
        requirements: (opportunity.requirements || []).slice(0, 30).map((r) => r.slice(0, 500)),
        profile: options.profile,
      }),
      signal: options.signal,
    });
    if (!response.ok) {
      // 402 insufficient_credits / 429 limit must surface to the user.
      await throwIfBillingResponse(response);
      return null;
    }
    return (await response.json()) as OpportunityPlanEnrichment;
  } catch (error) {
    if (isAiBillingError(error)) throw error;
    return null;
  }
}

/**
 * Merges AI enrichment onto the deterministic roadmap. The scheduling (dates,
 * reminders, daily plan) always comes from the heuristic; the LLM only refines
 * narrative fields, and milestones are matched by id so alignment is stable.
 */
export function mergeRoadmapEnrichment(
  roadmap: AIGeneratedRoadmap,
  enrichment: OpportunityPlanEnrichment | null
): AIGeneratedRoadmap {
  if (!enrichment) return roadmap;

  const enrichedById = new Map((enrichment.milestones || []).map((milestone) => [milestone.id, milestone]));
  const hasSupportActions = Array.isArray(enrichment.supportActions) && enrichment.supportActions.length > 0;

  const validPairs = <T,>(list: T[] | undefined, keys: Array<keyof T>): T[] =>
    Array.isArray(list)
      ? list.filter(
          (item) =>
            item && keys.every((key) => typeof item[key] === 'string' && (item[key] as unknown as string).trim())
        )
      : [];

  const requirementActions = validPairs<RequirementAction>(enrichment.requirementActions, ['requirement', 'action']);
  const profileGaps = validPairs<ProfileGap>(enrichment.profileGaps, ['gap', 'action']);
  const bestPractices = Array.isArray(enrichment.bestPractices)
    ? enrichment.bestPractices.filter((tip) => typeof tip === 'string' && tip.trim())
    : [];

  return {
    ...roadmap,
    personalized: enrichment.generatedBy === 'ai',
    summary: enrichment.summary?.trim() || roadmap.summary,
    winningStrategy: enrichment.winningStrategy?.trim() || roadmap.winningStrategy,
    supportActions: hasSupportActions ? enrichment.supportActions! : roadmap.supportActions,
    requirementActions: requirementActions.length > 0 ? requirementActions : roadmap.requirementActions,
    profileGaps: profileGaps.length > 0 ? profileGaps : roadmap.profileGaps,
    bestPractices: bestPractices.length > 0 ? bestPractices : roadmap.bestPractices,
    milestones: roadmap.milestones.map((milestone) => {
      const enriched = enrichedById.get(milestone.id);
      if (!enriched) return milestone;
      return {
        ...milestone,
        title: enriched.title?.trim() || milestone.title,
        description: enriched.description?.trim() || milestone.description,
      };
    }),
  };
}

/**
 * Preferred entry point: builds the deterministic roadmap, then enriches it with
 * the backend LLM. Always resolves to a usable roadmap even fully offline.
 */
export async function generateRoadmap(
  opportunity: Opportunity,
  options: RoadmapGenerationOptions = {}
): Promise<AIGeneratedRoadmap> {
  const roadmap = generateRoadmapFromOpportunity(opportunity, options.startDate, options.profile);
  const enrichment = await fetchOpportunityPlanEnrichment(opportunity, roadmap.milestones, options);
  return mergeRoadmapEnrichment(roadmap, enrichment);
}

function generateMilestones(
  opp: Opportunity,
  start: Date,
  deadline: Date,
  submissionTarget: Date
): RoadmapMilestone[] {
  const milestones: RoadmapMilestone[] = [];
  const planDays = daysBetween(start, submissionTarget);

  milestones.push({
    id: 'milestone-1',
    title: 'Confirm fit and requirements',
    description: `Confirm deadline, eligibility, required documents, selection criteria, and what ${opp.organization} rewards in strong applicants.`,
    date: formatDate(addDays(start, Math.max(1, Math.floor(planDays * 0.12)))),
  });

  milestones.push({
    id: 'milestone-2',
    title: 'Collect proof and references',
    description: 'Collect transcripts, certificates, passport/ID, CV, proof of awards, and request recommendation letters early.',
    date: formatDate(addDays(start, Math.max(2, Math.floor(planDays * 0.28)))),
  });

  milestones.push({
    id: 'milestone-3',
    title: 'Draft SOP and essays',
    description: 'Write a focused story: impact, leadership, academic fit, career goal, and why this opportunity is the right bridge.',
    date: formatDate(addDays(start, Math.max(3, Math.floor(planDays * 0.48)))),
  });

  milestones.push({
    id: 'milestone-4',
    title: 'Feedback and final polish',
    description: 'Get feedback from a mentor, revise weak claims, proofread, compress documents, and check portal rules.',
    date: formatDate(addDays(start, Math.max(4, Math.floor(planDays * 0.72)))),
  });

  milestones.push({
    id: 'milestone-5',
    title: 'Submit before deadline',
    description: `Submit by this target date, ahead of the official deadline on ${formatDate(deadline)}. Save confirmation screenshots and reference numbers.`,
    date: formatDate(submissionTarget),
  });

  return milestones;
}

function generateDailyPlan(
  opp: Opportunity,
  start: Date,
  submissionTarget: Date
): RoadmapDailyAction[] {
  const planDays = Math.min(90, daysBetween(start, submissionTarget));
  const dailyPlan: RoadmapDailyAction[] = [];

  const phases: Array<{ until: number; focus: RoadmapDailyAction['focus']; titles: string[] }> = [
    {
      until: 0.16,
      focus: 'research',
      titles: [
        'Confirm eligibility and deadline',
        'Read official guidance',
        'Map selection criteria',
        'Study the host university or organization',
      ],
    },
    {
      until: 0.34,
      focus: 'documents',
      titles: [
        'Request transcripts',
        'Update CV achievements',
        'Collect certificates',
        'Ask recommenders early',
      ],
    },
    {
      until: 0.62,
      focus: 'writing',
      titles: [
        'Outline SOP story',
        'Write essay draft',
        'Strengthen leadership examples',
        'Connect goals to impact',
      ],
    },
    {
      until: 0.82,
      focus: 'review',
      titles: [
        'Get mentor feedback',
        'Revise weak sections',
        'Proofread documents',
        'Check portal requirements',
      ],
    },
    {
      until: 1,
      focus: 'submission',
      titles: [
        'Upload documents',
        'Run final checklist',
        'Submit application',
        'Save confirmation',
      ],
    },
  ];

  for (let day = 1; day <= planDays; day += 1) {
    const ratio = day / planDays;
    const phase = phases.find((item) => ratio <= item.until) || phases[phases.length - 1];
    const title = phase.titles[(day - 1) % phase.titles.length];

    dailyPlan.push({
      id: `day-${day}`,
      day,
      date: formatDate(addDays(start, day - 1)),
      title: `Day ${day}: ${title}`,
      description: buildDailyDescription(opp, phase.focus, title),
      focus: phase.focus,
      durationMinutes: phase.focus === 'writing' || phase.focus === 'review' ? 75 : 45,
    });
  }

  return dailyPlan;
}

function buildDailyDescription(
  opp: Opportunity,
  focus: RoadmapDailyAction['focus'],
  title: string
): string {
  const base = `Target: ${opp.title}.`;
  if (focus === 'research') return `${base} ${title}. Note eligibility, required documents, deadline, selection criteria, and proof you need.`;
  if (focus === 'documents') return `${base} ${title}. Store evidence in one folder and mark missing items immediately.`;
  if (focus === 'writing') return `${base} ${title}. Use one clear example, one measurable impact, and one future goal.`;
  if (focus === 'review') return `${base} ${title}. Ask whether the application sounds specific, credible, and aligned with ${opp.organization}.`;
  if (focus === 'submission') return `${base} ${title}. Check every upload, spelling, file name, and confirmation email.`;
  return `${base} Complete this task and update your progress.`;
}

function generateWeeklyGoals(
  opp: Opportunity,
  start: Date,
  deadline: Date,
  totalWeeks: number,
  category: string
): AIGeneratedRoadmap['weeklyGoals'] {
  const goals: AIGeneratedRoadmap['weeklyGoals'] = [];

  for (let week = 1; week <= totalWeeks; week++) {
    const weekEnd = addWeeks(start, week);
    const weekDeadline = addDays(weekEnd, -1);

    let title: string;
    let tasks: string[];

    if (week <= 2) {
      title = 'Research Phase';
      tasks = [
        `Read the full ${opp.title} guidelines and requirements`,
        'Create a checklist of all required documents',
        'Research past successful applicants (if available)',
        'Identify potential recommenders and reach out to them',
        category.includes('scholar') ? 'Research the organization\'s mission and values' : 'Understand the role responsibilities and expectations',
      ];
    } else if (week <= Math.floor(totalWeeks * 0.4)) {
      title = 'Document Gathering';
      tasks = [
        'Request official transcripts from your institution',
        'Update your CV/resume with latest achievements',
        'Collect certificates and awards documentation',
        'Draft your personal statement outline',
        'Prepare a portfolio of relevant work (if applicable)',
      ];
    } else if (week <= Math.floor(totalWeeks * 0.6)) {
      title = 'Essay Writing';
      tasks = [
        'Write first draft of your personal statement',
        'Draft responses to specific essay prompts',
        'Get feedback from mentors or advisors',
        'Revise and improve your essays',
        'Ensure all essays align with the opportunity\'s goals',
      ];
    } else if (week <= Math.floor(totalWeeks * 0.8)) {
      title = 'Application Assembly';
      tasks = [
        'Compile all documents in required formats',
        'Complete the online application form',
        'Upload all supporting documents',
        'Request recommendation letter submissions',
        'Review the entire application for errors',
      ];
    } else {
      title = 'Final Submission';
      tasks = [
        'Do a final thorough review of all materials',
        'Submit the application before the deadline',
        'Save confirmation and reference numbers',
        'Set up follow-up reminders',
        'Prepare for potential interviews or next steps',
      ];
    }

    goals.push({
      week,
      title,
      tasks,
      deadline: formatDate(weekDeadline),
    });
  }

  return goals;
}

function generateChecklist(
  opp: Opportunity,
  category: string
): AIGeneratedRoadmap['checklist'] {
  const checklist: AIGeneratedRoadmap['checklist'] = [];
  let id = 1;

  // Documents category
  const docItems = [
    'Official academic transcripts',
    'Updated CV/Resume',
    'Proof of identity (passport/national ID)',
    'Academic certificates and diplomas',
  ];

  if (category.includes('scholar') || category.includes('fellow')) {
    docItems.push('Proof of financial need (if required)');
    docItems.push('Academic recommendation letters (2-3)');
  }

  if (category.includes('job') || category.includes('intern')) {
    docItems.push('Professional reference letters');
    docItems.push('Portfolio or work samples');
  }

  docItems.forEach(item => {
    checklist.push({
      id: `checklist-${id++}`,
      title: item,
      category: 'document',
      completed: false,
    });
  });

  // Preparation category
  const prepItems = [
    'Research the organization thoroughly',
    'Understand the selection criteria',
    'Identify your unique selling points',
    'Prepare answers to common interview questions',
    'Practice your elevator pitch',
  ];

  prepItems.forEach(item => {
    checklist.push({
      id: `checklist-${id++}`,
      title: item,
      category: 'preparation',
      completed: false,
    });
  });

  // Application category
  const appItems = [
    'Complete online application form',
    'Write compelling personal statement',
    'Draft and refine all required essays',
    'Upload all required documents',
    'Submit recommendation letter requests',
    'Review application before submission',
  ];

  appItems.forEach(item => {
    checklist.push({
      id: `checklist-${id++}`,
      title: item,
      category: 'application',
      completed: false,
    });
  });

  // Interview category (if applicable)
  if (category.includes('scholar') || category.includes('fellow') || category.includes('job')) {
    const interviewItems = [
      'Research common interview formats',
      'Prepare your interview attire',
      'Test your tech setup (for virtual interviews)',
      'Prepare questions to ask the interviewer',
    ];

    interviewItems.forEach(item => {
      checklist.push({
        id: `checklist-${id++}`,
        title: item,
        category: 'interview',
        completed: false,
      });
    });
  }

  // Follow-up category
  checklist.push({
    id: `checklist-${id++}`,
    title: 'Send thank-you email after interview (if applicable)',
    category: 'follow-up',
    completed: false,
  });

  checklist.push({
    id: `checklist-${id++}`,
    title: 'Track application status regularly',
    category: 'follow-up',
    completed: false,
  });

  return checklist;
}

function generateReminders(
  milestones: RoadmapMilestone[],
  deadline: Date,
  startDate: Date
): AIGeneratedRoadmap['reminders'] {
  const reminders: AIGeneratedRoadmap['reminders'] = [];
  let id = 1;

  // Milestone reminders (1 week before each milestone)
  milestones.forEach(milestone => {
    const milestoneDate = new Date(milestone.date);
    const reminderDate = addDays(milestoneDate, -7);

    if (reminderDate > startDate) {
      reminders.push({
        id: `reminder-${id++}`,
        title: `Upcoming: ${milestone.title}`,
        date: formatDate(reminderDate),
        type: 'milestone',
      });
    }
  });

  // Deadline reminders
  const deadlineReminders = [30, 14, 7, 3, 1];

  deadlineReminders.forEach(daysBefore => {
    const reminderDate = addDays(deadline, -daysBefore);
    if (reminderDate > startDate) {
      reminders.push({
        id: `reminder-${id++}`,
        title: daysBefore === 1
          ? '🚨 Application deadline is tomorrow!'
          : daysBefore === 3
            ? '⚡ Application deadline in 3 days!'
            : daysBefore === 7
              ? '📅 One week until deadline!'
              : daysBefore === 14
                ? '📋 Two weeks until deadline'
                : '🗓️ One month until deadline',
        date: formatDate(reminderDate),
        type: 'deadline',
      });
    }
  });

  // Checklist reminders (weekly)
  const totalWeeks = weeksBetween(startDate, deadline);
  for (let week = 1; week <= totalWeeks; week++) {
    const weekStart = addWeeks(startDate, week);
    if (weekStart < deadline) {
      reminders.push({
        id: `reminder-${id++}`,
        title: `Week ${week}: Review your preparation checklist`,
        date: formatDate(weekStart),
        type: 'checklist',
      });
    }
  }

  return reminders.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function generateResources(opp: Opportunity, category: string): RoadmapResource[] {
  const opportunityQuery = `${opp.title} ${opp.organization}`;
  const sopQuery = `${category.includes('scholar') ? 'scholarship' : 'application'} statement of purpose writing tips`;
  const cvQuery = `${category.includes('scholar') ? 'scholarship CV' : 'application CV'} template PDF`;
  const interviewQuery = `${opp.organization} ${opp.title} interview preparation`;

  const resources: RoadmapResource[] = [
    {
      id: 'resource-official',
      title: 'Official application page',
      type: 'official',
      description: 'Use this as the source of truth for deadline, eligibility, required documents, and apply link.',
      url: opp.applyUrl,
    },
    {
      id: 'resource-youtube-sop',
      title: 'SOP and essay coaching videos',
      type: 'youtube',
      description: 'Watch examples of strong essays, then adapt the structure to your own evidence and goals.',
      url: buildSearchUrl('https://www.youtube.com/results?search_query=', sopQuery),
    },
    {
      id: 'resource-youtube-interview',
      title: 'Interview and selection prep videos',
      type: 'youtube',
      description: 'Practice explaining your leadership, fit, and impact in a concise spoken answer.',
      url: buildSearchUrl('https://www.youtube.com/results?search_query=', interviewQuery),
    },
    {
      id: 'resource-pdf-cv',
      title: 'CV and application PDF templates',
      type: 'pdf',
      description: 'Find clean templates for CVs, recommendation request sheets, and application checklists.',
      url: buildSearchUrl('https://www.google.com/search?q=', `${cvQuery} filetype:pdf`),
    },
    {
      id: 'resource-community',
      title: 'Applicant groups and communities',
      type: 'community',
      description: 'Search for recent applicants, alumni groups, or student communities to learn practical expectations.',
      url: buildSearchUrl('https://www.google.com/search?q=', `${opportunityQuery} applicants group alumni`),
    },
    {
      id: 'resource-mentor',
      title: 'Mentor feedback checkpoint',
      type: 'mentor',
      description: 'Ask a teacher, advisor, alumni, or senior student to review your CV and SOP before submission.',
    },
  ];

  return resources.filter((resource) => resource.type !== 'official' || Boolean(resource.url));
}

/** Map each listed requirement to a concrete evidence-producing action. */
function generateRequirementActions(opp: Opportunity): RequirementAction[] {
  return (opp.requirements || []).slice(0, 15).map((requirement) => {
    const lower = requirement.toLowerCase();
    let action = 'Gather or produce the evidence that proves you meet this, and file it in your application folder.';
    if (/transcript|academic record|grade|gpa|result/.test(lower)) {
      action = 'Request official transcripts from your institution now — they often take 1-2 weeks to issue.';
    } else if (/recommendation|referee|reference letter/.test(lower)) {
      action = 'Choose 2-3 referees today and brief them with your CV and this opportunity\'s criteria.';
    } else if (/essay|statement|motivation|sop|cover letter/.test(lower)) {
      action = 'Outline this within the first week; strong drafts need at least two feedback rounds.';
    } else if (/cv|resume|portfolio/.test(lower)) {
      action = 'Update it with your latest results and tailor one line of proof to each selection criterion.';
    } else if (/english|language|ielts|toefl|proficiency/.test(lower)) {
      action = 'Check whether a test score is required and book the earliest test date if you lack one.';
    } else if (/age|years old|under \d|nationality|citizen|resident/.test(lower)) {
      action = 'Verify you qualify before investing time — confirm with your ID/passport details.';
    } else if (/degree|bachelor|master|diploma|enrolled|student/.test(lower)) {
      action = 'Prepare proof of enrollment or your certificate copy, scanned clearly as PDF.';
    }
    return { requirement, action };
  });
}

/** Compare the applicant profile against the opportunity to surface fixable gaps. */
function generateProfileGaps(
  opp: Opportunity,
  category: string,
  profile?: ApplicantProfile
): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  if (!profile) {
    return [
      {
        gap: 'Your Edutu profile is incomplete, so this plan is not yet personalized.',
        action: 'Fill in your education level, field of study, and ambitions in your profile, then regenerate.',
      },
    ];
  }

  if (!profile.pursuit) {
    gaps.push({
      gap: 'No field of study/pursuit on your profile.',
      action: 'Add it so your application story can connect your academic direction to this opportunity.',
    });
  }
  if (!profile.ambitions?.length) {
    gaps.push({
      gap: 'No stated ambitions on your profile.',
      action: 'Write 2-3 sentences on your long-term goal — selectors reward clear direction.',
    });
  }
  if (!profile.gradeLevel && !profile.isGraduate) {
    gaps.push({
      gap: 'Your education level is not set.',
      action: 'Set it so eligibility checks and essay framing match your actual stage.',
    });
  }
  if (category.includes('scholar') && profile.interests?.length) {
    const text = `${opp.title} ${opp.description || ''}`.toLowerCase();
    const overlaps = profile.interests.filter((interest) => text.includes(interest.toLowerCase()));
    if (overlaps.length === 0) {
      gaps.push({
        gap: 'None of your listed interests obviously connect to this opportunity.',
        action: 'Decide your strongest genuine link to this program and make it the spine of your essay.',
      });
    }
  }
  return gaps.slice(0, 4);
}

/** Category-level tactics used by past winners; the AI replaces these with sharper ones. */
function generateBestPractices(category: string): string[] {
  const isScholarly = category.includes('scholar') || category.includes('fellow') || category.includes('grant');
  return isScholarly
    ? [
        'Winners submit 3-5 days early — portals slow down or crash near deadlines.',
        'Tie every essay paragraph to one proof point: an award, project, or measurable result.',
        'Brief your referees with your CV and the program criteria before they write.',
        'Mirror the program\'s own language when describing your impact and goals.',
        'Have one non-expert read your essay — if they can\'t retell your story, simplify it.',
      ]
    : [
        'Tailor your CV to the listed requirements — one line of proof per requirement.',
        'Research the organization\'s recent work and reference it in your motivation.',
        'Submit early and confirm receipt; follow up politely if you get no confirmation.',
        'Prepare a 60-second story of your best result for screening calls.',
        'Connect with current or past participants on LinkedIn and ask one specific question.',
      ];
}

function generateSupportActions(opp: Opportunity, category: string): string[] {
  return [
    `Join or search for a recent applicant/alumni community for ${opp.organization}.`,
    'Find one mentor to review your CV and statement before the final week.',
    'Prepare a single evidence folder for transcripts, certificates, awards, passport/ID, and recommendation letters.',
    'Book two feedback checkpoints: one after first draft, one before final submission.',
    category.includes('scholar')
      ? 'Prepare a funding and impact story: why you need support, what you will do with it, and who benefits.'
      : 'Prepare a fit story: why this role/program, why you, and what measurable value you bring.',
  ];
}

function generateWinningStrategy(
  opp: Opportunity,
  daysUntilDeadline: number,
  submissionBufferDays: number,
  category: string
): string {
  const evidence = category.includes('scholar')
    ? 'academic strength, leadership, service, financial or contextual need, and long-term impact'
    : 'fit, proof of skill, execution history, and motivation';

  return `Aim to submit ${submissionBufferDays} days before the official deadline. Use the remaining ${daysUntilDeadline} days to prove ${evidence}. Every task should create one asset: a document, essay paragraph, recommender update, proof file, or review note.`;
}

function generateSummary(
  opp: Opportunity,
  totalWeeks: number,
  category: string,
  daysUntilDeadline: number,
  submissionTarget: Date
): string {
  const categoryLabel = category.includes('scholar') ? 'scholarship'
    : category.includes('fellow') ? 'fellowship'
      : category.includes('job') ? 'position'
        : category.includes('intern') ? 'internship'
          : 'opportunity';

  return `You have ${daysUntilDeadline} day${daysUntilDeadline === 1 ? '' : 's'} until the deadline. This ${totalWeeks}-week roadmap targets submission by ${formatDate(submissionTarget)} and turns ${opp.title} into daily actions, milestones, resources, checklist items, goals, and reminders to help you compete strongly for this ${categoryLabel}.`;
}
