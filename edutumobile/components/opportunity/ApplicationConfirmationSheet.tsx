import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function ApplicationConfirmationSheet({
  visible,
  title,
  busy,
  onSubmitted,
  onNotYet,
  onWithdraw,
}: {
  visible: boolean;
  title: string;
  busy: boolean;
  onSubmitted: () => void;
  onNotYet: () => void;
  onWithdraw: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onNotYet}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <Text style={[styles.heading, { color: colors.foreground }]}>Did you submit your application?</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>Opening the application for {title} does not count as submission. Confirm only after completing it on the official website.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Yes, I submitted the application"
            disabled={busy}
            onPress={onSubmitted}
            style={[styles.primary, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }]}
          >
            <Text style={[styles.primaryText, { color: colors.background }]}>Yes, I submitted it</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="I have not submitted yet"
            disabled={busy}
            onPress={onNotYet}
            style={[styles.secondary, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
          >
            <Text style={[styles.secondaryText, { color: colors.foreground }]}>Not yet</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="I decided not to continue"
            disabled={busy}
            onPress={onWithdraw}
            style={styles.withdraw}
          >
            <Text style={[styles.withdrawText, { color: colors.mutedForeground }]}>I decided not to continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 23, 0.58)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '900' },
  body: { fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 20 },
  primary: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontSize: 14, fontWeight: '900' },
  secondary: { minHeight: 48, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 10 },
  secondaryText: { fontSize: 14, fontWeight: '800' },
  withdraw: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  withdrawText: { fontSize: 13, fontWeight: '700' },
});
