import React, { useMemo, useState, useCallback } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Globe,
  ChevronRight,
  ArrowLeft,
  Bell,
  LayoutGrid,
  List,
} from 'lucide-react';

import { useDarkMode } from '../hooks/useDarkMode';
import { usePersonalizedOpportunities } from '../hooks/usePersonalizedOpportunities';
import { useNavigate } from 'react-router-dom';
import NotificationInbox from './NotificationInbox';
import ImageWithFallback from './ImageWithFallback';
import type { Opportunity } from '../types/opportunity';

interface AllOpportunitiesProps {
  onBack: () => void;
  onSelectOpportunity: (opportunity: Opportunity) => void;
}

type ViewMode = 'list' | 'grid';

const AllOpportunities: React.FC<AllOpportunitiesProps> = ({ onBack, onSelectOpportunity }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const { isDarkMode } = useDarkMode();
  const navigate = useNavigate();
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

  const handleRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

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
                {loading ? 'Curating your matches...' : `${filteredOpportunities.length} personalized matches`}
              </p>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className={`hidden sm:flex items-center rounded-xl border overflow-hidden ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-brand-500 text-white' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-brand-500 text-white' : isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                >
                  <List size={16} />
                </button>
              </div>

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className={`p-2.5 rounded-xl transition-all ${loading ? 'opacity-50 cursor-not-allowed' : ''} ${isDarkMode ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
                title="Refresh Feed"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>

              {/* Notifications Button */}
              <button
                onClick={() => setShowNotifications(true)}
                className={`relative p-2.5 rounded-xl transition-all ${isDarkMode ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
                title="Notifications"
              >
                <Bell size={18} />
                <span className="absolute top-2 right-2 h-2 w-2 bg-rose-500 rounded-full" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-24 space-y-6 relative z-10">

        {/* Search & Filter Bar */}
        <div className="sticky top-16 md:top-20 z-20 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search opportunities by title, organization, or location..."
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
                <div className="grid grid-cols-2 gap-3">
                  {filteredOpportunities.map(({ opportunity, matchScore }, index) => (
                    <div
                      key={opportunity.id}
                      onClick={() => onSelectOpportunity(opportunity)}
                      className={`rounded-xl overflow-hidden border cursor-pointer group transition-all ${isDarkMode ? 'bg-gray-900 border-white/5 hover:border-white/10' : 'bg-white border-slate-200 hover:border-slate-300'} animate-slide-up`}
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <div className="h-24 overflow-hidden relative bg-slate-100 dark:bg-slate-800">
                        <ImageWithFallback
                          src={opportunity.image}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          fallbackClassName="w-full h-full"
                        />
                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm">
                          <span className="text-[8px] font-bold text-brand-600 dark:text-brand-400">{Math.round(matchScore)}%</span>
                        </div>
                      </div>
                      <div className="p-2.5">
                        <span className="text-[8px] font-bold text-primary tracking-wider">{opportunity.category || 'General'}</span>
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2 mt-0.5 leading-tight">
                          {opportunity.title}
                        </h3>
                        <div className="flex items-center justify-between mt-1.5 text-[8px] font-semibold text-slate-400">
                          <span className="flex items-center gap-0.5"><Globe size={8} /> {opportunity.location || 'Remote'}</span>
                          <span>{opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Ongoing'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOpportunities.map(({ opportunity, matchScore }, index) => (
                    <div
                      key={opportunity.id}
                      onClick={() => onSelectOpportunity(opportunity)}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer group transition-all ${isDarkMode ? 'bg-gray-900 border-white/5 hover:border-white/10' : 'bg-white border-slate-200 hover:border-slate-300'} animate-slide-up`}
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <ImageWithFallback
                          src={opportunity.image}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          fallbackClassName="w-full h-full"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] font-bold text-primary tracking-wider">{opportunity.category || 'General'}</span>
                          <span className="text-[8px] font-bold text-brand-600 dark:text-brand-400">{Math.round(matchScore)}%</span>
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

      <NotificationInbox
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </div>
  );
};

export default AllOpportunities;
