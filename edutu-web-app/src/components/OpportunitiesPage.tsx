import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    Sparkles,
    Sun,
    Moon,
    MapPin,
    Calendar,
    Search,
    X,
    Globe,
    Twitter,
    Linkedin,
    Github,
    Trophy,
    LockKeyhole,
    Smartphone
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import { useOpportunities } from '../hooks/useOpportunities';
import type { Opportunity } from '../types/opportunity';

interface OpportunityCardProps {
    opportunity: Opportunity;
    matchScore?: number;
    index: number;
}

const opportunityFallbackImages: Record<string, string> = {
    business: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg',
    'computer science': 'https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg',
    science: 'https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg',
    arts: 'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg',
    general: 'https://images.pexels.com/photos/5212329/pexels-photo-5212329.jpeg',
};

const getOpportunityImage = (opportunity: Opportunity) => {
    if (opportunity.image) return opportunity.image;

    const category = opportunity.category?.toLowerCase() || 'general';
    return opportunityFallbackImages[category] || opportunityFallbackImages.general;
};

const OpportunityCard: React.FC<OpportunityCardProps & { onNavigate: (path: string) => void }> = ({ opportunity, matchScore, index, onNavigate }) => {
    const { isDarkMode } = useDarkMode();

    const webflowShadow = isDarkMode
        ? '0 1px 0 rgba(255,255,255,0.1), 0 13px 13px rgba(0,0,0,0.2), 0 3px 7px rgba(0,0,0,0.1)'
        : '0 1px 0 #d8d8d8, 0 13px 13px rgba(0,0,0,0.04), 0 3px 7px rgba(0,0,0,0.08)';

    const difficultyColor = opportunity.difficulty === 'Easy' ? '#00d722' :
        opportunity.difficulty === 'Hard' ? '#ff3b30' : '#ffae13';

    const deadlineText = opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Ongoing';
    const imageUrl = getOpportunityImage(opportunity);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
            className="cursor-pointer group transition-all duration-300"
            style={{
                backgroundColor: isDarkMode ? '#111' : '#ffffff',
                border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                borderRadius: '8px',
                boxShadow: webflowShadow
            }}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = '#146ef5';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = isDarkMode ? '#222' : '#d8d8d8';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}
            onClick={() => onNavigate('/auth')}
        >
            <div className="relative h-40 overflow-hidden" style={{ borderRadius: '8px 8px 0 0' }}>
                <img
                    src={imageUrl}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                />
                <div
                    className="absolute inset-0"
                    style={{
                        background: isDarkMode
                            ? 'linear-gradient(180deg, rgba(8,8,8,0.05), rgba(8,8,8,0.76))'
                            : 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(8,25,48,0.44))',
                    }}
                />
            </div>
            {matchScore !== undefined && matchScore > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 mx-6 mt-5 mb-4" style={{ backgroundColor: '#146ef515', borderRadius: '4px', width: 'fit-content' }}>
                    <Sparkles size={12} style={{ color: '#146ef5' }} />
                    <span className="text-[11px] font-bold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                        {Math.round(matchScore)}% Match
                    </span>
                </div>
            )}

            <div className="px-6 py-6">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="px-2.5 py-1 text-[10px] font-bold tracking-[1.5px]" style={{ backgroundColor: '#146ef515', color: '#146ef5', borderRadius: '4px' }}>
                        {opportunity.category}
                    </span>
                    {opportunity.difficulty && (
                        <span className="px-2.5 py-1 text-[10px] font-bold tracking-[1.5px]" style={{ backgroundColor: `${difficultyColor}15`, color: difficultyColor, borderRadius: '4px' }}>
                            {opportunity.difficulty}
                        </span>
                    )}
                </div>

                <h3 className="text-[18px] font-semibold leading-[1.3] mb-3 line-clamp-2 group-hover:text-[#146ef5] transition-colors" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                    {opportunity.title}
                </h3>

                <div className="flex items-center gap-4 text-[11px] font-semibold tracking-[1.5px]" style={{ color: isDarkMode ? '#6a6a6a' : '#8a8a8a' }}>
                    <div className="flex items-center gap-1.5">
                        <MapPin size={12} />
                        <span>{opportunity.location || 'Remote'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Calendar size={12} />
                        <span>{deadlineText}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

const SkeletonCard: React.FC = () => {
    const { isDarkMode } = useDarkMode();
    return (
        <div className="animate-pulse" style={{ backgroundColor: isDarkMode ? '#111' : '#f0f0f0', borderRadius: '8px', height: '200px' }} />
    );
};

const OpportunitiesPage: React.FC = () => {
    const { isDarkMode, toggleDarkMode } = useDarkMode();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');

    const { data: opportunities, loading } = useOpportunities();

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
        return opportunities.filter((opportunity) => {
            if (selectedCategory !== 'All' && opportunity.category !== selectedCategory) return false;
            if (!term) return true;
            const haystack = [opportunity.title, opportunity.organization, opportunity.description, opportunity.location]
                .filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(term);
        });
    }, [opportunities, searchTerm, selectedCategory]);
    const visibleOpportunities = filteredOpportunities.slice(0, 24);

    const webflowShadow = isDarkMode
        ? '0 84px 24px rgba(0,0,0,0.3), 0 54px 22px rgba(0,0,0,0.2), 0 30px 18px rgba(0,0,0,0.15), 0 13px 13px rgba(0,0,0,0.1), 0 3px 7px rgba(0,0,0,0.08)'
        : '0 84px 24px rgba(0,0,0,0), 0 54px 22px rgba(0,0,0,0.01), 0 30px 18px rgba(0,0,0,0.04), 0 13px 13px rgba(0,0,0,0.08), 0 3px 7px rgba(0,0,0,0.09)';

    const cardShadow = isDarkMode
        ? '0 1px 0 rgba(255,255,255,0.1), 0 13px 13px rgba(0,0,0,0.2), 0 3px 7px rgba(0,0,0,0.1)'
        : '0 1px 0 #d8d8d8, 0 13px 13px rgba(0,0,0,0.04), 0 3px 7px rgba(0,0,0,0.08)';

    return (
        <div style={{ backgroundColor: isDarkMode ? '#080808' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808', fontFamily: "'Inter', 'Arial', sans-serif", minHeight: '100vh' }}>
            <motion.header
                className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md transition-colors duration-300"
                style={{ backgroundColor: isDarkMode ? 'rgba(8, 8, 8, 0.9)' : 'rgba(255, 255, 255, 0.95)' }}
            >
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between" style={{ borderBottom: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <Link to="/" className="flex items-center gap-2.4 cursor-pointer">
                        <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                        <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            edutu
                        </span>
                    </Link>

                    <div className="flex items-center gap-4">
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 px-5 py-2.4 text-[16px] font-medium rounded cursor-pointer transition-all duration-200"
                            style={{
                                backgroundColor: '#146ef5',
                                color: '#ffffff',
                                borderRadius: '4px',
                                boxShadow: webflowShadow
                            }}
                            onMouseEnter={(e) => {
                                (e.target as HTMLElement).style.transform = 'translateY(-2px)';
                                (e.target as HTMLElement).style.backgroundColor = '#0055d4';
                            }}
                            onMouseLeave={(e) => {
                                (e.target as HTMLElement).style.transform = 'translateY(0)';
                                (e.target as HTMLElement).style.backgroundColor = '#146ef5';
                            }}
                        >
                            Back to Home <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>
            </motion.header>

            <main className="relative z-10">
                <section className="pt-[160px] pb-[64px] px-4 sm:px-6">
                    <div className="max-w-[1200px] mx-auto text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            className="inline-flex items-center gap-2.4 px-4 py-2 mb-8 rounded"
                            style={{
                                backgroundColor: '#146ef510',
                                border: `1px solid #146ef530`,
                                borderRadius: '4px'
                            }}
                        >
                            <Globe size={14} style={{ color: '#146ef5' }} />
                            <span className="text-[12.8px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                DISCOVER & GROW
                            </span>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="text-[48px] sm:text-[64px] md:text-[72px] font-semibold leading-[1.04] tracking-[-0.8px] mb-8"
                            style={{ color: isDarkMode ? '#ffffff' : '#080808' }}
                        >
                            Explore <span style={{ color: '#146ef5' }}>Opportunities</span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="max-w-[640px] text-[20px] leading-[1.5] font-normal mx-auto"
                            style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}
                        >
                            Browse scholarships, fellowships, internships, and programs from 31+ countries. Sign in to unlock personalized matches.
                        </motion.p>
                    </div>
                </section>

                <section className="py-8 px-4 sm:px-6 sticky top-[64px] z-40" style={{ backgroundColor: isDarkMode ? '#080808' : '#ffffff' }}>
                    <div className="max-w-[1200px] mx-auto space-y-4">
                        <div className="flex gap-3">
                            <div className="flex-1 relative">
                                <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#8a8a8a' }} />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search opportunities..."
                                    className="w-full pl-11 pr-4 py-3 text-[16px] font-medium outline-none transition-all duration-200"
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#f8f8f8',
                                        border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                        borderRadius: '4px',
                                        color: isDarkMode ? '#f5f5f5' : '#080808'
                                    }}
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8a8a8a' }}
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className="px-4 py-2 text-[11px] font-bold tracking-[1.5px] rounded whitespace-nowrap transition-all duration-200"
                                    style={{
                                        backgroundColor: selectedCategory === cat ? '#146ef5' : isDarkMode ? '#111' : '#f8f8f8',
                                        color: selectedCategory === cat ? '#ffffff' : isDarkMode ? '#ababab' : '#5a5a5a',
                                        border: `1px solid ${selectedCategory === cat ? '#146ef5' : isDarkMode ? '#222' : '#d8d8d8'}`,
                                        borderRadius: '4px'
                                    }}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        <div className="text-[12px] font-semibold tracking-[1.5px]" style={{ color: isDarkMode ? '#5a5a5a' : '#ababab' }}>
                            {filteredOpportunities.length} {filteredOpportunities.length === 1 ? 'opportunity' : 'opportunities'} found
                        </div>
                    </div>
                </section>

                <section className="py-16 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <div className="max-w-[1200px] mx-auto">
                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <SkeletonCard key={i} />
                                ))}
                            </div>
                        ) : filteredOpportunities.length > 0 ? (
                            <div className="space-y-10">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {visibleOpportunities.map((opportunity, index) => (
                                        <OpportunityCard
                                            key={opportunity.id}
                                            opportunity={opportunity}
                                            index={index}
                                            onNavigate={navigate}
                                        />
                                    ))}
                                </div>
                                <motion.div
                                    initial={{ opacity: 0, y: 18 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    className="relative overflow-hidden rounded-[28px] border p-8 md:p-12 text-center"
                                    style={{
                                        background: isDarkMode
                                            ? 'linear-gradient(135deg, rgba(20,110,245,0.22), rgba(0,184,107,0.16)), #0f1720'
                                            : 'linear-gradient(135deg, #eaf3ff, #e9fff5)',
                                        borderColor: isDarkMode ? 'rgba(255,255,255,0.14)' : '#b9dafb',
                                        boxShadow: webflowShadow,
                                    }}
                                >
                                    <div className="absolute inset-x-0 top-0 h-24" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.14), transparent)' }} />
                                    <div className="relative z-10 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#ffffff', color: '#146ef5' }}>
                                        <LockKeyhole size={30} />
                                    </div>
                                    <h2 className="relative z-10 text-[32px] md:text-[48px] font-semibold leading-tight mb-4" style={{ color: isDarkMode ? '#ffffff' : '#08243d' }}>
                                        Unlock 1,000+ more global opportunities
                                    </h2>
                                    <p className="relative z-10 max-w-2xl mx-auto text-[17px] leading-relaxed mb-8" style={{ color: isDarkMode ? '#c7d2da' : '#466176' }}>
                                        Sign up or download the app to view the full scholarship, internship, fellowship, and grant feed with personalized matches.
                                    </p>
                                    <div className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-3">
                                        <button
                                            onClick={() => navigate('/auth')}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold"
                                            style={{ backgroundColor: '#146ef5', color: '#ffffff' }}
                                        >
                                            Sign up to unlock <ArrowRight size={16} />
                                        </button>
                                        <button
                                            onClick={() => navigate('/auth')}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border px-7 py-3.5 text-sm font-bold"
                                            style={{ borderColor: isDarkMode ? 'rgba(255,255,255,0.18)' : '#b9dafb', color: isDarkMode ? '#ffffff' : '#08243d' }}
                                        >
                                            <Smartphone size={16} /> Download app
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-20"
                            >
                                <div className="h-20 w-20 flex items-center justify-center mx-auto mb-6 rounded" style={{ backgroundColor: '#146ef510', borderRadius: '8px' }}>
                                    <Trophy size={32} style={{ color: '#146ef5' }} />
                                </div>
                                <h3 className="text-[24px] font-semibold mb-3" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                    No opportunities found
                                </h3>
                                <p className="text-[16px]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    Try adjusting your search or filters to find what you're looking for.
                                </p>
                            </motion.div>
                        )}
                    </div>
                </section>

                <section className="py-32 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <div className="max-w-[1000px] mx-auto text-center p-12 lg:p-20" style={{ backgroundColor: '#146ef5', borderRadius: '8px', boxShadow: webflowShadow }}>
                        <h2 className="text-[40px] md:text-[56px] font-semibold leading-[1.04] mb-6 text-white">
                            Ready to find your match?
                        </h2>
                        <p className="max-w-[500px] mx-auto text-[18px] leading-[1.5] mb-10" style={{ color: '#ffffffcc' }}>
                            Sign in to get AI-powered personalized recommendations based on your profile and goals.
                        </p>
                        <button
                            onClick={() => navigate('/auth')}
                            className="inline-flex items-center gap-2 px-10 py-4 text-[16px] font-medium rounded cursor-pointer transition-all duration-200"
                            style={{
                                backgroundColor: '#ffffff',
                                color: '#080808',
                                borderRadius: '4px',
                                boxShadow: '0 1px 0 rgba(0,0,0,0.1), 0 13px 13px rgba(0,0,0,0.2), 0 3px 7px rgba(0,0,0,0.15)'
                            }}
                            onMouseEnter={(e) => {
                                (e.target as HTMLElement).style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                (e.target as HTMLElement).style.transform = 'translateY(0)';
                            }}
                        >
                            Sign In <ArrowRight size={16} />
                        </button>
                    </div>
                </section>
            </main>

            <footer className="py-16 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
                    <div className="max-w-[300px]">
                        <Link to="/" className="flex items-center gap-2 mb-4">
                            <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                            <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                edutu
                            </span>
                        </Link>
                        <p className="text-[16px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                            Modular career operating system. Mapping potential to progress, one milestone at a time.
                        </p>
                    </div>

                    <div className="flex items-center gap-6">
                        <a href="https://twitter.com/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                            <Twitter size={20} />
                        </a>
                        <a href="https://linkedin.com/company/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                            <Linkedin size={20} />
                        </a>
                        <a href="https://github.com/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                            <Github size={20} />
                        </a>
                    </div>
                </div>
                <div className="max-w-[1200px] mx-auto mt-12 pt-8 flex justify-between items-center" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <span className="text-[10px] font-semibold tracking-[1.5px]" style={{ color: isDarkMode ? '#5a5a5a' : '#ababab' }}>© {new Date().getFullYear()} Edutu Inc.</span>
                    <span className="text-[10px] font-semibold tracking-[1.5px]" style={{ color: isDarkMode ? '#5a5a5a' : '#ababab' }}>v3.0.4-beta</span>
                </div>
            </footer>
        </div>
    );
};

export default OpportunitiesPage;
