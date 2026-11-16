import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Target } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useGoals } from '@edutu/core/src/hooks/useGoals';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';

export function PlanGoalPreview({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { goals, isLoading } = useGoals(supabase, userId);
  const goal = goals.find(value => value.status === 'active');
  const progress = goal && Number.isFinite(goal.progress) ? Math.max(0, Math.min(100, goal.progress)) : 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={goal ? `Open goal: ${goal.title}` : 'View your goals'}
      onPress={() => router.push(goal ? { pathname: '/goals/[id]', params: { id: goal.id } } : { pathname: '/goals', params: { planNav: '1' } })}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Target size={23} color={colors.accent} />
      <View style={styles.body}>
        <Text numberOfLines={2} style={[styles.title, { color: colors.foreground }]}>{goal?.title ?? 'Your goals'}</Text>
        {goal ? <>
          {goal.description ? <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12 }}>{goal.description}</Text> : null}
          <View style={styles.progressRow}>
            <View accessibilityRole="progressbar" accessibilityLabel="Goal progress" accessibilityValue={{ min: 0, max: 100, now: progress }}
              style={[styles.track, { backgroundColor: colors.muted }]}>
              <View style={{ height: '100%', width: `${progress}%`, backgroundColor: colors.accent }} />
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{progress}%</Text>
          </View>
        </> : <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{isLoading ? 'Loading goals…' : 'View your goals and next milestones'}</Text>}
      </View>
      <ArrowRight size={18} color={colors.accent} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 72 },
  body: { flex: 1, gap: 4, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 5, borderRadius: 3, flex: 1, overflow: 'hidden' },
});
