import { v4 as uuidv4 } from 'uuid';

export interface TestGoal {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  progress: number;
  status: string;
  targetDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestMilestone {
  id: string;
  goalId: string;
  title: string;
  completed: boolean;
  order: number;
  createdAt: Date;
}

const DEFAULT_GOAL: Omit<TestGoal, 'id' | 'userId'> = {
  title: 'Complete JAMB registration and achieve 300+ score',
  description: 'Register for JAMB UTME, create study plan covering all four subjects, aim for 300+.',
  category: 'Academics',
  progress: 45,
  status: 'active',
  targetDate: new Date('2026-04-15'),
  createdAt: new Date('2026-01-05'),
  updatedAt: new Date('2026-05-28'),
};

export function buildGoal(userId?: string, overrides?: Partial<TestGoal>): TestGoal {
  return {
    id: uuidv4(),
    userId: userId ?? '00000000-0000-0000-0000-000000000001',
    ...DEFAULT_GOAL,
    ...overrides,
  };
}

export function buildMilestone(goalId: string, overrides?: Partial<TestMilestone>): TestMilestone {
  return {
    id: uuidv4(),
    goalId,
    title: 'Complete milestone task',
    completed: false,
    order: overrides?.order ?? 1,
    createdAt: new Date(),
    ...overrides,
  };
}

export function buildDefaultMilestones(goalId: string): TestMilestone[] {
  return [
    buildMilestone(goalId, { title: 'Research required topics and gather materials', order: 1, completed: true }),
    buildMilestone(goalId, { title: 'Create weekly study schedule', order: 2, completed: true }),
    buildMilestone(goalId, { title: 'Complete first round of past questions', order: 3, completed: false }),
    buildMilestone(goalId, { title: 'Review weak areas and timed mock exams', order: 4, completed: false }),
    buildMilestone(goalId, { title: 'Final revision and readiness assessment', order: 5, completed: false }),
  ];
}

export function scholarshipApplicationGoalPreset(userId?: string): TestGoal {
  return buildGoal(userId, {
    title: 'Apply for 5 fully-funded international scholarships',
    description: 'Research and submit complete applications to Chevening, Commonwealth, PTDF, Erasmus Mundus, and DAAD.',
    category: 'Scholarship Application',
    progress: 20,
    targetDate: new Date('2026-12-31'),
  });
}

export function completedGoalPreset(userId?: string): TestGoal {
  return buildGoal(userId, {
    title: 'Complete NYSC registration',
    progress: 100,
    status: 'completed',
    targetDate: new Date('2026-02-28'),
  });
}
