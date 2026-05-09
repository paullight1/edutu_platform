import type { Opportunity } from '../types/opportunity';

export interface RoadmapTask {
  id: string;
  title: string;
  description: string;
  duration: string;
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  description: string;
  week: number;
  tasks: RoadmapTask[];
}

export interface WeeklyChecklistItem {
  item: string;
  done: boolean;
}

export interface WeeklyGoal {
  week: number;
  goal: string;
  checklist: WeeklyChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  item: string;
  done: boolean;
  category: string;
}

export interface RoadmapOverview {
  totalMilestones: number;
  estimatedWeeks: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface GeneratedRoadmap {
  overview: RoadmapOverview;
  milestones: RoadmapMilestone[];
  weeklyGoals: WeeklyGoal[];
  checklist: ChecklistItem[];
}

const categoryTemplates: Record<string, Omit<GeneratedRoadmap, 'overview'>> = {
  scholarship: {
    milestones: [
      {
        id: 'm1',
        title: 'Research & Eligibility Check',
        description: 'Verify eligibility criteria and gather scholarship details',
        week: 1,
        tasks: [
          { id: 't1', title: 'Review eligibility requirements', description: 'Check academic, geographic, and demographic criteria', duration: '2 hours' },
          { id: 't2', title: 'Document required materials', description: 'List all documents, essays, and references needed', duration: '1 hour' },
          { id: 't3', title: 'Research past winners', description: 'Study successful applicants backgrounds and essays', duration: '3 hours' }
        ]
      },
      {
        id: 'm2',
        title: 'Document Preparation',
        description: 'Gather and prepare all required documents',
        week: 2,
        tasks: [
          { id: 't4', title: 'Request official transcripts', description: 'Contact your institution for official academic records', duration: '1 hour' },
          { id: 't5', title: 'Update CV/Resume', description: 'Tailor your resume to highlight relevant achievements', duration: '3 hours' },
          { id: 't6', title: 'Collect certificates', description: 'Gather academic and extracurricular certificates', duration: '2 hours' }
        ]
      },
      {
        id: 'm3',
        title: 'Essay & Personal Statement',
        description: 'Write compelling essays that stand out',
        week: 3,
        tasks: [
          { id: 't7', title: 'Brainstorm essay topics', description: 'Identify your unique story and key achievements', duration: '2 hours' },
          { id: 't8', title: 'Write first draft', description: 'Create a complete first draft of your personal statement', duration: '4 hours' },
          { id: 't9', title: 'Get feedback', description: 'Share draft with mentors or peers for review', duration: '1 hour' },
          { id: 't10', title: 'Revise and polish', description: 'Incorporate feedback and refine your essay', duration: '3 hours' }
        ]
      },
      {
        id: 'm4',
        title: 'Recommendation Letters',
        description: 'Secure strong letters of recommendation',
        week: 4,
        tasks: [
          { id: 't11', title: 'Identify recommenders', description: 'Choose professors or supervisors who know you well', duration: '1 hour' },
          { id: 't12', title: 'Request recommendations', description: 'Send formal requests with deadline and materials', duration: '2 hours' },
          { id: 't13', title: 'Follow up', description: 'Check in with recommenders one week before deadline', duration: '30 min' }
        ]
      },
      {
        id: 'm5',
        title: 'Application Submission',
        description: 'Complete and submit your application',
        week: 5,
        tasks: [
          { id: 't14', title: 'Fill application form', description: 'Complete all required fields accurately', duration: '2 hours' },
          { id: 't15', title: 'Upload documents', description: 'Attach all prepared documents in required formats', duration: '1 hour' },
          { id: 't16', title: 'Final review', description: 'Double-check everything before submission', duration: '1 hour' },
          { id: 't17', title: 'Submit application', description: 'Submit and save confirmation receipt', duration: '30 min' }
        ]
      },
      {
        id: 'm6',
        title: 'Interview Preparation',
        description: 'Prepare for potential interview rounds',
        week: 6,
        tasks: [
          { id: 't18', title: 'Research common questions', description: 'Study typical scholarship interview questions', duration: '2 hours' },
          { id: 't19', title: 'Practice mock interviews', description: 'Do practice sessions with friends or mentors', duration: '3 hours' },
          { id: 't20', title: 'Prepare your questions', description: 'Create thoughtful questions to ask interviewers', duration: '1 hour' }
        ]
      }
    ],
    weeklyGoals: [
      { week: 1, goal: 'Complete eligibility research and create application timeline', checklist: [{ item: 'Eligibility verified', done: false }, { item: 'Requirements documented', done: false }, { item: 'Timeline created', done: false }] },
      { week: 2, goal: 'Gather all required documents', checklist: [{ item: 'Transcripts requested', done: false }, { item: 'CV updated', done: false }, { item: 'Certificates collected', done: false }] },
      { week: 3, goal: 'Write and refine personal statement', checklist: [{ item: 'Topics brainstormed', done: false }, { item: 'First draft written', done: false }, { item: 'Feedback received', done: false }, { item: 'Final version ready', done: false }] },
      { week: 4, goal: 'Secure recommendation letters', checklist: [{ item: 'Recommenders identified', done: false }, { item: 'Requests sent', done: false }, { item: 'Follow-ups done', done: false }] },
      { week: 5, goal: 'Submit complete application', checklist: [{ item: 'Form filled', done: false }, { item: 'Documents uploaded', done: false }, { item: 'Application submitted', done: false }] },
      { week: 6, goal: 'Prepare for interviews', checklist: [{ item: 'Questions researched', done: false }, { item: 'Mock interviews done', done: false }, { item: 'Your questions prepared', done: false }] }
    ],
    checklist: [
      { id: 'c1', item: 'Academic transcripts', done: false, category: 'Documents' },
      { id: 'c2', item: 'Updated CV/Resume', done: false, category: 'Documents' },
      { id: 'c3', item: 'Certificates and awards', done: false, category: 'Documents' },
      { id: 'c4', item: 'ID/Passport copy', done: false, category: 'Documents' },
      { id: 'c5', item: 'Personal statement', done: false, category: 'Documents' },
      { id: 'c6', item: 'Research organization background', done: false, category: 'Skills' },
      { id: 'c7', item: 'Study past winners profiles', done: false, category: 'Skills' },
      { id: 'c8', item: 'Prepare portfolio (if required)', done: false, category: 'Skills' },
      { id: 'c9', item: 'Complete application form', done: false, category: 'Applications' },
      { id: 'c10', item: 'Submit recommendation requests', done: false, category: 'Applications' },
      { id: 'c11', item: 'Pay application fee (if any)', done: false, category: 'Applications' },
      { id: 'c12', item: 'Practice mock interviews', done: false, category: 'Interview Prep' },
      { id: 'c13', item: 'Prepare elevator pitch', done: false, category: 'Interview Prep' },
      { id: 'c14', item: 'Research interviewers', done: false, category: 'Interview Prep' },
      { id: 'c15', item: 'Plan interview outfit', done: false, category: 'Interview Prep' }
    ]
  },
  internship: {
    milestones: [
      {
        id: 'm1',
        title: 'Company Research',
        description: 'Understand the company culture, values, and role requirements',
        week: 1,
        tasks: [
          { id: 't1', title: 'Research company background', description: 'Study company history, mission, and recent news', duration: '2 hours' },
          { id: 't2', title: 'Analyze job description', description: 'Break down required skills and qualifications', duration: '1 hour' },
          { id: 't3', title: 'Connect with current employees', description: 'Reach out on LinkedIn for insights', duration: '2 hours' }
        ]
      },
      {
        id: 'm2',
        title: 'Resume & Cover Letter',
        description: 'Create tailored application materials',
        week: 2,
        tasks: [
          { id: 't4', title: 'Tailor resume', description: 'Highlight relevant skills and experiences', duration: '3 hours' },
          { id: 't5', title: 'Write cover letter', description: 'Craft a compelling narrative for this specific role', duration: '2 hours' },
          { id: 't6', title: 'Get feedback', description: 'Have mentors review your materials', duration: '1 hour' }
        ]
      },
      { id: 'm3', title: 'Skill Assessment Prep', description: 'Prepare for technical or skills assessments', week: 3, tasks: [{ id: 't7', title: 'Practice technical problems', description: 'Work on relevant coding or case study problems', duration: '4 hours' }, { id: 't8', title: 'Review core concepts', description: 'Refresh knowledge in key areas', duration: '3 hours' }] },
      { id: 'm4', title: 'Interview Preparation', description: 'Practice and prepare for interview rounds', week: 4, tasks: [{ id: 't9', title: 'Behavioral questions prep', description: 'Prepare STAR method responses', duration: '2 hours' }, { id: 't10', title: 'Technical interview practice', description: 'Mock technical interviews', duration: '3 hours' }, { id: 't11', title: 'Company-specific research', description: 'Prepare questions and talking points', duration: '1 hour' }] },
      { id: 'm5', title: 'Application & Follow-up', description: 'Submit application and track status', week: 5, tasks: [{ id: 't12', title: 'Submit application', description: 'Apply through the official channel', duration: '1 hour' }, { id: 't13', title: 'Send follow-up email', description: 'Thank you and status check', duration: '30 min' }] }
    ],
    weeklyGoals: [
      { week: 1, goal: 'Complete thorough company and role research', checklist: [{ item: 'Company researched', done: false }, { item: 'Role requirements analyzed', done: false }, { item: 'LinkedIn connections made', done: false }] },
      { week: 2, goal: 'Finalize resume and cover letter', checklist: [{ item: 'Resume tailored', done: false }, { item: 'Cover letter written', done: false }, { item: 'Feedback incorporated', done: false }] },
      { week: 3, goal: 'Prepare for skills assessments', checklist: [{ item: 'Practice problems completed', done: false }, { item: 'Core concepts reviewed', done: false }] },
      { week: 4, goal: 'Master interview skills', checklist: [{ item: 'Behavioral answers prepared', done: false }, { item: 'Technical practice done', done: false }, { item: 'Questions for interviewer ready', done: false }] },
      { week: 5, goal: 'Submit and follow up', checklist: [{ item: 'Application submitted', done: false }, { item: 'Follow-up sent', done: false }] }
    ],
    checklist: [
      { id: 'c1', item: 'Tailored resume', done: false, category: 'Documents' },
      { id: 'c2', item: 'Cover letter', done: false, category: 'Documents' },
      { id: 'c3', item: 'Portfolio/GitHub (if applicable)', done: false, category: 'Documents' },
      { id: 'c4', item: 'Company research notes', done: false, category: 'Skills' },
      { id: 'c5', item: 'Technical skills practiced', done: false, category: 'Skills' },
      { id: 'c6', item: 'Industry knowledge updated', done: false, category: 'Skills' },
      { id: 'c7', item: 'Application form completed', done: false, category: 'Applications' },
      { id: 'c8', item: 'References prepared', done: false, category: 'Applications' },
      { id: 'c9', item: 'Mock interviews completed', done: false, category: 'Interview Prep' },
      { id: 'c10', item: 'STAR stories prepared', done: false, category: 'Interview Prep' },
      { id: 'c11', item: 'Professional outfit ready', done: false, category: 'Interview Prep' },
      { id: 'c12', item: 'Thank-you email template', done: false, category: 'Interview Prep' }
    ]
  },
  competition: {
    milestones: [
      { id: 'm1', title: 'Competition Analysis', description: 'Understand rules, format, and evaluation criteria', week: 1, tasks: [{ id: 't1', title: 'Read competition rules', description: 'Study all guidelines and requirements', duration: '2 hours' }, { id: 't2', title: 'Study past winners', description: 'Analyze winning entries and approaches', duration: '3 hours' }] },
      { id: 'm2', title: 'Project Planning', description: 'Define your project scope and timeline', week: 2, tasks: [{ id: 't3', title: 'Define project concept', description: 'Brainstorm and select your best idea', duration: '3 hours' }, { id: 't4', title: 'Create project plan', description: 'Break down into milestones and deadlines', duration: '2 hours' }, { id: 't5', title: 'Gather resources', description: 'Collect tools, data, and materials needed', duration: '2 hours' }] },
      { id: 'm3', title: 'Development Phase', description: 'Build and develop your project or entry', week: 3, tasks: [{ id: 't6', title: 'Start development', description: 'Begin building your project', duration: '6 hours' }, { id: 't7', title: 'Mid-point review', description: 'Assess progress and adjust plan', duration: '1 hour' }, { id: 't8', title: 'Complete core features', description: 'Finish the main components', duration: '8 hours' }] },
      { id: 'm4', title: 'Refinement & Testing', description: 'Polish your work and test thoroughly', week: 4, tasks: [{ id: 't9', title: 'Refine and optimize', description: 'Improve quality and fix issues', duration: '4 hours' }, { id: 't10', title: 'Get peer feedback', description: 'Share with others for review', duration: '2 hours' }, { id: 't11', title: 'Final testing', description: 'Test everything works as expected', duration: '2 hours' }] },
      { id: 'm5', title: 'Submission', description: 'Prepare and submit your final entry', week: 5, tasks: [{ id: 't12', title: 'Prepare submission materials', description: 'Create presentations, documentation', duration: '3 hours' }, { id: 't13', title: 'Final review', description: 'Check against all requirements', duration: '1 hour' }, { id: 't14', title: 'Submit entry', description: 'Submit before deadline', duration: '30 min' }] }
    ],
    weeklyGoals: [
      { week: 1, goal: 'Understand competition thoroughly', checklist: [{ item: 'Rules studied', done: false }, { item: 'Past winners analyzed', done: false }] },
      { week: 2, goal: 'Plan your project', checklist: [{ item: 'Concept defined', done: false }, { item: 'Project plan created', done: false }, { item: 'Resources gathered', done: false }] },
      { week: 3, goal: 'Build your project', checklist: [{ item: 'Development started', done: false }, { item: 'Mid-point review done', done: false }, { item: 'Core features complete', done: false }] },
      { week: 4, goal: 'Polish and test', checklist: [{ item: 'Refinements made', done: false }, { item: 'Feedback received', done: false }, { item: 'Testing passed', done: false }] },
      { week: 5, goal: 'Submit entry', checklist: [{ item: 'Materials prepared', done: false }, { item: 'Final review done', done: false }, { item: 'Entry submitted', done: false }] }
    ],
    checklist: [
      { id: 'c1', item: 'Competition rules document', done: false, category: 'Documents' },
      { id: 'c2', item: 'Project proposal/plan', done: false, category: 'Documents' },
      { id: 'c3', item: 'Submission documentation', done: false, category: 'Documents' },
      { id: 'c4', item: 'Technical skills practiced', done: false, category: 'Skills' },
      { id: 'c5', item: 'Domain knowledge researched', done: false, category: 'Skills' },
      { id: 'c6', item: 'Project built and tested', done: false, category: 'Applications' },
      { id: 'c7', item: 'Entry submitted on time', done: false, category: 'Applications' },
      { id: 'c8', item: 'Presentation practiced', done: false, category: 'Interview Prep' },
      { id: 'c9', item: 'Q&A preparation', done: false, category: 'Interview Prep' }
    ]
  },
  fellowship: {
    milestones: [
      { id: 'm1', title: 'Program Research', description: 'Deep dive into the fellowship program details', week: 1, tasks: [{ id: 't1', title: 'Study program overview', description: 'Understand goals, duration, and benefits', duration: '2 hours' }, { id: 't2', title: 'Research alumni', description: 'Connect with past fellows for insights', duration: '3 hours' }] },
      { id: 'm2', title: 'Application Essays', description: 'Write powerful, authentic essays', week: 2, tasks: [{ id: 't3', title: 'Essay brainstorming', description: 'Identify your unique value proposition', duration: '3 hours' }, { id: 't4', title: 'Draft essays', description: 'Write complete drafts for all prompts', duration: '5 hours' }, { id: 't5', title: 'Revise with feedback', description: 'Get expert feedback and refine', duration: '3 hours' }] },
      { id: 'm3', title: 'References & Portfolio', description: 'Secure recommendations and compile portfolio', week: 3, tasks: [{ id: 't6', title: 'Select references', description: 'Choose people who can speak to your strengths', duration: '1 hour' }, { id: 't7', title: 'Request letters', description: 'Send formal requests with context', duration: '1 hour' }, { id: 't8', title: 'Compile portfolio', description: 'Organize work samples and achievements', duration: '3 hours' }] },
      { id: 'm4', title: 'Interview Prep', description: 'Prepare for rigorous fellowship interviews', week: 4, tasks: [{ id: 't9', title: 'Practice panel interviews', description: 'Mock interviews with multiple questioners', duration: '3 hours' }, { id: 't10', title: 'Prepare presentation', description: 'Create and practice any required presentations', duration: '4 hours' }] },
      { id: 'm5', title: 'Final Submission', description: 'Complete and submit your application', week: 5, tasks: [{ id: 't11', title: 'Complete application', description: 'Fill all sections carefully', duration: '2 hours' }, { id: 't12', title: 'Submit before deadline', description: 'Double-check and submit', duration: '1 hour' }] }
    ],
    weeklyGoals: [
      { week: 1, goal: 'Research fellowship thoroughly', checklist: [{ item: 'Program goals understood', done: false }, { item: 'Alumni contacted', done: false }] },
      { week: 2, goal: 'Write compelling essays', checklist: [{ item: 'Brainstorming done', done: false }, { item: 'Drafts written', done: false }, { item: 'Feedback incorporated', done: false }] },
      { week: 3, goal: 'Gather references and portfolio', checklist: [{ item: 'References selected', done: false }, { item: 'Letters requested', done: false }, { item: 'Portfolio compiled', done: false }] },
      { week: 4, goal: 'Prepare for interviews', checklist: [{ item: 'Mock interviews done', done: false }, { item: 'Presentation ready', done: false }] },
      { week: 5, goal: 'Submit application', checklist: [{ item: 'Application complete', done: false }, { item: 'Submitted on time', done: false }] }
    ],
    checklist: [
      { id: 'c1', item: 'Program research notes', done: false, category: 'Documents' },
      { id: 'c2', item: 'Application essays', done: false, category: 'Documents' },
      { id: 'c3', item: 'Portfolio/work samples', done: false, category: 'Documents' },
      { id: 'c4', item: 'CV/Resume', done: false, category: 'Documents' },
      { id: 'c5', item: 'Leadership experience documented', done: false, category: 'Skills' },
      { id: 'c6', item: 'Community involvement highlighted', done: false, category: 'Skills' },
      { id: 'c7', item: 'Application form completed', done: false, category: 'Applications' },
      { id: 'c8', item: 'Recommendation letters received', done: false, category: 'Applications' },
      { id: 'c9', item: 'Panel interview practiced', done: false, category: 'Interview Prep' },
      { id: 'c10', item: 'Presentation rehearsed', done: false, category: 'Interview Prep' },
      { id: 'c11', item: 'Personal pitch perfected', done: false, category: 'Interview Prep' }
    ]
  }
};

const defaultTemplate = categoryTemplates.scholarship;

function calculateDifficulty(opportunity: Opportunity): 'Easy' | 'Medium' | 'Hard' {
  if (opportunity.difficulty) return opportunity.difficulty;
  const stepCount = opportunity.applicationProcess.length;
  if (stepCount <= 2) return 'Easy';
  if (stepCount <= 4) return 'Medium';
  return 'Hard';
}

function findTemplate(category: string): Omit<GeneratedRoadmap, 'overview'> {
  const lower = category.toLowerCase();
  if (lower.includes('scholarship') || lower.includes('grant') || lower.includes('award')) return categoryTemplates.scholarship;
  if (lower.includes('intern') || lower.includes('job') || lower.includes('career') || lower.includes('work')) return categoryTemplates.internship;
  if (lower.includes('compet') || lower.includes('hackathon') || lower.includes('challenge')) return categoryTemplates.competition;
  if (lower.includes('fellow') || lower.includes('program') || lower.includes('training')) return categoryTemplates.fellowship;
  return defaultTemplate;
}

function calculateEstimatedWeeks(template: Omit<GeneratedRoadmap, 'overview'>): number {
  const maxWeek = Math.max(...template.milestones.map(m => m.week));
  return maxWeek;
}

export function generateRoadmap(opportunity: Opportunity): GeneratedRoadmap {
  const template = findTemplate(opportunity.category);
  const difficulty = calculateDifficulty(opportunity);
  const estimatedWeeks = calculateEstimatedWeeks(template);

  const overview: RoadmapOverview = {
    totalMilestones: template.milestones.length,
    estimatedWeeks,
    difficulty
  };

  const startDate = new Date();

  const weeklyGoals = template.weeklyGoals.map(wg => ({
    ...wg,
    checklist: wg.checklist.map(ci => ({ ...ci }))
  }));

  const milestones = template.milestones.map(m => ({
    ...m,
    tasks: m.tasks.map(t => ({ ...t }))
  }));

  const checklist = template.checklist.map(c => ({ ...c }));

  return { overview, milestones, weeklyGoals, checklist };
}

export function generateAISummary(opportunity: Opportunity, roadmap: GeneratedRoadmap): string {
  const { overview } = roadmap;
  const category = opportunity.category.toLowerCase();
  
  const summaries: Record<string, string> = {
    scholarship: `This ${overview.estimatedWeeks}-week preparation path covers ${overview.totalMilestones} key milestones to maximize your scholarship application. Starting with thorough research and document gathering, you'll craft compelling essays, secure strong recommendations, and prepare for interviews. The ${overview.difficulty.toLowerCase()} difficulty rating reflects the comprehensive nature of scholarship applications. Stay consistent with weekly goals and you'll have a strong, polished application ready before the deadline.`,
    internship: `Over ${overview.estimatedWeeks} weeks, this roadmap guides you through ${overview.totalMilestones} milestones to land your ideal internship. You'll start by researching the company and role, then craft tailored application materials. Skill assessment prep and intensive interview practice will give you the edge. With a ${overview.difficulty.toLowerCase()} difficulty level, consistent weekly progress will position you as a top candidate.`,
    competition: `This ${overview.estimatedWeeks}-week plan covers ${overview.totalMilestones} milestones to develop a winning competition entry. From initial analysis through project development to final submission, each week builds on the last. The ${overview.difficulty.toLowerCase()} difficulty means you'll need focused effort, but the structured approach ensures nothing is missed.`,
    fellowship: `Prepare for this prestigious fellowship over ${overview.estimatedWeeks} weeks across ${overview.totalMilestones} milestones. The program demands excellent essays, strong references, and impressive interview performance. With ${overview.difficulty.toLowerCase()} difficulty, dedication to each weekly goal is essential. This roadmap ensures every component of your application receives the attention it deserves.`
  };

  for (const [key, summary] of Object.entries(summaries)) {
    if (category.includes(key)) return summary;
  }

  return `This ${overview.estimatedWeeks}-week preparation plan covers ${overview.totalMilestones} milestones tailored for "${opportunity.title}". With a ${overview.difficulty.toLowerCase()} difficulty rating, consistent progress through each weekly goal will ensure you're fully prepared. Follow the milestones in order, complete checklist items as you go, and you'll maximize your chances of success.`;
}

export function calculateCompletionDate(weeks: number): string {
  const date = new Date();
  date.setDate(date.getDate() + weeks * 7);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
