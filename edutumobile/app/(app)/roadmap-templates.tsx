import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BookOpen, Briefcase, Bell, Calendar, ChevronRight, Clock3, Download, ExternalLink, GraduationCap, Rocket, Sparkles, Users, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { useTheme } from '../../components/context/ThemeContext';
import { notificationService } from '../../lib/notifications';

type TemplateIcon = typeof BookOpen;

interface TemplateResource {
    title: string;
    provider: string;
    url: string;
}

interface TemplateMilestone {
    week: number;
    title: string;
    guidance: string;
    deliverable: string;
    resources: TemplateResource[];
}

interface Template {
    id: string;
    title: string;
    summary: string;
    meta: string;
    difficulty: string;
    icon: TemplateIcon;
    accent: string;
    outcomes: string[];
    reminderCadence: string;
    milestones: TemplateMilestone[];
}

const TEMPLATES: Template[] = [
    {
        id: 'python-course',
        title: 'Complete Python Programming Course',
        summary: 'Master Python fundamentals, APIs, automation, and a final portfolio project.',
        meta: '12 weeks',
        difficulty: 'Beginner to Intermediate',
        icon: BookOpen,
        accent: '#2563EB',
        reminderCadence: 'Weekly Monday study blocks plus milestone check-ins.',
        outcomes: ['Understand Python syntax and data structures.', 'Build automation and API projects.', 'Publish one GitHub portfolio project.'],
        milestones: [
            {
                week: 1,
                title: 'Set up and learn Python basics',
                guidance: 'Install Python, choose an editor, then practice variables, strings, numbers, conditionals, and loops.',
                deliverable: 'A working setup and 10 short practice scripts.',
                resources: [
                    { title: 'Python for Beginners', provider: 'freeCodeCamp', url: 'https://www.youtube.com/watch?v=eWRfhZUzrAc' },
                    { title: 'Python Tutorial', provider: 'W3Schools', url: 'https://www.w3schools.com/python/' },
                ],
            },
            {
                week: 4,
                title: 'Data structures and files',
                guidance: 'Use lists, dictionaries, sets, and file operations to process real data.',
                deliverable: 'A CSV reader that summarizes opportunity deadlines.',
                resources: [{ title: 'Google Python Class', provider: 'Google', url: 'https://developers.google.com/edu/python' }],
            },
            {
                week: 8,
                title: 'APIs and automation',
                guidance: 'Call APIs, parse JSON, handle errors, and automate a useful opportunity-search task.',
                deliverable: 'A script that fetches and filters scholarship or internship data.',
                resources: [{ title: 'APIs for Beginners', provider: 'freeCodeCamp', url: 'https://www.youtube.com/watch?v=GZvSYJDk-us' }],
            },
            {
                week: 12,
                title: 'Final portfolio project',
                guidance: 'Package your strongest project with a README, screenshots, setup instructions, and a short demo.',
                deliverable: 'One published GitHub project.',
                resources: [{ title: 'GitHub Skills', provider: 'GitHub', url: 'https://skills.github.com/' }],
            },
        ],
    },
    {
        id: 'scholarship-applications',
        title: 'Apply to 5 International Scholarships',
        summary: 'Plan eligibility, essays, documents, recommendations, deadlines, and interviews.',
        meta: '16 weeks',
        difficulty: 'Intermediate',
        icon: GraduationCap,
        accent: '#16A34A',
        reminderCadence: 'Two weekly reminders for application writing and document review.',
        outcomes: ['Create a ranked scholarship shortlist.', 'Prepare reusable essays and documents.', 'Submit five complete applications.'],
        milestones: [
            {
                week: 1,
                title: 'Shortlist the right scholarships',
                guidance: 'Define eligibility, funding needs, target countries, and deadline windows before applying.',
                deliverable: 'A ranked shortlist of 10 scholarships.',
                resources: [{ title: 'Opportunity Desk', provider: 'Opportunity Desk', url: 'https://www.opportunitydesk.org/' }],
            },
            {
                week: 4,
                title: 'Build your document bank',
                guidance: 'Prepare a master CV, recommendation request, transcript checklist, and reusable essay story blocks.',
                deliverable: 'A master CV and three essay story blocks.',
                resources: [{ title: 'Essay Guidance', provider: 'Chevening', url: 'https://www.chevening.org/scholarships/guidance/essays/' }],
            },
            {
                week: 16,
                title: 'Submit and prepare for interviews',
                guidance: 'Submit the final applications, then rehearse motivation, leadership, and study-plan answers.',
                deliverable: 'Five submitted applications and an interview prep sheet.',
                resources: [{ title: 'Interview Tips', provider: 'The Scholarship System', url: 'https://www.youtube.com/watch?v=HVMl3L9Da5s' }],
            },
        ],
    },
    {
        id: 'portfolio-website',
        title: 'Build Professional Portfolio Website',
        summary: 'Create a public proof-of-work website with project stories and contact links.',
        meta: '8 weeks',
        difficulty: 'Beginner to Intermediate',
        icon: Briefcase,
        accent: '#2563eb',
        reminderCadence: 'Weekly build reminder and final launch checklist.',
        outcomes: ['Publish a portfolio homepage.', 'Showcase 2-3 projects.', 'Add contact, CV, and social links.'],
        milestones: [
            {
                week: 1,
                title: 'Plan your proof of work',
                guidance: 'Choose your audience, collect projects, and write concise case-study summaries.',
                deliverable: 'A one-page site outline.',
                resources: [{ title: 'Portfolio Tutorial', provider: 'freeCodeCamp', url: 'https://www.youtube.com/watch?v=xV7S8BhIeBo' }],
            },
            {
                week: 8,
                title: 'Launch and share',
                guidance: 'Deploy, test links, add SEO basics, and include your site in applications.',
                deliverable: 'A live portfolio URL.',
                resources: [{ title: 'Deployments', provider: 'Vercel', url: 'https://vercel.com/docs/deployments/overview' }],
            },
        ],
    },
    {
        id: 'leadership-skills',
        title: 'Develop Leadership & Communication Skills',
        summary: 'Practice speaking, feedback, delegation, confidence, and team communication.',
        meta: '10 weeks',
        difficulty: 'All Levels',
        icon: Users,
        accent: '#0891B2',
        reminderCadence: 'Weekly reflection reminders and biweekly speaking practice.',
        outcomes: ['Practice public speaking.', 'Lead a small initiative.', 'Improve conflict handling.'],
        milestones: [
            {
                week: 1,
                title: 'Communication baseline',
                guidance: 'Record a short talk, identify strengths, and choose two improvement areas.',
                deliverable: 'A 3-minute recorded intro and self-review.',
                resources: [{ title: 'Think Fast, Talk Smart', provider: 'Stanford GSB', url: 'https://www.youtube.com/playlist?list=PLxq_lXOUlvQDqJ3I8A9b6WH6lsR3K7M4u' }],
            },
            {
                week: 5,
                title: 'Lead a real initiative',
                guidance: 'Choose a small group task and practice delegation, updates, and feedback.',
                deliverable: 'A completed team task with lessons learned.',
                resources: [{ title: 'Leadership Skills', provider: 'MindTools', url: 'https://www.mindtools.com/a3f9d6v/leadership-skills' }],
            },
        ],
    },
    {
        id: 'startup-launch',
        title: 'Launch Your First Startup',
        summary: 'Validate a problem, build an MVP, and run a first launch experiment.',
        meta: '20 weeks',
        difficulty: 'Advanced',
        icon: Rocket,
        accent: '#F97316',
        reminderCadence: 'Weekly build reminders and monthly validation review.',
        outcomes: ['Validate a real customer problem.', 'Build a small MVP.', 'Run one launch experiment.'],
        milestones: [
            {
                week: 1,
                title: 'Validate the problem',
                guidance: 'Interview target users and define the painful problem before building.',
                deliverable: '10 user interviews and a problem statement.',
                resources: [{ title: 'Startup School', provider: 'Y Combinator', url: 'https://www.startupschool.org/' }],
            },
            {
                week: 10,
                title: 'Build an MVP',
                guidance: 'Build the smallest version that proves users want the outcome.',
                deliverable: 'A working MVP with one core workflow.',
                resources: [{ title: 'Build an MVP', provider: 'Y Combinator', url: 'https://www.youtube.com/watch?v=1hHMwLxN6EM' }],
            },
        ],
    },
];

const buildDate = (week: number) => {
    const date = new Date();
    date.setDate(date.getDate() + Math.max(1, week) * 7);
    date.setHours(9, 0, 0, 0);
    return date;
};

const formatIcsDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export default function RoadmapTemplatesScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const cardBg = isDark ? '#111827' : '#FFFFFF';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const subtleBg = isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC';

    const exportCalendar = async (template: Template) => {
        const events = template.milestones.map((milestone) => {
            const start = buildDate(milestone.week);
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            const description = `${milestone.guidance}\\nDeliverable: ${milestone.deliverable}`;
            return [
                'BEGIN:VEVENT',
                `UID:${template.id}-${milestone.week}@edutu`,
                `DTSTAMP:${formatIcsDate(new Date())}`,
                `DTSTART:${formatIcsDate(start)}`,
                `DTEND:${formatIcsDate(end)}`,
                `SUMMARY:${template.title}: Week ${milestone.week}`,
                `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
                'END:VEVENT',
            ].join('\n');
        });
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Edutu//Roadmap Templates//EN', ...events, 'END:VCALENDAR'].join('\n');

        if (Platform.OS === 'web') {
            Alert.alert('Calendar ready', 'Calendar export is available on mobile builds.');
            return;
        }

        const file = new File(Paths.cache, `${template.id}-roadmap.ics`);
        file.write(ics);
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', dialogTitle: 'Add roadmap to calendar' });
        } else {
            Alert.alert('Calendar file created', file.uri);
        }
    };

    const scheduleReminders = async (template: Template) => {
        const allowed = await notificationService.requestPermissions();
        if (!allowed) {
            Alert.alert('Notifications blocked', 'Enable notifications to receive roadmap reminders.');
            return;
        }

        const scheduled = [];
        for (const milestone of template.milestones.slice(0, 8)) {
            const date = buildDate(milestone.week);
            if (date.getTime() <= Date.now()) continue;
            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: `Roadmap reminder: Week ${milestone.week}`,
                    body: `${template.title} - ${milestone.title}`,
                    data: { type: 'roadmap-template', templateId: template.id, week: milestone.week },
                },
                trigger: { date } as Notifications.NotificationTriggerInput,
            });
            scheduled.push(id);
        }

        Alert.alert('Reminders scheduled', `${scheduled.length} roadmap reminders are now scheduled.`);
    };

    const openResource = async (resource: TemplateResource) => {
        const supported = await Linking.canOpenURL(resource.url);
        if (supported) {
            await Linking.openURL(resource.url);
        }
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title="Explore Templates" subtitle="Featured roadmap paths" showBack />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                >
                    <View style={[styles.featuredPanel, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '24' }]}>
                        <View style={styles.featuredTopRow}>
                            <View style={[styles.featuredIcon, { backgroundColor: colors.primary }]}>
                                <Sparkles size={22} color="#FFFFFF" />
                            </View>
                            <View style={styles.featuredCopy}>
                                <Text style={[styles.featuredEyebrow, { color: colors.primary }]}>FEATURED ROADMAP TEMPLATES</Text>
                                <Text style={[styles.featuredTitle, { color: colors.foreground }]}>Pick a proven path and start planning faster</Text>
                            </View>
                        </View>
                        <Text style={[styles.featuredSubtitle, { color: textSecondary }]}>
                            Each template includes milestones, resources, calendar export, and study reminders.
                        </Text>
                        <View style={styles.statsRow}>
                            <View style={[styles.statPill, { backgroundColor: subtleBg, borderColor }]}>
                                <BookOpen size={13} color={colors.primary} />
                                <Text style={[styles.statText, { color: colors.foreground }]}>{TEMPLATES.length} templates</Text>
                            </View>
                            <View style={[styles.statPill, { backgroundColor: subtleBg, borderColor }]}>
                                <Clock3 size={13} color={colors.primary} />
                                <Text style={[styles.statText, { color: colors.foreground }]}>8-20 weeks</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionHeading, { color: colors.foreground }]}>Featured paths</Text>
                        <Text style={[styles.sectionCount, { color: textSecondary }]}>{TEMPLATES.length} available</Text>
                    </View>

                    <View style={styles.list}>
                        {TEMPLATES.map((template) => {
                            const Icon = template.icon;
                            return (
                                <TouchableOpacity
                                    key={template.id}
                                    activeOpacity={0.86}
                                    style={[styles.card, { backgroundColor: cardBg, borderColor }]}
                                    onPress={() => setSelectedTemplate(template)}
                                >
                                    <View style={styles.cardTop}>
                                        <View style={[styles.iconBox, { backgroundColor: template.accent + '18' }]}>
                                            <Icon size={21} color={template.accent} />
                                        </View>
                                        <View style={[styles.difficultyPill, { backgroundColor: template.accent + '12' }]}>
                                            <Text style={[styles.difficultyText, { color: template.accent }]} numberOfLines={1}>
                                                {template.difficulty}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                                        {template.title}
                                    </Text>
                                    <Text style={[styles.cardSummary, { color: textSecondary }]} numberOfLines={2}>
                                        {template.summary}
                                    </Text>
                                    <View style={styles.cardFooter}>
                                        <View style={styles.metaRow}>
                                            <Calendar size={12} color={textSecondary} />
                                            <Text style={[styles.metaText, { color: textSecondary }]}>{template.meta}</Text>
                                        </View>
                                        <View style={[styles.openCircle, { backgroundColor: subtleBg }]}>
                                            <ChevronRight size={16} color={textSecondary} />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            <Modal visible={!!selectedTemplate} animationType="slide" transparent onRequestClose={() => setSelectedTemplate(null)}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalKeyboardView}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <View style={styles.modalOverlay}>
                        <View style={[styles.sheet, { backgroundColor: cardBg, borderColor, paddingBottom: insets.bottom }]}>
                            {selectedTemplate && (
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={styles.sheetContent}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                            >
                                <View style={styles.sheetHeader}>
                                    <View style={[styles.iconBox, { backgroundColor: selectedTemplate.accent + '18' }]}>
                                        {React.createElement(selectedTemplate.icon, { size: 22, color: selectedTemplate.accent })}
                                    </View>
                                    <View style={styles.sheetTitleWrap}>
                                        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{selectedTemplate.title}</Text>
                                        <Text style={[styles.sheetSubtitle, { color: textSecondary }]}>{selectedTemplate.difficulty} • {selectedTemplate.meta}</Text>
                                    </View>
                                    <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.background }]} onPress={() => setSelectedTemplate(null)}>
                                        <X size={18} color={colors.foreground} />
                                    </TouchableOpacity>
                                </View>

                                <Text style={[styles.description, { color: textSecondary }]}>{selectedTemplate.summary}</Text>

                                <View style={styles.actionGrid}>
                                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: selectedTemplate.accent }]} onPress={() => router.push('/roadmaps')}>
                                        <BookOpen size={16} color="#FFFFFF" />
                                        <Text style={styles.primaryActionText}>Start roadmap</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.actionBtn, styles.secondaryActionBtn, { borderColor }]} onPress={() => exportCalendar(selectedTemplate)}>
                                        <Download size={16} color={colors.foreground} />
                                        <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>Calendar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.actionBtn, styles.secondaryActionBtn, { borderColor }]} onPress={() => scheduleReminders(selectedTemplate)}>
                                        <Bell size={16} color={colors.foreground} />
                                        <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>Reminders</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={[styles.panel, { backgroundColor: colors.background }]}>
                                    <Text style={[styles.panelTitle, { color: colors.foreground }]}>Outcomes</Text>
                                    {selectedTemplate.outcomes.map((outcome) => (
                                        <Text key={outcome} style={[styles.bullet, { color: textSecondary }]}>• {outcome}</Text>
                                    ))}
                                </View>

                                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Guidance and resources</Text>
                                {selectedTemplate.milestones.map((milestone) => (
                                    <View key={`${selectedTemplate.id}-${milestone.week}`} style={[styles.milestone, { backgroundColor: colors.background, borderColor }]}>
                                        <Text style={[styles.weekLabel, { color: selectedTemplate.accent }]}>Week {milestone.week}</Text>
                                        <Text style={[styles.milestoneTitle, { color: colors.foreground }]}>{milestone.title}</Text>
                                        <Text style={[styles.milestoneText, { color: textSecondary }]}>{milestone.guidance}</Text>
                                        <Text style={[styles.deliverable, { color: colors.foreground }]}>Deliverable: {milestone.deliverable}</Text>
                                        <View style={styles.resourceList}>
                                            {milestone.resources.map((resource) => (
                                                <TouchableOpacity key={resource.url} style={[styles.resourceChip, { borderColor }]} onPress={() => openResource(resource)}>
                                                    <Text style={[styles.resourceText, { color: colors.foreground }]} numberOfLines={1}>{resource.title}</Text>
                                                    <ExternalLink size={12} color={textSecondary} />
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                ))}
                            </ScrollView>
                            )}
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    keyboardView: { flex: 1 },
    scrollView: { flex: 1 },
    content: { padding: 16 },
    featuredPanel: {
        borderWidth: 1,
        borderRadius: 20,
        padding: 16,
        marginBottom: 18,
    },
    featuredTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    featuredIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    featuredCopy: { flex: 1 },
    featuredEyebrow: { fontSize: 10, fontWeight: '900', marginBottom: 5 },
    featuredTitle: { fontSize: 20, fontWeight: '900', lineHeight: 25 },
    featuredSubtitle: { fontSize: 13, lineHeight: 19, marginTop: 12 },
    statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    statPill: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 7,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statText: { fontSize: 12, fontWeight: '800' },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    sectionHeading: { fontSize: 17, fontWeight: '900' },
    sectionCount: { fontSize: 12, fontWeight: '700' },
    list: { gap: 12 },
    card: {
        borderWidth: 1,
        borderRadius: 20,
        padding: 15,
    },
    cardTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    difficultyPill: {
        maxWidth: '62%',
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 5,
    },
    difficultyText: { fontSize: 10, fontWeight: '900' },
    cardTitle: { fontSize: 16, fontWeight: '900', lineHeight: 21 },
    cardSummary: { fontSize: 13, lineHeight: 18, marginTop: 5 },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 13,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaText: { fontSize: 11, fontWeight: '600' },
    openCircle: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalKeyboardView: { flex: 1 },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    sheet: {
        maxHeight: '88%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
    },
    sheetContent: { padding: 16, paddingBottom: 36 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sheetTitleWrap: { flex: 1 },
    sheetTitle: { fontSize: 18, fontWeight: '900', lineHeight: 23 },
    sheetSubtitle: { fontSize: 12, marginTop: 3, fontWeight: '600' },
    closeBtn: {
        width: 38,
        height: 38,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    description: { fontSize: 14, lineHeight: 21, marginTop: 14 },
    actionGrid: { flexDirection: 'row', gap: 8, marginTop: 16 },
    actionBtn: {
        flex: 1,
        minHeight: 44,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
    },
    secondaryActionBtn: { borderWidth: 1, backgroundColor: 'transparent' },
    primaryActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    secondaryActionText: { fontSize: 12, fontWeight: '800' },
    panel: { borderRadius: 20, padding: 14, marginTop: 16 },
    panelTitle: { fontSize: 14, fontWeight: '900', marginBottom: 8 },
    bullet: { fontSize: 13, lineHeight: 20, marginBottom: 3 },
    sectionTitle: { fontSize: 16, fontWeight: '900', marginTop: 18, marginBottom: 10 },
    milestone: { borderWidth: 1, borderRadius: 20, padding: 14, marginBottom: 12 },
    weekLabel: { fontSize: 12, fontWeight: '900', marginBottom: 6 },
    milestoneTitle: { fontSize: 15, fontWeight: '900', lineHeight: 20 },
    milestoneText: { fontSize: 13, lineHeight: 20, marginTop: 7 },
    deliverable: { fontSize: 13, lineHeight: 19, marginTop: 8, fontWeight: '700' },
    resourceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    resourceChip: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 7,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        maxWidth: '100%',
    },
    resourceText: { fontSize: 12, fontWeight: '700', maxWidth: 220 },
});
