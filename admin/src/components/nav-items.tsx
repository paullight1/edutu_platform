import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Target,
  Inbox,
  CalendarDays,
  BookOpen,
  FileText,
  Users,
  ShieldCheck,
  Smartphone,
  Megaphone,
  Flag,
  LayoutTemplate,
  ShieldAlert,
  BellRing,
  Banknote,
  Receipt,
  Tag,
  Mic,
  Cpu,
  Radio,
  Activity,
  SlidersHorizontal,
  FolderOpen,
  Heart,
} from "lucide-react";

export type NavLeaf = { label: string; to: string; icon?: LucideIcon };
export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
};
export type NavEntry =
  | ({ kind: "leaf" } & NavLeaf & { icon: LucideIcon })
  | ({ kind: "group" } & NavGroup);

export const NAV: NavEntry[] = [
  { kind: "leaf", label: "Dashboard", to: "/", icon: LayoutDashboard },
  {
    kind: "group",
    id: "content",
    label: "Content",
    icon: FolderOpen,
    children: [
      { label: "Opportunities", to: "/opportunities", icon: Target },
      { label: "Submissions", to: "/submissions", icon: Inbox },
      { label: "Events", to: "/events", icon: CalendarDays },
      { label: "Roadmaps", to: "/roadmaps", icon: BookOpen },
      { label: "Blog", to: "/blog", icon: FileText },
      { label: "Impact Stories", to: "/impact-stories", icon: Heart },
    ],
  },
  {
    kind: "group",
    id: "people",
    label: "People",
    icon: Users,
    children: [
      { label: "Users", to: "/users", icon: Users },
      { label: "Creators", to: "/creators", icon: ShieldCheck },
      { label: "Community Safety", to: "/community-safety", icon: ShieldAlert },
    ],
  },
  {
    kind: "group",
    id: "app",
    label: "App & Engagement",
    icon: Smartphone,
    children: [
      { label: "Home Blocks", to: "/app/home", icon: LayoutTemplate },
      { label: "Campaigns", to: "/app/campaigns", icon: Megaphone },
      { label: "Feature Flags", to: "/app/flags", icon: Flag },
      { label: "Widgets", to: "/app/widgets", icon: Radio },
      { label: "App Control", to: "/app/control", icon: ShieldAlert },
      { label: "Notifications", to: "/notifications", icon: BellRing },
    ],
  },
  {
    kind: "group",
    id: "money",
    label: "Monetization",
    icon: Banknote,
    children: [
      { label: "Overview", to: "/monetization", icon: Banknote },
      { label: "Pricing", to: "/monetization/pricing", icon: Tag },
      { label: "Transactions", to: "/monetization/transactions", icon: Receipt },
      { label: "Usage (Voice AI)", to: "/monetization/usage", icon: Mic },
    ],
  },
  {
    kind: "group",
    id: "engine",
    label: "Engine",
    icon: Cpu,
    children: [
      { label: "Sources", to: "/engine", icon: Cpu },
      { label: "Live Runs", to: "/engine/runs", icon: Radio },
      { label: "Status", to: "/engine/status", icon: Activity },
    ],
  },
  { kind: "leaf", label: "Settings", to: "/settings", icon: SlidersHorizontal },
];

// Longest-prefix match so "/monetization/pricing" beats "/monetization".
export function groupForPath(pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const entry of NAV) {
    if (entry.kind !== "group") continue;
    for (const child of entry.children) {
      const hit =
        child.to === "/"
          ? pathname === "/"
          : pathname === child.to || pathname.startsWith(child.to + "/");
      if (hit && (!best || child.to.length > best.len)) {
        best = { id: entry.id, len: child.to.length };
      }
    }
  }
  return best?.id ?? null;
}
