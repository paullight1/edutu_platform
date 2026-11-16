import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, LayoutGrid } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MORE_FEATURES } from '../../lib/moreFeatures';
import { useTheme } from '../context/ThemeContext';

export function MoreFeatureHub() {
  const router = useRouter();
  const { t } = useTranslation(['opps', 'profile']);
  const { colors } = useTheme();

  return (
    <View style={styles.section} testID="more-feature-hub">
      <View style={styles.headingRow}>
        <View style={[styles.headingIcon, { backgroundColor: `${colors.accent}18` }]}>
          <LayoutGrid size={16} color={colors.accent} />
        </View>
        <Text style={[styles.heading, { color: colors.foreground }]}>{t('list.otherFeatures')}</Text>
      </View>

      <View style={styles.grid}>
        {MORE_FEATURES.map((item) => {
          const Icon = item.icon;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={t(item.title)}
              onPress={() => router.push(item.route as never)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <LinearGradient colors={[...item.gradient]} style={styles.cardGradient}>
                <View style={styles.cardIcon}>
                  <Icon size={16} color="#FFFFFF" strokeWidth={2} />
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>{t(item.title)}</Text>
                <ChevronRight size={14} color="rgba(255,255,255,0.9)" />
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  headingIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '48.5%', borderRadius: 14, overflow: 'hidden' },
  cardPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  cardGradient: { minHeight: 62, paddingHorizontal: 11, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  cardTitle: { flex: 1, color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '800' },
});
