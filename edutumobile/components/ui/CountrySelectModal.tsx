import React, { useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    Keyboard,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Search, X } from 'lucide-react-native';
import { COUNTRIES, type Country } from '../../data/onboarding-data';
import { useTheme } from '../context/ThemeContext';

interface CountrySelectModalProps {
    visible: boolean;
    /** Currently selected country name (free text tolerated). */
    value?: string | null;
    onSelect: (countryName: string) => void;
    onClose: () => void;
}

/**
 * Searchable, keyboard-safe full-screen country picker. Header + search are
 * pinned at the top and the list is padded by the live keyboard height so no
 * row hides behind the keyboard (the same pattern proven in onboarding). Emits
 * the country *name* so it drops into the existing string profile field.
 */
export function CountrySelectModal({ visible, value, onSelect, onClose }: CountrySelectModalProps) {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const [search, setSearch] = useState('');
    const [kbHeight, setKbHeight] = useState(0);

    useEffect(() => {
        if (!visible) return;
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height ?? 0));
        const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [visible]);

    useEffect(() => {
        if (!visible) setSearch('');
    }, [visible]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return COUNTRIES;
        return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
    }, [search]);

    const handleSelect = (country: Country) => {
        onSelect(country.name);
        Keyboard.dismiss();
        onClose();
    };

    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const rowBorder = isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F7';
    const searchBg = isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9';

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                        <X color={colors.foreground} size={22} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: colors.foreground }]}>Select country</Text>
                    <View style={styles.closeBtn} />
                </View>

                <View style={[styles.searchRow, { backgroundColor: searchBg }]}>
                    <Search color={textSecondary} size={18} />
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search countries"
                        placeholderTextColor={textSecondary}
                        style={[styles.searchInput, { color: colors.foreground }]}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoFocus
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                            <X color={textSecondary} size={16} />
                        </TouchableOpacity>
                    )}
                </View>

                <FlatList
                    data={filtered}
                    keyExtractor={(item) => item.code}
                    contentContainerStyle={{ paddingBottom: kbHeight + insets.bottom + 24 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    initialNumToRender={20}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={{ color: textSecondary }}>No matches</Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        const isSelected =
                            !!value && item.name.toLowerCase() === value.trim().toLowerCase();
                        return (
                            <TouchableOpacity
                                style={[styles.row, { borderBottomColor: rowBorder }]}
                                onPress={() => handleSelect(item)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.flag}>{item.flag}</Text>
                                <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                                {isSelected && <Check color={colors.primary} size={18} />}
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 17, fontWeight: '700' },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 14,
        height: 46,
        borderRadius: 14,
    },
    searchInput: { flex: 1, fontSize: 15 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    flag: { fontSize: 22 },
    name: { flex: 1, fontSize: 15, fontWeight: '500' },
    empty: { paddingVertical: 60, alignItems: 'center' },
});
