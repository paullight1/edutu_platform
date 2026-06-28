import { Alert, View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, ChevronRight, Clock, Globe } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../../components/context/ThemeContext";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import {
  ApplicationStatus,
  AppliedOpportunity,
  fetchTrackedApplications,
  updateTrackedApplicationStatus,
} from "../../packages/core/src/services/applications";
import { BrandedLoader } from "../../components/ui/BrandedLoader";

const STATUS_OPTIONS: ApplicationStatus[] = ['submitted', 'interview', 'offer', 'rejected', 'withdrawn'];

function formatStatus(value: ApplicationStatus) {
  if (value === 'offer') return 'Offer';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getStatusColor(value: ApplicationStatus) {
  switch (value) {
    case 'interview':
      return '#3B82F6';
    case 'offer':
      return '#3b82f6';
    case 'rejected':
      return '#EF4444';
    case 'withdrawn':
      return '#64748B';
    case 'draft':
      return '#F59E0B';
    case 'submitted':
    default:
      return '#10B981';
  }
}

function formatDate(value?: string | null) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDeadline(value?: string | null) {
  if (!value) return 'Rolling';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Rolling';
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'Closed';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  return `${days} days left`;
}

export default function AppliedPage() {
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [applications, setApplications] = useState<AppliedOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const textPrimary = colors.foreground;
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const cardBg = colors.card;
  const borderColor = colors.border;
  const accentColor = colors.accent;

  const loadApplications = useCallback(async () => {
    if (!user?.id) {
      setApplications([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setLoading(true);
      setApplications(await fetchTrackedApplications(supabase, user.id, getToken));
    } catch (error) {
      console.error('Failed to load applied opportunities:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken, user?.id]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadApplications();
  }, [loadApplications]);

  const updateStatus = useCallback(async (applicationId: string, status: ApplicationStatus) => {
    if (!user?.id) return;

    try {
      const updated = await updateTrackedApplicationStatus(supabase, user.id, applicationId, status, getToken);
      if (!updated) throw new Error('Unable to update status');
      setApplications((current) => current.map((item) => (
        item.id === applicationId ? { ...item, status } : item
      )));
    } catch (error) {
      console.error('Failed to update application status:', error);
      Alert.alert('Status not updated', 'Please try again in a moment.');
    }
  }, [getToken, user?.id]);

  const openStatusPicker = useCallback((application: AppliedOpportunity) => {
    Alert.alert(
      'Update application status',
      application.title,
      [
        ...STATUS_OPTIONS.map((status) => ({
          text: formatStatus(status),
          onPress: () => updateStatus(application.id, status),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }, [updateStatus]);

  const headerSubtitle = useMemo(() => {
    if (loading) return 'Loading...';
    return `${applications.length} applied`;
  }, [applications.length, loading]);

  const renderApplication = useCallback(({ item }: { item: AppliedOpportunity }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: cardBg, borderColor }]}
      activeOpacity={0.85}
      onPress={() => router.push(`/opportunities/${item.opportunity_id}`)}
    >
      <View style={[styles.thumb, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.thumbImage} resizeMode="cover" />
        ) : (
          <Globe size={24} color={accentColor} />
        )}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.category, { color: accentColor }]} numberOfLines={1}>{item.category}</Text>
          <TouchableOpacity
            onPress={() => openStatusPicker(item)}
            style={[styles.statusButton, { backgroundColor: `${getStatusColor(item.status)}1F` }]}
            activeOpacity={0.75}
          >
            <Text style={[styles.status, { color: getStatusColor(item.status) }]}>{formatStatus(item.status)}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.cardTitle, { color: textPrimary }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[styles.org, { color: textSecondary }]} numberOfLines={1}>{item.organization}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Calendar size={12} color={textSecondary} />
            <Text style={[styles.metaText, { color: textSecondary }]}>Applied {formatDate(item.submitted_at)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Clock size={12} color={textSecondary} />
            <Text style={[styles.metaText, { color: textSecondary }]}>{formatDeadline(item.deadline)}</Text>
          </View>
        </View>
      </View>
      <ChevronRight size={18} color={textSecondary} />
    </TouchableOpacity>
  ), [accentColor, cardBg, borderColor, isDark, openStatusPicker, router, textPrimary, textSecondary]);

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Globe size={48} color={textSecondary} />
      <Text style={[styles.emptyTitle, { color: textPrimary }]}>No applications yet</Text>
      <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
        Opportunities you apply for will appear here.
      </Text>
      <TouchableOpacity
        style={[styles.emptyBtn, { backgroundColor: accentColor }]}
        onPress={() => router.push('/opportunities')}
      >
        <Text style={styles.emptyBtnText}>Browse Opportunities</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
      <ScreenHeader title="My Applications" showBack subtitle={headerSubtitle} />

      <FlatList
        data={applications}
        keyExtractor={(item) => item.id}
        renderItem={renderApplication}
        ListEmptyComponent={loading ? null : renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
        }
      />

      {loading && applications.length === 0 && (
        <View style={styles.loadingOverlay}>
          <BrandedLoader label="Loading applications..." />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  cardBody: {
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  category: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    flex: 1,
  },
  status: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 3,
  },
  org: {
    fontSize: 11,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 10,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
});
