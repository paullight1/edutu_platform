import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  MessageCircle,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import PublicHeader from "../../components/PublicHeader";
import SiteFooter from "../../components/SiteFooter";
import Seo from "../../components/Seo";
import { fetchPublicGroup } from "./publicApi";
import type { PublicCommunityGroupSummary } from "./types";
import { publicDescription } from "./format";
import { toAbsoluteUrl } from "../../lib/publicSite";
import { getCommunityFallbackCover } from "./communityCover";

export default function PublicCommunityGroupPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { isSignedIn } = useAuth();
  const [group, setGroup] = useState<PublicCommunityGroupSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void fetchPublicGroup(slug)
      .then((row) => {
        if (active) setGroup(row);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const description = group
    ? publicDescription(
        group.description,
        `Join ${group.name} on Edutu to discuss applications, opportunities and practical next steps with other learners.`,
      )
    : "Public Edutu community group.";
  const canonicalPath = `/community/groups/${encodeURIComponent(slug)}`;
  const jsonLd = useMemo(
    () =>
      group
        ? [
            {
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: `${group.name} Community`,
              description,
              url: toAbsoluteUrl(canonicalPath),
              isPartOf: {
                "@type": "WebPage",
                name: "Edutu Community",
                url: toAbsoluteUrl("/community"),
              },
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Community",
                  item: toAbsoluteUrl("/community"),
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: group.name,
                  item: toAbsoluteUrl(canonicalPath),
                },
              ],
            },
          ]
        : undefined,
    [canonicalPath, description, group],
  );

  const joinPath = group
    ? isSignedIn
      ? `/app/community/groups/${group.id}`
      : `/auth?mode=sign-up&redirect=${encodeURIComponent(`/app/community/groups/${group.id}`)}`
    : "/community";

  return (
    <div className="min-h-[100dvh] bg-[#fffaf4] text-[#39180f] dark:bg-surface-body dark:text-text-primary">
      <Seo
        title={group ? `${group.name} Community | Edutu` : "Community | Edutu"}
        description={description}
        path={canonicalPath}
        noindex={error}
        jsonLd={jsonLd}
      />
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <Link
          to="/community"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#765e55] transition hover:text-[#d94b0f] dark:text-text-secondary dark:hover:text-brand"
        >
          <ArrowLeft size={16} className="rtl:rotate-180" /> Back to community
        </Link>

        {loading ? (
          <div className="mt-6 animate-pulse rounded-[30px] border border-[#efd9ca] bg-white p-6 dark:border-subtle dark:bg-surface-layer sm:p-9">
            <div className="h-16 w-16 rounded-2xl bg-[#f6e6dc] dark:bg-surface-elevated" />
            <div className="mt-5 h-10 w-2/3 rounded bg-[#f6e6dc] dark:bg-surface-elevated" />
            <div className="mt-4 h-5 w-full rounded bg-[#f6e6dc] dark:bg-surface-elevated" />
            <div className="mt-2 h-5 w-3/4 rounded bg-[#f6e6dc] dark:bg-surface-elevated" />
          </div>
        ) : error || !group ? (
          <section className="mt-6 rounded-[30px] border border-[#efd9ca] bg-white p-8 text-center shadow-sm dark:border-subtle dark:bg-surface-layer sm:p-12">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand">
              <ShieldCheck size={24} />
            </span>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-[-0.04em]">
              This community is not publicly available
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#765e55] dark:text-text-secondary">
              It may be private, archived, closed, or no longer exist. Edutu
              does not reveal which case applies to anonymous visitors.
            </p>
            <Link
              to="/community"
              className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#f45b16] px-4 text-sm font-bold text-white"
            >
              Explore public communities
            </Link>
          </section>
        ) : (
          <>
            <article className="mt-6 overflow-hidden rounded-[32px] border border-[#efd9ca] bg-white shadow-[0_30px_80px_-55px_rgba(74,23,13,.6)] dark:border-subtle dark:bg-surface-layer">
              <div className="relative overflow-hidden bg-[#4a170d] px-6 py-8 text-white sm:px-9 sm:py-10">
                <img
                  src={getCommunityFallbackCover(
                    `${group.name} ${group.description ?? ""}`,
                  )}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-40"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#2d120c]/95 via-[#4a170d]/80 to-[#4a170d]/35"
                />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-orange-200">
                      Public Edutu community
                    </p>
                    <h1 className="mt-2 max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-5xl">
                      {group.name}
                    </h1>
                    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-white/75">
                      <span className="inline-flex items-center gap-1.5">
                        <UsersRound size={16} />{" "}
                        {group.memberCount.toLocaleString()} members
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MessageCircle size={16} />{" "}
                        {group.messageCount.toLocaleString()} posts
                      </span>
                      {group.expiresAt ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarClock size={16} /> Active until{" "}
                          {new Date(group.expiresAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] text-[#39180f] dark:text-text-primary">
                    What this community is for
                  </h2>
                  <p className="mt-4 whitespace-pre-wrap text-base leading-8 text-[#765e55] dark:text-text-secondary">
                    {description}
                  </p>
                  <div className="mt-7 rounded-[22px] border border-[#efd9ca] bg-[#fff9f1] p-4 dark:border-subtle dark:bg-surface-elevated">
                    <p className="text-sm font-bold text-[#4a170d] dark:text-text-primary">
                      Public summary only
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#765e55] dark:text-text-secondary">
                      Messages, member identities, request answers, private
                      resources and moderation data are never exposed on this
                      public page. Sign in and follow the group’s membership
                      rules to participate.
                    </p>
                  </div>
                </div>

                <aside className="rounded-[24px] border border-[#efd9ca] bg-[#fff9f1] p-5 dark:border-subtle dark:bg-surface-elevated">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#d94b0f] dark:text-brand">
                    Join the conversation
                  </p>
                  <h2 className="mt-2 font-display text-xl font-semibold tracking-[-0.025em] text-[#39180f] dark:text-text-primary">
                    Open the real community room
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#765e55] dark:text-text-secondary">
                    Inside Edutu you can see the current conversation, resources
                    and group membership state.
                  </p>
                  <Link
                    to={joinPath}
                    className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#f45b16] px-4 text-sm font-extrabold text-white shadow-sm"
                  >
                    {isSignedIn ? "Open community" : "Sign up to join"}
                    <ArrowRight size={17} className="rtl:rotate-180" />
                  </Link>
                </aside>
              </div>
            </article>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
