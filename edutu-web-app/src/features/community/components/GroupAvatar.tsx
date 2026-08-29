import { UsersRound } from "lucide-react";
import { cn } from "../../../lib/cn";

export default function GroupAvatar({
  emoji,
  name,
  size = "md",
}: {
  emoji?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const classes = {
    sm: "h-10 w-10 rounded-xl text-lg",
    md: "h-12 w-12 rounded-2xl text-xl",
    lg: "h-16 w-16 rounded-[20px] text-2xl",
    xl: "h-[5.5rem] w-[5.5rem] rounded-2xl text-3xl",
  }[size];

  return (
    <span
      aria-label={`${name} community`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-[#f4dcc9] bg-[#fcead5] shadow-sm dark:border-subtle dark:bg-surface-elevated",
        classes,
      )}
    >
      {emoji?.trim() ? emoji : <UsersRound size={size === "xl" ? 30 : size === "lg" ? 25 : 20} className="text-[#f45b16] dark:text-brand" />}
    </span>
  );
}
