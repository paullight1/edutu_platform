import { NativeGlassSurface } from '../ui/NativeGlassSurface';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useMotion } from '../../hooks/useMotion';

export type PlanSection = 'overview' | 'applications' | 'deadlines' | 'goals' | 'roadmaps';
const sections: { key: PlanSection; route: string }[] = [
  { key: 'overview', route: '/my-plan' },
  { key: 'applications', route: '/applied' },
  { key: 'deadlines', route: '/deadlines' },
  { key: 'goals', route: '/goals' },
  { key: 'roadmaps', route: '/roadmaps' },
];

/** Internal workspace navigation: global destinations stay in the bottom bar. */
export function PlanWorkspaceHeader({ section, subtitle }: { section: PlanSection; subtitle?: string }) {
  const { colors, isDark, highContrast } = useTheme();
  const { t } = useTranslation('home');
  const router = useRouter();
  const motion = useMotion();
  const actionRoute = section === 'goals' ? '/goals/add' : section === 'roadmaps' ? '/creator-dashboard' : '/opportunities';
  const actionLabel = t(section === 'goals' ? 'myPlan.createGoal' : section === 'roadmaps' ? 'myPlan.createRoadmap' : 'myPlan.explore');
  return <View>
    <View style={s.headingRow}>
      <View style={s.headingBody}>
        <Text accessibilityRole="header" style={[s.title, { color: colors.foreground }]}>{t('myPlan.title')}</Text>
        <Text style={[s.subtitle, { color: colors.textSecondary }]}>{subtitle ?? t('myPlan.workspaceIntro')}</Text>
      </View>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel={actionLabel}
        scaleTo={motion.reduced ? 1 : 0.97} onPress={() => router.navigate(actionRoute)}
        style={s.add}>
        <NativeGlassSurface radius={24} isDark={isDark} highContrast={highContrast} surface={colors.card} border={colors.border} />
        <Plus size={22} color={colors.accent} />
      </AnimatedPressable>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.sections} accessibilityRole="tablist">
      {sections.map(({ key, route }) => <AnimatedPressable key={key} accessibilityRole="tab"
        accessibilityState={{ selected: section === key }} accessibilityLabel={t(`myPlan.${key}`)}
        hapticFeedback="selection" scaleTo={1}
        onPress={() => { if (section !== key) router.replace({ pathname: route, params: { planNav: '1' } } as never); }}
        style={[s.section, { borderBottomColor: section === key ? colors.accent : 'transparent' }]}>
        <Text style={[s.sectionLabel, { color: section === key ? colors.foreground : colors.textSecondary, fontWeight: section === key ? '700' : '500' }]}>{t(`myPlan.${key}`)}</Text>
      </AnimatedPressable>)}
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  headingRow: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  headingBody: { flex: 1, gap: 6 }, title: { fontSize: 32, fontWeight: '700', letterSpacing: -1 },
  subtitle: { fontSize: 14, lineHeight: 20 }, add: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0 }, sections: { paddingHorizontal: 20, gap: 24 },
  section: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 2, paddingBottom: 8 }, sectionLabel: { fontSize: 15 },
  next: { borderRadius: 24, borderCurve: 'continuous', padding: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 16 },
  eyebrow: { fontSize: 12, fontWeight: '700' }, nextLabel: { fontSize: 19, lineHeight: 25, fontWeight: '600' },
});
