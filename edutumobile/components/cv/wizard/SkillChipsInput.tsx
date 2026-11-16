import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { AnimatedPressable } from '../../ui/AnimatedPressable';
import { RADIUS, SPACE, useFieldColors } from './formKit';

interface Props {
    skills: string[];
    onChange: (skills: string[]) => void;
    label: string;
    hint?: string;
    placeholder?: string;
}

/**
 * Skills as real chips.
 *
 * The old field joined every skill into one comma-separated string and re-split
 * the whole thing on each keystroke, so typing a comma mid-word silently split
 * a skill in two and there was no way to edit or remove a single entry. Here
 * the committed skills are their own list; the text input only ever holds the
 * one being typed.
 */
export function SkillChipsInput({ skills, onChange, label, hint, placeholder }: Props) {
    const { t } = useTranslation('cv');
    const { colors, muted, fieldBg, fieldBorder, focusBg } = useFieldColors();
    const [draft, setDraft] = useState('');
    const [focused, setFocused] = useState(false);

    const commit = (raw: string) => {
        // A paste can carry several skills at once — split those, but never
        // split what the user is still typing.
        const additions = raw
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .filter((value) => !skills.some((skill) => skill.toLowerCase() === value.toLowerCase()));

        if (additions.length) onChange([...skills, ...additions]);
        setDraft('');
    };

    const handleChangeText = (text: string) => {
        if (text.includes(',')) {
            const parts = text.split(',');
            const trailing = parts.pop() ?? '';
            commit(parts.join(','));
            setDraft(trailing.trimStart());
            return;
        }
        setDraft(text);
    };

    const removeAt = (index: number) => {
        onChange(skills.filter((_, i) => i !== index));
    };

    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: muted }]}>{label}</Text>
            {!!hint && <Text style={[styles.hint, { color: muted }]}>{hint}</Text>}

            <TextInput
                style={[
                    styles.input,
                    {
                        backgroundColor: focused ? focusBg : fieldBg,
                        borderColor: focused ? colors.primary : fieldBorder,
                        borderWidth: focused ? 2 : 1,
                        color: colors.foreground,
                    },
                ]}
                value={draft}
                onChangeText={handleChangeText}
                onSubmitEditing={() => commit(draft)}
                onBlur={() => {
                    setFocused(false);
                    commit(draft);
                }}
                onFocus={() => setFocused(true)}
                placeholder={placeholder}
                placeholderTextColor={muted}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                blurOnSubmit={false}
                accessibilityLabel={label}
            />

            {skills.length > 0 && (
                <View style={styles.chipWrap}>
                    {skills.map((skill, index) => (
                        <AnimatedPressable
                            key={`${skill}-${index}`}
                            style={[
                                styles.chip,
                                { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}44` },
                            ]}
                            scaleTo={0.93}
                            onPress={() => removeAt(index)}
                            accessibilityRole="button"
                            accessibilityLabel={t('wizard.skills.remove', { skill })}
                        >
                            <View style={styles.chipInner}>
                                <Text style={[styles.chipText, { color: colors.primary }]} numberOfLines={1}>
                                    {skill}
                                </Text>
                                <X size={13} color={colors.primary} strokeWidth={2.5} />
                            </View>
                        </AnimatedPressable>
                    ))}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: SPACE.field,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 7,
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
        fontSize: 15,
    },
    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
    },
    chip: {
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        maxWidth: '100%',
    },
    chipInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '600',
        flexShrink: 1,
    },
});
