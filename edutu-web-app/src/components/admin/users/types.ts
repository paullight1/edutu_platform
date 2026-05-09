import type { UserRole } from '../../../hooks/useRoleManager';

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  goalsCompleted: number;
  opportunitiesExplored: number;
  lastActive: Date | null;
  joinedAt: Date | null;
  bio?: string;
  location?: string;
  aiInteractions?: number;
  goalCompletionRate?: number;
  engagementScore?: number;
}
