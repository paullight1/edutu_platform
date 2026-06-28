import { View, Text, Image, type ViewProps, StyleSheet } from "react-native";

interface AvatarProps extends ViewProps {
    name?: string;
    imageUrl?: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
}

const SIZE_MAP = {
    xs: { size: 24, fontSize: 8, radius: 8 },
    sm: { size: 32, fontSize: 11, radius: 12 },
    md: { size: 40, fontSize: 14, radius: 16 },
    lg: { size: 56, fontSize: 16, radius: 16 },
    xl: { size: 80, fontSize: 20, radius: 24 },
};

export function Avatar({ name = "?", imageUrl, size = "md", style, ...props }: AvatarProps) {
    const initials = name
        .split(" ")
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase() ?? "")
        .join("");

    const { size: dim, fontSize, radius } = SIZE_MAP[size];

    return (
        <View
            style={[
                styles.container,
                { width: dim, height: dim, borderRadius: radius },
                style
            ]}
            {...props}
        >
            {imageUrl ? (
                <Image
                    source={{ uri: imageUrl }}
                    style={styles.image}
                    resizeMode="cover"
                />
            ) : (
                <Text style={[styles.text, { fontSize }]}>
                    {initials || "?"}
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#4F46E5',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    text: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
});
