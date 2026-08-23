import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { BookOpen, Edit3 } from "lucide-react";
import Seo from "../../components/Seo";
import { useAuth as useAppAuth } from "../../hooks/useAuth";
import { CommunityApi } from "./api";
import type { CommunityProfileContentItem, CommunityResourceCursor } from "./types";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";
import { formatCommunityTime } from "./format";

type Section = "posts" | "resources";

export default function CommunityProfilePage() {
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const [items, setItems] = useState<CommunityProfileContentItem[]>([]);
  const [cursor, setCursor] = useState<CommunityResourceCursor | null>(null);
  const [section, setSection] = useState<Section>("posts");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await api.fetchOwnContent(null, 30);
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your community activity could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.fetchOwnContent(cursor, 30);
      setItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        page.items.forEach((item) => byId.set(item.id, item));
        return [...byId.values()];
      });
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "More community activity could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };

  const resources = useMemo(
    () => items.flatMap((item) => item.resources.map((resource) => ({ ...resource, itemId: item.id, storyTitle: item.title }))),
    [items],
  );
  const name = user?.name || "Edutu learner";
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "E";

  return (
    <>
      <Seo title={`${name} — Community profile | Edutu`} description="Your Edutu community posts and resources." path="/app/community/profile" noindex />
      <CommunityProductShell title="Community profile" description="Your identity and the useful things you have shared in Edutu communities.">
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[26px] border border-[#f4dcc9] bg-white p-6 text-center shadow-sm dark:border-subtle dark:bg-surface-layer sm:p-8">
            <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#fff9f1] bg-[#fcead5] text-2xl font-extrabold text-[#8f3f1b] shadow-sm dark:border-surface-body dark:bg-surface-elevated dark:text-text-secondary">{initials}</span>
            <h1 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-[#4a170d] dark:text-text-primary">{name}</h1>
            <p className="mt-1 text-sm text-[#796f6b] dark:text-text-secondary">{user?.email || "Edutu community member"}</p>
            <Link to="/app/profile" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#f4dcc9] px-4 text-sm font-bold text-[#6b4538] transition hover:border-[#f45b16]/35 hover:text-[#f45b16] dark:border-subtle dark:text-text-secondary"><Edit3 size={16} /> Edit profile</Link>
          </section>

          <div className="mt-5 grid grid-cols-2 rounded-2xl border border-[#f4dcc9] bg-white p-1 dark:border-subtle dark:bg-surface-layer" role="tablist" aria-label="Community profile content">
            {(["posts", "resources"] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={section === item} onClick={() => setSection(item)} className={`min-h-11 rounded-xl text-sm font-bold capitalize ${section === item ? "bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand" : "text-[#796f6b] dark:text-text-secondary"}`}>{item}</button>
            ))}
          </div>

          {error ? <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p> : null}
          <section className="mt-4">
            {loading ? (
              <CommunityState kind="loading" />
            ) : section === "posts" ? (
              items.length === 0 ? <CommunityState kind="empty" title="No community posts yet" body="Posts that become durable community profile content will appear here." /> : (
                <div className="overflow-hidden rounded-[22px] border border-[#f4dcc9] bg-white dark:border-subtle dark:bg-surface-layer">
                  {items.map((item, index) => (
                    <article key={item.id} className={`flex min-h-20 items-center gap-3 px-4 py-3 ${index !== items.length - 1 ? "border-b border-[#f4dcc9] dark:border-subtle" : ""}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fcead5] text-sm font-extrabold text-[#f45b16] dark:bg-brand/10 dark:text-brand">{item.category.slice(0, 1).toUpperCase()}</span>
                      <div className="min-w-0 flex-1"><h2 className="line-clamp-2 text-sm font-bold text-[#4a170d] dark:text-text-primary">{item.title}</h2><p className="mt-1 text-xs text-[#796f6b] dark:text-text-secondary">{item.category} · {item.likes} likes · {formatCommunityTime(item.createdAt)}</p></div>
                    </article>
                  ))}
                </div>
              )
            ) : resources.length === 0 ? (
              <CommunityState kind="empty" title="No saved resources yet" body="Resources tied to your community content will appear here." />
            ) : (
              <div className="overflow-hidden rounded-[22px] border border-[#f4dcc9] bg-white dark:border-subtle dark:bg-surface-layer">
                {resources.map((resource, index) => (
                  <div key={`${resource.itemId}:${resource.id}`} className={`flex min-h-20 items-center gap-3 px-4 py-3 ${index !== resources.length - 1 ? "border-b border-[#f4dcc9] dark:border-subtle" : ""}`}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"><BookOpen size={17} /></span>
                    <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold text-[#4a170d] dark:text-text-primary">{resource.title}</p><p className="mt-1 truncate text-xs text-[#796f6b] dark:text-text-secondary">{resource.provider || resource.type || resource.storyTitle}</p></div>
                  </div>
                ))}
              </div>
            )}
            {cursor ? <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="mx-auto mt-4 block min-h-11 rounded-xl border border-[#f4dcc9] bg-white px-4 text-sm font-bold text-[#f45b16] disabled:opacity-50 dark:border-subtle dark:bg-surface-layer">{loadingMore ? "Loading…" : "Load more"}</button> : null}
          </section>
        </div>
      </CommunityProductShell>
    </>
  );
}
