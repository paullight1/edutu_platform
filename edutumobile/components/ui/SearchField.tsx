import { forwardRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

type SearchFieldProps = Omit<TextInputProps, 'style'> & {
  onClear?: () => void;
  clearLabel?: string;
  clearTestID?: string;
  trailing?: ReactNode;
};

/** Place inside the scroll content, below the screen header. */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField({
  onClear, clearLabel = 'Clear search', clearTestID, trailing, ...input
}, ref) {
  const { colors } = useTheme();
  return (
    <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Search size={18} color={colors.textSecondary} />
      <TextInput
        ref={ref}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={input.placeholder}
        {...input}
        style={[styles.input, { color: colors.foreground }]}
      />
      {onClear && <Pressable
        accessibilityRole="button" accessibilityLabel={clearLabel} testID={clearTestID}
        onPress={onClear} style={styles.clear}>
        <X size={16} color={colors.textSecondary} />
      </Pressable>}
      {trailing}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingLeft: 12 },
  input: { flex: 1, minWidth: 0, minHeight: 46, paddingRight: 10, paddingVertical: 9, fontSize: 15 },
  clear: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
