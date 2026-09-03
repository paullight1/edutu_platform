import {
  resolveOpportunityTemplateKind,
  type OpportunityJourneyTaskTemplate,
  type OpportunityTemplateKind,
} from "./opportunity-journey-templates";

const BASE_EFFORT_HOURS: Record<OpportunityTemplateKind, number> = {
  scholarship: 8,
  employment: 5,
  fellowship: 7,
  grant: 15,
  lightweight: 3,
};

const REQUIREMENT_ADJUSTMENTS: Array<{
  pattern: RegExp;
  hours: number;
}> = [
  { pattern: /\b(transcripts?|academic records?|certificates?)\b/iu, hours: 2 },
  {
    pattern: /\b(references?|recommendation letters?|referees?)\b/iu,
    hours: 2,
  },
  { pattern: /\b(essays?|statements?|motivation letters?)\b/iu, hours: 3 },
  { pattern: /\b(portfolios?|work samples?)\b/iu, hours: 3 },
  {
    pattern: /\b(budgets?|financial statements?|accounts?)\b/iu,
    hours: 4,
  },
  { pattern: /\b(proposals?|business plans?|project plans?)\b/iu, hours: 5 },
  { pattern: /\b(videos?|pitches?)\b/iu, hours: 3 },
  { pattern: /\b(interviews?|assessments?|tests?)\b/iu, hours: 3 },
  { pattern: /\b(cv|resume|curriculum vitae)\b/iu, hours: 1 },
];

export function estimateOpportunityEffortHours(input: {
  category: string | null | undefined;
  requirementsText?: string | null;
}): number {
  const kind = resolveOpportunityTemplateKind(input.category);
  const text = input.requirementsText ?? "";
  const adjustment = REQUIREMENT_ADJUSTMENTS.reduce(
    (total, rule) => total + (rule.pattern.test(text) ? rule.hours : 0),
    0,
  );
  return Math.min(40, BASE_EFFORT_HOURS[kind] + adjustment);
}

export interface ScheduledOpportunityTask
  extends OpportunityJourneyTaskTemplate {
  dueAt: Date;
}

export function scheduleOpportunityJourneyTasks(input: {
  tasks: OpportunityJourneyTaskTemplate[];
  startAt: Date;
  deadline?: Date | null;
  weeklyHours: number;
  estimatedEffortHours?: number;
}): ScheduledOpportunityTask[] {
  if (input.tasks.length === 0) return [];

  const start = new Date(input.startAt);
  const oneDay = 86_400_000;
  const weeklyHours = Math.max(1, Math.min(40, input.weeklyHours));
  const effort = Math.max(
    input.tasks.length,
    input.estimatedEffortHours ?? input.tasks.length * 1.5,
  );

  let end: Date;
  if (input.deadline && input.deadline.getTime() > start.getTime()) {
    const preferredBuffer = input.deadline.getTime() - oneDay;
    end = new Date(Math.max(start.getTime(), preferredBuffer));
  } else {
    const preparationWeeks = Math.max(1, effort / weeklyHours);
    end = new Date(start.getTime() + preparationWeeks * 7 * oneDay);
  }

  const span = Math.max(0, end.getTime() - start.getTime());
  return input.tasks.map((task, index) => ({
    ...task,
    dueAt: new Date(
      start.getTime() + Math.round((span * (index + 1)) / input.tasks.length),
    ),
  }));
}
