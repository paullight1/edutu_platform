export type RoadmapTemplateIcon = 'book' | 'graduation' | 'briefcase' | 'users' | 'rocket' | 'heart';

export interface RoadmapTemplateResource {
  title: string;
  provider: string;
  url: string;
  type: 'video' | 'course' | 'guide' | 'tool';
}

export interface RoadmapTemplateMilestone {
  week: number;
  title: string;
  guidance: string;
  deliverable: string;
  resources: RoadmapTemplateResource[];
}

export interface RoadmapTemplate {
  id: string;
  title: string;
  description: string;
  duration: string;
  difficulty: string;
  icon: RoadmapTemplateIcon;
  category: string;
  milestones: number;
  estimatedTime: string;
  skills: string[];
  color: string;
  outcomes: string[];
  calendarTitle: string;
  reminderCadence: string;
  milestonesPlan: RoadmapTemplateMilestone[];
}

export const roadmapTemplates: RoadmapTemplate[] = [
  {
    id: 'python-course',
    title: 'Complete Python Programming Course',
    description: 'Master Python from basics to advanced concepts with hands-on projects',
    duration: '12 weeks',
    difficulty: 'Beginner to Intermediate',
    icon: 'book',
    category: 'Programming',
    milestones: 12,
    estimatedTime: '3-4 hours/week',
    skills: ['Python Basics', 'Data Structures', 'Web Development', 'APIs'],
    color: 'bg-surface-layer border-subtle',
    calendarTitle: 'Python roadmap study block',
    reminderCadence: 'Weekly study reminders every Monday, plus milestone check-ins every 2 weeks.',
    outcomes: [
      'Build confidence with Python syntax, functions, and data structures.',
      'Create three portfolio-ready projects.',
      'Understand APIs, automation, and web app foundations.',
    ],
    milestonesPlan: [
      {
        week: 1,
        title: 'Set up Python and learn the basics',
        guidance: 'Install Python, choose an editor, and practice variables, input, strings, numbers, and control flow.',
        deliverable: 'A working local Python setup and 10 small practice scripts.',
        resources: [
          { title: 'Python for Beginners', provider: 'freeCodeCamp', url: 'https://www.youtube.com/watch?v=eWRfhZUzrAc', type: 'video' },
          { title: 'Python Tutorial', provider: 'W3Schools', url: 'https://www.w3schools.com/python/', type: 'guide' },
        ],
      },
      {
        week: 2,
        title: 'Functions, loops, and reusable thinking',
        guidance: 'Convert repeated code into functions and learn how to debug with print statements and tracebacks.',
        deliverable: 'A command-line calculator and a reusable helper module.',
        resources: [
          { title: 'Python Functions', provider: 'Corey Schafer', url: 'https://www.youtube.com/watch?v=9Os0o3wzS_I', type: 'video' },
        ],
      },
      {
        week: 4,
        title: 'Data structures and files',
        guidance: 'Use lists, dictionaries, sets, and file reading/writing to work with real data.',
        deliverable: 'A CSV reader that summarizes opportunity deadlines.',
        resources: [
          { title: 'Python Data Structures', provider: 'Google for Education', url: 'https://developers.google.com/edu/python', type: 'course' },
        ],
      },
      {
        week: 8,
        title: 'APIs and automation project',
        guidance: 'Call public APIs, parse JSON, handle errors, and automate a useful task.',
        deliverable: 'A script that fetches and filters scholarship or internship data.',
        resources: [
          { title: 'APIs for Beginners', provider: 'freeCodeCamp', url: 'https://www.youtube.com/watch?v=GZvSYJDk-us', type: 'video' },
        ],
      },
      {
        week: 12,
        title: 'Final portfolio project',
        guidance: 'Package your best project with a README, screenshots, and clear setup instructions.',
        deliverable: 'One published GitHub project and a short demo video.',
        resources: [
          { title: 'GitHub Skills', provider: 'GitHub', url: 'https://skills.github.com/', type: 'course' },
        ],
      },
    ],
  },
  {
    id: 'scholarship-applications',
    title: 'Apply to 5 International Scholarships',
    description: 'Strategic approach to scholarship applications with timeline and requirements',
    duration: '16 weeks',
    difficulty: 'Intermediate',
    icon: 'graduation',
    category: 'Education',
    milestones: 15,
    estimatedTime: '5-6 hours/week',
    skills: ['Research', 'Essay Writing', 'Application Strategy', 'Interview Prep'],
    color: 'bg-surface-layer border-subtle',
    calendarTitle: 'Scholarship application sprint',
    reminderCadence: 'Two weekly reminders: research/application work and document review.',
    outcomes: [
      'Build a shortlist of scholarships matched to your profile.',
      'Prepare reusable essays, CV, transcript, and recommendation request materials.',
      'Submit five complete applications with deadline buffers.',
    ],
    milestonesPlan: [
      {
        week: 1,
        title: 'Profile audit and opportunity shortlist',
        guidance: 'Define eligibility, target countries, funding needs, and deadlines before choosing opportunities.',
        deliverable: 'A ranked shortlist of 10 scholarships with requirements and deadlines.',
        resources: [
          { title: 'Scholarship Essay Tips', provider: 'College Essay Guy', url: 'https://www.youtube.com/watch?v=5c3k3s7T8w0', type: 'video' },
          { title: 'Scholarships Search', provider: 'Opportunity Desk', url: 'https://www.opportunitydesk.org/', type: 'tool' },
        ],
      },
      {
        week: 4,
        title: 'Core documents and essay bank',
        guidance: 'Create reusable personal statement blocks, impact stories, CV entries, and recommendation request notes.',
        deliverable: 'One master CV, one personal statement draft, and three story blocks.',
        resources: [
          { title: 'How to Write a Personal Statement', provider: 'Chevening', url: 'https://www.chevening.org/scholarships/guidance/essays/', type: 'guide' },
        ],
      },
      {
        week: 8,
        title: 'Application batch one',
        guidance: 'Submit the first two applications, then review what slowed you down before the next batch.',
        deliverable: 'Two submitted applications and a checklist for the remaining three.',
        resources: [
          { title: 'Recommendation Letter Requests', provider: 'Coursera', url: 'https://www.coursera.org/articles/letter-of-recommendation', type: 'guide' },
        ],
      },
      {
        week: 16,
        title: 'Interview and follow-up preparation',
        guidance: 'Prepare concise answers for motivation, leadership, study plan, and impact questions.',
        deliverable: 'Five submitted applications and a 10-question interview practice sheet.',
        resources: [
          { title: 'Scholarship Interview Questions', provider: 'The Scholarship System', url: 'https://www.youtube.com/watch?v=HVMl3L9Da5s', type: 'video' },
        ],
      },
    ],
  },
  {
    id: 'portfolio-website',
    title: 'Build Professional Portfolio Website',
    description: 'Create a stunning portfolio to showcase your skills and projects',
    duration: '8 weeks',
    difficulty: 'Beginner to Intermediate',
    icon: 'briefcase',
    category: 'Career',
    milestones: 8,
    estimatedTime: '4-5 hours/week',
    skills: ['Web Design', 'HTML/CSS', 'JavaScript', 'Portfolio Strategy'],
    color: 'bg-surface-layer border-subtle',
    calendarTitle: 'Portfolio build session',
    reminderCadence: 'Weekly build reminder and final launch checklist reminder.',
    outcomes: ['Publish a portfolio homepage.', 'Showcase 2-3 projects with impact.', 'Add contact and CV links.'],
    milestonesPlan: [
      {
        week: 1,
        title: 'Plan your proof of work',
        guidance: 'Choose your audience, collect projects, and write short case-study summaries.',
        deliverable: 'A one-page site outline and project list.',
        resources: [{ title: 'Portfolio Website Tutorial', provider: 'freeCodeCamp', url: 'https://www.youtube.com/watch?v=xV7S8BhIeBo', type: 'video' }],
      },
      {
        week: 4,
        title: 'Build and refine the site',
        guidance: 'Create sections for intro, projects, experience, contact, and links.',
        deliverable: 'A responsive draft portfolio.',
        resources: [{ title: 'Web.dev Learn CSS', provider: 'Google', url: 'https://web.dev/learn/css', type: 'course' }],
      },
      {
        week: 8,
        title: 'Launch and share',
        guidance: 'Deploy the site, test links, improve SEO, and add the portfolio to applications.',
        deliverable: 'A live portfolio URL.',
        resources: [{ title: 'Deploy with Vercel', provider: 'Vercel', url: 'https://vercel.com/docs/deployments/overview', type: 'guide' }],
      },
    ],
  },
  {
    id: 'leadership-skills',
    title: 'Develop Leadership & Communication Skills',
    description: 'Build essential leadership qualities and communication expertise',
    duration: '10 weeks',
    difficulty: 'All Levels',
    icon: 'users',
    category: 'Personal Development',
    milestones: 10,
    estimatedTime: '3-4 hours/week',
    skills: ['Public Speaking', 'Team Management', 'Conflict Resolution', 'Emotional Intelligence'],
    color: 'bg-surface-layer border-subtle',
    calendarTitle: 'Leadership practice session',
    reminderCadence: 'Weekly reflection reminders and biweekly speaking practice.',
    outcomes: ['Practice public speaking.', 'Improve conflict handling.', 'Lead one small project or community activity.'],
    milestonesPlan: [
      {
        week: 1,
        title: 'Communication baseline',
        guidance: 'Record a short talk, identify strengths, and choose two improvement areas.',
        deliverable: 'A 3-minute recorded introduction and self-review.',
        resources: [{ title: 'Think Fast, Talk Smart', provider: 'Stanford GSB', url: 'https://www.youtube.com/playlist?list=PLxq_lXOUlvQDqJ3I8A9b6WH6lsR3K7M4u', type: 'video' }],
      },
      {
        week: 5,
        title: 'Lead a small initiative',
        guidance: 'Choose a real group task and practice delegation, updates, and feedback.',
        deliverable: 'A completed small team task with lessons learned.',
        resources: [{ title: 'Leadership Skills', provider: 'MindTools', url: 'https://www.mindtools.com/a3f9d6v/leadership-skills', type: 'guide' }],
      },
    ],
  },
  {
    id: 'startup-launch',
    title: 'Launch Your First Startup',
    description: 'Complete guide from idea validation to product launch and marketing',
    duration: '20 weeks',
    difficulty: 'Advanced',
    icon: 'rocket',
    category: 'Entrepreneurship',
    milestones: 18,
    estimatedTime: '8-10 hours/week',
    skills: ['Business Planning', 'Market Research', 'Product Development', 'Marketing'],
    color: 'bg-surface-layer border-subtle',
    calendarTitle: 'Startup launch work block',
    reminderCadence: 'Weekly build reminder and monthly validation review.',
    outcomes: ['Validate a business problem.', 'Launch an MVP.', 'Run a first customer acquisition test.'],
    milestonesPlan: [
      {
        week: 1,
        title: 'Validate the problem',
        guidance: 'Interview target users and define the painful problem clearly before building.',
        deliverable: '10 user interviews and a problem statement.',
        resources: [{ title: 'Startup School', provider: 'Y Combinator', url: 'https://www.startupschool.org/', type: 'course' }],
      },
      {
        week: 10,
        title: 'Build an MVP',
        guidance: 'Build the smallest version that proves the user wants the outcome.',
        deliverable: 'A working MVP with one core workflow.',
        resources: [{ title: 'How to Build an MVP', provider: 'Y Combinator', url: 'https://www.youtube.com/watch?v=1hHMwLxN6EM', type: 'video' }],
      },
      {
        week: 20,
        title: 'Launch and learn',
        guidance: 'Run a small launch, collect feedback, and decide the next iteration.',
        deliverable: 'A launch report with signups, feedback, and next actions.',
        resources: [{ title: 'The Lean Startup Summary', provider: 'Strategyzer', url: 'https://www.strategyzer.com/library/the-lean-startup', type: 'guide' }],
      },
    ],
  },
  {
    id: 'fitness-health',
    title: 'Complete Health & Fitness Transformation',
    description: 'Comprehensive wellness program for physical and mental health',
    duration: '16 weeks',
    difficulty: 'All Levels',
    icon: 'heart',
    category: 'Health & Wellness',
    milestones: 12,
    estimatedTime: '5-6 hours/week',
    skills: ['Exercise Planning', 'Nutrition', 'Mental Health', 'Habit Building'],
    color: 'bg-surface-layer border-subtle',
    calendarTitle: 'Wellness habit block',
    reminderCadence: 'Daily habit reminders and weekly progress review.',
    outcomes: ['Build a realistic exercise habit.', 'Create a simple nutrition plan.', 'Track energy, sleep, and consistency.'],
    milestonesPlan: [
      {
        week: 1,
        title: 'Baseline and habit design',
        guidance: 'Measure your current habits and choose a realistic first routine.',
        deliverable: 'A weekly routine with exercise, sleep, and meal targets.',
        resources: [{ title: 'Physical Activity Basics', provider: 'CDC', url: 'https://www.cdc.gov/physical-activity-basics/index.html', type: 'guide' }],
      },
      {
        week: 8,
        title: 'Progressive training rhythm',
        guidance: 'Increase intensity slowly and track recovery to avoid burnout.',
        deliverable: 'Eight weeks of tracked workouts and recovery notes.',
        resources: [{ title: 'Fitness Blender', provider: 'Fitness Blender', url: 'https://www.youtube.com/user/FitnessBlender', type: 'video' }],
      },
    ],
  },
];

export const getRoadmapTemplateById = (id?: string | null) =>
  roadmapTemplates.find((template) => template.id === id);
