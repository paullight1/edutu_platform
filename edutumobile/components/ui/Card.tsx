import { View, type ViewProps, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

interface CardProps extends ViewProps {
    variant?: "glass" | "solid" | "elevated";
}

export function Card({ children, variant = "solid", style, ...props }: CardProps) {
    const { isDark } = useTheme();
    
    const getVariantStyle = () => {
        if (isDark) {
            switch (variant) {
                case "glass":
                    return { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.15)' };
                case "elevated":
                    return { backgroundColor: '#334155', borderColor: '#475569' };
                case "solid":
                default:
                    return { backgroundColor: '#1e293b', borderColor: '#334155' };
            }
        } else {
            switch (variant) {
                case "glass":
                    return { backgroundColor: 'rgba(255,255,255,0.5)', borderColor: '#e2e8f0' };
                case "elevated":
                    return { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' };
                case "solid":
                default:
                    return { backgroundColor: '#ffffff', borderColor: '#e2e8f0' };
            }
        }
    };

    return (
        <View style={[styles.card, getVariantStyle(), style]} {...props}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
    },
});
