import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { AnimatedPressable } from '../ui/AnimatedPressable';

const STORAGE_PREFIX = 'edutu:oppRequirements:';

type RequirementChecklistProps = {
  opportunityId: string;
  items: string[];
};

/**
 * Requirements as a working checklist rather than a paragraph list. Ticking
 * is the user's own scratchpad (persisted per opportunity, never uploaded) —
 * it turns the densest reference section on the screen into something they
 * can actually scan and act on.
 */
export function RequirementChecklist({
  opportunityId,
  items,
}: RequirementChecklistProps) {
  const { colors, isDark } = useTheme();
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const [checked, setChecked] = useState<string[]>([]);
  const storageKey = `${STORAGE_PREFIX}${opportunityId}`;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setChecked(parsed.filter((v) => typeof v === 'string'));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const toggle = useCallback(
    (item: string) => {
      setChecked((prev) => {
        const next = prev.includes(item)
          ? prev.filter((value) => value !== item)
          : [...prev, item];
        AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
        return next;
      });
    },
    [storageKey],
  );

  return (
    <View style={styles.list}>
      {items.map((item, index) => {
        const isChecked = checked.includes(item);
        return (
          <AnimatedPressable
            key={`${item}-${index}`}
            onPress={() => toggle(item)}
            scaleTo={0.98}
            hapticFeedback="selection"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isChecked }}
            accessibilityLabel={item}
            style={styles.itemHit}
          >
            {/* Row layout must sit inside AnimatedPressable's own flex:1
                Pressable wrapper, not on the outer style. */}
            <View style={styles.item}>
            <View
              style={[
                styles.box,
                {
                  borderColor: isChecked ? colors.accent : colors.border,
                  backgroundColor: isChecked ? colors.accent : 'transparent',
                },
              ]}
            >
              {isChecked ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
            </View>
            <Text
              style={[
                styles.text,
                {
                  color: isChecked ? textSecondary : colors.foreground,
                  textDecorationLine: isChecked ? 'line-through' : 'none',
                },
              ]}
            >
              {item}
            </Text>
            </View>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 4 },
  itemHit: { paddingVertical: 9 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  box: {
    width: 21,
    height: 21,
    borderRadius: 6,
    borderWidth: 1.6,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  text: { flex: 1, fontSize: 15, lineHeight: 21 },
});
