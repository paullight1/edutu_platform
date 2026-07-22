import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowUpRight, ArrowDownLeft, PlusCircle, CreditCard, Flame, Zap, Crown } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useTheme } from '../../components/context/ThemeContext';
import { useCredits } from '@edutu/core/src/hooks/useCredits';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import { CreditPackSheet } from '../../components/credits/CreditPackSheet';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';

export default function WalletScreen() {
    const { t } = useTranslation('home');
    const { user } = useUser();
    const router = useRouter();
    const { colors } = useTheme();
    const { credits, loginStreak, isLoading: creditsLoading, transactions, refreshCredits } = useCredits(supabase, user?.id || null);
    const { isPro, isLoading: proLoading } = useProStatus(supabase, user?.id || null);
    const [refreshing, setRefreshing] = useState(false);
    const [showCreditSheet, setShowCreditSheet] = useState(false);

    const scrollRef = useRef<ScrollView>(null);
    const txSectionY = useRef(0);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refreshCredits();
        setRefreshing(false);
    }, [refreshCredits]);

    const handleAddCredits = () => {
        setShowCreditSheet(true);
    };

    const handleUpgradePro = () => {
        router.push('/paywall');
    };

    const handleViewHistory = () => {
        scrollRef.current?.scrollTo({ y: txSectionY.current, animated: true });
    };

    // Highlight the daily-login streak; day 7 (and multiples) grant a bonus.
    const streakDots = Array.from({ length: 7 }, (_, i) => i < loginStreak % 7 || (loginStreak > 0 && loginStreak % 7 === 0));

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title={t('wallet.title')} showBack />

            <ScrollView
                ref={scrollRef}
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
            >
                {/* Balance Card */}
                <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.balanceCard}>
                    <View style={styles.balanceCenter}>
                        <Text style={styles.balanceLabel}>{t('wallet.balanceTitle')}</Text>
                        {creditsLoading ? (
                            <ActivityIndicator color="#3B82F6" size="large" style={{ marginTop: 8 }} />
                        ) : (
                            <Text style={styles.balanceAmount}>{credits.toLocaleString()}</Text>
                        )}
                        <Text style={styles.balanceSub}>{t('wallet.creditsUnit')}</Text>
                    </View>

                    {/* Pro Status Badge */}
                    {!proLoading && (
                        <TouchableOpacity
                            style={[styles.proStatusBadge, { backgroundColor: isPro ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.1)' }]}
                            onPress={!isPro ? handleUpgradePro : undefined}
                            activeOpacity={0.7}
                        >
                            <Crown size={14} color={isPro ? '#F59E0B' : '#94A3B8'} />
                            <Text style={[styles.proStatusText, { color: isPro ? '#F59E0B' : '#94A3B8' }]}>
                                {isPro ? t('wallet.proMember') : t('wallet.upgradeToPro')}
                            </Text>
                        </TouchableOpacity>
                    )}

                    <View style={styles.actionsRow}>
                        <TouchableOpacity style={styles.actionItem} onPress={handleAddCredits} activeOpacity={0.7}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                                <PlusCircle color="#10B981" size={22} />
                            </View>
                            <Text style={styles.actionLabel}>{t('wallet.buyCredits')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionItem} onPress={handleViewHistory} activeOpacity={0.7}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
                                <CreditCard color="#F59E0B" size={22} />
                            </View>
                            <Text style={styles.actionLabel}>{t('wallet.history')}</Text>
                        </TouchableOpacity>
                    </View>
                </LinearGradient>

                {/* Login Streak */}
                <View style={[styles.streakCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.streakHeader}>
                        <View style={styles.streakTitleRow}>
                            <View style={[styles.streakFlame, { backgroundColor: 'rgba(249, 115, 22, 0.15)' }]}>
                                <Flame color="#F97316" size={18} />
                            </View>
                            <View>
                                <Text style={[styles.streakTitle, { color: colors.foreground }]}>
                                    {t('wallet.dayStreak', { count: loginStreak })}
                                </Text>
                                <Text style={[styles.streakSub, { color: colors.textSecondary }]}>
                                    {loginStreak > 0 && loginStreak % 7 === 0
                                        ? t('wallet.streakBonusUnlocked')
                                        : t('wallet.streakBonusHint')}
                                </Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.streakDots}>
                        {streakDots.map((filled, i) => {
                            const isBonusDay = i === 6;
                            return (
                                <View key={i} style={styles.streakDotWrap}>
                                    <View
                                        style={[
                                            styles.streakDot,
                                            {
                                                backgroundColor: filled
                                                    ? isBonusDay
                                                        ? '#F59E0B'
                                                        : '#F97316'
                                                    : colors.muted,
                                                borderColor: isBonusDay ? '#F59E0B' : 'transparent',
                                            },
                                        ]}
                                    >
                                        {isBonusDay && (
                                            <Zap size={12} color={filled ? '#FFFFFF' : colors.textSecondary} />
                                        )}
                                    </View>
                                    <Text style={[styles.streakDotLabel, { color: colors.textSecondary }]}>
                                        {i + 1}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {/* Quick Actions */}
                <View style={styles.quickActions}>
                    {/* Pro users already have unlimited features — don't pitch Pro to them. */}
                    {!isPro && (
                    <TouchableOpacity
                        style={[styles.quickActionBtn, { backgroundColor: `${colors.accent}10`, borderColor: `${colors.accent}20` }]}
                        onPress={handleUpgradePro}
                        activeOpacity={0.7}
                    >
                        <Crown size={24} color={colors.accent} />
                        <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>{t('wallet.upgradeToPro')}</Text>
                        <Text style={[styles.quickActionDesc, { color: colors.textSecondary }]}>{t('wallet.unlimitedPremiumFeatures')}</Text>
                    </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[styles.quickActionBtn, { backgroundColor: 'rgba(16, 185, 129, 0.10)', borderColor: 'rgba(16, 185, 129, 0.20)' }]}
                        onPress={handleAddCredits}
                        activeOpacity={0.7}
                    >
                        <Zap size={24} color="#10B981" />
                        <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>{t('wallet.buyCredits')}</Text>
                        <Text style={[styles.quickActionDesc, { color: colors.textSecondary }]}>{t('wallet.payPerUse')}</Text>
                    </TouchableOpacity>
                </View>

                {/* Transactions Section */}
                <View
                    style={styles.sectionHeader}
                    onLayout={(e) => {
                        txSectionY.current = e.nativeEvent.layout.y;
                    }}
                >
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('wallet.recentTransactions')}</Text>
                </View>

                {creditsLoading ? (
                    <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
                ) : transactions.length === 0 ? (
                    <View style={styles.emptyState}>
                        <CreditCard color={colors.textSecondary} size={36} />
                        <Text style={[styles.emptyText, { color: colors.foreground }]}>{t('wallet.noTransactions')}</Text>
                        <Text style={[styles.emptySubText, { color: colors.textSecondary }]}>
                            {t('wallet.noTransactionsHint')}
                        </Text>
                        <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.accent }]} onPress={handleAddCredits}>
                            <Text style={styles.emptyBtnText}>{t('wallet.buyCredits')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    transactions.map((tx, i) => {
                        const isCredit = tx.amount > 0;
                        const color = isCredit ? '#10B981' : '#EF4444';
                        return (
                            <View key={tx.id || i} style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                <View style={[styles.txIcon, { backgroundColor: `${color}15` }]}>
                                    {isCredit ? (
                                        <ArrowDownLeft color={color} size={22} />
                                    ) : (
                                        <ArrowUpRight color={color} size={22} />
                                    )}
                                </View>
                                <View style={styles.txContent}>
                                    <Text style={[styles.txTitle, { color: colors.foreground }]}>{tx.description || tx.type}</Text>
                                    <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                                        {new Date(tx.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </Text>
                                </View>
                                <Text style={[styles.txAmount, { color }]}>
                                    {t('wallet.txAmount', { sign: isCredit ? '+' : '', amount: Math.abs(tx.amount) })}
                                </Text>
                            </View>
                        );
                    })
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            <CreditPackSheet
                visible={showCreditSheet}
                onClose={() => setShowCreditSheet(false)}
                userId={user?.id || null}
                onPurchased={refreshCredits}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
    balanceCard: { padding: 28, borderRadius: 24, marginBottom: 24 },
    balanceCenter: { alignItems: 'center', marginBottom: 20 },
    balanceLabel: { color: '#94A3B8', fontWeight: '500', marginBottom: 4, fontSize: 14 },
    balanceAmount: { color: 'white', fontSize: 48, fontWeight: 'bold' },
    balanceSub: { color: '#3B82F6', fontWeight: '700', letterSpacing: 2, marginTop: 4, fontSize: 13 },
    proStatusBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, alignSelf: 'center', marginBottom: 20 },
    proStatusText: { fontSize: 12, fontWeight: '700' },
    actionsRow: { flexDirection: 'row', justifyContent: 'space-around' },
    actionItem: { alignItems: 'center' },
    actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    actionLabel: { color: 'white', fontSize: 12, fontWeight: '500' },

    // Streak
    streakCard: { borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 24 },
    streakHeader: { marginBottom: 16 },
    streakTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    streakFlame: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    streakTitle: { fontSize: 16, fontWeight: '700' },
    streakSub: { fontSize: 12, marginTop: 2 },
    streakDots: { flexDirection: 'row', justifyContent: 'space-between' },
    streakDotWrap: { alignItems: 'center', gap: 6 },
    streakDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
    streakDotLabel: { fontSize: 10, fontWeight: '600' },

    // Quick Actions
    quickActions: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    quickActionBtn: { flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
    quickActionTitle: { fontSize: 14, fontWeight: '700', marginTop: 8, marginBottom: 4 },
    quickActionDesc: { fontSize: 11, textAlign: 'center', lineHeight: 16 },

    // Transactions
    sectionHeader: { marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold' },
    emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
    emptyText: { fontWeight: '700', fontSize: 15 },
    emptySubText: { fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
    emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
    emptyBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
    txCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
    txIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    txContent: { flex: 1 },
    txTitle: { fontWeight: '600', fontSize: 14 },
    txDate: { fontSize: 12, marginTop: 2 },
    txAmount: { fontWeight: 'bold', fontSize: 15 },
});
