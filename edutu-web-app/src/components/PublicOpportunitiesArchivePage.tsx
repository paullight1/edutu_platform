import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  matchPath,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useOpportunities } from "../hooks/useOpportunities";
import type { Opportunity } from "../types/opportunity";
import {
  isOpportunityExpired,
  parseOpportunityDeadline,
} from "../services/opportunities";
import { buildPageHref, parsePageParam } from "../lib/seoPagination";
import { getDefaultSeoImage, toAbsoluteUrl } from "../lib/publicSite";
import PublicEditorialShell from "./PublicEditorialShell";
import Seo from "./Seo";
import Pagination from "./ui/Pagination";

const PAGE_SIZE = 12;

type OpportunityWithCategoryAliases = Opportunity & {
  canonicalCategory?: string | null;
  canonical_category?: string | null;
};

type PublicCategory = {
  slug: string;
  label: string;
  title: string;
  description: string;
  introduction: string;
  canonicalCategories: string[];
  keywords: string[];
  keywordOnly?: boolean;
};

const PUBLIC_CATEGORIES: PublicCategory[] = [
  {
    slug: "scholarships",
    label: "Scholarships",
    title: "Scholarships for African and global students | Edutu",
    description:
      "Browse verified undergraduate, postgraduate and fully funded scholarships with deadlines, eligibility, benefits and official application sources.",
    introduction:
      "Discover scholarship opportunities for undergraduate, postgraduate and doctoral study, organised so you can check eligibility and prepare before the deadline.",
    canonicalCategories: ["scholarships", "scholarship"],
    keywords: ["scholarship", "bursary", "studentship"],
  },
  {
    slug: "internships",
    label: "Internships",
    title: "Internships and graduate trainee opportunities | Edutu",
    description:
      "Find verified internships, apprenticeships and graduate trainee roles with locations, deadlines, requirements and official application links.",
    introduction:
      "Explore practical work-experience opportunities for students, recent graduates and early-career professionals.",
    canonicalCategories: ["internships", "internship"],
    keywords: ["internship", "intern", "trainee", "apprenticeship"],
  },
  {
    slug: "fellowships",
    label: "Fellowships",
    title: "Fellowships, residencies and leadership cohorts | Edutu",
    description:
      "Explore verified fellowships, residencies and leadership cohorts with benefits, selection requirements, deadlines and source links.",
    introduction:
      "Find fellowships and residencies supporting leadership, research, public service, creative work and professional development.",
    canonicalCategories: ["fellowships", "fellowship"],
    keywords: ["fellowship", "fellow", "residency"],
  },
  {
    slug: "grants",
    label: "Grants",
    title: "Grants and funding opportunities | Edutu",
    description:
      "Discover verified grants, seed funding and project support with funding details, eligibility, deadlines and official source links.",
    introduction:
      "Explore grants for research, community projects, startups, creative work and social impact.",
    canonicalCategories: ["grants", "grant"],
    keywords: ["grant", "microgrant", "seed funding"],
  },
  {
    slug: "graduate-programs",
    label: "Graduate programs",
    title: "Graduate programs, master's and PhD opportunities | Edutu",
    description:
      "Find graduate degree, master's, MBA and PhD opportunities with admission requirements, funding information, deadlines and official sources.",
    introduction:
      "Browse postgraduate study and graduate-school opportunities, including master's, doctoral and professional degree programmes.",
    canonicalCategories: [
      "graduate-programs",
      "graduate-program",
      "graduate-programmes",
      "graduate-programme",
    ],
    keywords: ["graduate program", "postgraduate", "master's", "masters", "phd"],
  },
  {
    slug: "bootcamps",
    label: "Bootcamps",
    title: "Bootcamps, accelerators and intensive training | Edutu",
    description:
      "Explore verified bootcamps, accelerators and cohort-based training with skills, eligibility, costs or funding, deadlines and application links.",
    introduction:
      "Find intensive learning and acceleration programmes designed to build practical skills or support early-stage ventures.",
    canonicalCategories: ["bootcamps", "bootcamp"],
    keywords: ["bootcamp", "accelerator", "academy", "intensive training"],
  },
  {
    slug: "programs",
    label: "Programs",
    title: "Leadership, exchange and development programs | Edutu",
    description:
      "Browse verified leadership, exchange, mentorship and professional development programs with eligibility, benefits and deadlines.",
    introduction:
      "Explore structured programmes providing training, mentorship, networks, exchange experiences and professional development.",
    canonicalCategories: ["programs", "program"],
    keywords: ["program", "programme", "leadership", "exchange", "mentorship"],
  },
  {
    slug: "competitions",
    label: "Competitions",
    title: "Competitions, challenges and innovation awards | Edutu",
    description:
      "Find verified competitions, innovation challenges, contests and hackathons with prizes, eligibility, deadlines and official entry links.",
    introduction:
      "Discover competitions and challenges for ideas, research, entrepreneurship, technology, writing, design and social impact.",
    canonicalCategories: ["programs", "program"],
    keywords: [
      "competition",
      "contest",
      "challenge",
      "hackathon",
      "prize",
      "award",
    ],
    keywordOnly: true,
  },
  {
    slug: "events",
    label: "Opportunity events",
    title: "Conferences, summits, workshops and opportunity events | Edutu",
    description:
      "Discover verified conferences, summits, workshops and webinars with audience details, dates, locations and registration sources.",
    introduction:
      "Explore conferences, workshops, webinars, summits and forums offering learning, networking or application opportunities.",
    canonicalCategories: ["events", "event"],
    keywords: ["conference", "summit", "workshop", "webinar", "forum", "event"],
  },
];

function normalise(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, " ");
}

function findCategory(slug: string | null | undefined): PublicCategory | null {
  const normalised = normalise(slug);
  if (!normalised) return null;
  return (
    PUBLIC_CATEGORIES.find((category) => category.slug === normalised) ?? null
  );
}

function categorySearchText(opportunity: Opportunity): string {
  return normalise(
    [
      opportunity.title,
      opportunity.category,
      opportunity.organization,
      opportunity.summary,
      ...(opportunity.tags ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function opportunityMatchesCategory(
  opportunity: OpportunityWithCategoryAliases,
  category: PublicCategory | null,
): boolean {
  if (!category) return true;

  const canonical = normalise(
    opportunity.canonicalCategory ?? opportunity.canonical_category,
  );
  const storedCategory = normalise(opportunity.category);
  const canonicalMatch = category.canonicalCategories.some((candidate) => {
    const normalisedCandidate = normalise(candidate);
    return (
      canonical === normalisedCandidate || storedCategory === normalisedCandidate
    );
  });
  const haystack = categorySearchText(opportunity);
  const keywordMatch = category.keywords.some((keyword) =>
    haystack.includes(normalise(keyword)),
  );

  return category.keywordOnly ? keywordMatch : canonicalMatch || keywordMatch;
}

function matchesSearch(opportunity: Opportunity, query: string): boolean {
  const tokens = normalise(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalise(
    [
      opportunity.title,
      opportunity.organization,
      opportunity.summary,
      opportunity.description,
      opportunity.location,
      opportunity.category,
      ...(opportunity.tags ?? []),
      ...(opportunity.benefits ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  return tokens.every((token) => haystack.includes(token));
}

function updatedTime(opportunity: Opportunity): number {
  const value = opportunity.lastUpdated || opportunity.createdAt;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function titleForPage(title: string, page: number): string {
  const base = title.replace(/\s*\|\s*Edutu\s*$/i, "").trim();
  return `${base}${page > 1 ? ` — Page ${page}` : ""} | Edutu`;
}

function formatDeadline(value: string | null | undefined): string {
  if (!value) return "Confirm with provider";
  if (/rolling/i.test(value)) return "Rolling deadline";
  const date = parseOpportunityDeadline(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const summary = opportunity.summary || opportunity.description;
  const image =
    opportunity.image || opportunity.imageFallback || getDefaultSeoImage();

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft transition hover:-translate-y-1 hover:border-brand/40 hover:shadow-elevated">
      <div className="aspect-[16/9] overflow-hidden bg-surface-elevated">
        <img
          src={image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          {opportunity.category ? (
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
              {opportunity.category}
            </span>
          ) : null}
          {opportunity.isRemote ? (
            <span className="rounded-full border border-subtle px-2.5 py-1 text-xs font-semibold text-text-muted">
              Remote
            </span>
          ) : null}
        </div>
        <h2 className="mt-3 line-clamp-3 font-display text-xl font-semibold leading-snug tracking-tight text-text-primary transition group-hover:text-brand">
          {opportunity.title}
        </h2>
        {opportunity.organization ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
            <Building2 size={14} aria-hidden="true" />
            <span className="line-clamp-1">{opportunity.organization}</span>
          </p>
        ) : null}
        {summary ? (
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-text-secondary">
            {summary}
          </p>
        ) : null}
        <div className="mt-auto space-y-2 border-t border-subtle pt-4 text-sm text-text-muted">
          {opportunity.location ? (
            <p className="flex items-center gap-2">
              <MapPin size={15} aria-hidden="true" />
              <span className="line-clamp-1">{opportunity.location}</span>
            </p>
          ) : null}
          <p className="flex items-center gap-2">
            <CalendarDays size={15} aria-hidden="true" />
            <span>{formatDeadline(opportunity.deadline)}</span>
          </p>
        </div>
      </div>
      <Link
        to={`/opportunity/${opportunity.id}`}
        state={{ opportunity }}
        className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2"
        aria-label={`View ${opportunity.title}`}
      />
    </article>
  );
}

export default function PublicOpportunitiesArchivePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: opportunities, loading, error, refresh } = useOpportunities();
  const [searchQuery, setSearchQuery] = useState("");
  const resultsRef = useRef<HTMLElement>(null);
  const [serverFallbackHtml] = useState(() =>
    document.querySelector<HTMLElement>("#seo-content")?.outerHTML ?? "",
  );

  const cleanPathname = location.pathname.replace(/\/+$/, "") || "/";
  const categoryMatch = matchPath(
    { path: "/opportunities/:category", end: true },
    cleanPathname,
  );
  const routeCategorySlug = categoryMatch?.params.category ?? null;
  const legacyCategorySlug = searchParams.get("category");
  const category = findCategory(routeCategorySlug || legacyCategorySlug);
  const invalidCategory = Boolean(routeCategorySlug && !category);
  const requestedPage = parsePageParam(searchParams.get("page"));
  const canonicalBasePath = category
    ? `/opportunities/${category.slug}`
    : "/opportunities";

  useEffect(() => {
    if (routeCategorySlug || !legacyCategorySlug || !category) return;
    const next = new URLSearchParams(searchParams);
    next.delete("category");
    navigate(buildPageHref(`/opportunities/${category.slug}`, next, requestedPage), {
      replace: true,
    });
  }, [
    category,
    legacyCategorySlug,
    navigate,
    requestedPage,
    routeCategorySlug,
    searchParams,
  ]);

  const filtered = useMemo(() => {
    return opportunities
      .filter((opportunity) => !isOpportunityExpired(opportunity))
      .filter((opportunity) =>
        opportunityMatchesCategory(opportunity, category),
      )
      .filter((opportunity) => matchesSearch(opportunity, searchQuery))
      .sort((left, right) => updatedTime(right) - updatedTime(left));
  }, [category, opportunities, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = parsePageParam(String(requestedPage), totalPages);
  const visible = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );
  const canonicalPath =
    page > 1 ? `${canonicalBasePath}?page=${page}` : canonicalBasePath;

  const archiveParams = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("category");
    return next;
  }, [searchParams]);
  const getPageHref = useCallback(
    (targetPage: number) =>
      buildPageHref(canonicalBasePath, archiveParams, targetPage),
    [archiveParams, canonicalBasePath],
  );

  useEffect(() => {
    if (loading || requestedPage === page) return;
    navigate(getPageHref(page), { replace: true });
  }, [getPageHref, loading, navigate, page, requestedPage]);

  const goToPage = useCallback(
    (targetPage: number) => {
      navigate(getPageHref(targetPage));
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [getPageHref, navigate],
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (page > 1) {
      navigate(getPageHref(1), { replace: true });
    }
  };

  if (invalidCategory) {
    return (
      <div className="bg-surface-body">
        <Seo
          title="Opportunity category not found | Edutu"
          description="This opportunity category is unavailable. Browse current scholarships, internships, fellowships and grants instead."
          path={cleanPathname}
          noindex
        />
        <PublicEditorialShell>
          <section className="mx-auto max-w-2xl rounded-3xl border border-subtle bg-surface-layer px-6 py-16 text-center shadow-soft">
            <AlertCircle
              size={46}
              aria-hidden="true"
              className="mx-auto text-text-muted"
            />
            <h1 className="mt-4 font-display text-3xl font-semibold text-text-primary">
              Opportunity category not found
            </h1>
            <p className="mt-3 text-text-secondary">
              The category may have changed or the address may be incorrect.
            </p>
            <Link
              to="/opportunities"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white no-underline"
            >
              Browse all opportunities
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
        </PublicEditorialShell>
      </div>
    );
  }

  const genericTitle =
    "Updated scholarships, internships, grants and fellowships | Edutu";
  const genericDescription =
    "Explore verified scholarships, internships, fellowships, grants, graduate programs and application opportunities with deadlines and official sources.";
  const seoTitle = titleForPage(category?.title || genericTitle, page);
  const seoDescription = category?.description || genericDescription;
  const seoJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: category?.label || "Edutu opportunities",
      description: seoDescription,
      url: toAbsoluteUrl(canonicalPath),
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: visible.length,
        itemListElement: visible.map((opportunity, index) => ({
          "@type": "ListItem",
          position: (page - 1) * PAGE_SIZE + index + 1,
          name: opportunity.title,
          url: toAbsoluteUrl(`/opportunity/${opportunity.id}`),
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: toAbsoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Opportunities",
          item: toAbsoluteUrl("/opportunities"),
        },
        ...(category
          ? [
              {
                "@type": "ListItem",
                position: 3,
                name: category.label,
                item: toAbsoluteUrl(canonicalPath),
              },
            ]
          : []),
      ],
    },
  ];

  if ((loading || (error && opportunities.length === 0)) && serverFallbackHtml) {
    return (
      <div className="bg-surface-body">
        <Seo
          title={seoTitle}
          description={seoDescription}
          path={canonicalPath}
          image={getDefaultSeoImage()}
          jsonLd={seoJsonLd}
        />
        <div dangerouslySetInnerHTML={{ __html: serverFallbackHtml }} />
      </div>
    );
  }

  return (
    <div className="bg-surface-body">
      <Seo
        title={seoTitle}
        description={seoDescription}
        path={canonicalPath}
        image={getDefaultSeoImage()}
        jsonLd={seoJsonLd}
      />
      <PublicEditorialShell mainClassName="max-w-7xl pb-24 pt-8 sm:pt-12">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-2 text-sm text-text-muted"
        >
          <Link to="/" className="hover:text-brand">
            Home
          </Link>
          <span aria-hidden="true">/</span>
          {category ? (
            <>
              <Link to="/opportunities" className="hover:text-brand">
                Opportunities
              </Link>
              <span aria-hidden="true">/</span>
              <span>{category.label}</span>
            </>
          ) : (
            <span>Opportunities</span>
          )}
        </nav>

        <section className="relative overflow-hidden rounded-3xl border border-brand/15 bg-surface-layer px-6 py-9 shadow-soft sm:px-10 sm:py-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 90% 0%, rgb(var(--color-brand-500) / 0.18), transparent 38%), radial-gradient(circle at 0% 100%, rgb(var(--color-brand-300) / 0.10), transparent 36%)",
            }}
          />
          <div className="relative max-w-4xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand">
              <Sparkles size={14} aria-hidden="true" />
              Verified opportunity discovery
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-4xl font-semibold leading-[1.03] tracking-[-0.04em] text-text-primary sm:text-5xl lg:text-6xl">
              {category?.label || "Explore opportunities"}
              {page > 1 ? ` — Page ${page}` : ""}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-text-secondary sm:text-lg sm:leading-8">
              {category?.introduction || genericDescription}
            </p>
          </div>
        </section>

        <nav
          aria-label="Opportunity categories"
          className="mt-7 flex gap-2 overflow-x-auto pb-2"
        >
          <Link
            to="/opportunities"
            className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold no-underline transition ${
              !category
                ? "border-brand bg-brand text-white"
                : "border-subtle bg-surface-layer text-text-secondary hover:border-brand/40 hover:text-brand"
            }`}
          >
            All opportunities
          </Link>
          {PUBLIC_CATEGORIES.map((item) => (
            <Link
              key={item.slug}
              to={`/opportunities/${item.slug}`}
              className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold no-underline transition ${
                category?.slug === item.slug
                  ? "border-brand bg-brand text-white"
                  : "border-subtle bg-surface-layer text-text-secondary hover:border-brand/40 hover:text-brand"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-subtle bg-surface-layer p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xl">
            <Search
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <label htmlFor="public-opportunity-search" className="sr-only">
              Search opportunities
            </label>
            <input
              id="public-opportunity-search"
              type="search"
              value={searchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search by title, provider, skill or location..."
              className="h-12 w-full rounded-xl border border-subtle bg-surface-elevated pl-12 pr-4 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/20"
            />
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="text-sm font-medium text-text-muted">
              {filtered.length.toLocaleString()} result
              {filtered.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-subtle px-4 text-sm font-semibold text-text-secondary transition hover:border-brand/40 hover:text-brand disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                aria-hidden="true"
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </div>

        {error && opportunities.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            The latest refresh failed, so Edutu is showing the most recent saved
            catalogue available in this session.
          </div>
        ) : null}

        <section ref={resultsRef} className="scroll-mt-24 pt-8">
          {loading && opportunities.length === 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[390px] animate-pulse rounded-2xl border border-subtle bg-surface-layer"
                />
              ))}
            </div>
          ) : null}

          {!loading && visible.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                />
              ))}
            </div>
          ) : null}

          {!loading && visible.length === 0 ? (
            <div className="rounded-3xl border border-subtle bg-surface-layer px-6 py-16 text-center shadow-soft">
              <AlertCircle
                size={44}
                aria-hidden="true"
                className="mx-auto text-text-muted"
              />
              <h2 className="mt-4 font-display text-2xl font-semibold text-text-primary">
                {error
                  ? "Opportunities are temporarily unavailable"
                  : searchQuery
                    ? "No opportunities match this search"
                    : "No active opportunities on this page"}
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-text-secondary">
                {error
                  ? "Please retry or use the official provider links from a previously loaded page."
                  : searchQuery
                    ? "Try fewer words, a broader field or another category."
                    : "Return to the first page or explore another opportunity category."}
              </p>
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  className="mt-6 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Clear search
                </button>
              ) : null}
            </div>
          ) : null}

          {!loading && !searchQuery.trim() ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={goToPage}
              getPageHref={getPageHref}
              className="mt-12"
            />
          ) : null}
        </section>

        <aside className="mt-16 grid gap-5 rounded-3xl border border-subtle bg-surface-layer p-6 shadow-soft lg:grid-cols-[1fr_auto] lg:items-center lg:p-8">
          <div>
            <h2 className="font-display text-2xl font-semibold text-text-primary">
              Confirm every opportunity at the source
            </h2>
            <p className="mt-2 max-w-3xl leading-7 text-text-secondary">
              Edutu helps people discover and understand opportunities. The
              named provider remains the final authority for eligibility,
              funding, deadlines and selection decisions.
            </p>
          </div>
          <Link
            to="/blog"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white no-underline"
          >
            Read application guides
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </aside>
      </PublicEditorialShell>
    </div>
  );
}
