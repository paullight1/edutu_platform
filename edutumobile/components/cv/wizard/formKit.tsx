import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Switch,
    type TextInputProps,
    type ViewStyle,
} from 'react-native';
import { Plus, Trash2, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedPressable } from '../../ui/AnimatedPressable';

/**
 * The CV wizard's form design system.
 *
 * The old editor used roughly the same 12–20px gap at field, card and section
 * level, so nothing grouped visually. This scale is deliberately non-uniform:
 * each level is clearly larger than the one inside it, which is what makes a
 * long form scannable.
 */
export const SPACE = {
    /** Between two fields in the same card. */
    field: 20,
    /** Between two cards / repeated items. */
    group: 28,
    /** Between a step's intro and its body, and before the footer. */
    section: 40,
    cardPad: 20,
    gutter: 20,
} as const;

export const RADIUS = { field: 12, card: 16, pill: 999 } as const;

/** Inputs used to be borderless slabs that vanished in dark mode. */
export function useFieldColors() {
    const { colors, isDark } = useTheme();
    return {
        colors,
        isDark,
        muted: isDark ? '#94A3B8' : '#64748B',
        fieldBg: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
        fieldBorder: isDark ? 'rgba(255,255,255,0.12)' : '#E2E8F0',
        focusBg: isDark ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.05)',
    };
}

interface FormFieldProps extends Omit<TextInputProps, 'style'> {
    label: string;
    /** Quiet guidance under the label — why this field matters. */
    hint?: string;
    /** Inline validation message. Non-blocking: the user can still continue. */
    error?: string;
    multiline?: boolean;
    required?: boolean;
    containerStyle?: ViewStyle;
}

/** Labelled text input with a visible border and a real focus state. */
export function FormField({
    label,
    hint,
    error,
    multiline,
    required,
    containerStyle,
    ...inputProps
}: FormFieldProps) {
    const { colors, muted, fieldBg, fieldBorder, focusBg } = useFieldColors();
    const [focused, setFocused] = useState(false);

    const borderColor = error ? '#EF4444' : focused ? colors.primary : fieldBorder;

    return (
        <View style={[styles.field, containerStyle]}>
            <Text style={[styles.label, { color: muted }]}>
                {label}
                {required ? <Text style={styles.requiredMark}> *</Text> : null}
            </Text>
            {!!hint && <Text style={[styles.hint, { color: muted }]}>{hint}</Text>}
            <TextInput
                {...inputProps}
                multiline={multiline}
                style={[
                    styles.input,
                    multiline && styles.inputMultiline,
                    {
                        backgroundColor: focused ? focusBg : fieldBg,
                        borderColor,
                        color: colors.foreground,
                        // A 2px border on focus reads as a ring without a shadow,
                        // which Android renders inconsistently.
                        borderWidth: focused || error ? 2 : 1,
                    },
                ]}
                placeholderTextColor={muted}
                onFocus={(event) => {
                    setFocused(true);
                    inputProps.onFocus?.(event);
                }}
                onBlur={(event) => {
                    setFocused(false);
                    inputProps.onBlur?.(event);
                }}
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
    );
}

/** A card grouping related fields. One card = one idea. */
export function FormCard({
    children,
    style,
}: {
    children: React.ReactNode;
    style?: ViewStyle;
}) {
    const { colors } = useTheme();
    return (
        <View
            style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
                style,
            ]}
        >
            {children}
        </View>
    );
}

/** Step heading: illustration, title, and one line explaining the point. */
export function StepIntro({
    title,
    description,
    illustration: Illustration,
}: {
    title: string;
    description: string;
    illustration?: React.ComponentType<{ size?: number; accent?: string }>;
}) {
    const { colors, muted } = useFieldColors();
    return (
        <View style={styles.intro}>
            {Illustration && (
                <View style={styles.introArt}>
                    <Illustration size={64} accent={colors.primary} />
                </View>
            )}
            <View style={styles.introCopy}>
                <Text style={[styles.introTitle, { color: colors.foreground }]}>{title}</Text>
                <Text style={[styles.introDescription, { color: muted }]}>{description}</Text>
            </View>
        </View>
    );
}

/** Header above a repeatable list, with its count and an Add affordance. */
export function ListHeader({
    title,
    count,
    addLabel,
    onAdd,
}: {
    title: string;
    count: number;
    addLabel: string;
    onAdd: () => void;
}) {
    const { colors } = useFieldColors();
    return (
        <View style={styles.listHeader}>
            <View style={styles.listHeaderTitleWrap}>
                <Text style={[styles.listHeaderTitle, { color: colors.foreground }]}>{title}</Text>
                {count > 0 && (
                    <View style={[styles.countBadge, { backgroundColor: `${colors.primary}22` }]}>
                        <Text style={[styles.countBadgeText, { color: colors.primary }]}>{count}</Text>
                    </View>
                )}
            </View>
            {/* Layout props live on an inner View: AnimatedPressable renders a
                flex:1 Pressable inside its styled wrapper. */}
            <AnimatedPressable
                style={[styles.addBtn, { borderColor: colors.primary }]}
                onPress={onAdd}
                scaleTo={0.95}
                accessibilityRole="button"
                accessibilityLabel={addLabel}
            >
                <View style={styles.addBtnInner}>
                    <Plus size={15} color={colors.primary} strokeWidth={2.5} />
                    <Text style={[styles.addBtnText, { color: colors.primary }]}>{addLabel}</Text>
                </View>
            </AnimatedPressable>
        </View>
    );
}

/**
 * Header of one repeated item. Delete asks for confirmation via `onDelete` —
 * the caller owns the dialog, because a bare trash tap used to destroy an
 * entry with no warning and no undo.
 */
export function ItemHeader({ title, onDelete }: { title: string; onDelete: () => void }) {
    const { t } = useTranslation('cv');
    const { colors } = useFieldColors();
    return (
        <View style={styles.itemHeader}>
            <Text style={[styles.itemHeaderText, { color: colors.foreground }]} numberOfLines={1}>
                {title}
            </Text>
            <AnimatedPressable
                onPress={onDelete}
                scaleTo={0.9}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('wizard.delete.action', { title })}
            >
                <Trash2 size={17} color="#EF4444" />
            </AnimatedPressable>
        </View>
    );
}

/** Dashed placeholder that doubles as the primary Add action when empty. */
export function EmptyStepHint({
    label,
    icon: Icon,
    onAdd,
}: {
    label: string;
    icon: LucideIcon;
    onAdd: () => void;
}) {
    const { colors, muted, isDark } = useFieldColors();
    return (
        <AnimatedPressable
            style={[
                styles.emptyHint,
                { borderColor: isDark ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.5)' },
            ]}
            scaleTo={0.97}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <View style={styles.emptyHintInner}>
                <View style={[styles.emptyHintIcon, { backgroundColor: `${colors.primary}14` }]}>
                    <Icon size={26} color={colors.primary} strokeWidth={1.8} />
                </View>
                <Text style={[styles.emptyHintText, { color: muted }]}>{label}</Text>
            </View>
        </AnimatedPressable>
    );
}

export function SwitchRow({
    label,
    value,
    onValueChange,
}: {
    label: string;
    value: boolean;
    onValueChange: (next: boolean) => void;
}) {
    const { colors, muted } = useFieldColors();
    return (
        <View style={styles.switchRow}>
            <Text style={[styles.label, { color: muted, marginBottom: 0 }]}>{label}</Text>
            <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.primary }} />
        </View>
    );
}

const styles = StyleSheet.create({
    field: {
        marginBottom: SPACE.field,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 7,
        letterSpacing: 0.1,
    },
    requiredMark: {
        color: '#EF4444',
        fontWeight: '700',
    },
    hint: {
        fontSize: 12,
        lineHeight: 17,
        marginTop: -3,
        marginBottom: 7,
        opacity: 0.85,
    },
    input: {
        minHeight: 52,
        borderRadius: RADIUS.field,
        paddingHorizontal: 14,
        paddingVertical: 14,
        fontSize: 15,
    },
    inputMultiline: {
        minHeight: 116,
        textAlignVertical: 'top',
        lineHeight: 21,
    },
    error: {
        color: '#EF4444',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 6,
    },
    card: {
        borderRadius: RADIUS.card,
        borderWidth: 1,
        padding: SPACE.cardPad,
        marginBottom: SPACE.group,
    },
    intro: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: SPACE.section - 12,
    },
    introArt: {
        width: 64,
        height: 64,
    },
    introCopy: {
        flex: 1,
    },
    introTitle: {
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    introDescription: {
        fontSize: 14,
        lineHeight: 20,
        marginTop: 4,
    },
    listHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    listHeaderTitleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    listHeaderTitle: {
        fontSize: 17,
        fontWeight: '700',
    },
    countBadge: {
        minWidth: 22,
        height: 22,
        paddingHorizontal: 7,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    countBadgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    addBtn: {
        borderWidth: 1.5,
        borderRadius: RADIUS.pill,
    },
    addBtnInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingHorizontal: 13,
        paddingVertical: 7,
    },
    addBtnText: {
        fontSize: 13,
        fontWeight: '700',
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        gap: 12,
    },
    itemHeaderText: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
    },
    emptyHint: {
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderRadius: RADIUS.card,
        marginBottom: SPACE.group,
    },
    emptyHintInner: {
        paddingVertical: 28,
        paddingHorizontal: 20,
        alignItems: 'center',
        gap: 12,
    },
    emptyHintIcon: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyHintText: {
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center',
        lineHeight: 20,
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACE.field,
        paddingVertical: 4,
    },
});
