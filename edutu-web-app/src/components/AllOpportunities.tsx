import React, { useMemo, useState } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Globe,
  ChevronRight,
} from 'lucide-react';

import { useDarkMode } from '../hooks/useDarkMode';
import { usePersonalizedOpportunities } from '../hooks/usePersonalizedOpportunities';
import PageHeader from './PageHeader';
import ImageWithFallback from './ImageWithFallback';
import type { Opportunity } from '../types/opportunity';

interface AllOpportunitiesProps {
  onBack: () => void;
  onSelectOpportunity: (opportunity: Opportunity) => void;
}

const AllOpportunities: React.FC<AllOpportunitiesProps> = ({ onBack, onSelectOpportunity }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const { isDarkMode } = useDarkMode();
  const {
    data: personalizedOpportunities,
    loading,
    refresh
  } = usePersonalizedOpportunities();

  const opportunities = useMemo(() =>
    personalizedOpportunities.map(item => item.opportunity),
    [personalizedOpportunities]
  );

  const categories = useMemo(() => {
    const dynamic = new Set<string>();
    opportunities.forEach((opportunity) => {
      if (opportunity.category) {
        dynamic.add(opportunity.category);
      }
    });
    return ['All', ...Array.from(dynamic).sort()];
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return personalizedOpportunities.filter(({ opportunity }) => {
      if (selectedCategory !== 'All' && opportunity.category !== selectedCategory) return false;
      if (!term) return true;
      const haystack = [opportunity.title, opportunity.organization, opportunity.description, opportunity.location]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [personalizedOpportunities, searchTerm, selectedCategory]);

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-900'} font-body transition-colors duration-500`}>
      {/* Background Mesh Gradient */}
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-10 mesh-gradient" />

      {/* Page Header */}
      <PageHeader
        title="Explore Opportunities"
        subtitle={loading ? 'Curating your matches...' : `${filteredOpportunities.length} personalized matches`}
        onBack={onBack}
        rightContent={
          <button
            onClick={refresh}
            disabled={loading}
            className={`p-2.5 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/20 transition-all ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Refresh Feed"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-24 space-y-6 relative z-10">

        {/* Search & Filter Bar */}
        <div className="sticky top-4 z-20 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="w-full pl-11 pr-4 py-3 rounded-2xl border-none bg-white dark:bg-gray-900 text-slate-900 dark:text-white placeholder-slate-500 shadow-sm focus:ring-2 focus:ring-brand-500 transition-all font-medium text-sm"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-3 rounded-2xl transition-all shadow-sm border ${showFilters
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white dark:bg-gray-900 text-slate-600 dark:text-slate-400 border-transparent hover:border-slate-200 dark:hover:border-white/10'
                }`}
            >
              <Filter size={20} />
            </button>
          </div>

          {/* Quick Categories Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap border ${selectedCategory === cat
                  ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/20'
                  : 'bg-white dark:bg-gray-900 text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Opportunities List */}
        <div className="space-y-6 pb-12">
          {loading ? (
            <div className="space-y-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="premium-card p-6 h-48 animate-pulse border-none bg-white/50 dark:bg-gray-900/50" />
              ))}
            </div>
          ) : filteredOpportunities.length > 0 ? (
            filteredOpportunities.map(({ opportunity, matchScore }, index) => (
              <div
                key={opportunity.id}
                onClick={() => onSelectOpportunity(opportunity)}
                className="premium-card group relative p-0 flex flex-col md:flex-row gap-0 cursor-pointer overflow-hidden hover:scale-[1.01] transition-all duration-500 border-none bg-white dark:bg-gray-900 shadow-xl shadow-slate-200/40 dark:shadow-none animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Match Score Badge - Modern Floating Style */}
                <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-lg border border-brand-500/20 group-hover:scale-110 transition-transform">
                  <Sparkles size={14} className="text-brand-500 animate-pulse" />
                  <span className="text-xs font-bold text-brand-600 dark:text-brand-400">{Math.round(matchScore)}% Match</span>
                </div>

                {/* Left Side: Image Container */}
                  <div className="w-full md:w-64 h-48 md:h-auto overflow-hidden relative shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent z-10" />
                    <ImageWithFallback
                      src={opportunity.image}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      fallbackClassName="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-300 gap-3"
                    />
                  </div>

                {/* Right Side: Content */}
                <div className="flex-1 p-6 md:p-8 flex flex-col justify-between relative">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="px-2.5 py-1 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[10px] font-black tracking-widest">
                        {opportunity.category}
                      </span>
                      <div className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700 mx-1" />
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest ${opportunity.difficulty === 'Easy' ? 'bg-emerald-500/10 text-emerald-600' :
                        opportunity.difficulty === 'Hard' ? 'bg-rose-500/10 text-rose-600' :
                          'bg-amber-500/10 text-amber-600'
                        }`}>
                        {opportunity.difficulty || 'Intermediate'}
                      </span>
                    </div>

                    <h3 className="text-2xl font-display font-bold mb-3 group-hover:text-brand-500 transition-colors leading-tight">
                      {opportunity.title}
                    </h3>

                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-6 line-clamp-2 leading-relaxed max-w-2xl">
                      {opportunity.description || "A personalized opportunity curated by Edutu AI to help you achieve your career goals. This match aligns with your background and interests."}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-6">
                    <div className="flex flex-wrap items-center gap-6 text-[11px] font-bold text-slate-400 dark:text-slate-500 tracking-widest">
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-2 rounded-full bg-brand-500" />
                        <span className="group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">{opportunity.deadline || 'Ongoing'}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-2 rounded-full bg-indigo-500" />
                        <span className="group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">{opportunity.location || 'Remote'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-brand-500 font-bold text-sm">
                      <span>Explore Journey</span>
                      <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>

                {/* Decorative Elements */}
                <div className="absolute -bottom-10 -right-10 h-32 w-32 bg-brand-500/5 rounded-full blur-3xl group-hover:bg-brand-500/10 transition-colors" />
              </div>
            ))
          ) : (
            <div className="text-center py-20 premium-card bg-transparent border-dashed">
              <Globe size={48} className="mx-auto text-slate-300 mb-4 opacity-50" />
              <h3 className="text-xl font-display font-bold mb-2">Refining Feed...</h3>
              <p className="text-slate-500 font-medium">Try adjusting your filters to see more results.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AllOpportunities;
