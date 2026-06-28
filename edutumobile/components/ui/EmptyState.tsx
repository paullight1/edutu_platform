import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import {
  SearchX, Bookmark, Target, FileText, Bell, Inbox,
  Compass, AlertCircle, Wifi, WifiOff, Sparkles,
} from 'lucide-react-native';

export type EmptyStateVariant =
  | 'search'
  | 'saved'
  | 'goals'
  | 'applications'
  | 'notifications'
  | 'deadlines'
  | 'offline'
  | 'error'
  | 'generic';

interface EmptyStateProps extends ViewProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  variant?: EmptyStateVariant;
  actionLabel?: string;
  onAction?: () => void;
}

interface VariantConfig {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  iconColor: string;
}

const VARIANTS: Record<EmptyStateVariant, VariantConfig> = {
  search: {
    icon: SearchX,
    title: 'No results found',
    description: 'Try adjusting your search terms or filters to find what you\'re looking for.',
    actionLabel: 'Clear Search',
    iconColor: '#94A3B8',
  },
  saved: {
    icon: Bookmark,
    title: 'No saved opportunities',
    description: 'Opportunities you bookmark will appear here. Start exploring to find scholarships and programmes that match your goals.',
    actionLabel: 'Browse Opportunities',
    iconColor: '#6366F1',
  },
  goals: {
    icon: Target,
    title: 'No goals yet',
    description: 'Create your first goal to start tracking your progress toward scholarships, skills, and career milestones.',
    actionLabel: 'Create Goal',
    iconColor: '#10B981',
  },
  applications: {
    icon: FileText,
    title: 'No applications yet',
    description: 'Track your scholarship and job applications here. When you apply to an opportunity, mark it to monitor your progress.',
    actionLabel: 'Browse Opportunities',
    iconColor: '#3b82f6',
  },
  notifications: {
    icon: Bell,
    title: 'No notifications',
    description: 'You\'re all caught up! We\'ll notify you about deadlines, new opportunities, and goal reminders.',
    actionLabel: 'Explore Opportunities',
    iconColor: '#F59E0B',
  },
  deadlines: {
    icon: AlertCircle,
    title: 'No upcoming deadlines',
    description: 'You don\'t have any approaching deadlines. Save opportunities and create goals to track important dates.',
    actionLabel: 'Browse Opportunities',
    iconColor: '#EF4444',
  },
  offline: {
    icon: WifiOff,
    title: 'You\'re offline',
    description: 'Check your internet connection. You can still browse previously loaded content.',
    actionLabel: 'Try Again',
    iconColor: '#64748B',
  },
  error: {
    icon: AlertCircle,
    title: 'Something went wrong',
    description: 'We couldn\'t load this content. Please try again or check back later.',
    actionLabel: 'Retry',
    iconColor: '#EF4444',
  },
  generic: {
    icon: Inbox,
    title: 'Nothing here yet',
    description: 'Content will appear here once it\'s available.',
    actionLabel: 'Go Back',
    iconColor: '#94A3B8',
  },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'generic',
  actionLabel,
  onAction,
  ...props
}: EmptyStateProps) {
  const config = VARIANTS[variant];
  const Icon = icon || config.icon;
  const displayTitle = title || config.title;
  const displayDescription = description || config.description;
  const displayActionLabel = actionLabel || config.actionLabel;

  return (
    <View style={styles.container} {...props}>
      <View style={[styles.iconContainer, { backgroundColor: `${config.iconColor}15` }]}>
        <Icon size={32} color={config.iconColor} />
      </View>
      <Text style={styles.title}>{displayTitle}</Text>
      <Text style={styles.description}>{displayDescription}</Text>
      {action || (onAction && (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: config.iconColor }]}
          onPress={onAction}
          activeOpacity={0.8}
        >
          <Sparkles size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.actionLabel}>{displayActionLabel}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
