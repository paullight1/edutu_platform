export type CommunityStoryStatus = 'approved' | 'pending' | 'hidden';
export type CommunityStoryType = 'roadmap' | 'marketplace';
export type CommunityStoryPrice = 'Free' | 'Premium';
export type CommunityDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export interface CommunityResource {
  id: string;
  title: string;
  description?: string;
  url?: string;
  provider?: string;
  type?: 'article' | 'video' | 'course' | 'tool' | 'book' | 'other';
  cost?: 'free' | 'paid';
  notes?: string;
}

export interface CommunityRoadmapTask {
  id: string;
  title: string;
  description?: string;
  duration?: string;
  resourceIds?: string[];
  outcome?: string;
}

export interface CommunityRoadmapStage {
  id: string;
  title: string;
  description?: string;
  duration?: string;
  milestone?: string;
  tasks: CommunityRoadmapTask[];
  resourceIds?: string[];
  checkpoint?: string;
}

export interface CommunityCreator {
  name: string;
  title?: string;
  avatar?: string;
  email?: string;
  verified?: boolean;
}

export interface CommunityStoryStats {
  rating: number;
  users: number;
  successRate: number;
  saves?: number;
  adoptionCount?: number;
  likes?: number;
  comments?: number;
}

export interface CommunityModeratorNote {
  id: string;
  note: string;
  author?: string;
  createdAt: string;
}

export interface CommunityStory {
  id: string;
  title: string;
  summary: string;
  story?: string;
  category: string;
  duration?: string;
  difficulty: CommunityDifficulty;
  price: CommunityStoryPrice;
  successRate: number;
  image?: string;
  creator: CommunityCreator;
  tags: string[];
  outcomes?: string[];
  resources: CommunityResource[];
  roadmap: CommunityRoadmapStage[];
  status: CommunityStoryStatus;
  type: CommunityStoryType;
  featured?: boolean;
  featuredRank?: number | null;
  createdAt?: string;
  updatedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  moderatorNotes?: CommunityModeratorNote[];
  stats: CommunityStoryStats;
  lastUpdatedLabel?: string;
  lastUpdatedTimestamp?: number;
  paymentLink?: string | null;
  experiences?: string;
  sopSamples?: any[];
  checklist?: any[];
}

export interface CommunityStoryQueryOptions {
  type?: CommunityStoryType | CommunityStoryType[];
  status?: CommunityStoryStatus;
  category?: string;
  limit?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'featuredRank';
  descending?: boolean;
}

export interface CommunityStorySubmissionInput {
  title: string;
  summary: string;
  story?: string;
  category: string;
  duration?: string;
  difficulty?: CommunityDifficulty;
  price?: CommunityStoryPrice;
  successRate?: number;
  tags?: string[];
  outcomes?: string[];
  coverImage?: string | null;
  creator: {
    name: string;
    title?: string;
    avatar?: string;
    email?: string;
  };
  type: CommunityStoryType;
  resources?: CommunityResource[];
  roadmap?: CommunityRoadmapStage[];
  creatorNotes?: string;
}