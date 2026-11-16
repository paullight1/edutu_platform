import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ban, CalendarClock, CheckCircle2, ThumbsDown } from 'lucide-react-native';
import type { DismissReason } from '@edutu/core/src/services/opportunitySignals';

/**
 * Typed "not interested" picker. The reason matters: wrong_field teaches the
 * engine taste (fewer of this category), while the other three only hide the
 * item — a user who already applied or isn't eligible still LIKES this kind
 * of opportunity, and a plain dismiss would wrongly bury the whole category.
 */
export function DismissReasonSheet({
  visible,
  isDark,
  onSelect,
  onClose,
}: {
  visible: boolean;
  isDark: boolean;
  onSelect: (reason: DismissReason) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('opps');

  const surface = isDark ? '#111827' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const rowBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)';

  const options: Array<{
    reason: DismissReason;
    label: string;
    hint: string;
    Icon: typeof ThumbsDown;
  }> = [
    {
      reason: 'wrong_field',
      label: t('dismissSheet.wrongField', { defaultValue: 'Not my kind of opportunity' }),
      hint: t('dismissSheet.wrongFieldHint', { defaultValue: "You'll see fewer like this" }),
      Icon: ThumbsDown,
    },
    {
      reason: 'not_eligible',
      label: t('dismissSheet.notEligible', { defaultValue: "I'm not eligible" }),
      hint: t('dismissSheet.notEligibleHint', {
        defaultValue: 'Hides it without changing your interests',
      }),
      Icon: Ban,
    },
    {
      reason: 'already_applied',
      label: t('dismissSheet.alreadyApplied', { defaultValue: 'I already applied' }),
      hint: t('dismissSheet.alreadyAppliedHint', {
        defaultValue: "We'll keep it out of your feed",
      }),
      Icon: CheckCircle2,
    },
    {
      reason: 'deadline_too_soon',
      label: t('dismissSheet.deadlineTooSoon', { defaultValue: 'Deadline is too close' }),
      hint: t('dismissSheet.deadlineTooSoonHint', {
        defaultValue: 'Not enough time to apply properly',
      }),
      Icon: CalendarClock,
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: surface }]} onPress={() => {}}>
          <View style={[styles.grabber, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
          <Text style={[styles.title, { color: textPrimary }]}>
            {t('dismissSheet.title', { defaultValue: 'Not interested?' })}
          </Text>
          <Text style={[styles.subtitle, { color: textSecondary }]}>
            {t('dismissSheet.subtitle', {
              defaultValue: 'Tell us why — it makes your matches smarter.',
            })}
          </Text>

          {options.map(({ reason, label, hint, Icon }) => (
            <TouchableOpacity
              key={reason}
              style={[styles.row, { backgroundColor: rowBg }]}
              activeOpacity={0.8}
              onPress={() => onSelect(reason)}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <View style={styles.rowIcon}>
                <Icon size={18} color={textSecondary} strokeWidth={2} />
              </View>
              <View style={styles.rowTextGroup}>
                <Text style={[styles.rowLabel, { color: textPrimary }]}>{label}</Text>
                <Text style={[styles.rowHint, { color: textSecondary }]} numberOfLines={1}>
                  {hint}
                </Text>
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={[styles.cancelText, { color: textSecondary }]}>
              {t('dismissSheet.cancel', { defaultValue: 'Cancel' })}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  rowIcon: {
    width: 28,
    alignItems: 'center',
    marginRight: 10,
  },
  rowTextGroup: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowHint: {
    fontSize: 12,
    marginTop: 1,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
