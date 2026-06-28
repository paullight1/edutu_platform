import { Opportunity } from '../types/opportunity';

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
  startDate: Date = new Date()
): AIGeneratedRoadmap {
  const parsedDeadline = opportunity.deadline ? new Date(opportunity.deadline) : null;
  const deadline = parsedDeadline && !Number.isNaN(parsedDeadline.getTime()) ? parsedDeadline : addDays(startDate, 90);
  const daysUntilDeadline = daysBetween(startDate, deadline);
  const submissionBufferDays = daysUntilDeadline > 60 ? 7 : daysUntilDeadline > 21 ? 4 : 2;
  const submissionTarget = clampDate(addDays(deadline, -submissionBufferDays), startDate, deadline);
  const daysUntilSubmissionTarget = daysBetween(startDate, submissionTarget);
  const totalWeeks = weeksBetween(startDate, submissionTarget);
  const category = opportunity.category?.toLowerCase() || '';

  const milestones = generateMilestones(opportunity, startDate, deadline, submissionTarget, totalWeeks, category);
  const dailyPlan = generateDailyPlan(opportunity, startDate, submissionTarget, category);
  const weeklyGoals = generateWeeklyGoals(opportunity, startDate, submissionTarget, totalWeeks, category);
  const checklist = generateChecklist(opportunity, category);
  const resources = generateResources(opportunity, category);
  const reminders = generateReminders(milestones, deadline, startDate);
  const supportActions = generateSupportActions(opportunity, category);
  const winningStrategy = generateWinningStrategy(opportunity, daysUntilDeadline, submissionBufferDays, category);
  const summary = generateSummary(opportunity, totalWeeks, category, daysUntilDeadline, submissionTarget);

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
  };
}

function generateMilestones(
  opp: Opportunity,
  start: Date,
  deadline: Date,
  submissionTarget: Date,
  totalWeeks: number,
  category: string
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
  submissionTarget: Date,
  category: string
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
      description: buildDailyDescription(opp, phase.focus, title, category),
      focus: phase.focus,
      durationMinutes: phase.focus === 'writing' || phase.focus === 'review' ? 75 : 45,
    });
  }

  return dailyPlan;
}

function buildDailyDescription(
  opp: Opportunity,
  focus: RoadmapDailyAction['focus'],
  title: string,
  category: string
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
    const weekStart = addWeeks(start, week - 1);
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
