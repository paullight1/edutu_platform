import { View, type ViewProps } from "react-native";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../context/ThemeContext";

function cn(...inputs: string[]) {
    return twMerge(clsx(inputs));
}

interface ProgressBarProps extends ViewProps {
    /** 0–100 - accepts both 'value' and 'progress' for compatibility */
    value?: number;
    progress?: number;
    variant?: "blue" | "green" | "yellow" | "purple";
    size?: "sm" | "md" | "lg";
    className?: string;
}

export function ProgressBar({ value, progress, variant = "blue", size = "md", className, ...props }: ProgressBarProps) {
    const { isDark } = useTheme();
    const rawValue = value ?? progress ?? 0;
    const clamped = Math.min(100, Math.max(0, rawValue));

    const trackSizes = { sm: "h-1", md: "h-2", lg: "h-3" };
    const fillColors = {
        blue:   "bg-blue-500",
        green:  "bg-green-500",
        yellow: "bg-yellow-500",
        purple: "bg-blue-500",
    };
    const trackColor = isDark ? "bg-slate-700" : "bg-slate-200";

    return (
        <View
            className={cn("w-full rounded-full overflow-hidden", trackSizes[size], trackColor, className ?? "")}
            {...props}
        >
            <View
                className={cn("h-full rounded-full", fillColors[variant])}
                style={{ width: `${clamped}%` }}
            />
        </View>
    );
}