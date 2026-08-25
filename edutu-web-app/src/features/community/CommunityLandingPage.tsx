import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import PublicHeader from "../../components/PublicHeader";
import SiteFooter from "../../components/SiteFooter";
import Seo from "../../components/Seo";
import { fetchPublicGroups } from "./publicApi";
import type { PublicCommunityGroupSummary } from "./types";
import { formatCommunityTime } from "./format";

const paths = [
  {
    icon: Search,
    title: "Find your people",
    body: "Explore focused communities around scholarships, internships, careers and application work.",
  },
  {
    icon: MessageCircle,
    title: "Ask useful questions",
    body: "Talk to people preparing for the same next step instead of searching alone across scattered chats.",
  },
  {
    icon: BookOpen,
    title: "Keep resources findable",
    body: "Images and PDFs shared in a group collect in a dedicated Resources view rather than disappearing in the scroll.",
  },
];

export default function CommunityLandingPage() {
  const { isSignedIn } = useAuth();
  const [groups, setGroups] = useState<PublicCommunityGroupSummary[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchPublicGroups(6)
      .then((rows) => {
        if (active) setGroups(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingGroups(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const productPath = isSignedIn
    ? "/app/community/explore"
    : "/auth?mode=sign-up&redirect=%2Fapp%2Fcommunity%2Fexplore";

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#fffaf4] text-[#3f1d14] dark:bg-surface-body dark:text-text-primary">
      <Seo
        title="Scholarship & Career Community for African Learners | Edutu"
        description="Join Edutu communities where learners discuss scholarships, fellowships, internships, applications and career opportunities together."
        path="/community"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Edutu Community",
            description:
              "Focused communities for learners discovering and applying to scholarships, fellowships, internships and career opportunities.",
            url: "https://www.edutu.org/community",
          },
        ]}
      />
      <PublicHeader />

      <main>
        <section className="relative overflow-hidden border-b border-[#f2dfd2] px-4 pb-16 pt-16 dark:border-subtle sm:px-6 sm:pb-20 sm:pt-20 lg:px-8">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(244,91,22,.12),transparent_27%),radial-gradient(circle_at_85%_25%,rgba(37,99,235,.08),transparent_28%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_.95fr] lg:gap-16">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#f2d2bd] bg-white/75 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.15em] text-[#d94b0f] shadow-sm dark:border-subtle dark:bg-surface-layer dark:text-brand">
                <Sparkles size={14} /> Edutu Community
              </span>
              <h1 className="mt-6 max-w-[13ch] font-display text-[clamp(2.7rem,7vw,5.4rem)] font-semibold leading-[.98] tracking-[-0.055em] text-[#39180f] dark:text-text-primary">
                Opportunities are easier with a community behind you.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#765e55] dark:text-text-secondary sm:text-lg sm:leading-8">
                Find people preparing for the same scholarship, fellowship, internship or career move. Ask questions, share resources, and keep moving before the deadline.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  to={productPath}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#f45b16] px-6 text-sm font-extrabold text-white shadow-[0_14px_32px_-20px_rgba(244,91,22,.8)] transition hover:-translate-y-0.5 hover:bg-[#d94b0f]"
                >
                  {isSignedIn ? "Open community" : "Join the community"}
                  <ArrowRight size={17} className="rtl:rotate-180" />
                </Link>
                <a href="#public-communities" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#efd5c5] bg-white px-6 text-sm font-extrabold text-[#5a3326] transition hover:border-[#f45b16]/40 hover:text-[#d94b0f] dark:border-subtle dark:bg-surface-layer dark:text-text-primary">
                  See active communities
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-[#88746d] dark:text-text-muted">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} className="text-emerald-600" /> Scam-aware message screening</span>
                <span className="inline-flex items-center gap-1.5"><UsersRound size={15} className="text-[#f45b16]" /> Public and private groups</span>
                <span className="inline-flex items-center gap-1.5"><BookOpen size={15} className="text-blue-600" /> Durable resource library</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="rounded-[30px] border border-[#ecd2c2] bg-white p-3 shadow-[0_30px_80px_-45px_rgba(74,23,13,.55)] dark:border-subtle dark:bg-surface-layer sm:p-4">
                <div className="rounded-[24px] bg-[#4a170d] p-5 text-white dark:bg-slate-900 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-orange-200">Inside a room</p>
                      <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.03em]">Chevening application crew</h2>
                    </div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-2xl">🎓</span>
                  </div>
                  <div className="mt-6 space-y-3">
                    <div className="max-w-[86%] rounded-2xl rounded-ss-md bg-white/10 p-3">
                      <p className="text-xs font-bold text-orange-100">Maya</p>
                      <p className="mt-1 text-sm leading-6 text-white/90">Does anyone have a clean way to structure the leadership essay without repeating the networking example?</p>
                    </div>
                    <div className="ms-auto max-w-[82%] rounded-2xl rounded-se-md bg-[#f45b16] p-3">
                      <p className="text-xs font-bold text-orange-100">You</p>
                      <p className="mt-1 text-sm leading-6">I used problem → action → measurable result, then saved networking for the next question.</p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center text-xs font-bold text-white/70">
                    <span className="rounded-xl bg-white/5 px-2 py-2">Posts</span>
                    <span className="rounded-xl bg-white/5 px-2 py-2">Resources</span>
                    <span className="rounded-xl bg-white/5 px-2 py-2">About</span>
                  </div>
                </div>
              </div>
              <span aria-hidden="true" className="absolute -right-5 -top-5 hidden h-20 w-20 rounded-3xl bg-[#fcead5] lg:block" />
              <span aria-hidden="true" className="absolute -bottom-7 -left-7 -z-10 hidden h-28 w-28 rounded-full bg-blue-100 lg:block" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-[#f45b16]">Built for doing the work</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-[#39180f] dark:text-text-primary sm:text-4xl">Less noise. More useful progress.</h2>
            <p className="mt-4 text-base leading-7 text-[#765e55] dark:text-text-secondary">Community should help you apply, not give you another infinite social feed to manage.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {paths.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-[26px] border border-[#efd9ca] bg-white p-6 shadow-[0_12px_36px_-30px_rgba(74,23,13,.5)] dark:border-subtle dark:bg-surface-layer">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"><Icon size={20} /></span>
                <h3 className="mt-5 font-display text-xl font-semibold tracking-[-0.025em] text-[#39180f] dark:text-text-primary">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#765e55] dark:text-text-secondary">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="public-communities" className="border-y border-[#f2dfd2] bg-white/65 dark:border-subtle dark:bg-surface-layer/35">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-[#f45b16]">Open now</p>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.035em] text-[#39180f] dark:text-text-primary">Public communities worth exploring</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#765e55] dark:text-text-secondary">These are real public Edutu groups returned by the community service. Private rooms never appear here.</p>
              </div>
              <Link to={productPath} className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-extrabold text-[#d94b0f] dark:text-brand">Explore all <ArrowRight size={16} className="rtl:rotate-180" /></Link>
            </div>

            {loadingGroups ? (
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((key) => <div key={key} className="h-44 animate-pulse rounded-[24px] bg-[#fff9f1] dark:bg-surface-elevated" />)}</div>
            ) : groups.length > 0 ? (
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groups.map((group) => (
                  <Link key={group.id} to={`/community/groups/${group.slug}`} className="group rounded-[24px] border border-[#efd9ca] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#f45b16]/35 dark:border-subtle dark:bg-surface-layer">
                    <div className="flex items-start gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fcead5] text-xl dark:bg-surface-elevated">{group.coverEmoji}</span>
                      <div className="min-w-0 flex-1"><h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug text-[#39180f] transition group-hover:text-[#d94b0f] dark:text-text-primary dark:group-hover:text-brand">{group.name}</h3><p className="mt-1 text-xs font-bold text-[#9a8278] dark:text-text-muted">{group.memberCount.toLocaleString()} members · {group.messageCount.toLocaleString()} posts</p></div>
                    </div>
                    {group.description ? <p className="mt-4 line-clamp-2 text-sm leading-6 text-[#765e55] dark:text-text-secondary">{group.description}</p> : null}
                    <p className="mt-4 text-xs font-bold text-[#9a8278] dark:text-text-muted">Created {formatCommunityTime(group.createdAt)}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-7 rounded-[24px] border border-dashed border-[#e5c7b5] bg-[#fff9f1] p-8 text-center dark:border-subtle dark:bg-surface-elevated"><Briefcase className="mx-auto text-[#f45b16]" /><p className="mt-3 text-sm font-bold text-[#4a170d] dark:text-text-primary">Public groups will appear here as members create them.</p></div>
            )}
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-[32px] bg-[#4a170d] px-6 py-10 text-white shadow-[0_30px_70px_-45px_rgba(74,23,13,.75)] sm:px-10 sm:py-12">
            <div className="grid items-center gap-7 md:grid-cols-[1fr_auto]">
              <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-orange-200">Your next application does not have to be solo</p><h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Find a focused room, contribute something useful, and keep moving.</h2></div>
              <Link to={productPath} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#f45b16] px-6 text-sm font-extrabold text-white">{isSignedIn ? "Open community" : "Create your Edutu account"}<ArrowRight size={17} className="rtl:rotate-180" /></Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
