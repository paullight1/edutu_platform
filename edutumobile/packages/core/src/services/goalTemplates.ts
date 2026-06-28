/**
 * Goal Templates Library
 *
 * Pre-built goal templates users can add with one tap.
 * Templates are localized for the African student context.
 */

export interface GoalTemplate {
  id: string;
  title: string;
  description: string;
  category: 'Scholarship' | 'Career' | 'Skill' | 'Education' | 'Personal' | 'Fellowship' | 'Internship';
  priority: 'High' | 'Medium' | 'Low';
  estimatedDuration: string; // human-readable
  suggestedSubtasks: string[];
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    id: 'apply-5-scholarships',
    title: 'Apply to 5 Fully-Funded Scholarships',
    description: 'Research, prepare documents, and submit complete applications to at least 5 fully-funded scholarship programmes for study abroad.',
    category: 'Scholarship',
    priority: 'High',
    estimatedDuration: '3 months',
    suggestedSubtasks: [
      'Research 10 scholarship programmes',
      'Prepare academic transcripts and certificates',
      'Write a compelling personal statement',
      'Request 3 recommendation letters',
      'Submit 5 complete applications before deadlines',
    ],
  },
  {
    id: 'learn-python',
    title: 'Learn Python Programming Basics',
    description: 'Master Python fundamentals including variables, loops, functions, and data structures.',
    category: 'Skill',
    priority: 'Medium',
    estimatedDuration: '2 months',
    suggestedSubtasks: [
      'Complete Python basics course on DataCamp or freeCodeCamp',
      'Build 3 small projects (calculator, to-do app, web scraper)',
      'Solve 50 coding challenges on LeetCode or HackerRank',
      'Contribute to one open-source Python project on GitHub',
    ],
  },
  {
    id: 'build-cv',
    title: 'Build a Professional CV',
    description: 'Create a polished, ATS-friendly CV tailored to your target opportunities.',
    category: 'Career',
    priority: 'High',
    estimatedDuration: '2 weeks',
    suggestedSubtasks: [
      'List all education, experience, skills, and achievements',
      'Choose a professional CV template',
      'Write strong bullet points using action verbs and metrics',
      'Tailor CV for 3 specific scholarship/job opportunities',
      'Get feedback from a mentor or career coach',
    ],
  },
  {
    id: 'prepare-ielts',
    title: 'Prepare for IELTS Academic Exam',
    description: 'Achieve a band score of 7.0+ for scholarship and university applications.',
    category: 'Education',
    priority: 'High',
    estimatedDuration: '3 months',
    suggestedSubtasks: [
      'Take a diagnostic practice test to establish baseline',
      'Study 30 minutes daily using IELTS preparation materials',
      'Complete 10 full-length practice tests under timed conditions',
      'Focus on weakest section (Listening/Reading/Writing/Speaking)',
      'Register for the official exam and book test date',
    ],
  },
  {
    id: 'find-internship',
    title: 'Secure a Summer Internship',
    description: 'Find and apply to internships in your field to gain professional experience.',
    category: 'Internship',
    priority: 'High',
    estimatedDuration: '2 months',
    suggestedSubtasks: [
      'Update CV and LinkedIn profile',
      'Research 20 companies with internship programmes',
      'Write tailored cover letters for top 10 opportunities',
      'Practice interview skills with mock interviews',
      'Submit all applications and follow up after 2 weeks',
    ],
  },
  {
    id: 'network-10',
    title: 'Network with 10 Professionals in Your Field',
    description: 'Build meaningful professional connections through LinkedIn, events, and informational interviews.',
    category: 'Career',
    priority: 'Medium',
    estimatedDuration: '1 month',
    suggestedSubtasks: [
      'Optimize LinkedIn profile with professional photo and headline',
      'Identify 20 professionals to connect with',
      'Send personalized connection requests to 10 people per week',
      'Schedule 5 informational interviews',
      'Attend 2 industry events or webinars',
    ],
  },
  {
    id: 'complete-online-course',
    title: 'Complete an Online Certification Course',
    description: 'Earn a professional certificate to strengthen your profile for scholarships and jobs.',
    category: 'Education',
    priority: 'Medium',
    estimatedDuration: '6 weeks',
    suggestedSubtasks: [
      'Choose a course relevant to your field (Coursera, edX, Udemy)',
      'Create a weekly study schedule (5 hours/week)',
      'Complete all modules and assignments',
      'Pass the final exam or capstone project',
      'Add the certificate to CV and LinkedIn',
    ],
  },
  {
    id: 'write-personal-statement',
    title: 'Write a Compelling Personal Statement',
    description: 'Craft a powerful personal statement that tells your unique story for scholarship applications.',
    category: 'Scholarship',
    priority: 'High',
    estimatedDuration: '2 weeks',
    suggestedSubtasks: [
      'Brainstorm key life experiences, achievements, and goals',
      'Write first draft (focus on content, not perfection)',
      'Revise for clarity, impact, and authenticity',
      'Get feedback from 3 trusted reviewers',
      'Polish final version and adapt for specific applications',
    ],
  },
];

/**
 * Get templates filtered by category.
 */
export function getTemplatesByCategory(category: GoalTemplate['category']): GoalTemplate[] {
  return GOAL_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get a single template by ID.
 */
export function getTemplateById(id: string): GoalTemplate | undefined {
  return GOAL_TEMPLATES.find((t) => t.id === id);
}
