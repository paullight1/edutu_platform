import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Linking,
    ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ChevronRight, X, Info, ArrowUpRight } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAppControl } from '../context/AppControlContext';
import { findCustomFeature, type HomeBlock } from '../../lib/homeBlocks';
import type { Opportunity } from '@edutu/core/src/types/opportunity';

// ─── Server-driven home renderer ─────────────────────────────────────────────
// Renders the admin-composed `homeLayout` blocks. Each block type maps to a
// component through BLOCK_RENDERERS; unknown types render nothing so a block
// type shipped later via EAS Update never breaks an older binary. Every block
// is wrapped in an error boundary so one bad block renders nothing, not a
// crash. When the layout is empty the whole region renders nothing and the
// home screen keeps its built-in sections.
//
// "Native" block types (recommendations/categories/quick_stats/profile_prompt)
// are reserved tokens: the built-in home screen already renders those sections,
// so they render nothing here to avoid duplication. They exist so the admin
// composer can reason about the full feed and so a future build can delegate
// them here.

const NATIVE_BLOCK_TYPES = new Set([
    'recommendations',
    'categories',
    'quick_stats',
    'profile_prompt',
]);

function str(props: Record<string, unknown>, key: string): string {
    const value = props[key];
    return typeof value === 'string' ? value : '';
}

function openUrl(url: string, router: ReturnType<typeof useRouter>) {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('/')) {
        router.push(trimmed as never);
        return;
    }
    void WebBrowser.openBrowserAsync(trimmed).catch(() => {
        void Linking.openURL(trimmed).catch(() => {});
    });
}

// ─── Content block components ────────────────────────────────────────────────

function AnnouncementBlock({ props }: { props: Record<string, unknown> }) {
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const [dismissed, setDismissed] = React.useState(false);

    const title = str(props, 'title');
    const body = str(props, 'body');
    const ctaLabel = str(props, 'ctaLabel');
    const ctaUrl = str(props, 'ctaUrl');
    const accent = str(props, 'accentColor') || colors.accent;

    if (dismissed || (!title && !body)) return null;

    return (
        <View
            style={[
                styles.card,
                {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                    borderColor: accent,
                    borderLeftWidth: 4,
                },
            ]}
        >
            <TouchableOpacity
                style={styles.dismiss}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => setDismissed(true)}
                activeOpacity={0.7}
            >
                <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            {title ? (
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
            ) : null}
            {body ? (
                <Text style={[styles.cardBody, { color: colors.textSecondary }]}>{body}</Text>
            ) : null}
            {ctaLabel && ctaUrl ? (
                <TouchableOpacity
                    style={[styles.cta, { backgroundColor: accent }]}
                    onPress={() => openUrl(ctaUrl, router)}
                    activeOpacity={0.85}
                >
                    <Text style={styles.ctaText}>{ctaLabel}</Text>
                    <ArrowUpRight size={15} color="#FFFFFF" />
                </TouchableOpacity>
            ) : null}
        </View>
    );
}

function PromoBannerBlock({ props }: { props: Record<string, unknown> }) {
    const router = useRouter();
    const imageUrl = str(props, 'imageUrl');
    const linkUrl = str(props, 'linkUrl');
    const title = str(props, 'title');

    if (!imageUrl) return null;

    return (
        <TouchableOpacity
            style={styles.banner}
            activeOpacity={linkUrl ? 0.9 : 1}
            disabled={!linkUrl}
            onPress={() => linkUrl && openUrl(linkUrl, router)}
        >
            <Image source={{ uri: imageUrl }} style={styles.bannerImage} resizeMode="cover" />
            {title ? (
                <View style={styles.bannerOverlay}>
                    <Text style={styles.bannerTitle} numberOfLines={2}>
                        {title}
                    </Text>
                </View>
            ) : null}
        </TouchableOpacity>
    );
}

function InfoCardBlock({ props }: { props: Record<string, unknown> }) {
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const title = str(props, 'title');
    const body = str(props, 'body');
    const ctaLabel = str(props, 'ctaLabel');
    const ctaUrl = str(props, 'ctaUrl');

    if (!title && !body) return null;

    return (
        <View
            style={[
                styles.card,
                {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                    borderColor: colors.border,
                },
            ]}
        >
            <View style={styles.infoHeader}>
                <Info size={18} color={colors.accent} />
                {title ? (
                    <Text style={[styles.cardTitle, { color: colors.foreground, marginBottom: 0 }]}>
                        {title}
                    </Text>
                ) : null}
            </View>
            {body ? (
                <Text style={[styles.cardBody, { color: colors.textSecondary }]}>{body}</Text>
            ) : null}
            {ctaLabel && ctaUrl ? (
                <TouchableOpacity
                    style={styles.linkRow}
                    onPress={() => openUrl(ctaUrl, router)}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.linkText, { color: colors.accent }]}>{ctaLabel}</Text>
                    <ChevronRight size={16} color={colors.accent} />
                </TouchableOpacity>
            ) : null}
        </View>
    );
}

function WebFeatureBlock({ props }: { props: Record<string, unknown> }) {
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const { appControl } = useAppControl();

    const featureId = str(props, 'featureId');
    const feature = findCustomFeature(appControl?.customFeatures, featureId);
    if (!feature) return null;

    return (
        <TouchableOpacity
            style={[
                styles.card,
                styles.featureCard,
                {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                    borderColor: colors.border,
                },
            ]}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/feature/[id]', params: { id: feature.id } })}
        >
            <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.foreground, marginBottom: feature.subtitle ? 2 : 0 }]}>
                    {feature.title}
                </Text>
                {feature.subtitle ? (
                    <Text style={[styles.cardBody, { color: colors.textSecondary, marginBottom: 0 }]}>
                        {feature.subtitle}
                    </Text>
                ) : null}
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
        </TouchableOpacity>
    );
}

function CuratedRailBlock({
    props,
    opportunities,
}: {
    props: Record<string, unknown>;
    opportunities: Opportunity[];
}) {
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const title = str(props, 'title') || 'Featured';
    const ids = Array.isArray(props.opportunityIds)
        ? (props.opportunityIds as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];

    const items = ids.length
        ? ids
              .map((id) => opportunities.find((o) => o.id === id))
              .filter((o): o is Opportunity => Boolean(o))
        : [];

    if (!items.length) return null;

    return (
        <View style={styles.rail}>
            <Text style={[styles.railTitle, { color: colors.foreground }]}>{title}</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railScroll}
            >
                {items.map((item) => (
                    <TouchableOpacity
                        key={item.id}
                        style={[
                            styles.railCard,
                            {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                                borderColor: colors.border,
                            },
                        ]}
                        activeOpacity={0.85}
                        onPress={() => router.push(`/opportunities/${item.id}`)}
                    >
                        {item.image ? (
                            <Image source={{ uri: item.image }} style={styles.railImage} resizeMode="cover" />
                        ) : null}
                        <Text style={[styles.railCardTitle, { color: colors.foreground }]} numberOfLines={2}>
                            {item.title}
                        </Text>
                        <Text style={[styles.railCardOrg, { color: colors.textSecondary }]} numberOfLines={1}>
                            {item.organization}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
}

// ─── Registry + error boundary ───────────────────────────────────────────────

class BlockErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean }
> {
    state = { hasError: false };
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch() {
        // A single bad block must never take down the home screen.
    }
    render() {
        return this.state.hasError ? null : this.props.children;
    }
}

function renderBlock(block: HomeBlock, opportunities: Opportunity[]): React.ReactNode {
    switch (block.type) {
        case 'announcement':
            return <AnnouncementBlock props={block.props} />;
        case 'promo_banner':
            return <PromoBannerBlock props={block.props} />;
        case 'info_card':
            return <InfoCardBlock props={block.props} />;
        case 'web_feature':
            return <WebFeatureBlock props={block.props} />;
        case 'curated_rail':
            return <CuratedRailBlock props={block.props} opportunities={opportunities} />;
        default:
            // Native sections are rendered by the home screen itself; unknown
            // types are forward-compat placeholders. Both render nothing here.
            return null;
    }
}

/**
 * Renders the admin-composed home blocks. Content blocks render inline;
 * native/unknown types are skipped. Returns nothing when there is no layout.
 */
export function HomeBlocks({ opportunities = [] }: { opportunities?: Opportunity[] }) {
    const { appControl } = useAppControl();
    const layout = appControl?.homeLayout ?? [];

    const contentBlocks = layout.filter((block) => !NATIVE_BLOCK_TYPES.has(block.type));
    if (!contentBlocks.length) return null;

    return (
        <View style={styles.container}>
            {contentBlocks.map((block) => (
                <BlockErrorBoundary key={block.id}>
                    <View style={styles.blockSpacing}>{renderBlock(block, opportunities)}</View>
                </BlockErrorBoundary>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 20,
    },
    blockSpacing: {
        marginBottom: 12,
    },
    card: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
    },
    featureCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    dismiss: {
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 2,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 6,
        paddingRight: 20,
    },
    cardBody: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
    infoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    cta: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 10,
    },
    ctaText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 14,
    },
    linkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    linkText: {
        fontSize: 14,
        fontWeight: '600',
    },
    banner: {
        borderRadius: 16,
        overflow: 'hidden',
        height: 150,
    },
    bannerImage: {
        width: '100%',
        height: '100%',
    },
    bannerOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: 14,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    bannerTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    rail: {},
    railTitle: {
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 10,
    },
    railScroll: {
        gap: 12,
        paddingRight: 8,
    },
    railCard: {
        width: 220,
        borderRadius: 16,
        borderWidth: 1,
        padding: 12,
    },
    railImage: {
        width: '100%',
        height: 96,
        borderRadius: 10,
        marginBottom: 8,
    },
    railCardTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    railCardOrg: {
        fontSize: 12,
    },
});
