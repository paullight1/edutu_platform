import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useFeatureFlag } from '../context/AppControlContext';

export default function LegacyPathNotice({
  stage,
}: {
  stage: 'discover' | 'pursuing' | 'applied' | 'outcome';
}) {
  const enabled = useFeatureFlag('opportunity_my_path');
  const { colors } = useTheme();
  const router = useRouter();
  if (!enabled) return null;

  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.foreground }]}>Now available in My Path</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>See this together with preparation tasks, next actions, and outcomes.</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${stage} in My Path`}
        onPress={() =>
          router.push({
            pathname: '/my-path',
            params: { stage },
          } as never)
        }
        style={[styles.button, { backgroundColor: colors.muted }]}
      >
        <ArrowRight size={18} color={colors.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { marginHorizontal: 16, marginVertical: 10, borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  title: { fontSize: 14, fontWeight: '900' },
  body: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  button: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
