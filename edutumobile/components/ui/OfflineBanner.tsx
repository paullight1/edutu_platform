import { RefreshCw, WifiOff } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOffline } from '../context/OfflineContext';
import { useTheme } from '../context/ThemeContext';

export function OfflineBanner() {
  const { isOffline, showIndicator, refresh } = useOffline();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  if (!isOffline || !showIndicator) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { top: insets.top + 8 }]}
    >
      <View
        style={[
          styles.banner,
          {
            backgroundColor: isDark ? 'rgba(124, 45, 18, 0.94)' : 'rgba(255, 237, 213, 0.98)',
            borderColor: isDark ? 'rgba(251, 146, 60, 0.35)' : 'rgba(234, 88, 12, 0.18)',
          },
        ]}
      >
        <View style={styles.message}>
          <WifiOff color={isDark ? '#FDBA74' : '#C2410C'} size={18} />
          <Text style={[styles.text, { color: isDark ? '#FFEDD5' : '#9A3412' }]}>
            You are offline
          </Text>
        </View>
        <Pressable onPress={() => void refresh()} style={styles.refreshButton}>
          <RefreshCw color={isDark ? '#FFEDD5' : '#9A3412'} size={16} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 4000,
  },
  banner: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
  },
  refreshButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
