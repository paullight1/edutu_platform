import type React from 'react';
import {
  CheckCircle2,
  Clock,
  FolderOpen,
  Inbox,
} from 'lucide-react-native';

export type MoreFeature = {
  id: string;
  title: string;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  route: string;
  gradient: readonly [string, string];
};

/** Utility destinations consolidated under the bottom-nav More page. */
export const MORE_FEATURES: MoreFeature[] = [
  {
    id: 'applied',
    title: 'list.features.applied.title',
    icon: CheckCircle2,
    route: '/applied',
    gradient: ['#14B8A6', '#0F766E'],
  },
  {
    id: 'deadlines',
    title: 'list.features.deadlines.title',
    icon: Clock,
    route: '/deadlines',
    gradient: ['#F97316', '#DC2626'],
  },
  {
    id: 'documents',
    title: 'profile:view.menu.myDocuments',
    icon: FolderOpen,
    route: '/profile/documents',
    gradient: ['#7C3AED', '#5B21B6'],
  },
  {
    id: 'submissions',
    title: 'list.features.submissions.title',
    icon: Inbox,
    route: '/opportunities/submissions',
    gradient: ['#6366F1', '#4338CA'],
  },
];
