import React, { useMemo, useState, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Sparkles,
  Globe,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  LayoutGrid,
  List,
} from 'lucide-react';

import { useDarkMode } from '../hooks/useDarkMode';
import { usePersonalizedOpportunities } from '../hooks/usePersonalizedOpportunities';
import { useOpportunities } from '../hooks/useOpportunities';
import { useNavigate } from 'react-router-dom';
import ImageWithFallback from './ImageWithFallback';
import type { Opportunity } from '../types/opportunity';

interface AllOpportunitiesProps {
  onBack: () => void;
  onSelectOpportunity: (opportunity: Opportunity) => void;
}

type ViewMode = 'list' | 'grid';

const AllOpportunities: React.FC<AllOpportunitiesProps> = ({ onBack, onSelectOpportunity }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isFeedNoticeOpen, setIsFeedNoticeOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const { isDarkMode } = useDarkMode();
  const navigate = useNavigate();
  const {
    data: personalizedOpportunities,
    loading: personalizedLoading,
    refresh: refreshPersonalized
  } = usePersonalizedOpportunities();
  const {
    data: allOpportunities,
    loading: allLoading,
    refresh: refreshAll
  } = useOpportunities();

  const hasPersonalizedMatches = personalizedOpportunities.length > 0;
  const loading = personalizedLoading || allLoading;

  const opportunityItems = useMemo(() => {
    if (hasPersonalizedMatches) {
      return personalizedOpportunities.map((item) => ({
        opportunity: item.opportunity,
        matchScore: item.matchScore,
        source: 'personalized' as const,
      }));
    }

    return allOpportunities.map((opportunity) => ({
      opportunity,
      matchScore: undefined,
      source: 'general' as const,
    }));
  }, [allOpportunities, hasPersonalizedMatches, personalizedOpportunities]);

  const filteredOpportunities = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return opportunityItems.filter(({ opportunity }) => {
      if (!term) return true;
      const haystack = [opportunity.title, opportunity.organization, opportunity.description, opportunity.location]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [opportunityItems, searchTerm]);

  const handleRefresh = useCallback(() => {
    refreshPersonalized();
    refreshAll();
  }, [refreshAll, refreshPersonalized]);

  const handleBack = useCallback(() => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      onBack();
    }
  }, [navigate, onBack]);

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-900'} font-body transition-colors duration-500`}>
      {/* Background Mesh Gradient */}
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-10 mesh-gradient" />

      {/* Page Header */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b transition-all duration-300 ${isDarkMode ? 'bg-gray-950/90 border-white/10' : 'bg-white/90 border-gray-200'}`}>
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Back Button */}
            <button
              onClick={handleBack}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm transition-all ${isDarkMode ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
            >
              <ArrowLeft size={20} strokeWidth={2.5} />
              <span className="hidden sm:inline">Back</span>
            </button>

            {/* Title Section */}
            <div className="flex-1 min-w-0">
              <h1 className={`text-xl md:text-2xl font-display font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Explore Opportunities
              </h1>
              <p className={`text-xs md:text-sm truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {loading
                  ? 'Loading opportunities...'
                  : hasPersonalizedMatches
                    ? `${filteredOpportunities.length} personalized matches`
                    : `${filteredOpportunities.length} opportunities available`}
              </p>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className={`p-2.5 rounded-xl transition-all ${loading ? 'opacity-50 cursor-not-allowed' : ''} ${isDarkMode ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
                title="Refresh Feed"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>

              {/* Search Button */}
              <button
                onClick={() => setShowSearch((value) => !value)}
                className={`relative p-2.5 rounded-xl transition-all ${isDarkMode ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
                title="Search opportunities"
                aria-label="Search opportunities"
              >
                <Search size={18} />
              </button>
            </div>
          </div>
          {showSearch && (
            <div className="mt-3 relative animate-in fade-in slide-in-from-top-1 duration-200">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by title, organization, or location..."
                autoFocus
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-gray-900 text-slate-900 dark:text-white placeholder-slate-500 shadow-sm focus:ring-2 focus:ring-brand-500 transition-all font-medium text-sm"
              />
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-24 space-y-6 relative z-10">

        {!loading && !hasPersonalizedMatches && allOpportunities.length > 0 && (
          <section className={`rounded-[20px] border p-4 transition-all ${isDarkMode ? 'bg-brand-500/10 border-brand-500/20' : 'bg-brand-50 border-brand-100'}`}>
            <button
              type="button"
              onClick={() => setIsFeedNoticeOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-3 text-left"
              aria-expanded={isFeedNoticeOpen}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-10 w-10 rounded-[20px] bg-brand-500 text-white flex items-center justify-center shrink-0">
                  <Sparkles size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold">Showing all Edutu opportunities</h2>
                  {!isFeedNoticeOpen && (
                    <p className={`mt-0.5 truncate text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Complete your profile to unlock ranked matches.
                    </p>
                  )}
                </div>
              </div>
              <ChevronDown
                size={18}
                className={`shrink-0 text-slate-400 transition-transform ${isFeedNoticeOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isFeedNoticeOpen && (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="sm:pl-[52px]">
                  <p className={`mt-1 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    Complete your profile to unlock ranked matches. For now, browse scholarships, internships, fellowships, and programs from the full feed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/app/personalization')}
                  className="inline-flex items-center justify-center gap-2 rounded-[20px] bg-brand-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-brand-500/20"
                >
                  Personalize feed <ChevronRight size={16} />
                </button>
              </div>
            )}
          </section>
        )}

        {/* View Controls */}
        <div className={`sticky top-16 md:top-20 z-20 rounded-[20px] border p-3 backdrop-blur-xl ${isDarkMode ? 'bg-gray-950/85 border-white/10' : 'bg-white/85 border-slate-200 shadow-sm'}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">View</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Choose how opportunities display</p>
            </div>
            <div className={`flex items-center gap-1 rounded-[20px] border p-1 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white shadow-sm'}`}>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-all ${viewMode === 'grid'
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                : isDarkMode
                  ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              aria-label="Grid view"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-all ${viewMode === 'list'
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                : isDarkMode
                  ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              aria-label="List view"
            >
              <List size={18} />
            </button>
            </div>
          </div>
        </div>

        {/* Opportunities List/Grid */}
        <div className="pb-12">
          {loading ? (
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`rounded-xl animate-pulse ${viewMode === 'grid' ? 'h-48' : 'h-24'} ${isDarkMode ? 'bg-white/5' : 'bg-slate-200'}`} />
              ))}
            </div>
          ) : filteredOpportunities.length > 0 ? (
            <>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredOpportunities.map(({ opportunity, matchScore, source }, index) => (
                    <div
                      key={opportunity.id}
                      onClick={() => onSelectOpportunity(opportunity)}
                      className={`rounded-3xl overflow-hidden border cursor-pointer group transition-all hover:-translate-y-0.5 ${isDarkMode ? 'bg-gray-900 border-white/5 hover:border-white/10' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/70'} animate-slide-up`}
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <div className="h-36 overflow-hidden relative bg-slate-100 dark:bg-slate-800">
                        <ImageWithFallback
                          src={opportunity.image ?? ''}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          fallbackClassName="w-full h-full"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent" />
                        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-brand-600 backdrop-blur">
                          {opportunity.category || 'General'}
                        </span>
                        {source === 'personalized' && typeof matchScore === 'number' && (
                          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/20">
                            <span className="text-[10px] font-black">{Math.round(matchScore)}% match</span>
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                          {opportunity.title}
                        </h3>
                        <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
                          {opportunity.organization || 'Global opportunity'}
                        </p>
                        <div className="flex items-center justify-between mt-3 text-[10px] font-bold text-slate-400">
                          <span className="flex items-center gap-1"><Globe size={10} /> {opportunity.location || 'Remote'}</span>
                          <span>{opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Ongoing'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOpportunities.map(({ opportunity, matchScore, source }, index) => (
                    <div
                      key={opportunity.id}
                      onClick={() => onSelectOpportunity(opportunity)}
                      className={`flex items-center gap-4 p-4 rounded-3xl border cursor-pointer group transition-all ${isDarkMode ? 'bg-gray-900 border-white/5 hover:border-white/10' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/60'} animate-slide-up`}
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <ImageWithFallback
                          src={opportunity.image ?? ''}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          fallbackClassName="w-full h-full"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] font-bold text-primary tracking-wider">{opportunity.category || 'General'}</span>
                          {source === 'personalized' && typeof matchScore === 'number' && (
                            <span className="text-[8px] font-bold text-brand-600 dark:text-brand-400">{Math.round(matchScore)}% match</span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                          {opportunity.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 text-[9px] font-semibold text-slate-400">
                          <span>{opportunity.location || 'Remote'}</span>
                          <span>•</span>
                          <span>{opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Ongoing'}</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-primary shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20">
              <Globe size={48} className={`mx-auto mb-4 ${isDarkMode ? 'text-slate-600' : 'text-slate-300'}`} />
              <h3 className="text-xl font-display font-bold mb-2">No matches found</h3>
              <p className="text-slate-500 font-medium">Try adjusting your filters to see more results.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default AllOpportunities;
