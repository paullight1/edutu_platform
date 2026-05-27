export interface AppUser {
  id: string;
  name: string;
  email?: string;
  age?: number;
  courseOfStudy?: string;
  avatarUrl?: string;
}

export type OptionalAppUser = AppUser | null;

