import { View, Text, type ViewProps } from "react-native";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: string[]) {
    return twMerge(clsx(inputs));
}

interface BadgeProps extends ViewProps {
    label: string;
    variant?: "blue" | "green" | "yellow" | "red" | "purple" | "gray";
    size?: "sm" | "md";
}

export function Badge({ label, variant = "blue", size = "md", className, ...props }: BadgeProps) {
    const variants = {
        blue:   "bg-blue-500/20 border border-blue-500/30",
        green:  "bg-green-500/20 border border-green-500/30",
        yellow: "bg-yellow-500/20 border border-yellow-500/30",
        red:    "bg-red-500/20 border border-red-500/30",
        purple: "bg-blue-500/20 border border-blue-500/30",
        gray:   "bg-slate-700 border border-slate-600",
    };

    const textVariants = {
        blue:   "text-blue-400",
        green:  "text-green-400",
        yellow: "text-yellow-400",
        red:    "text-red-400",
        purple: "text-blue-400",
        gray:   "text-slate-300",
    };

    const sizes = {
        sm: "px-2 py-0.5 rounded-lg",
        md: "px-3 py-1 rounded-xl",
    };

    const textSizes = {
        sm: "text-[10px] font-semibold",
        md: "text-xs font-semibold",
    };

    return (
        <View className={cn("flex-row items-center", variants[variant], sizes[size], className ?? "")} {...props}>
            <Text className={cn(textVariants[variant], textSizes[size])}>
                {label}
            </Text>
        </View>
    );
}
