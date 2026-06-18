import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  MapPin,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useOpportunities } from '../hooks/useOpportunities';
import type { Opportunity } from '../types/opportunity';
import ImageWithFallback from './ImageWithFallback';

const categoryFallbackImages: Record<string, string> = {
  scholarships: 'https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg',
  fellowships: 'https://images.pexels.com/photos/1438072/pexels-photo-1438072.jpeg',
  internships: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg',
  grants: 'https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg',
  programs: 'https://images.pexels.com/photos/1181715/pexels-photo-1181715.jpeg',
  general: 'https://images.pexels.com/photos/5212329/pexels-photo-5212329.jpeg',
};

function getOpportunityImage(opportunity: Opportunity): string {
  if (opportunity.image) return opportunity.image;

  const category = opportunity.category?.trim().toLowerCase() || 'general';
  return categoryFallbackImages[category] || categoryFallbackImages.general;
}

function formatDeadline(deadline?: string | null): string {
  if (!deadline) return 'Rolling';

  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return 'Rolling';

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  return (
    <Link
      to={`/opportunity/${opportunity.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-white/10 dark:bg-slate-950"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100 dark:bg-slate-900">
        <ImageWithFallback
          src={getOpportunityImage(opportunity)}
          alt={`${opportunity.title} cover image`}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          fallbackClassName="flex h-full w-full items-center justify-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
        {opportunity.match > 0 ? (
          <span className="absolute left-4 top-4 inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-900 shadow-sm backdrop-blur dark:bg-slate-950/80 dark:text-white">
            {Math.round(opportunity.match)}% match
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-brand-500/20 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
            {opportunity.category || 'General'}
          </span>
          {opportunity.difficulty ? (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              {opportunity.difficulty}
            </span>
          ) : null}
        </div>

        <h2 className="text-lg font-semibold leading-tight text-slate-950 transition group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-300">
          {opportunity.title}
        </h2>

        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {opportunity.description}
        </p>

        <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={14} />
            {opportunity.location || 'Remote'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar size={14} />
            {formatDeadline(opportunity.deadline)}
          </span>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
            {opportunity.organization || 'Edutu'}
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition group-hover:gap-2 dark:text-brand-300">
            Open
            <ArrowRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function LoadingCard() {
  return <div className="h-[360px] animate-pulse rounded-[28px] bg-slate-200 dark:bg-white/5" />;
}

export default function OpportunitiesPage() {
  const { data: opportunities, loading, error, refresh } = useOpportunities();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    for (const opportunity of opportunities) {
      if (opportunity.category?.trim()) {
        categorySet.add(opportunity.category.trim());
      }
    }

    return ['All', ...Array.from(categorySet).sort((left, right) => left.localeCompare(right))];
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return opportunities.filter((opportunity) => {
      if (selectedCategory !== 'All' && opportunity.category !== selectedCategory) {
        return false;
      }

      if (!term) {
        return true;
      }

      const haystack = [
        opportunity.title,
        opportunity.organization,
        opportunity.description,
        opportunity.location,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [opportunities, searchTerm, selectedCategory]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('All');
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-950 transition-colors dark:bg-slate-950 dark:text-white">
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-600 dark:text-brand-300">
              Browse
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Opportunities
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
              Scholarships, fellowships, internships, grants, and programs in one focused feed.
            </p>
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:text-white"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </section>

        <section className="sticky top-4 z-20 mt-8 rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90">
          <div className="space-y-4">
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by title, organization, location, or keyword"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-11 text-sm text-slate-950 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-950"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition hover:text-slate-700 dark:hover:text-white"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const active = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white'
                    }`}
                    aria-pressed={active}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span>
                {loading
                  ? 'Loading opportunities...'
                  : `${filteredOpportunities.length} ${
                    filteredOpportunities.length === 1 ? 'opportunity' : 'opportunities'
                  }`}
              </span>
              {(searchTerm || selectedCategory !== 'All') && !loading ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="font-semibold text-brand-600 transition hover:text-brand-500 dark:text-brand-300"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {error ? (
          <section className="mt-8 rounded-[28px] border border-rose-200 bg-rose-50 p-6 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
            <h2 className="text-lg font-semibold">Unable to load opportunities</h2>
            <p className="mt-2 text-sm leading-6 text-rose-800/80 dark:text-rose-100/80">
              {error}
            </p>
            <button
              type="button"
              onClick={refresh}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
            >
              <RefreshCw size={16} />
              Try again
            </button>
          </section>
        ) : null}

        {loading ? (
          <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <LoadingCard key={index} />
            ))}
          </section>
        ) : filteredOpportunities.length > 0 ? (
          <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredOpportunities.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </section>
        ) : (
          <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-10 text-center dark:border-white/10 dark:bg-slate-950">
            <h2 className="text-2xl font-semibold tracking-tight">No opportunities found</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Try a broader search term or clear the current filter to see more listings.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Reset filters
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
