import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Linking,
    StyleSheet,
    Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    ChevronRight,
    HelpCircle,
    Mail,
    Globe,
    ChevronDown,
    ChevronUp
} from 'lucide-react-native';
import { Card } from '../../components/ui/Card';
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { useTheme } from "../../components/context/ThemeContext";
import { useTranslation } from 'react-i18next';

// `question`/`answer` hold i18n keys (home namespace); translated at render time.
const FAQS = [
    {
        question: "help.faqs.ai.question",
        answer: "help.faqs.ai.answer"
    },
    {
        question: "help.faqs.enroll.question",
        answer: "help.faqs.enroll.answer"
    },
    {
        question: "help.faqs.credits.question",
        answer: "help.faqs.credits.answer"
    },
    {
        question: "help.faqs.security.question",
        answer: "help.faqs.security.answer"
    }
];

function FAQItem({ item, isDark, colors }: { item: typeof FAQS[0], isDark: boolean, colors: any }) {
    const { t } = useTranslation('home');
    const [expanded, setExpanded] = useState(false);

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setExpanded(!expanded)}
            style={styles.faqItem}
        >
            <Card variant={isDark ? "glass" : "elevated"} style={[styles.faqCard, { borderColor: isDark ? 'rgba(51,65,85,0.3)' : '#e2e8f0' }]}>
                <View style={styles.faqHeader}>
                    <Text style={[styles.faqQuestion, { color: colors.foreground }]}>
                        {t(item.question)}
                    </Text>
                    {expanded ? (
                        <ChevronUp size={18} color={colors.accent} />
                    ) : (
                        <ChevronDown size={18} color={isDark ? "#475569" : "#94a3b8"} />
                    )}
                </View>
                {expanded && (
                    <Text style={[styles.faqAnswer, { color: isDark ? "#94A3B8" : "#64748B" }]}>
                        {t(item.answer)}
                    </Text>
                )}
            </Card>
        </TouchableOpacity>
    );
}

export default function HelpScreen() {
    const { t } = useTranslation('home');
    const { isDark, colors } = useTheme();

    const handleContactEmail = () => {
        Linking.openURL('mailto:support@edutu.org');
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title={t('help.title')} showBack={true} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Header Section */}
                <View style={styles.header}>
                    <View style={[styles.iconBg, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                        <HelpCircle size={32} color={colors.accent} />
                    </View>
                    <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                        {t('help.headerTitle')}
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: isDark ? "#94A3B8" : "#64748B" }]}>
                        {t('help.headerSubtitle')}
                    </Text>
                </View>

                {/* FAQ Section */}
                <Text style={[styles.sectionTitle, { color: isDark ? "#475569" : "#94A3B8" }]}>
                    {t('help.faqSectionTitle')}
                </Text>

                {FAQS.map((faq, index) => (
                    <FAQItem key={index} item={faq} isDark={isDark} colors={colors} />
                ))}

                {/* Contact Section */}
                <Text style={[styles.sectionTitle, { color: isDark ? "#475569" : "#94A3B8", marginTop: 32 }]}>
                    {t('help.directSupport')}
                </Text>

                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleContactEmail}
                    style={styles.contactItem}
                >
                    <Card variant="glass" style={[styles.contactCard, { borderColor: 'rgba(99,102,241,0.2)' }]}>
                        <View style={styles.contactRow}>
                            <View style={[styles.contactIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                                <Mail size={22} color="#10b981" />
                            </View>
                            <View style={styles.contactText}>
                                <Text style={[styles.contactTitle, { color: colors.foreground }]}>{t('help.emailSupport')}</Text>
                                <Text style={styles.contactSubtitle}>support@edutu.org</Text>
                            </View>
                            <ChevronRight size={18} color={isDark ? "#475569" : "#94a3b8"} />
                        </View>
                    </Card>
                </TouchableOpacity>

                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => Linking.openURL('https://edutu.org')}
                    style={styles.contactItem}
                >
                    <Card variant="glass" style={[styles.contactCard, { borderColor: 'rgba(99,102,241,0.2)' }]}>
                        <View style={styles.contactRow}>
                            <View style={[styles.contactIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                                <Globe size={22} color="#3b82f6" />
                            </View>
                            <View style={styles.contactText}>
                                <Text style={[styles.contactTitle, { color: colors.foreground }]}>{t('help.visitWebsite')}</Text>
                                <Text style={[styles.contactSubtitle, { color: '#3b82f6' }]}>www.edutu.org</Text>
                            </View>
                            <ChevronRight size={18} color={isDark ? "#475569" : "#94a3b8"} />
                        </View>
                    </Card>
                </TouchableOpacity>

                {/* Footer Info */}
                <View style={styles.footer}>
                    <Image
                        source={require('../../assets/logo1.png')}
                        style={styles.footerLogo}
                        resizeMode="contain"
                    />
                    <Text style={[styles.footerText, { color: isDark ? "#475569" : "#94A3B8" }]}>{t('help.footer')}</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 60,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    iconBg: {
        width: 64,
        height: 64,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    headerSubtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 6,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginLeft: 4,
        marginBottom: 16,
    },
    faqItem: {
        marginBottom: 12,
    },
    faqCard: {
        padding: 16,
        borderWidth: 1,
    },
    faqHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    faqQuestion: {
        fontSize: 14,
        fontWeight: '700',
        flex: 1,
        marginRight: 16,
    },
    faqAnswer: {
        fontSize: 13,
        lineHeight: 20,
        marginTop: 12,
    },
    contactItem: {
        marginBottom: 12,
    },
    contactCard: {
        padding: 20,
        borderWidth: 1,
    },
    contactRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    contactIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    contactText: {
        flex: 1,
    },
    contactTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    contactSubtitle: {
        fontSize: 13,
        color: '#10b981',
        marginTop: 2,
    },
    footer: {
        alignItems: 'center',
        marginTop: 48,
        paddingBottom: 16,
    },
    footerLogo: {
        width: 50,
        height: 50,
        marginBottom: 10,
        opacity: 0.5,
    },
    footerText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
});
