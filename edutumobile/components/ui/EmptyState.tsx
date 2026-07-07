import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewProps } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  iconColor: string;
}

const VARIANTS: Record<EmptyStateVariant, VariantConfig> = {
  search: {
    icon: SearchX,
    iconColor: '#94A3B8',
  },
  saved: {
    icon: Bookmark,
    iconColor: '#6366F1',
  },
  goals: {
    icon: Target,
    iconColor: '#10B981',
  },
  applications: {
    icon: FileText,
    iconColor: '#3b82f6',
  },
  notifications: {
    icon: Bell,
    iconColor: '#F59E0B',
  },
  deadlines: {
    icon: AlertCircle,
    iconColor: '#EF4444',
  },
  offline: {
    icon: WifiOff,
    iconColor: '#64748B',
  },
  error: {
    icon: AlertCircle,
    iconColor: '#EF4444',
  },
  generic: {
    icon: Inbox,
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
  const { t } = useTranslation('common');
  const config = VARIANTS[variant];
  const Icon = icon || config.icon;
  const displayTitle = title || t(`emptyState.${variant}.title`);
  const displayDescription = description || t(`emptyState.${variant}.description`);
  const displayActionLabel = actionLabel || t(`emptyState.${variant}.actionLabel`);

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
