import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Search,
  Sparkles,
  Star,
  Users,
  Filter,
  BookOpen,
  ExternalLink,
  RefreshCw,
  Info,
  Clock,
  BarChart
} from 'lucide-react';
import Button from './ui/Button';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Select from './ui/Select';
import PageHeader from './PageHeader';
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from './ui/Dialog';
import { useToast } from './ui/ToastProvider';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '@clerk/clerk-react';
import type { AppUser } from '../types/user';
import {
  CommunityResource,
  CommunityRoadmapStage,
  CommunityStoryPrice,
  CommunityStoryStats
} from '../types/community';
import {
  fetchCommunityStories,
  recordCommunityStoryAdoptionWithToken,
  submitCommunityStory
} from '../services/communityMarketplaceSupabase';
import { fetchRoadmapCalendarExport, type RoadmapAdoptionResponse } from '../services/roadmapApi';

interface CommunityRoadmap {
  id: string;
  title: string;
  description: string;
  creator: {
    name: string;
    avatar: string;
    title: string;
    verified: boolean;
  };
  creatorEmail?: string;
  category: string;
  duration: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  rating: number;
  users: number;
  successRate: number;
  tags: string[];
  achievements: string[];
  price: 'Free' | 'Premium';
  image: string;
  featured: boolean;
  status: 'approved' | 'pending' | 'hidden';
  type: 'roadmap' | 'marketplace';
  lastUpdatedLabel: string;
  lastUpdatedTimestamp: number;
  story: string;
  resources: CommunityResource[];
  roadmap: CommunityRoadmapStage[];
  stats: CommunityStoryStats;
  paymentLink?: string | null;
  communityId?: string | null;
  deadlineStrategy?: string | null;
}

interface CommunityMarketplaceProps {
  onRoadmapSelect: (roadmap: CommunityRoadmap) => void;
  user: AppUser | null;
  onBack: () => void;
}

interface CreateRoadmapForm {
  title: string;
  summary: string;
  story: string;
  roadmapOutline: string;
  resourceNotes: string;
  category: string;
  duration: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  price: 'Free' | 'Premium';
  successRate: string;
  tags: string;
  outcomes: string;
  coverImage: string;
  creatorTitle: string;
  creatorEmail: string;
  paymentLink: string;
  type: 'roadmap' | 'marketplace';
}

type SortOption = 'Popular' | 'Newest' | 'Highest Rated' | 'Most Used' | 'Free Only';

const FALLBACK_ROADMAPS: CommunityRoadmap[] = [
  {
    id: 'sample-oxford-mba',
    title: 'Oxford MBA Admission Journey',
    description:
      'How Amara layered leadership, GMAT prep, and scholarship outreach to secure a fully funded Oxford MBA seat.',
    creator: { name: 'Amara Bello', avatar: 'MBA', title: 'Oxford Said MBA Scholar', verified: true },
    creatorEmail: 'amara@edutu.ai',
    category: 'Education',
    duration: '18 months',
    difficulty: 'Advanced',
    rating: 4.9,
    users: 912,
    successRate: 62,
    tags: ['MBA', 'Scholarships', 'Leadership'],
    achievements: ['Oxford Said offer', 'Clarendon Scholarship', 'GMAT 740'],
    price: 'Premium',
    image: 'https://images.pexels.com/photos/5212345/pexels-photo-5212345.jpeg',
    featured: true,
    status: 'approved',
    type: 'roadmap',
    lastUpdatedLabel: '3 days ago',
    lastUpdatedTimestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
    story:
      'Follow the exact playbook Amara used to balance leadership impact, GMAT excellence, and scholarship outreach to secure a fully funded Oxford MBA. Each milestone includes templates, outreach scripts, and scorecards.',
    resources: [
      {
        id: 'ox-res-1',
        title: 'Leadership Impact Tracker Template',
        description: 'Spreadsheet template to quantify community and professional impact.',
        url: 'https://example.com/resources/leadership-tracker',
        type: 'tool',
        cost: 'free'
      },
      {
        id: 'ox-res-2',
        title: 'GMAT 740 Study Schedule',
        url: 'https://example.com/resources/gmat-740-plan',
        type: 'article',
        cost: 'free'
      },
      {
        id: 'ox-res-3',
        title: 'Clarendon Scholarship Outreach Email Pack',
        url: 'https://example.com/resources/clarendon-outreach',
        type: 'other',
        cost: 'paid',
        notes: 'Included in premium bundle'
      }
    ],
    roadmap: [
      {
        id: 'ox-stage-1',
        title: 'Months 1-3: Clarify your MBA narrative',
        description: 'Audit achievements, map leadership themes, and shortlist programs.',
        duration: '12 weeks',
        tasks: []
      },
      {
        id: 'ox-stage-2',
        title: 'Months 4-6: GMAT excellence sprint',
        description: 'Target a 720+ GMAT using Amara’s split-day approach.',
        duration: '12 weeks',
        tasks: []
      },
      {
        id: 'ox-stage-3',
        title: 'Months 7-12: Scholarship outreach & essays',
        description: 'Run scholarship outreach cadences and polish your essays.',
        duration: '24 weeks',
        tasks: []
      }
    ],
    stats: {
      rating: 4.9,
      users: 912,
      successRate: 62,
      saves: 420,
      adoptionCount: 318,
      likes: 198,
      comments: 64
    },
    paymentLink: 'https://market.edutu.ai/guides/oxford-mba'
  },
  {
    id: 'sample-data-science',
    title: 'Pivot to Senior Data Scientist',
    description: 'Isaac moved from support specialist to senior data science through night classes and ML projects.',
    creator: { name: 'Isaac Mensah', avatar: 'DS', title: 'Senior Data Scientist', verified: true },
    creatorEmail: 'isaac@edutu.ai',
    category: 'Programming',
    duration: '14 months',
    difficulty: 'Intermediate',
    rating: 4.8,
    users: 1245,
    successRate: 68,
    tags: ['Python', 'ML', 'Career switch'],
    achievements: ['Senior DS offer', 'Portfolio of 6 projects', 'Conference talk'],
    price: 'Free',
    image: 'https://images.pexels.com/photos/3861958/pexels-photo-3861958.jpeg',
    featured: false,
    status: 'approved',
    type: 'roadmap',
    lastUpdatedLabel: '1 week ago',
    lastUpdatedTimestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
    story:
      'Isaac documents how he balanced a support role with night classes, project-based learning, and community showcases to become a senior data scientist. The guide includes weekly checkpoints and portfolio templates.',
    resources: [
      {
        id: 'ds-res-1',
        title: 'Night School ML Curriculum',
        url: 'https://example.com/resources/night-ml',
        type: 'course',
        cost: 'free'
      },
      {
        id: 'ds-res-2',
        title: 'Portfolio Project Rubric',
        url: 'https://example.com/resources/ds-rubric',
        type: 'tool',
        cost: 'free'
      },
      {
        id: 'ds-res-3',
        title: 'Weekly Study Tracker',
        url: 'https://example.com/resources/study-tracker',
        type: 'tool',
        cost: 'free'
      }
    ],
    roadmap: [
      {
        id: 'ds-stage-1',
        title: 'Weeks 1-6: Solidify Python & statistics',
        description: 'Refresh Python, statistics, and SQL foundations with targeted exercises.',
        duration: '6 weeks',
        tasks: []
      },
      {
        id: 'ds-stage-2',
        title: 'Weeks 7-16: Build portfolio-ready ML projects',
        description: 'Ship three end-to-end projects that demonstrate experimentation and storytelling.',
        duration: '10 weeks',
        tasks: []
      },
      {
        id: 'ds-stage-3',
        title: 'Weeks 17-24: Showcase & grow community proof',
        description: 'Publish case studies, present at meetups, and prepare interview artifacts.',
        duration: '8 weeks',
        tasks: []
      }
    ],
    stats: {
      rating: 4.8,
      users: 1245,
      successRate: 68,
      saves: 512,
      adoptionCount: 402,
      likes: 276,
      comments: 81
    },
    paymentLink: null
  }
];

const CREATE_DEFAULTS: CreateRoadmapForm = {
  title: '',
  summary: '',
  story: '',
  roadmapOutline: '',
  resourceNotes: '',
  category: 'Programming',
  duration: '6 months',
  difficulty: 'Intermediate',
  price: 'Free',
  successRate: '60',
  tags: '',
  outcomes: '',
  coverImage: '',
  creatorTitle: '',
  creatorEmail: '',
  paymentLink: '',
  type: 'roadmap'
};

const normaliseDifficulty = (value: unknown): 'Beginner' | 'Intermediate' | 'Advanced' => {
  if (value === 'Beginner' || value === 'Advanced') {
    return value;
  }
  return 'Intermediate';
};

const toNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const toStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
};

const parseDate = (value: unknown): Date => {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return new Date();
};

const ensureImage = (category: string, provided?: string): string => {
  if (provided && provided.trim().length > 0) {
    return provided.trim();
  }
  const key = category.toLowerCase();
  if (key === 'education') {
    return 'https://images.pexels.com/photos/5212345/pexels-photo-5212345.jpeg';
  }
  if (key === 'programming') {
    return 'https://images.pexels.com/photos/3861958/pexels-photo-3861958.jpeg';
  }
  if (key === 'business') {
    return 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg';
  }
  return 'https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg';
};

const createLocalId = (prefix: string, index: number) => `${prefix}-${index}-${Math.random().toString(36).slice(2, 10)}`;

const normaliseResourceList = (value: unknown): CommunityResource[] => {
  if (!value) {
    return [];
  }

  const rawList = Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : [value];

  return rawList
    .map((entry, index) => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (!trimmed) {
          return null;
        }
        return {
          id: createLocalId('resource', index),
          title: trimmed,
          description: undefined,
          url: undefined,
          type: undefined,
          cost: undefined,
          notes: undefined
        } as CommunityResource;
      }

      if (entry && typeof entry === 'object') {
        const resource = entry as Record<string, unknown>;
        const title =
          typeof resource.title === 'string' && resource.title.trim().length > 0
            ? resource.title.trim()
            : typeof resource.name === 'string'
              ? resource.name.trim()
              : '';
        if (!title) {
          return null;
        }

        const url =
          typeof resource.url === 'string' && resource.url.trim().length > 0
            ? resource.url.trim()
            : typeof resource.link === 'string'
              ? resource.link.trim()
              : undefined;

        const description =
          typeof resource.description === 'string' && resource.description.trim().length > 0
            ? resource.description.trim()
            : undefined;

        const provider =
          typeof resource.provider === 'string' && resource.provider.trim().length > 0
            ? resource.provider.trim()
            : undefined;

        const notes =
          typeof resource.notes === 'string' && resource.notes.trim().length > 0
            ? resource.notes.trim()
            : undefined;

        const type =
          typeof resource.type === 'string' && resource.type.trim().length > 0
            ? (resource.type.trim() as CommunityResource['type'])
            : undefined;

        const cost =
          typeof resource.cost === 'string' && resource.cost.trim().length > 0
            ? (resource.cost.trim() === 'paid' ? 'paid' : 'free')
            : undefined;

        return {
          id:
            (typeof resource.id === 'string' && resource.id.trim().length > 0
              ? resource.id.trim()
              : createLocalId('resource', index)),
          title,
          description,
          url,
          provider,
          type,
          cost,
          notes
        };
      }

      return null;
    })
    .filter((item): item is CommunityResource => Boolean(item));
};

const normaliseRoadmapStages = (value: unknown): CommunityRoadmapStage[] => {
  if (!value) {
    return [];
  }

  const serialiseStringStage = (raw: string, index: number): CommunityRoadmapStage => {
    const trimmed = raw.trim();
    const [heading, ...rest] = trimmed.split(/[-:]/);
    const description = rest.join('-').trim();
    return {
      id: createLocalId('stage', index),
      title: heading.trim() || `Stage ${index + 1}`,
      description: description || undefined,
      tasks: []
    };
  };

  if (typeof value === 'string') {
    const segments = value.split(/\n{2,}|\r\n{2,}/).map((segment) => segment.trim());
    return segments.filter(Boolean).map((segment, index) => serialiseStringStage(segment, index));
  }

  const rawList = Array.isArray(value) ? value : [value];

  return rawList
    .map((entry, index) => {
      if (typeof entry === 'string') {
        return serialiseStringStage(entry, index);
      }

      if (entry && typeof entry === 'object') {
        const stage = entry as Record<string, unknown>;
        const title =
          typeof stage.title === 'string' && stage.title.trim().length > 0
            ? stage.title.trim()
            : typeof stage.name === 'string'
              ? stage.name.trim()
              : '';

        const description =
          typeof stage.description === 'string' && stage.description.trim().length > 0
            ? stage.description.trim()
            : typeof stage.summary === 'string'
              ? stage.summary.trim()
              : undefined;

        const milestone =
          typeof stage.milestone === 'string' && stage.milestone.trim().length > 0
            ? stage.milestone.trim()
            : undefined;

        const duration =
          typeof stage.duration === 'string' && stage.duration.trim().length > 0
            ? stage.duration.trim()
            : undefined;

        const tasksRaw = stage.tasks;
        const tasks =
          Array.isArray(tasksRaw) && tasksRaw.length > 0
            ? tasksRaw
              .map((task, taskIndex): CommunityRoadmapStage['tasks'][number] | null => {
                if (task && typeof task === 'object') {
                  const taskRecord = task as Record<string, unknown>;
                  const taskTitle =
                    typeof taskRecord.title === 'string' && taskRecord.title.trim().length > 0
                      ? taskRecord.title.trim()
                      : '';
                  if (!taskTitle) {
                    return null;
                  }

                  const taskDescription =
                    typeof taskRecord.description === 'string' && taskRecord.description.trim().length > 0
                      ? taskRecord.description.trim()
                      : undefined;

                  return {
                    id:
                      typeof taskRecord.id === 'string' && taskRecord.id.trim().length > 0
                        ? taskRecord.id.trim()
                        : createLocalId(`task-${index}`, taskIndex),
                    title: taskTitle,
                    description: taskDescription,
                    duration:
                      typeof taskRecord.duration === 'string' && taskRecord.duration.trim().length > 0
                        ? taskRecord.duration.trim()
                        : undefined,
                    resourceIds: Array.isArray(taskRecord.resourceIds)
                      ? (taskRecord.resourceIds.filter((id): id is string => typeof id === 'string') as string[])
                      : undefined,
                    outcome:
                      typeof taskRecord.outcome === 'string' && taskRecord.outcome.trim().length > 0
                        ? taskRecord.outcome.trim()
                        : undefined
                  };
                }
                if (typeof task === 'string' && task.trim().length > 0) {
                  return {
                    id: createLocalId(`task-${index}`, taskIndex),
                    title: task.trim(),
                    description: undefined
                  };
                }
                return null;
              })
              .filter((task): task is CommunityRoadmapStage['tasks'][number] => Boolean(task))
            : [];

        return {
          id:
            typeof stage.id === 'string' && stage.id.trim().length > 0
              ? stage.id.trim()
              : createLocalId('stage', index),
          title: title || `Stage ${index + 1}`,
          description,
          duration,
          milestone,
          tasks,
          resourceIds: Array.isArray(stage.resourceIds)
            ? (stage.resourceIds.filter((id): id is string => typeof id === 'string') as string[])
            : undefined,
          checkpoint:
            typeof stage.checkpoint === 'string' && stage.checkpoint.trim().length > 0
              ? stage.checkpoint.trim()
              : undefined
        };
      }

      return null;
    })
    .filter((stage): stage is CommunityRoadmapStage => Boolean(stage));
};

const deriveStatsFromPayload = (
  payload: Record<string, unknown>,
  defaults: Pick<CommunityStoryStats, 'rating' | 'users' | 'successRate'>
): CommunityStoryStats => {
  const statsPayload = payload.stats as Record<string, unknown> | undefined;
  const read = (key: string, fallback: number) => {
    if (statsPayload && key in statsPayload) {
      return toNumber(statsPayload[key], fallback);
    }
    if (key in payload) {
      return toNumber(payload[key], fallback);
    }
    return fallback;
  };

  const rating = Math.min(Math.max(read('rating', defaults.rating), 0), 5);
  const users = Math.max(0, Math.round(read('users', defaults.users)));
  const successRate = Math.min(Math.max(read('successRate', defaults.successRate), 1), 100);

  return {
    rating,
    users,
    successRate,
    saves: Math.max(0, Math.round(read('saves', 0))),
    adoptionCount: Math.max(0, Math.round(read('adoptionCount', defaults.users))),
    likes: Math.max(0, Math.round(read('likes', 0))),
    comments: Math.max(0, Math.round(read('comments', 0)))
  };
};

const mapListingToRoadmap = (payload: Record<string, unknown>, id: string): CommunityRoadmap => {
  const category = typeof payload.category === 'string' ? payload.category : 'Community';
  const updatedAt = parseDate(payload.updatedAt ?? payload.createdAt);

  const creatorRecord =
    payload.creator && typeof payload.creator === 'object' ? (payload.creator as Record<string, unknown>) : null;
  const creatorName =
    typeof creatorRecord?.name === 'string' && creatorRecord.name.trim().length > 0
      ? creatorRecord.name.trim()
      : typeof payload.creatorName === 'string'
        ? payload.creatorName
        : 'Community creator';
  const creatorAvatar =
    typeof creatorRecord?.avatar === 'string' && creatorRecord.avatar.trim().length > 0
      ? creatorRecord.avatar.trim()
      : typeof payload.creatorAvatar === 'string' && payload.creatorAvatar.trim().length > 0
        ? payload.creatorAvatar.trim()
        : 'CC';
  const creatorTitle =
    typeof creatorRecord?.title === 'string' && creatorRecord.title.trim().length > 0
      ? creatorRecord.title.trim()
      : typeof payload.creatorTitle === 'string'
        ? payload.creatorTitle
        : '';
  const creatorEmail =
    typeof creatorRecord?.email === 'string' && creatorRecord.email.trim().length > 0
      ? creatorRecord.email.trim()
      : typeof payload.creatorEmail === 'string'
        ? payload.creatorEmail.trim()
        : undefined;
  const creatorVerified =
    typeof creatorRecord?.verified === 'boolean' ? creatorRecord.verified : Boolean(payload.creatorVerified);

  const rawRating = Math.max(4.2, toNumber(payload.rating, 4.7));
  const rawUsers = toNumber(payload.users ?? payload.submissions, 0);
  const rawSuccessRate = Math.min(Math.max(toNumber(payload.successRate, 60), 1), 100);
  const stats = deriveStatsFromPayload(payload, {
    rating: rawRating,
    users: rawUsers,
    successRate: rawSuccessRate
  });

  const story =
    typeof payload.story === 'string' && payload.story.trim().length > 0
      ? payload.story.trim()
      : typeof payload.longDescription === 'string' && payload.longDescription.trim().length > 0
        ? payload.longDescription.trim()
        : typeof payload.description === 'string'
          ? payload.description
          : typeof payload.summary === 'string'
            ? payload.summary
            : 'Community submission awaiting more details.';

  const paymentLink =
    typeof payload.paymentLink === 'string' && payload.paymentLink.trim().length > 0
      ? payload.paymentLink.trim()
      : typeof payload.checkoutUrl === 'string' && payload.checkoutUrl.trim().length > 0
        ? payload.checkoutUrl.trim()
        : typeof payload.purchaseLink === 'string' && payload.purchaseLink.trim().length > 0
          ? payload.purchaseLink.trim()
          : undefined;

  return {
    id,
    title: typeof payload.title === 'string' ? payload.title : 'Untitled submission',
    description:
      typeof payload.description === 'string' && payload.description.trim().length > 0
        ? payload.description
        : typeof payload.summary === 'string'
          ? payload.summary
          : 'Community submission awaiting more details.',
    creator: {
      name: creatorName,
      avatar: creatorAvatar,
      title: creatorTitle,
      verified: creatorVerified
    },
    creatorEmail,
    category,
    duration: typeof payload.duration === 'string' ? payload.duration : 'Flexible',
    difficulty: normaliseDifficulty(payload.difficulty),
    rating: stats.rating,
    users: stats.users,
    successRate: stats.successRate,
    tags: toStringList(payload.tags),
    achievements: toStringList(payload.outcomes ?? payload.achievements),
    price: payload.priceType === 'premium' ? 'Premium' : 'Free',
    image: ensureImage(
      category,
      typeof payload.coverImage === 'string'
        ? payload.coverImage
        : typeof payload.image === 'string'
          ? payload.image
          : undefined
    ),
    featured: Boolean(payload.featured),
    status: payload.status === 'approved' ? 'approved' : payload.status === 'hidden' ? 'hidden' : 'pending',
    type: payload.type === 'marketplace' ? 'marketplace' : 'roadmap',
    lastUpdatedLabel: updatedAt.toLocaleDateString(),
    lastUpdatedTimestamp: updatedAt.getTime(),
    story,
    resources: normaliseResourceList(payload.resources),
    roadmap: normaliseRoadmapStages(payload.roadmap),
    stats,
    paymentLink,
    communityId: typeof payload.communityId === 'string' ? payload.communityId : null,
    deadlineStrategy: typeof payload.deadlineStrategy === 'string' ? payload.deadlineStrategy : null
  };
};

const downloadIcs = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const getAdoptionSummary = (adoption: RoadmapAdoptionResponse | undefined) => {
  const reminders = adoption?.reminderSchedule || adoption?.reminder_schedule || [];
  const communityAction = adoption?.communityAction || adoption?.community_action;
  const targetDeadline = adoption?.targetDeadline || adoption?.target_deadline;
  const parts = [
    reminders.length ? `${reminders.length} reminders prepared` : null,
    targetDeadline ? `deadline set for ${new Date(targetDeadline).toLocaleDateString()}` : null,
    communityAction?.communityId ? 'community next step available' : null,
  ].filter(Boolean);

  return parts.length ? parts.join(' • ') : 'Your roadmap is ready in your workspace.';
};

const CommunityMarketplace: React.FC<CommunityMarketplaceProps> = ({ onRoadmapSelect, user, onBack }) => {
  const { isDarkMode } = useDarkMode();
  const { toast } = useToast();
  const { userId, getToken } = useAuth();

  const [remoteRoadmaps, setRemoteRoadmaps] = useState<CommunityRoadmap[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(true);
  const [hasRealtimeData, setHasRealtimeData] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRoadmap, setSelectedRoadmap] = useState<CommunityRoadmap | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sortOption] = useState<SortOption>('Popular');
  const [formState, setFormState] = useState<CreateRoadmapForm>({ ...CREATE_DEFAULTS });
  const [isAddingRoadmap, setIsAddingRoadmap] = useState(false);

  useEffect(() => {
    // Use Supabase/optimized implementation to fetch community stories
    const fetchStories = async () => {
      try {
        setLoadingRemote(true);
        // Fetch backend roadmaps plus non-roadmap marketplace listings.
        const stories = await fetchCommunityStories({
          status: 'approved',
          type: ['roadmap', 'marketplace']
        });
        const mappedStories = (stories || []).map(s => mapListingToRoadmap(s as any, s.id));
        setRemoteRoadmaps(mappedStories);
        setHasRealtimeData(true);
      } catch (error) {
        console.error('Error fetching community stories:', error);
        // Optionally set error state here to show to the user
      } finally {
        setLoadingRemote(false);
      }
    };

    fetchStories();
  }, []);

  const combinedRoadmaps = hasRealtimeData && remoteRoadmaps.length > 0 ? remoteRoadmaps : FALLBACK_ROADMAPS;

  const approvedRoadmaps = useMemo(
    () => combinedRoadmaps.filter((roadmap) => roadmap.status === 'approved'),
    [combinedRoadmaps]
  );

  const categories = useMemo(() => {
    const unique = new Set<string>();
    approvedRoadmaps.forEach((roadmap) => unique.add(roadmap.category));
    return ['All', ...Array.from(unique).sort((a, b) => a.localeCompare(b))];
  }, [approvedRoadmaps]);

  useEffect(() => {
    if (categoryFilter !== 'All' && !categories.includes(categoryFilter)) {
      setCategoryFilter('All');
    }
  }, [categories, categoryFilter]);

  const filteredRoadmaps = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return approvedRoadmaps
      .filter((roadmap) => {
        const matchesSearch =
          search.length === 0 ||
          roadmap.title.toLowerCase().includes(search) ||
          roadmap.description.toLowerCase().includes(search) ||
          roadmap.creator.name.toLowerCase().includes(search) ||
          roadmap.tags.some((tag) => tag.toLowerCase().includes(search));

        const matchesCategory =
          categoryFilter === 'All' || roadmap.category.toLowerCase() === categoryFilter.toLowerCase();

        const matchesPrice = sortOption === 'Free Only' ? roadmap.price === 'Free' : true;

        return matchesSearch && matchesCategory && matchesPrice;
      })
      .sort((a, b) => {
        switch (sortOption) {
          case 'Newest':
            return b.lastUpdatedTimestamp - a.lastUpdatedTimestamp;
          case 'Highest Rated':
            return ((b.stats?.rating || 0) - (a.stats?.rating || 0));
          case 'Most Used':
            return ((b.stats?.users || 0) - (a.stats?.users || 0));
          default:
            return Number(b.featured) - Number(a.featured) || ((b.stats?.successRate || 0) - (a.stats?.successRate || 0));
        }
      });
  }, [approvedRoadmaps, categoryFilter, sortOption, searchTerm]);

  useEffect(() => {
    if (!selectedRoadmap && filteredRoadmaps.length > 0) {
      setSelectedRoadmap(filteredRoadmaps[0]);
      return;
    }
    if (selectedRoadmap && filteredRoadmaps.length > 0) {
      const stillPresent = filteredRoadmaps.find((roadmap) => roadmap.id === selectedRoadmap.id);
      if (!stillPresent) {
        setSelectedRoadmap(filteredRoadmaps[0]);
      }
      return;
    }
    if (filteredRoadmaps.length === 0) {
      setSelectedRoadmap(null);
    }
  }, [filteredRoadmaps, selectedRoadmap]);

  const resetForm = () => setFormState({ ...CREATE_DEFAULTS });

  const handleCreateRoadmap = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedTitle = formState.title.trim();
    const trimmedSummary = formState.summary.trim();

    if (!trimmedTitle || !trimmedSummary) {
      toast({
        title: 'Add a title and summary',
        description: 'Share a short title and description so learners know what your roadmap covers.',
        variant: 'error'
      });
      return;
    }

    setSubmitting(true);
    try {
      // Prepare submission data in the format expected by the Supabase service
      const submissionData = {
        title: trimmedTitle,
        summary: trimmedSummary,
        description: trimmedSummary,
        category: formState.category.trim() || 'Community',
        duration: formState.duration.trim() || 'Flexible',
        difficulty: formState.difficulty,
        price: (formState.price === 'Premium' ? 'Premium' : 'Free') as CommunityStoryPrice, // Update to match CommunityStoryPrice
        successRate: Math.min(Math.max(Number.parseInt(formState.successRate || '60', 10), 1), 100),
        tags: toStringList(formState.tags),
        outcomes: toStringList(formState.outcomes),
        coverImage: formState.coverImage.trim() || null,
        creator: {
          name: user?.name ?? 'Anonymous learner',
          email: formState.creatorEmail.trim() || undefined,
          title: formState.creatorTitle.trim() || undefined
        },
        type: 'roadmap' as const,
        status: 'pending' as const,
        featured: false,
        resources: [],
        roadmap: [],
        story: trimmedSummary
      };

      // Submit using the Supabase implementation
      if (!userId) throw new Error('Not authenticated');
      const token = await getToken();
      await submitCommunityStory(userId, submissionData, token);

      setCreateOpen(false);
      resetForm();
      toast({
        title: 'Submission received',
        description: 'Thank you for sharing your success story!',
        variant: 'success'
      });
    } catch (error) {
      toast({
        title: 'Unable to submit roadmap',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDetail = (roadmap: CommunityRoadmap) => {
    setSelectedRoadmap(roadmap);
    setDetailOpen(true);
  };

  const handleGetRoadmap = async (roadmap: CommunityRoadmap) => {
    if (isAddingRoadmap) return;
    setIsAddingRoadmap(true);
    try {
      let adoption: RoadmapAdoptionResponse | undefined;
      if (roadmap.type === 'roadmap' && !roadmap.id.startsWith('sample-')) {
        const token = await getToken();
        const targetDeadline = roadmap.deadlineStrategy
          ? window.prompt('Target application deadline for this roadmap (YYYY-MM-DD). Leave blank if you do not know it yet.')?.trim()
          : '';
        adoption = await recordCommunityStoryAdoptionWithToken(
          roadmap.id,
          token,
          {
            targetDeadline: targetDeadline || undefined,
            calendarSyncEnabled: true,
          },
        ) as RoadmapAdoptionResponse | undefined;

        if (adoption?.calendar?.enabled && adoption.calendar.eventCount > 0) {
          try {
            const calendar = await fetchRoadmapCalendarExport(adoption.id, token);
            downloadIcs(calendar.filename, calendar.ics);
          } catch (calendarError) {
            console.warn('Roadmap calendar export failed', calendarError);
          }
        }
      }
      await onRoadmapSelect(roadmap);
      setDetailOpen(false);
      toast({
        title: 'Roadmap adopted',
        description: getAdoptionSummary(adoption),
        variant: 'success'
      });
    } catch (error) {
      console.error('Failed to add roadmap:', error);
      toast({
        title: 'Error',
        description: 'Failed to add roadmap. Please try again.',
        variant: 'error'
      });
    } finally {
      setIsAddingRoadmap(false);
    }
  };


  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-white text-slate-900'} font-body transition-colors duration-300`}>
      {/* Page Header */}
      <PageHeader
        title="Community Marketplace"
        subtitle="Discover proven career trajectories shared by the Edutu community"
        onBack={onBack}
      />

      <div className="max-w-7xl mx-auto px-6 pt-6 pb-24 space-y-8 relative z-10">

        {/* Search & Filter Controls */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-600 transition-colors">
                <Search size={18} />
              </div>
              <input
                type="text"
                placeholder="Search roadmaps, careers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-subtle bg-surface-layer/50 dark:bg-gray-900 shadow-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-medium text-sm"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-3 rounded-xl transition-all shadow-sm border ${showFilters
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white dark:bg-gray-900 text-slate-600 dark:text-slate-400 border-subtle hover:border-brand-500/30'
                }`}
            >
              <Filter size={20} />
            </button>
          </div>

          {/* Collapsible Filters */}
          {showFilters && (
            <div className="p-1 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide w-full">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-5 py-2.5 rounded-xl font-bold text-[10px] tracking-wider transition-all whitespace-nowrap border ${categoryFilter === cat
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-brand-600 dark:border-brand-600'
                      : 'bg-white dark:bg-gray-900 text-slate-500 border-subtle hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Redesigned Success Trajectory Banner Card */}
        <div
          onClick={() => setCreateOpen(true)}
          className="stat-card stat-card-purple group cursor-pointer p-6 md:p-10 relative overflow-hidden"
        >
          <div className="stat-card-edge" />
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 space-y-4 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 dark:bg-white/10 border border-white/20 backdrop-blur-md">
                <Sparkles size={14} className="text-white" />
                <span className="text-[10px] font-bold tracking-wider text-white">Community Edition</span>
              </div>
              <h3 className="text-3xl font-display font-bold text-white leading-tight">
                Share Your Success <br className="hidden md:block" /> Trajectory
              </h3>
              <p className="text-base text-white/80 font-medium max-w-xl leading-relaxed">
                Publish your career journey and help thousands of learners follow your proven path to success.
              </p>
            </div>

            <Button
              variant="secondary"
              className="bg-white text-brand-600 hover:bg-slate-50 rounded-2xl px-10 py-5 h-auto font-black shadow-xl shadow-brand-500/10 group-hover:scale-105 transition-transform"
            >
              <Plus size={20} className="mr-2" />
              Publish Now
            </Button>
          </div>

          <div className="absolute right-[-20px] bottom-[-20px] opacity-10 group-hover:opacity-20 transition-opacity">
            <Sparkles size={120} className="text-white rotate-12" />
          </div>
        </div>

        {/* Refined Grid */}
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-slate-500 tracking-widest">Featured Roadmaps</h2>
            <div className="h-px flex-1 bg-subtle" />
          </div>

          {loadingRemote ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-[400px] rounded-2xl animate-pulse bg-surface-layer border border-subtle" />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
              {filteredRoadmaps.map((roadmap) => (
                <div
                  key={roadmap.id}
                  onClick={() => handleOpenDetail(roadmap)}
                  className="group flex flex-col bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-subtle hover:border-brand-500/50 hover:shadow-xl hover:shadow-brand-500/5 transition-all duration-300 cursor-pointer"
                >
                  {/* Card Media */}
                  <div className="relative h-48 overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <img
                      src={roadmap.image}
                      alt={roadmap.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute top-4 left-4">
                      <div className="px-3 py-1.5 rounded-lg bg-white/90 dark:bg-gray-900/90 backdrop-blur-md text-[10px] font-bold tracking-wider shadow-sm border border-white/20">
                        {roadmap.category}
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-6 flex-1 flex flex-col space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden flex items-center justify-center font-bold text-[10px] border border-subtle">
                          {(roadmap.creator?.avatar && roadmap.creator.avatar.length <= 3) ? roadmap.creator.avatar : <Users size={10} />}
                        </div>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-tight">
                          {roadmap.creator?.name || 'Anonymous'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-md">
                        <Star size={10} fill="currentColor" />
                        <span className="text-[10px] font-bold">{(roadmap.stats?.rating ?? 0).toFixed(1)}</span>
                      </div>
                    </div>

                    <h3 className="text-xl font-bold leading-tight group-hover:text-brand-600 transition-colors line-clamp-2">
                      {roadmap.title}
                    </h3>

                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed font-medium">
                      {roadmap.description}
                    </p>

                    <div className="mt-auto pt-4 flex items-center justify-between border-t border-subtle">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Users size={14} />
                          <span className="text-xs font-bold">{(roadmap.stats?.users ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="px-2 py-0.5 rounded-md bg-slate-50 dark:bg-white/5 text-[10px] font-bold tracking-wider text-slate-500 border border-subtle">
                          {roadmap.difficulty}
                        </div>
                      </div>
                      <div className="text-xs font-bold text-brand-600 dark:text-brand-400">
                        {roadmap.price}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Immersive Full-Page Roadmap Detail View */}
      {detailOpen && selectedRoadmap && (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-950 overflow-y-auto animate-in slide-in-from-right duration-500 fill-mode-forwards scrollbar-hide">
          {/* Immersive Hero Header */}
          <div className="relative h-[45vh] md:h-[55vh] w-full shrink-0">
            <img
              src={selectedRoadmap.image}
              alt={selectedRoadmap.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/20 to-transparent" />

            {/* Navigation Header */}
            <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-10">
              <button
                onClick={() => setDetailOpen(false)}
                className="p-3 rounded-2xl bg-black/20 hover:bg-black/40 text-white backdrop-blur-xl border border-white/10 transition-all active:scale-90"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex gap-2">
                <button className="p-3 rounded-2xl bg-black/20 text-white backdrop-blur-xl border border-white/10">
                  <Star size={20} />
                </button>
              </div>
            </div>

            {/* Hero Content */}
            <div className="absolute bottom-10 left-6 right-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-lg bg-brand-500 text-white text-[10px] font-black tracking-[0.2em] shadow-lg shadow-brand-500/20">
                  {selectedRoadmap.category}
                </span>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 text-white text-[10px] font-bold tracking-wider backdrop-blur-md border border-white/10">
                  <Clock size={12} />
                  {selectedRoadmap.duration}
                </div>
              </div>
              <h1 className="text-3xl md:text-5xl font-display font-bold text-white leading-[1.1] tracking-tight">
                {selectedRoadmap.title}
              </h1>
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 overflow-hidden flex items-center justify-center font-bold text-xs text-brand-400">
                    {(selectedRoadmap.creator?.avatar && selectedRoadmap.creator.avatar.length <= 3) ? selectedRoadmap.creator.avatar : <Users size={16} />}
                  </div>
                  <span className="text-sm font-bold text-white/90">{selectedRoadmap.creator?.name}</span>
                </div>
                <div className="w-1 h-1 rounded-full bg-white/30" />
                <div className="flex items-center gap-1.5 text-amber-400">
                  <Star size={16} fill="currentColor" />
                  <span className="text-sm font-black">{selectedRoadmap.rating.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Content Area */}
          <div className="max-w-4xl mx-auto px-6 py-12 space-y-16 pb-32">
            {/* Overview / Story Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <Info size={20} />
                </div>
                <h3 className="text-xl font-display font-bold">Trajectory Overview</h3>
              </div>
              <div className="prose prose-slate dark:prose-invert max-w-none">
                <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                  {selectedRoadmap.story || selectedRoadmap.description}
                </p>
              </div>
              {selectedRoadmap.deadlineStrategy && (
                <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4">
                  <p className="text-xs font-black tracking-widest text-brand-600 dark:text-brand-300">DEADLINE STRATEGY</p>
                  <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                    {selectedRoadmap.deadlineStrategy}
                  </p>
                </div>
              )}

              {/* Quick Stats Banner */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                {[
                  { label: 'Difficulty', value: selectedRoadmap.difficulty, icon: <BarChart size={16} /> },
                  { label: 'Learners', value: selectedRoadmap.users.toLocaleString(), icon: <Users size={16} /> },
                  { label: 'Success Rate', value: `${selectedRoadmap.successRate}%`, icon: <Sparkles size={16} /> },
                  { label: 'Access', value: selectedRoadmap.price, icon: <BookOpen size={16} /> }
                ].map((stat) => (
                  <div key={stat.label} className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-subtle flex flex-col gap-2">
                    <div className="text-slate-400">{stat.icon}</div>
                    <div>
                      <p className="text-[10px] font-black tracking-widest text-slate-400">{stat.label}</p>
                      <p className="font-bold text-slate-900 dark:text-white">{stat.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Immersive Timeline Section */}
            <div className="space-y-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-brand-500/10 text-brand-500">
                    <BookOpen size={20} />
                  </div>
                  <h3 className="text-xl font-display font-bold">Step-by-Step Curriculum</h3>
                </div>
                <span className="text-xs font-black text-slate-400 tracking-widest">
                  {selectedRoadmap.roadmap?.length || 0} Phases
                </span>
              </div>

              <div className="relative space-y-12 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-brand-500 before:via-indigo-500 before:to-slate-200 dark:before:to-slate-800">
                {selectedRoadmap.roadmap?.map((stage, idx) => (
                  <div key={stage.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                    {/* Dot Icon */}
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white dark:border-gray-950 bg-white dark:bg-gray-900 shadow-xl z-10 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 transition-transform group-hover:scale-125">
                      <div className="w-3 h-3 rounded-full bg-brand-500 animate-pulse" />
                    </div>
                    {/* Card */}
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-3xl bg-white dark:bg-gray-900 border border-subtle shadow-sm hover:shadow-xl hover:border-brand-500/30 transition-all duration-300">
                      <div className="flex items-center justify-between mb-3 text-brand-500">
                        <span className="text-[10px] font-black tracking-widest">Phase {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          {typeof stage.relativeDueDays === 'number' && (
                            <span className="text-[10px] font-bold py-1 px-2 rounded-lg bg-amber-500/10 text-amber-600">
                              {stage.relativeDueDays < 0
                                ? `${Math.abs(stage.relativeDueDays)} days before deadline`
                                : stage.relativeDueDays === 0
                                  ? 'Deadline day'
                                  : `Day ${stage.relativeDueDays}`}
                            </span>
                          )}
                          {stage.duration && <span className="text-[10px] font-bold py-1 px-2 rounded-lg bg-brand-500/10">{stage.duration}</span>}
                        </div>
                      </div>
                      <h4 className="text-lg font-bold mb-2 text-slate-900 dark:text-white leading-tight">{stage.title}</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                        {stage.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resources Grid */}
            {selectedRoadmap.resources && selectedRoadmap.resources.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-accent-500/10 text-accent-500">
                    <ExternalLink size={20} />
                  </div>
                  <h3 className="text-xl font-display font-bold">Bundle Resources</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedRoadmap.resources.map((resource) => (
                    <div key={resource.id} className="group p-5 rounded-2xl bg-white dark:bg-gray-900 border border-subtle hover:border-accent-500/30 transition-all cursor-pointer">
                      <div className="flex items-start justify-between mb-4">
                        <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 group-hover:bg-accent-500 group-hover:text-white transition-colors">
                          <BookOpen size={20} />
                        </div>
                        <ExternalLink size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <h5 className="font-bold text-slate-900 dark:text-white mb-1">{resource.title}</h5>
                      <p className="text-xs text-slate-500 font-medium capitalize line-clamp-1">{resource.type || 'Resource'} • {resource.cost || 'Access'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky Bottom Action Bar */}
          <div className="fixed bottom-0 left-0 right-0 p-6 md:p-8 bg-white/80 dark:bg-gray-950/80 backdrop-blur-2xl border-t border-subtle z-50">
            <div className="max-w-4xl mx-auto">
              <Button
                onClick={() => handleGetRoadmap(selectedRoadmap)}
                disabled={isAddingRoadmap}
                className="w-full rounded-2xl py-5 h-auto text-lg font-black shadow-2xl shadow-brand-500/30 bg-gradient-to-r from-brand-600 to-indigo-600 hover:scale-[1.02] transition-transform text-white flex items-center justify-center gap-4"
              >
                {isAddingRoadmap ? (
                  <>
                    <RefreshCw size={24} className="animate-spin" />
                    Forging Your New Path...
                  </>
                ) : (
                  <>
                    <Sparkles size={24} />
                    Get This Trajectory
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Simplified Submit Dialog */}
      {/* Simplified Submit Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (submitting) return;
          setCreateOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent preventCloseOnBackdropClick={submitting} className="max-w-xl rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="p-6 border-b border-subtle flex items-center justify-between bg-white dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500">
                <Sparkles size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold">Publish Roadmap</h2>
                <p className="text-xs text-slate-400 font-medium">Share your success trajectory with the community</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleCreateRoadmap} className="p-6 space-y-5 bg-white dark:bg-gray-900 max-h-[80vh] overflow-y-auto">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 tracking-wider ml-1">Roadmap Title</label>
              <Input
                value={formState.title}
                onChange={(e) => setFormState(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. Frontend Engineering Mastery"
                className="rounded-xl border border-subtle bg-slate-50 dark:bg-white/5 py-3 px-4 font-medium text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 tracking-wider ml-1">Category</label>
                <Select
                  value={formState.category}
                  onChange={(e) => setFormState(prev => ({ ...prev, category: e.target.value }))}
                  className="rounded-xl border border-subtle bg-slate-50 dark:bg-white/5 h-11 px-4 font-medium text-sm"
                >
                  <option>Programming</option>
                  <option>Business</option>
                  <option>Education</option>
                  <option>Creative</option>
                  <option>Lifestyle</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 tracking-wider ml-1">Difficulty</label>
                <Select
                  value={formState.difficulty}
                  onChange={(e) => setFormState(prev => ({ ...prev, difficulty: e.target.value as any }))}
                  className="rounded-xl border border-subtle bg-slate-50 dark:bg-white/5 h-11 px-4 font-medium text-sm"
                >
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 tracking-wider ml-1">Objectives Overview</label>
              <Textarea
                rows={4}
                value={formState.summary}
                onChange={(e) => setFormState(prev => ({ ...prev, summary: e.target.value }))}
                placeholder="Define the impact of this trajectory..."
                className="rounded-xl border border-subtle bg-slate-50 dark:bg-white/5 py-3 px-4 font-medium text-sm resize-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 tracking-wider ml-1">Duration</label>
                <Input
                  value={formState.duration}
                  onChange={(e) => setFormState(prev => ({ ...prev, duration: e.target.value }))}
                  placeholder="e.g. 12 Months"
                  className="rounded-xl border border-subtle bg-slate-50 dark:bg-white/5 py-3 px-4 font-medium text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 tracking-wider ml-1">Price Tier</label>
                <Select
                  value={formState.price}
                  onChange={(e) => setFormState(prev => ({ ...prev, price: e.target.value as any }))}
                  className="rounded-xl border border-subtle bg-slate-50 dark:bg-white/5 h-11 px-4 font-medium text-sm"
                >
                  <option value="Free">Free</option>
                  <option value="Premium">Premium</option>
                </Select>
              </div>
            </div>

            <DialogFooter className="pt-4 flex items-center gap-3">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={submitting} className="flex-1 rounded-xl py-3 h-auto font-bold text-sm">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 rounded-xl py-3 h-auto font-bold text-sm">
                {submitting ? 'Publishing...' : 'Publish Now'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};


export default CommunityMarketplace;
