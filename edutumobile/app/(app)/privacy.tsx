import React from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shield, Lock, Eye, Trash2 } from 'lucide-react-native';
import { Card } from '../../components/ui/Card';
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { useTheme } from "../../components/context/ThemeContext";

const PRIVACY_SECTIONS = [
    {
        title: "Data We Collect",
        desc: "We collect your name, email, and academic progress to personalize your learning experience and track your goals.",
        icon: Eye,
        color: "#3b82f6"
    },
    {
        title: "How We Use It",
        desc: "Your data helps us recommend courses, provide AI guidance, and ensure you earn Credits for your achievements.",
        icon: Shield,
        color: "#3b82f6"
    },
    {
        title: "Data Protection",
        desc: "All personal information is encrypted. We use industry-standard security protocols to keep your data safe from unauthorized access.",
        icon: Lock,
        color: "#10b981"
    },
    {
        title: "Your Rights",
        desc: "You can request to delete your account or download your data at any time through our help center or by contacting support.",
        icon: Trash2,
        color: "#ef4444"
    }
];

export default function PrivacyScreen() {
    const { isDark, colors } = useTheme();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title="Privacy Policy" showBack={true} />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Header Section */}
                <View style={styles.header}>
                    <View style={[styles.iconBg, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                        <Shield size={32} color={colors.accent} />
                    </View>
                    <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                        Your Privacy Matters
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: isDark ? "#94A3B8" : "#64748B" }]}>
                        Last updated: April 2026
                    </Text>
                </View>

                {/* Content Sections */}
                {PRIVACY_SECTIONS.map((section, index) => (
                    <Card key={index} variant={isDark ? "glass" : "elevated"} style={[styles.sectionCard, { borderColor: isDark ? 'rgba(51,65,85,0.2)' : '#e2e8f0' }]}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: `${section.color}15` }]}>
                                <section.icon size={20} color={section.color} />
                            </View>
                            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                                {section.title}
                            </Text>
                        </View>
                        <Text style={[styles.sectionDesc, { color: isDark ? "#94A3B8" : "#64748B" }]}>
                            {section.desc}
                        </Text>
                    </Card>
                ))}

                <View style={[styles.noticeBox, { backgroundColor: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.1)' }]}>
                    <Text style={[styles.noticeText, { color: isDark ? "#475569" : "#94A3B8" }]}>
                        By using Edutu, you agree to our terms of service and this privacy policy. We never sell your personal data to third parties.
                    </Text>
                </View>

                {/* Footer Info */}
                <View style={styles.footer}>
                    <Image
                        source={require('../../assets/logo1.png')}
                        style={styles.footerLogo}
                        resizeMode="contain"
                    />
                    <Text style={[styles.footerText, { color: isDark ? "#475569" : "#94A3B8" }]}>Edutu Legal</Text>
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
    sectionCard: {
        padding: 24,
        marginBottom: 16,
        borderWidth: 1,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    sectionDesc: {
        fontSize: 13,
        lineHeight: 20,
    },
    noticeBox: {
        marginTop: 16,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    noticeText: {
        fontSize: 11,
        fontStyle: 'italic',
        lineHeight: 18,
        textAlign: 'center',
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
