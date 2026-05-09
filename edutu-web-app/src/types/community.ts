export type CommunityStoryStatus = 'pending' | 'approved' | 'hidden';

export type CommunityStoryType = 'roadmap' | 'marketplace';

export type CommunityStoryDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export type CommunityStoryPrice = 'Free' | 'Premium';

export interface CommunityStoryCreator {
  name: string;
  title?: string;
  avatar?: string;
  email?: string;
  verified?: boolean;
}

export type CommunityResourceType =
  | 'article'
  | 'video'
  | 'course'
  | 'podcast'
  | 'community'
  | 'tool'
  | 'event'
  | 'other';

export interface CommunityResource {
  id: string;
  title: string;
  description?: string;
  url?: string;
  provider?: string;
  type?: CommunityResourceType;
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

export interface CommunityStoryStats {
  rating: number;
  users: number;
  successRate: number;
  saves: number;
  adoptionCount: number;
  likes: number;
  comments: number;
}

export interface CommunityModeratorNote {
  id: string;
  note: string;
  createdAt: string;
  author?: string;
}

export interface CommunityStory {
  id: string;
  title: string;
  summary: string;
  story: string;
  category: string;
  duration?: string;
  difficulty: CommunityStoryDifficulty;
  price: CommunityStoryPrice;
  successRate: number;
  image: string;
  creator: CommunityStoryCreator;
  tags: string[];
  outcomes: string[];
  resources: CommunityResource[];
  roadmap: CommunityRoadmapStage[];
  status: CommunityStoryStatus;
  type: CommunityStoryType;
  featured: boolean;
  featuredRank?: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  moderatorNotes?: CommunityModeratorNote[];
  stats: CommunityStoryStats;
  lastUpdatedLabel: string;
  lastUpdatedTimestamp: number;
}

export interface CommunityStorySubmissionInput {
  title: string;
  summary: string;
  story?: string;
  category?: string;
  duration?: string;
  difficulty: CommunityStoryDifficulty;
  price: CommunityStoryPrice;
  successRate?: number;
  tags?: string[];
  outcomes?: string[];
  coverImage?: string | null;
  creator: CommunityStoryCreator;
  resources?: CommunityResource[];
  roadmap?: CommunityRoadmapStage[];
  type?: CommunityStoryType;
  creatorNotes?: string | null;
}

export interface CommunityStoryUpdateInput {
  title?: string;
  summary?: string;
  story?: string;
  category?: string;
  duration?: string | null;
  difficulty?: CommunityStoryDifficulty;
  price?: CommunityStoryPrice;
  successRate?: number;
  tags?: string[];
  outcomes?: string[];
  image?: string | null;
  creator?: Partial<CommunityStoryCreator>;
  resources?: CommunityResource[];
  roadmap?: CommunityRoadmapStage[];
  status?: CommunityStoryStatus;
  featured?: boolean;
  featuredRank?: number | null;
  moderatorNotes?: CommunityModeratorNote[];
  approvedBy?: string | null;
  approvedAt?: string | null;
  stats?: Partial<CommunityStoryStats>;
}

export interface CommunityStoryQueryOptions {
  status?: CommunityStoryStatus | CommunityStoryStatus[];
  featuredOnly?: boolean;
  type?: CommunityStoryType | CommunityStoryType[];
  category?: string;
  limit?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'featuredRank';
  descending?: boolean;
}
