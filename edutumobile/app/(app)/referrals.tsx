import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Share,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gift, Share2, Users, Clock, Coins, Menu } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useTheme } from '../../components/context/ThemeContext';
import { useReferral } from '@edutu/core/src/hooks/useReferral';
import {
  REFERRAL_REWARD_REFERRER,
  REFERRAL_REWARD_REFEREE,
} from '@edutu/core/src/services/referrals';
import { supabase } from '../../lib/supabase';

export default function ReferralsScreen() {
  const { t } = useTranslation('home');
  const router = useRouter();
  const { user } = useUser();
  const { colors } = useTheme();
  const { code, message, stats, isLoading, refresh } = useReferral(
    supabase,
    user?.id || null,
  );
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleShare = useCallback(async () => {
    if (!message) return;
    try {
      await Share.share({ message });
    } catch {
      // user dismissed the sheet — nothing to do
    }
  }, [message]);

  const stat = (
    icon: React.ReactNode,
    value: number,
    label: string,
  ) => (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {icon}
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title={t('referral.title', { defaultValue: 'Invite friends' })}
        showBack
        right={
          <TouchableOpacity
            onPress={() => router.push('/profile')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('header.menu', { defaultValue: 'Open menu' })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Menu size={22} color={colors.foreground} strokeWidth={2} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.hero}>
          <Gift color="#F59E0B" size={32} />
          <Text style={styles.heroTitle}>
            {t('referral.heroTitle', {
              defaultValue: 'Give 10, get 10',
            })}
          </Text>
          <Text style={styles.heroSub}>
            {t('referral.heroSub', {
              rewardReferrer: REFERRAL_REWARD_REFERRER,
              rewardReferee: REFERRAL_REWARD_REFEREE,
              defaultValue:
                'Share your code. When a friend signs up and completes their profile, you get {{rewardReferrer}} credits and they get {{rewardReferee}}.',
            })}
          </Text>

          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>
              {t('referral.yourCode', { defaultValue: 'YOUR CODE' })}
            </Text>
            {isLoading ? (
              <ActivityIndicator color="#3B82F6" style={{ marginTop: 6 }} />
            ) : (
              <Text style={styles.codeValue}>{code ?? '—'}</Text>
            )}
          </View>
        </LinearGradient>

        <TouchableOpacity
          style={[styles.shareButton, !code && styles.buttonDisabled]}
          onPress={handleShare}
          disabled={!code}
          activeOpacity={0.85}
        >
          <Share2 color="#FFFFFF" size={18} />
          <Text style={styles.shareButtonText}>
            {t('referral.shareCta', { defaultValue: 'Share invite' })}
          </Text>
        </TouchableOpacity>

        <View style={styles.statsRow}>
          {stat(
            <Users color={colors.accent} size={20} />,
            stats.completed,
            t('referral.stats.joined', { defaultValue: 'Joined' }),
          )}
          {stat(
            <Clock color="#F59E0B" size={20} />,
            stats.pending,
            t('referral.stats.pending', { defaultValue: 'Pending' }),
          )}
          {stat(
            <Coins color="#22C55E" size={20} />,
            stats.creditsEarned,
            t('referral.stats.earned', { defaultValue: 'Credits' }),
          )}
        </View>

        <Text style={[styles.fineprint, { color: colors.textSecondary }]}>
          {t('referral.fineprint', {
            defaultValue:
              'Pending invites become credits once your friend finishes their profile.',
          })}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  hero: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 12,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  codeBox: {
    marginTop: 20,
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 16,
  },
  codeLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  codeValue: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 4,
    marginTop: 6,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 16,
  },
  shareButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  statCard: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
    gap: 6,
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600' },
  fineprint: { fontSize: 12, textAlign: 'center', marginTop: 20, lineHeight: 18 },
});
