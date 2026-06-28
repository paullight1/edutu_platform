import { View, ViewProps } from "react-native";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface GlassViewProps extends ViewProps {
    className?: string;
    intensity?: number;
}

export function GlassView({ className, children, ...props }: GlassViewProps) {
    return (
        <View
            className={cn(
                "bg-white/10 border border-white/20 rounded-2xl overflow-hidden",
                className
            )}
            {...props}
        >
            {children}
        </View>
    );
}
