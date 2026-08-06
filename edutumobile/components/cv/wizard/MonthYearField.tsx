import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Pressable } from 'react-native';
import { Calendar, ChevronDown } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AnimatedPressable } from '../../ui/AnimatedPressable';
import { RADIUS, SPACE, useFieldColors } from './formKit';

/**
 * Month/year picker writing a canonical `YYYY-MM`.
 *
 * Dates used to be free text, so "Jan 2023", "2023-01" and "01/23" all landed
 * in the same document and printed inconsistently. Storing one shape means the
 * PDF, the preview and the health check's chronology test all agree.
 */

const MONTH_KEYS = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;

/** Parse the canonical shape plus the legacy shapes already in saved CVs. */
function parseValue(value?: string | null): { year: number; month: number } | null {
    const raw = (value || '').trim();
    if (!raw) return null;

    const iso = raw.match(/^(\d{4})-(\d{1,2})/);
    if (iso) return { year: Number(iso[1]), month: Number(iso[2]) - 1 };

    const slash = raw.match(/^(\d{1,2})\/(\d{4})$/);
    if (slash) return { year: Number(slash[2]), month: Number(slash[1]) - 1 };

    const named = raw.toLowerCase().match(/^([a-z]{3,})[a-z.]*\s+(\d{4})$/);
    if (named) {
        const index = MONTH_KEYS.indexOf(named[1].slice(0, 3) as (typeof MONTH_KEYS)[number]);
        if (index >= 0) return { year: Number(named[2]), month: index };
    }

    const yearOnly = raw.match(/^(\d{4})$/);
    if (yearOnly) return { year: Number(yearOnly[1]), month: 0 };

    return null;
}

function toCanonical(year: number, month: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
}

interface Props {
    label: string;
    value?: string | null;
    onChange: (value: string) => void;
    /** Year the picker starts at when nothing is selected yet. */
    referenceYear?: number;
    placeholder?: string;
    /** Renders the field disabled, e.g. while "I currently work here" is on. */
    disabled?: boolean;
    disabledText?: string;
}

export function MonthYearField({
    label,
    value,
    onChange,
    referenceYear,
    placeholder,
    disabled,
    disabledText,
}: Props) {
    const { t } = useTranslation('cv');
    const { colors, muted, fieldBg, fieldBorder } = useFieldColors();
    const [open, setOpen] = useState(false);

    const parsed = parseValue(value);
    // `new Date()` is only read to seed the year list, never stored.
    const thisYear = referenceYear ?? new Date().getFullYear();
    const [draftYear, setDraftYear] = useState(parsed?.year ?? thisYear);

    const years = useMemo(() => {
        const list: number[] = [];
        for (let year = thisYear + 6; year >= thisYear - 50; year -= 1) list.push(year);
        return list;
    }, [thisYear]);

    const display = parsed
        ? `${t(`wizard.months.${MONTH_KEYS[parsed.month]}`)} ${parsed.year}`
        : (value || '').trim() || placeholder || t('wizard.dates.select');

    const openPicker = () => {
        setDraftYear(parsed?.year ?? thisYear);
        setOpen(true);
    };

    const select = (month: number) => {
        onChange(toCanonical(draftYear, month));
        setOpen(false);
    };

    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: muted }]}>{label}</Text>
            <AnimatedPressable
                style={[
                    styles.trigger,
                    {
                        backgroundColor: fieldBg,
                        borderColor: fieldBorder,
                        opacity: disabled ? 0.55 : 1,
                    },
                ]}
                scaleTo={0.98}
                disabled={disabled}
                onPress={openPicker}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${display}`}
            >
                <View style={styles.triggerInner}>
                    <Calendar size={17} color={muted} />
                    <Text
                        style={[
                            styles.triggerText,
                            { color: parsed || (!disabled && value) ? colors.foreground : muted },
                        ]}
                        numberOfLines={1}
                    >
                        {disabled ? (disabledText || display) : display}
                    </Text>
                    {!disabled && <ChevronDown size={17} color={muted} />}
                </View>
            </AnimatedPressable>

            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
                    <Pressable
                        style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={(event) => event.stopPropagation()}
                    >
                        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{label}</Text>

                        <Text style={[styles.sheetLabel, { color: muted }]}>{t('wizard.dates.year')}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearRow}>
                            {years.map((year) => {
                                const active = year === draftYear;
                                return (
                                    <Pressable
                                        key={year}
                                        onPress={() => setDraftYear(year)}
                                        style={[
                                            styles.yearChip,
                                            {
                                                backgroundColor: active ? colors.primary : 'transparent',
                                                borderColor: active ? colors.primary : fieldBorder,
                                            },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                    >
                                        <Text
                                            style={[
                                                styles.yearChipText,
                                                { color: active ? '#FFFFFF' : colors.foreground },
                                            ]}
                                        >
                                            {year}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        <Text style={[styles.sheetLabel, { color: muted, marginTop: 18 }]}>
                            {t('wizard.dates.month')}
                        </Text>
                        <View style={styles.monthGrid}>
                            {MONTH_KEYS.map((key, index) => {
                                const active = parsed?.month === index && parsed?.year === draftYear;
                                return (
                                    <Pressable
                                        key={key}
                                        onPress={() => select(index)}
                                        style={[
                                            styles.monthCell,
                                            {
                                                backgroundColor: active ? colors.primary : 'transparent',
                                                borderColor: active ? colors.primary : fieldBorder,
                                            },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                    >
                                        <Text
                                            style={[
                                                styles.monthText,
                                                { color: active ? '#FFFFFF' : colors.foreground },
                                            ]}
                                        >
                                            {t(`wizard.months.${key}`)}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <Pressable
                            onPress={() => {
                                onChange('');
                                setOpen(false);
                            }}
                            style={styles.clearBtn}
                            accessibilityRole="button"
                        >
                            <Text style={[styles.clearText, { color: muted }]}>{t('wizard.dates.clear')}</Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        marginBottom: SPACE.field,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 7,
    },
    trigger: {
        minHeight: 52,
        borderRadius: RADIUS.field,
        borderWidth: 1,
    },
    triggerInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 15,
    },
    triggerText: {
        flex: 1,
        fontSize: 15,
    },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(2,6,23,0.62)',
        justifyContent: 'center',
        padding: 20,
    },
    sheet: {
        borderRadius: 22,
        borderWidth: 1,
        padding: 22,
    },
    sheetTitle: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 18,
    },
    sheetLabel: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 10,
    },
    yearRow: {
        gap: 8,
        paddingRight: 8,
    },
    yearChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
    },
    yearChipText: {
        fontSize: 14,
        fontWeight: '700',
    },
    monthGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    monthCell: {
        width: '30%',
        flexGrow: 1,
        paddingVertical: 12,
        borderRadius: RADIUS.field,
        borderWidth: 1,
        alignItems: 'center',
    },
    monthText: {
        fontSize: 14,
        fontWeight: '600',
    },
    clearBtn: {
        marginTop: 18,
        alignItems: 'center',
        paddingVertical: 8,
    },
    clearText: {
        fontSize: 14,
        fontWeight: '600',
    },
});
