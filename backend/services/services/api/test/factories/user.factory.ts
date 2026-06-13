import { v4 as uuidv4 } from 'uuid';

export interface TestUserProfile {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  country: string;
  skills: string[];
  creditsBalance: number;
  creatorStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_USER: Omit<TestUserProfile, 'userId'> = {
  fullName: 'Amina Ibrahim',
  email: 'amina.ibrahim@example.ng',
  role: 'user',
  country: 'Nigeria',
  skills: ['Data Analysis', 'Python', 'Research', 'Public Speaking', 'Project Management'],
  creditsBalance: 150,
  creatorStatus: 'none',
  createdAt: new Date('2025-09-01'),
  updatedAt: new Date('2026-05-15'),
};

export function buildUser(overrides?: Partial<TestUserProfile>): TestUserProfile {
  return { userId: uuidv4(), ...DEFAULT_USER, ...overrides };
}

export function nigerianUndergraduatePreset(): TestUserProfile {
  return buildUser({
    fullName: 'Chidi Okafor',
    email: 'chidi.okafor@unilag.edu.ng',
    country: 'Nigeria',
    skills: ['Mathematics', 'Physics', 'Chemistry'],
    creditsBalance: 50,
  });
}

export function ghanaianPostgraduatePreset(): TestUserProfile {
  return buildUser({
    fullName: 'Akua Mensah',
    email: 'akua.mensah@email.gh',
    country: 'Ghana',
    skills: ['Environmental Science', 'GIS', 'Field Research'],
    creditsBalance: 200,
  });
}

export function kenyanEntrepreneurPreset(): TestUserProfile {
  return buildUser({
    fullName: 'David Kimani',
    email: 'david.kimani@example.ke',
    country: 'Kenya',
    skills: ['Business Strategy', 'Mobile Development', 'AgriTech'],
    creditsBalance: 300,
  });
}

export function approvedCreatorPreset(): TestUserProfile {
  return buildUser({
    fullName: 'Fatima Bello',
    email: 'fatima.bello@edutu.ng',
    country: 'Nigeria',
    skills: ['Curriculum Design', 'STEM Education', 'Assessment'],
    creditsBalance: 5000,
    creatorStatus: 'approved',
  });
}

export function adminPreset(): TestUserProfile {
  return buildUser({
    fullName: 'Olusegun Adebayo',
    email: 'admin@edutu.com',
    role: 'admin',
    country: 'Nigeria',
    skills: ['System Administration', 'DevOps', 'Security'],
    creditsBalance: 999999,
  });
}
