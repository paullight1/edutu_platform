import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowUpRight, ArrowDownLeft, PlusCircle, CreditCard, TrendingUp, Zap, Crown } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useTheme } from '../../components/context/ThemeContext';
import { useCredits } from '@edutu/core/src/hooks/useCredits';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import { supabase } from '../../lib/supabase';

export default function WalletScreen() {
    const { user } = useUser();
    const router = useRouter();
    const { colors } = useTheme();
    const { credits, isLoading: creditsLoading, transactions, refreshCredits } = useCredits(supabase, user?.id || null);
    const { isPro, isLoading: proLoading } = useProStatus(supabase, user?.id || null);
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refreshCredits();
        setRefreshing(false);
    }, [refreshCredits]);

    const handleAddCredits = () => {
        router.push('/paywall');
    };

    const handleUpgradePro = () => {
        router.push('/paywall');
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title="Wallet" showBack />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
            >
                {/* Balance Card */}
                <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.balanceCard}>
                    <View style={styles.balanceCenter}>
                        <Text style={styles.balanceLabel}>Credits Balance</Text>
                        {creditsLoading ? (
                            <ActivityIndicator color="#3B82F6" size="large" style={{ marginTop: 8 }} />
                        ) : (
                            <Text style={styles.balanceAmount}>{credits.toLocaleString()}</Text>
                        )}
                        <Text style={styles.balanceSub}>Credits</Text>
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
                                {isPro ? 'Pro Member' : 'Upgrade to Pro'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    <View style={styles.actionsRow}>
                        <TouchableOpacity style={styles.actionItem} onPress={handleAddCredits} activeOpacity={0.7}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                                <PlusCircle color="#10B981" size={22} />
                            </View>
                            <Text style={styles.actionLabel}>Buy Credits</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionItem} activeOpacity={0.7}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
                                <ArrowUpRight color="#3B82F6" size={22} />
                            </View>
                            <Text style={styles.actionLabel}>Send</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionItem} activeOpacity={0.7}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
                                <TrendingUp color="#3b82f6" size={22} />
                            </View>
                            <Text style={styles.actionLabel}>Cashout</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionItem} activeOpacity={0.7}>
                            <View style={[styles.actionIcon, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
                                <CreditCard color="#F59E0B" size={22} />
                            </View>
                            <Text style={styles.actionLabel}>History</Text>
                        </TouchableOpacity>
                    </View>
                </LinearGradient>

                {/* Quick Actions */}
                <View style={styles.quickActions}>
                    <TouchableOpacity
                        style={[styles.quickActionBtn, { backgroundColor: `${colors.accent}10`, borderColor: `${colors.accent}20` }]}
                        onPress={handleUpgradePro}
                        activeOpacity={0.7}
                    >
                        <Crown size={24} color={colors.accent} />
                        <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>Upgrade to Pro</Text>
                        <Text style={[styles.quickActionDesc, { color: colors.textSecondary }]}>$10/month for unlimited features</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.quickActionBtn, { backgroundColor: 'rgba(16, 185, 129, 0.10)', borderColor: 'rgba(16, 185, 129, 0.20)' }]}
                        onPress={handleAddCredits}
                        activeOpacity={0.7}
                    >
                        <Zap size={24} color="#10B981" />
                        <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>Buy Credits</Text>
                        <Text style={[styles.quickActionDesc, { color: colors.textSecondary }]}>Pay-per-use for AI features</Text>
                    </TouchableOpacity>
                </View>

                {/* Transactions Section */}
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Transactions</Text>
                </View>

                {creditsLoading ? (
                    <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
                ) : transactions.length === 0 ? (
                    <View style={styles.emptyState}>
                        <CreditCard color={colors.textSecondary} size={36} />
                        <Text style={[styles.emptyText, { color: colors.foreground }]}>No transactions yet</Text>
                        <Text style={[styles.emptySubText, { color: colors.textSecondary }]}>
                            Buy credits or earn from your content to see activity here.
                        </Text>
                        <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.accent }]} onPress={handleAddCredits}>
                            <Text style={styles.emptyBtnText}>Buy Credits</Text>
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
                                    {isCredit ? '+' : ''}{Math.abs(tx.amount)} cr
                                </Text>
                            </View>
                        );
                    })
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
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
