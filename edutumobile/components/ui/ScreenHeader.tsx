import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";
import { ChevronLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../components/context/ThemeContext";

interface ScreenHeaderProps {
    title: string;
    subtitle?: string;
    showBack?: boolean;
    flat?: boolean;
    alignLeading?: boolean;
    onBack?: () => void;
    right?: React.ReactNode;
    titleAccessory?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, showBack = false, flat = false, alignLeading = false, onBack, right, titleAccessory }: ScreenHeaderProps) {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const BackButton = flat ? AnimatedPressable : TouchableOpacity;

    return (
        <View style={[styles.container, {
            borderBottomColor: flat ? colors.border : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            paddingTop: 12,
            paddingBottom: 12,
            backgroundColor: colors.background,
        }]}>
            {/* Back Button - positioned close to title */}
            {showBack && (
                <BackButton
                    onPress={() => {
                        if (onBack) {
                            onBack();
                            return;
                        }

                        if (router.canGoBack()) {
                            router.back();
                            return;
                        }

                        router.replace('/(app)');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    style={[styles.backBtn, {
                        backgroundColor: flat ? undefined : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        marginRight: 8,
                    }]}
                    {...(flat ? { focusColor: colors.accent } : { activeOpacity: 0.7 })}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <ChevronLeft
                        size={22}
                        color={flat ? colors.foreground : isDark ? '#FFFFFF' : '#1E293B'}
                        strokeWidth={2.5}
                    />
                </BackButton>
            )}

            {/* Spacer when no back button - keeps title position consistent */}
            {!showBack && !alignLeading ? <View style={styles.spacer} /> : null}

            {titleAccessory ? <View style={styles.titleAccessory}>{titleAccessory}</View> : null}

            <View style={styles.titleContainer}>
                <Text
                    style={[
                        styles.title,
                        {
                            color: colors.foreground,
                            fontWeight: flat ? '500' : '700',
                        }
                    ]}
                    numberOfLines={1}
                >
                    {title}
                </Text>
                {subtitle && (
                    <Text style={[styles.subtitle, { color: flat ? colors.textSecondary : isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={1}>
                        {subtitle}
                    </Text>
                )}
            </View>

            {right ? <View style={styles.rightContainer}>{right}</View> : <View style={styles.spacer} />}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    spacer: {
        width: 36,
    },
    titleContainer: {
        flex: 1,
        paddingHorizontal: 4,
    },
    titleAccessory: {
        marginRight: 8,
    },
    title: {
        fontSize: 17,
        letterSpacing: -0.3,
    },
    subtitle: {
        fontSize: 13,
        marginTop: 2,
    },
    rightContainer: {
        marginLeft: 8,
    },
});
