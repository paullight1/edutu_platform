import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import Seo from "../../components/Seo";
import CommunityProtectedImage from "../../components/CommunityProtectedImage";
import { CommunityApi, isCommunityApiError } from "./api";
import type {
  CommunityDiscoveryResponse,
  GroupWithMembership,
} from "./types";
import { getCommunityFallbackCover } from "./communityCover";
import { formatCommunityCount } from "./format";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";

type Focus = "all" | "scholarships" | "careers" | "study";
const filters = [
  { id: "all" as const, label: "All" },
  { id: "scholarships" as const, label: "Scholarships" },
  { id: "careers" as const, label: "Careers" },
  { id: "study" as const, label: "Study help" },
];

export default function CommunityExplorePage() {
  const { getToken } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const [discovery, setDiscovery] = useState<CommunityDiscoveryResponse>({
    trending: [],
    communities: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<Focus>("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.getDiscovery(50);
      setDiscovery({
        trending: result.trending.filter(({ group }) => !group.archivedAt),
        communities: result.communities.filter(({ group }) => !group.archivedAt),
      });
    } catch (caught) {
      setError(
        isCommunityApiError(caught)
          ? caught.message
          : "We couldn't load communities right now.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const matchesFilters = useCallback((row: GroupWithMembership) => {
    const normalized = query.trim().toLowerCase();
    const { group } = row;
      const text = `${group.name} ${group.description ?? ""}`.toLowerCase();
      const matchesQuery = !normalized || text.includes(normalized);
      const matchesFocus =
        focus === "all" ||
        (focus === "scholarships" &&
          /scholar|funding|fellowship|erasmus/i.test(text)) ||
        (focus === "careers" &&
          /career|job|intern|leadership|work/i.test(text)) ||
        (focus === "study" &&
          /study|application|sop|essay|review|stem|ielts/i.test(text));
      return matchesQuery && matchesFocus;
  }, [focus, query]);

  const trending = useMemo(
    () => discovery.trending.filter(matchesFilters),
    [discovery.trending, matchesFilters],
  );
  const moreCommunities = useMemo(
    () => discovery.communities.filter(matchesFilters),
    [discovery.communities, matchesFilters],
  );
  const totalRows = discovery.trending.length + discovery.communities.length;
  const visibleCount = trending.length + moreCommunities.length;

  return (
    <>
      <Seo
        title="Explore communities | Edutu"
        description="Explore Edutu communities for scholarships, careers and application support."
        path="/app/community/explore"
        noindex
      />
      <CommunityProductShell title="Communities">
        <div className="pb-2 pt-4">
          <label className="relative block">
            <span className="sr-only">Search communities</span>
            <Search
              className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-[#76706c]"
              size={20}
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search communities"
              className="min-h-[52px] w-full rounded-full border border-transparent bg-[#f3f1ef] ps-12 pe-4 text-base text-[#17120f] outline-none transition placeholder:text-[#817a76] focus:border-[#f45b16]/35 focus:bg-white focus:ring-2 focus:ring-[#f45b16]/12 dark:bg-surface-elevated dark:text-text-primary dark:focus:bg-surface-layer"
            />
          </label>
          <div
            role="tablist"
            aria-label="Community focus"
            className="mt-3 grid h-11 grid-cols-4 border-b border-[#ded9d5] dark:border-subtle"
          >
            {filters.map(({ id, label }) => {
              const active = focus === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFocus(id)}
                  className={`relative min-w-0 px-1 text-xs font-semibold transition active:scale-[0.98] sm:text-sm ${
                    active
                      ? "text-[#17120f] dark:text-text-primary"
                      : "text-[#76706c] hover:text-[#f45b16] dark:text-text-secondary"
                  }`}
                >
                  <span className="block truncate">{label}</span>
                  {active ? (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#f45b16] dark:bg-brand" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div
            className="mt-5 grid grid-cols-2 gap-3"
            aria-label="Loading communities"
          >
            {[0, 1].map((item) => (
              <div
                key={item}
                className="aspect-[3/4] min-w-0 animate-pulse rounded-2xl bg-[#f3f1ef] dark:bg-surface-elevated"
              />
            ))}
          </div>
        ) : error && totalRows === 0 ? (
          <CommunityState
            kind="error"
            body={error}
            actionLabel="Try again"
            onAction={() => void load()}
          />
        ) : visibleCount === 0 ? (
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
          <div className="pb-5">
            {trending.length > 0 ? <section aria-labelledby="trending-communities" className="pt-5">
              <h2
                id="trending-communities"
                className="font-display text-xl font-bold tracking-[-0.025em] text-[#17120f] dark:text-text-primary"
              >
                Trending
              </h2>
              <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
                {trending.map(({ group, membership }) => {
                  const fallback = getCommunityFallbackCover(
                    `${group.name} ${group.description ?? ""}`,
                  );
                  return (
                    <Link
                      key={group.id}
                      to={`/app/community/groups/${group.id}`}
                      className="group flex w-[76vw] max-w-[18rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[#ece8e5] bg-white transition hover:border-[#f45b16]/30 dark:border-subtle dark:bg-surface-layer sm:w-auto sm:max-w-none"
                      aria-label={`Open ${group.name}`}
                    >
                      <span className="block aspect-[4/3] overflow-hidden bg-[#f3f1ef]">
                        {group.coverImageResourceUrl ? (
                          <CommunityProtectedImage
                            resourceUrl={group.coverImageResourceUrl}
                            alt={`${group.name} cover`}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <img
                            src={fallback}
                            alt={`${group.name} community`}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          />
                        )}
                      </span>
                      <span className="flex flex-1 flex-col p-3 sm:p-4">
                        <span className="flex items-start gap-1.5">
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 font-display text-base font-bold leading-5 tracking-[-0.02em] text-[#17120f] dark:text-text-primary sm:text-lg">
                              {group.name}
                            </span>
                            <span className="mt-1 block text-[11px] font-semibold leading-4 text-[#817a76] dark:text-text-muted sm:text-xs">
                              {formatCommunityCount(group.memberCount)} members
                              · {formatCommunityCount(group.messageCount)} posts
                            </span>
                          </span>
                          <ArrowRight
                            size={16}
                            className="mt-0.5 shrink-0 text-[#b5aba5] rtl:rotate-180"
                          />
                        </span>
                        {membership?.status === "active" ? (
                          <span className="mt-auto block pt-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                            Joined
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section> : null}

            {moreCommunities.length > 0 ? (
              <section aria-labelledby="more-communities" className="pt-6">
                <h2
                  id="more-communities"
                  className="font-display text-lg font-bold tracking-[-0.02em] text-[#17120f] dark:text-text-primary"
                >
                  More communities
                </h2>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {moreCommunities.map(({ group, membership }) => {
                    const fallback = getCommunityFallbackCover(
                      `${group.name} ${group.description ?? ""}`,
                    );
                    return (
                      <Link
                        key={group.id}
                        to={`/app/community/groups/${group.id}`}
                        className="group flex min-w-0 items-center gap-3 rounded-2xl border border-[#ece8e5] bg-white p-2.5 transition hover:border-[#f45b16]/30 active:scale-[0.99] dark:border-subtle dark:bg-surface-layer"
                        aria-label={`Open ${group.name}`}
                      >
                        <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f3f1ef] dark:bg-surface-elevated">
                          {group.coverImageResourceUrl ? (
                            <CommunityProtectedImage
                              resourceUrl={group.coverImageResourceUrl}
                              alt={`${group.name} cover`}
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                            />
                          ) : (
                            <img
                              src={fallback}
                              alt={`${group.name} community`}
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1 font-display text-sm font-bold tracking-[-0.015em] text-[#17120f] dark:text-text-primary">
                            {group.name}
                          </span>
                          <span className="mt-1 block text-[11px] font-semibold leading-4 text-[#817a76] dark:text-text-muted">
                            {formatCommunityCount(group.memberCount)} members ·{" "}
                            {formatCommunityCount(group.messageCount)} posts
                          </span>
                          {membership?.status === "active" ? (
                            <span className="mt-1 block text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                              Joined
                            </span>
                          ) : null}
                        </span>
                        <ArrowRight
                          size={16}
                          className="shrink-0 text-[#b5aba5] rtl:rotate-180"
                        />
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </CommunityProductShell>
    </>
  );
}
