import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ImageBackground,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { ChevronRight, Clock3, Compass, Sparkles, Star, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTheme } from '../../../components/context/ThemeContext';
import {
    FALLBACK_TEMPLATES,
    RoadmapTemplate,
    avatarColor,
    categoryMeta,
    fetchTemplates,
    initialsOf,
} from '../../../lib/roadmapTemplates';

const HERO_GRADIENT = ['rgba(2,6,23,0.02)', 'rgba(2,6,23,0.45)', 'rgba(2,6,23,0.88)'] as const;
const CARD_GRADIENT = ['rgba(2,6,23,0)', 'rgba(2,6,23,0.65)'] as const;

function formatCount(value: number): string {
    if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return String(value);
}

export default function RoadmapTemplatesScreen() {
    const { t } = useTranslation('goals');
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();

    const [templates, setTemplates] = useState<RoadmapTemplate[]>(FALLBACK_TEMPLATES);
    const [refreshing, setRefreshing] = useState(false);
    const [activeCategory, setActiveCategory] = useState('all');

    // Pull-to-refresh keeps its spinner flip here (setState in an event
    // handler is fine), separate from the mount fetch effect below.
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const mapped = await fetchTemplates();
            // Only replace the curated fallback set when the backend returns usable templates.
            if (mapped.length > 0) setTemplates(mapped);
        } catch {
            // Offline or backend unavailable — keep the curated fallback set already in state.
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const loadTemplates = async () => {
            try {
                const mapped = await fetchTemplates();
                // Only replace the curated fallback set when the backend returns usable templates.
                if (mapped.length > 0) setTemplates(mapped);
            } catch {
                // Offline or backend unavailable — keep the curated fallback set already in state.
            }
        };
        loadTemplates();
    }, []);

    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
    const cardBg = colors.card;

    const categories = useMemo(() => {
        const seen = new Map<string, ReturnType<typeof categoryMeta>>();
        templates.forEach((template) => {
            const meta = categoryMeta(template.category);
            if (!seen.has(meta.key)) seen.set(meta.key, meta);
        });
        return Array.from(seen.values());
    }, [templates]);

    const visibleTemplates = useMemo(
        () => (activeCategory === 'all'
            ? templates
            : templates.filter((template) => categoryMeta(template.category).key === activeCategory)),
        [templates, activeCategory],
    );

    const hero = activeCategory === 'all'
        ? visibleTemplates.find((template) => template.featured && template.coverImage) || visibleTemplates[0]
        : undefined;
    const listTemplates = hero ? visibleTemplates.filter((template) => template.id !== hero.id) : visibleTemplates;

    const openTemplate = (template: RoadmapTemplate) => {
        router.push(`/roadmap-templates/${template.id}` as any);
    };

    const renderAuthorRow = (template: RoadmapTemplate, light = false) => (
        <View style={styles.authorRow}>
            <View style={[styles.authorAvatar, { backgroundColor: avatarColor(template.authorName) }]}>
                <Text style={styles.authorInitials}>{initialsOf(template.authorName)}</Text>
            </View>
            <View style={styles.authorCopy}>
                <Text style={[styles.authorName, { color: light ? '#FFFFFF' : colors.foreground }]} numberOfLines={1}>
                    {template.authorName}
                </Text>
                {template.authorRole ? (
                    <Text
                        style={[styles.authorRole, { color: light ? 'rgba(255,255,255,0.75)' : textSecondary }]}
                        numberOfLines={1}
                    >
                        {template.authorRole}
                    </Text>
                ) : null}
            </View>
        </View>
    );

    const renderStats = (template: RoadmapTemplate, light = false) => {
        const color = light ? 'rgba(255,255,255,0.92)' : textSecondary;
        return (
            <View style={styles.statsRow}>
                {template.rating > 0 && (
                    <View style={styles.statItem}>
                        <Star size={12} color="#FBBF24" fill="#FBBF24" />
                        <Text style={[styles.statText, { color }]}>
                            {template.rating.toFixed(1)}{template.ratingCount > 0 ? ` (${template.ratingCount})` : ''}
                        </Text>
                    </View>
                )}
                {template.learners > 0 && (
                    <View style={styles.statItem}>
                        <Users size={12} color={color} />
                        <Text style={[styles.statText, { color }]}>
                            {t('templates.learners', { count: template.learners, formatted: formatCount(template.learners) })}
                        </Text>
                    </View>
                )}
                <View style={styles.statItem}>
                    <Clock3 size={12} color={color} />
                    <Text style={[styles.statText, { color }]}>{template.duration}</Text>
                </View>
            </View>
        );
    };

    const renderCategoryPill = (template: RoadmapTemplate) => {
        const meta = categoryMeta(template.category);
        const Icon = meta.icon;
        return (
            <View style={[styles.categoryPill, { backgroundColor: 'rgba(2,6,23,0.55)' }]}>
                <Icon size={11} color="#FFFFFF" />
                <Text style={styles.categoryPillText}>{t(`templates.categories.${meta.key}`)}</Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title={t('templates.title')} subtitle={t('templates.subtitle')} showBack />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
                }
            >
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipsRow}
                    style={styles.chipsScroll}
                >
                    <TouchableOpacity
                        style={[
                            styles.chip,
                            { borderColor },
                            activeCategory === 'all'
                                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                                : { backgroundColor: cardBg },
                        ]}
                        onPress={() => setActiveCategory('all')}
                    >
                        <Compass size={13} color={activeCategory === 'all' ? '#FFFFFF' : textSecondary} />
                        <Text style={[styles.chipText, { color: activeCategory === 'all' ? '#FFFFFF' : colors.foreground }]}>
                            {t('templates.categories.all')}
                        </Text>
                    </TouchableOpacity>
                    {categories.map((meta) => {
                        const active = activeCategory === meta.key;
                        const Icon = meta.icon;
                        return (
                            <TouchableOpacity
                                key={meta.key}
                                style={[
                                    styles.chip,
                                    { borderColor },
                                    active
                                        ? { backgroundColor: meta.color, borderColor: meta.color }
                                        : { backgroundColor: cardBg },
                                ]}
                                onPress={() => setActiveCategory(active ? 'all' : meta.key)}
                            >
                                <Icon size={13} color={active ? '#FFFFFF' : meta.color} />
                                <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.foreground }]}>
                                    {t(`templates.categories.${meta.key}`)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {hero && (
                    <TouchableOpacity activeOpacity={0.9} onPress={() => openTemplate(hero)} style={styles.heroWrap}>
                        <ImageBackground
                            source={hero.coverImage ? { uri: hero.coverImage } : undefined}
                            style={[styles.hero, { backgroundColor: categoryMeta(hero.category).color + '33' }]}
                            imageStyle={styles.heroImage}
                        >
                            <LinearGradient colors={HERO_GRADIENT} style={styles.heroGradient}>
                                <View style={styles.heroTopRow}>
                                    {renderCategoryPill(hero)}
                                    <View style={styles.featuredBadge}>
                                        <Sparkles size={11} color="#FDE68A" />
                                        <Text style={styles.featuredBadgeText}>{t('templates.featured')}</Text>
                                    </View>
                                </View>
                                <View style={styles.heroBottom}>
                                    <Text style={styles.heroTitle} numberOfLines={2}>{hero.title}</Text>
                                    {renderAuthorRow(hero, true)}
                                    {renderStats(hero, true)}
                                </View>
                            </LinearGradient>
                        </ImageBackground>
                    </TouchableOpacity>
                )}

                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionHeading, { color: colors.foreground }]}>{t('templates.featuredPaths')}</Text>
                    <Text style={[styles.sectionCount, { color: textSecondary }]}>
                        {t('templates.available', { count: visibleTemplates.length })}
                    </Text>
                </View>

                <View style={styles.list}>
                    {listTemplates.map((template) => {
                        const meta = categoryMeta(template.category);
                        const MetaIcon = meta.icon;
                        return (
                            <TouchableOpacity
                                key={template.id}
                                activeOpacity={0.88}
                                style={[styles.card, { backgroundColor: cardBg, borderColor }]}
                                onPress={() => openTemplate(template)}
                            >
                                <ImageBackground
                                    source={template.coverImage ? { uri: template.coverImage } : undefined}
                                    style={[styles.cardImage, { backgroundColor: meta.color + '26' }]}
                                >
                                    {!template.coverImage && (
                                        <View style={styles.cardImageFallback}>
                                            <MetaIcon size={38} color={meta.color} />
                                        </View>
                                    )}
                                    <LinearGradient colors={CARD_GRADIENT} style={styles.cardImageGradient}>
                                        <View style={styles.cardImageFooter}>
                                            {renderCategoryPill(template)}
                                            <View style={[styles.difficultyPill, { backgroundColor: 'rgba(2,6,23,0.55)' }]}>
                                                <Text style={styles.difficultyText}>{template.difficulty}</Text>
                                            </View>
                                        </View>
                                    </LinearGradient>
                                </ImageBackground>
                                <View style={styles.cardBody}>
                                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                                        {template.title}
                                    </Text>
                                    <Text style={[styles.cardSummary, { color: textSecondary }]} numberOfLines={2}>
                                        {template.summary}
                                    </Text>
                                    <View style={[styles.cardFooter, { borderTopColor: borderColor }]}>
                                        <View style={styles.cardFooterLeft}>{renderAuthorRow(template)}</View>
                                        <View style={styles.cardFooterRight}>
                                            {renderStats(template)}
                                            <View style={[styles.openCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
                                                <ChevronRight size={15} color={textSecondary} />
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    scrollView: { flex: 1 },
    content: { paddingBottom: 40 },
    chipsScroll: { marginTop: 4 },
    chipsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 14 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 13,
        paddingVertical: 8,
    },
    chipText: { fontSize: 12.5, fontWeight: '800' },
    heroWrap: { paddingHorizontal: 16, marginBottom: 20 },
    hero: {
        height: 230,
        borderRadius: 24,
        overflow: 'hidden',
    },
    heroImage: { borderRadius: 24 },
    heroGradient: {
        flex: 1,
        padding: 16,
        justifyContent: 'space-between',
    },
    heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    featuredBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(2,6,23,0.55)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    featuredBadgeText: { color: '#FDE68A', fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
    heroBottom: { gap: 8 },
    heroTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', lineHeight: 26 },
    categoryPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    categoryPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
    difficultyPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    difficultyText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    sectionHeading: { fontSize: 17, fontWeight: '900' },
    sectionCount: { fontSize: 12, fontWeight: '700' },
    list: { paddingHorizontal: 16, gap: 16 },
    card: {
        borderWidth: 1,
        borderRadius: 22,
        overflow: 'hidden',
    },
    cardImage: { height: 136, justifyContent: 'flex-end' },
    cardImageFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    cardImageGradient: { height: '100%', justifyContent: 'flex-end', padding: 12 },
    cardImageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardBody: { padding: 14 },
    cardTitle: { fontSize: 16.5, fontWeight: '900', lineHeight: 21 },
    cardSummary: { fontSize: 12.5, lineHeight: 18, marginTop: 5 },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    cardFooterLeft: { flex: 1, marginRight: 8 },
    cardFooterRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    authorAvatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    authorInitials: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
    authorCopy: { flexShrink: 1 },
    authorName: { fontSize: 12.5, fontWeight: '800' },
    authorRole: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
    statsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statText: { fontSize: 11, fontWeight: '700' },
    openCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
