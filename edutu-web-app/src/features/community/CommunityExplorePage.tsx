import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { BookOpen, Briefcase, GraduationCap, RefreshCw, Search } from "lucide-react";
import Seo from "../../components/Seo";
import { CommunityApi, isCommunityApiError } from "./api";
import type { GroupWithMembership } from "./types";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";
import GroupCard from "./components/GroupCard";

type Focus = "all" | "scholarships" | "careers" | "study";
const filters = [
  { id: "all" as const, label: "All", icon: Search },
  { id: "scholarships" as const, label: "Scholarships", icon: GraduationCap },
  { id: "careers" as const, label: "Careers", icon: Briefcase },
  { id: "study" as const, label: "Study help", icon: BookOpen },
];

export default function CommunityExplorePage() {
  const { getToken } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const [rows, setRows] = useState<GroupWithMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<Focus>("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.listGroups({ limit: 50 });
      setRows(result.filter(({ group }) => !group.archivedAt));
    } catch (caught) {
      setError(isCommunityApiError(caught) ? caught.message : "We couldn't load communities right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter(({ group }) => {
      const text = `${group.name} ${group.description ?? ""}`.toLowerCase();
      const matchesQuery = !normalized || text.includes(normalized);
      const matchesFocus =
        focus === "all" ||
        (focus === "scholarships" && /scholar|funding|fellowship|erasmus/i.test(text)) ||
        (focus === "careers" && /career|job|intern|leadership|work/i.test(text)) ||
        (focus === "study" && /study|application|sop|essay|review|stem|ielts/i.test(text));
      return matchesQuery && matchesFocus;
    });
  }, [focus, query, rows]);

  return (
    <>
      <Seo
        title="Explore communities | Edutu"
        description="Explore Edutu communities for scholarships, careers and application support."
        path="/app/community/explore"
        noindex
      />
      <CommunityProductShell
        title="Explore communities"
        description="Find people preparing for the same scholarships, careers and next steps as you."
        action={
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void load();
            }}
            disabled={refreshing}
            aria-label="Refresh communities"
            className="hidden h-11 items-center gap-2 rounded-xl border border-[#f4dcc9] bg-white px-3 text-sm font-bold text-[#796f6b] transition hover:text-[#f45b16] disabled:opacity-60 dark:border-subtle dark:bg-surface-layer dark:text-text-secondary sm:inline-flex"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      >
        <div className="mb-5 space-y-3">
          <label className="relative block">
            <span className="sr-only">Search communities</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#a68d83]" size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search communities"
              className="h-13 min-h-[52px] w-full rounded-2xl border border-[#f4dcc9] bg-white pl-12 pr-4 text-base text-[#4a170d] shadow-sm outline-none transition placeholder:text-[#a68d83] focus:border-[#f45b16]/60 focus:ring-2 focus:ring-[#f45b16]/15 dark:border-subtle dark:bg-surface-layer dark:text-text-primary"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filters.map(({ id, label, icon: Icon }) => {
              const active = focus === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFocus(id)}
                  aria-pressed={active}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-bold transition ${
                    active
                      ? "border-[#f45b16] bg-[#f45b16] text-white"
                      : "border-[#f4dcc9] bg-white text-[#4a170d] hover:border-[#f45b16]/35 dark:border-subtle dark:bg-surface-layer dark:text-text-primary"
                  }`}
                >
                  <Icon size={16} /> {label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <CommunityState kind="loading" />
        ) : error && rows.length === 0 ? (
          <CommunityState kind="error" body={error} actionLabel="Try again" onAction={() => void load()} />
        ) : visible.length === 0 ? (
          <CommunityState
            kind="empty"
            title="No communities match that yet"
            body="Try a broader search or another focus. New groups appear as members create them."
            actionLabel="Show all"
            onAction={() => {
              setQuery("");
              setFocus("all");
            }}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((row) => <GroupCard key={row.group.id} row={row} />)}
          </div>
        )}
      </CommunityProductShell>
    </>
  );
}
