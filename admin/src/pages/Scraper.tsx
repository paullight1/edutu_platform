import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    Bug,
    Play,
    Pause,
    RefreshCw,
    Plus,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Clock,
    Globe,
    X,
    BarChart3,
    AlertTriangle,
    ExternalLink,
    Zap,
    Activity,
    Search,
    Database,
    FileCheck,
    ChevronRight,
    Save,
    Filter,
    ArrowLeft,
} from 'lucide-react';

interface ScrapeSource {
    id: number;
    name: string;
    url: string;
    tier: number;
    category: string;
    enabled: boolean;
    priority: number;
    last_scraped: string | null;
    last_success: string | null;
    last_error: string | null;
    total_scraped: number;
    total_failed: number;
    parent_id?: number | null;
    is_group?: boolean;
}


interface ScrapeJob {
    id: string;
    source_id: number;
    source_name?: string;
    run_type: string;
    status: string;
    urls_discovered: number;
    urls_scraped: number;
    urls_saved?: number;
    urls_failed?: number;
    items_found?: number;
    source_results?: any; // usually stringified JSON or array
    errors: string[];
    warnings: string[];
    duration_seconds: number;
    started_at: string;
    completed_at: string | null;
}

interface ScrapeStats {
    total_opportunities: number;
    by_source: Record<string, number>;
    recent_scrape_count: number;
}

interface SourceResult {
    name: string;
    url: string;
    status: 'success' | 'failed' | 'skipped' | 'pending';
    itemsFound: number;
    itemsSaved: number;
    error?: string;
    duration?: number;
}

interface ScrapedOpportunity {
    title: string;
    organization?: string;
    category?: string;
    deadline?: string | null;
    location?: string;
    description?: string;
    applyUrl?: string;
    amount?: number | null;
    source: string;
    sourceUrl?: string;
}

interface ScrapeResult {
    success: boolean;
    sourcesScraped?: number;
    totalResults?: number;
    duration?: number;
    sources?: string[];
    error?: string;
    sourceResults?: SourceResult[];
    opportunities?: ScrapedOpportunity[];
}

interface Notification {
    id: number;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
}


interface Opportunity {
    id: string;
    title: string;
    organization: string;
    category: string;
    deadline: string | null;
    location: string;
    description: string;
    applyUrl: string;
    amount: number | null;
    source: string;
    createdAt: string;
}

export default function ScraperDashboard() {
    const [sources, setSources] = useState<ScrapeSource[]>([]);
    const [jobs, setJobs] = useState<ScrapeJob[]>([]);
    const [showAllJobs, setShowAllJobs] = useState(false);
    const [stats, setStats] = useState<ScrapeStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [maxPages, setMaxPages] = useState(3);
    const [showConfigureModal, setShowConfigureModal] = useState(false);
    const [configSource, setConfigSource] = useState<ScrapeSource | null>(null);

    // Automation Settings State
    const [autoRunEnabled, setAutoRunEnabled] = useState(false);
    const [cronSchedule, setCronSchedule] = useState('0 0 * * *');
    const [dataRetentionDays, setDataRetentionDays] = useState<number | null>(null);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    const API_URL = 'http://localhost:3000/api/scraper';
    const [showAddSource, setShowAddSource] = useState(false);
    const [newSource, setNewSource] = useState<{ name: string; url: string; category: string; asGroup?: boolean; parentId?: number }>({ name: '', url: '', category: 'scholarship', asGroup: false });
    const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
    const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
    const [recentOpportunities, setRecentOpportunities] = useState<Opportunity[]>([]);

    // Inspect Job & Data Retention
    const [inspectJobDetails, setInspectJobDetails] = useState<ScrapeJob | null>(null);
    const [inspectOpportunities, setInspectOpportunities] = useState<any[]>([]);
    const [isLoadingInspect, setIsLoadingInspect] = useState(false);
    const [isPurging, setIsPurging] = useState(false);

    // New state for enhanced UX
    const [showLoadingModal, setShowLoadingModal] = useState(false);
    const [showResultsModal, setShowResultsModal] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [scrapingProgress, setScrapingProgress] = useState<{ source: string; status: 'pending' | 'scraping' | 'completed' | 'failed'; progress: number }[]>([]);
    const [selectedOpportunities, setSelectedOpportunities] = useState<Set<number>>(new Set());
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const showNotification = (message: string, type: Notification['type'] = 'info') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
    const [opportunityFilter, setOpportunityFilter] = useState('');
    const [modalError, setModalError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
    const abortControllerRef = { current: null as AbortController | null };


    const fetchSettings = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(`${API_URL}/settings`, {
                headers: { 'Authorization': `Bearer ${session?.access_token || 'dev-token'}` }
            });
            if (response.ok) {
                const data = await response.json();
                setAutoRunEnabled(data.auto_run_enabled);
                setCronSchedule(data.cron_schedule);
                setDataRetentionDays(data.data_retention_days || null);
            }
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        }
    };

    const handleUpdateSettings = async () => {
        setIsSavingSettings(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(`${API_URL}/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token || 'dev-token'}`
                },
                body: JSON.stringify({
                    auto_run_enabled: autoRunEnabled,
                    cron_schedule: cronSchedule,
                    data_retention_days: dataRetentionDays
                })
            });
            if (response.ok) {
                showNotification('Automation settings updated', 'success');
            } else {
                showNotification('Failed to update settings', 'error');
            }
        } catch (error) {
            console.error('Failed to update settings:', error);
            showNotification('Error updating settings', 'error');
        } finally {
            setIsSavingSettings(false);
        }
    };

    const handleDataRetention = async (days: number) => {
        if (!confirm(`Are you sure you want to permanently delete all opportunities older than ${days} days?`)) return;
        setIsPurging(true);
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const { error } = await supabase
                .from('opportunities')
                .delete()
                .lt('created_at', cutoffDate.toISOString());

            if (error) throw error;

            showNotification(`Opportunities older than ${days} days purged.`, 'success');
            loadRecentOpportunities(); // refresh
        } catch (e) {
            console.error('Failed to purge data:', e);
            showNotification('Failed to purge data', 'error');
        } finally {
            setIsPurging(false);
        }
    };

    const handleSetRetention = async (days: number | null) => {
        setDataRetentionDays(days);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            await fetch(`${API_URL}/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token || 'dev-token'}`
                },
                body: JSON.stringify({
                    auto_run_enabled: autoRunEnabled,
                    cron_schedule: cronSchedule,
                    data_retention_days: days
                })
            });
            showNotification(`Retention policy set to ${days ? days + ' days' : 'Off'}`, 'success');

            if (days !== null) {
                handleDataRetention(days);
            }
        } catch (e) {
            console.error(e);
            showNotification('Failed to update retention policy', 'error');
        }
    };

    const handleInspectJob = async (job: ScrapeJob) => {
        setInspectJobDetails(job);
        setIsLoadingInspect(true);
        try {
            // Search opportunities that have this scrape_job_id in metadata
            const { data, error } = await supabase
                .from('opportunities')
                .select('*')
                // Wait, text search inside JSONB block:
                // Using textSearch or containing logic. 
                // Because metadata is JSONB, we can do: .contains('metadata', { scrape_job_id: job.id })
                .contains('metadata', `{"scrape_job_id": "${job.id}"}`);

            if (error) throw error;
            setInspectOpportunities(data || []);
        } catch (e) {
            console.error(e);
            showNotification('Failed to load opportunities for this job', 'error');
        } finally {
            setIsLoadingInspect(false);
        }
    };

    const handleDeleteJob = async (id: string) => {
        if (!confirm('Are you sure you want to delete this job and all opportunities scraped in it?')) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(`${API_URL}/jobs/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session?.access_token || 'dev-token'}` }
            });
            if (response.ok) {
                showNotification('Job and associated opportunities deleted', 'success');
                // Refresh data
                loadData();
                loadRecentOpportunities();
            } else {
                const { error } = await response.json();
                showNotification(`Failed to delete job: ${error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Failed to delete job:', error);
            showNotification('Error deleting job', 'error');
        }
    };

    useEffect(() => {
        loadData();
        loadRecentOpportunities();
        fetchSettings();

        // Subscribe to real-time scrape logs for live dashboard updates
        const scrapeLogsChannel = supabase
            .channel('public:scrape_logs')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'scrape_logs' },
                (payload) => {
                    setJobs(current => [payload.new as ScrapeJob, ...current].slice(0, 20));
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'scrape_logs' },
                (payload) => {
                    setJobs(current => current.map(job => job.id === payload.new.id ? payload.new as ScrapeJob : job));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(scrapeLogsChannel);
        };
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            await loadRecentOpportunities();

            let sourcesData = [];
            try {
                const sourcesRes = await supabase.from('scraping_sources').select('*').order('priority');
                if (sourcesRes.data) sourcesData = sourcesRes.data;
            } catch (e) {
                console.warn('scraping_sources table not found:', e);
            }
            setSources(sourcesData);

            let jobsData = [];
            try {
                const jobsRes = await supabase.from('scrape_logs').select('*').order('created_at', { ascending: false }).limit(20);
                if (jobsRes.data) jobsData = jobsRes.data;
            } catch (e) {
                console.warn('scrape_logs table not found:', e);
            }
            setJobs(jobsData);

            let statsData = [];
            try {
                const statsRes = await supabase.from('opportunities').select('source');
                if (statsRes.data) statsData = statsRes.data;
            } catch (e) {
                console.warn('opportunities table not found:', e);
            }

            const bySource: Record<string, number> = {};
            statsData.forEach((item: any) => {
                const source = item.source || 'manual';
                bySource[source] = (bySource[source] || 0) + 1;
            });

            setStats({
                total_opportunities: statsData.length,
                by_source: bySource,
                recent_scrape_count: jobsData.filter((j: any) => j.status === 'completed').length || 0,
            });
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setLoading(false);
    }

    async function loadRecentOpportunities() {
        try {
            const { data } = await supabase
                .from('opportunities')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);
            if (data) setRecentOpportunities(data as Opportunity[]);
        } catch (e) {
            console.warn('Could not load recent opportunities:', e);
        }
    }

    function stopScrape() {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setScraping(false);
        setShowLoadingModal(false);
        setModalError(null);
    }

    async function startScrape(sourceId?: number) {
        // Guard: only scrape enabled sources
        const sourcesToScrape = sourceId
            ? sources.filter(s => s.id === sourceId)
            : sources.filter(s => s.enabled);

        if (sourcesToScrape.length === 0) {
            setScrapeResult({
                success: false,
                error: sourceId
                    ? 'Selected source is disabled. Enable it first.'
                    : 'No enabled sources found. Enable at least one source before scraping.',
            });
            return;
        }

        setScraping(true);
        setScrapeResult(null);
        setModalError(null);
        setShowLoadingModal(true);
        setCurrentStep(1);

        // Initialize progress tracking
        setScrapingProgress(
            sourcesToScrape.map(s => ({ source: s.name, status: 'pending' as const, progress: 0 }))
        );

        // Create an AbortController so we can cancel
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            // Use port 3000 (NestJS default) unless overridden by env
            const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');

            // Step 1: Connecting to sources
            setCurrentStep(1);
            await new Promise(r => setTimeout(r, 500));

            // Step 2: Starting scrape
            setCurrentStep(2);
            // Mark all as 'scraping'
            setScrapingProgress(sourcesToScrape.map(s => ({ source: s.name, status: 'scraping' as const, progress: 0 })));

            const response = await fetch(`${backendUrl}/api/scraper/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token || (import.meta.env.VITE_API_KEY || 'edutu-dev-key')}`,
                },
                body: JSON.stringify({
                    sourceId: sourceId ?? undefined,
                    allSources: !sourceId,
                    maxPages: maxPages,
                }),
                signal: controller.signal,
            });

            // Step 3: Processing results
            setCurrentStep(3);

            if (response.ok) {
                const result = await response.json();
                console.log('Scrape result:', result);

                // Map backend response to expected ScrapeResult shape
                const mapped: ScrapeResult = {
                    success: result.success,
                    sourcesScraped: result.sourcesScraped ?? sourcesToScrape.length,
                    totalResults: result.totalResults ?? 0,
                    duration: result.duration,
                    error: result.error,
                    sourceResults: result.sourceResults ?? sourcesToScrape.map(s => ({
                        name: s.name,
                        url: s.url,
                        status: 'success' as const,
                        itemsFound: 0,
                        itemsSaved: 0,
                    })),
                    opportunities: result.opportunities ?? [],
                };

                setScrapeResult(mapped);

                setScrapingProgress(
                    (result.sourceResults ?? sourcesToScrape.map(s => ({ name: s.name, status: 'success' }))).map((sr: any) => ({
                        source: sr.name,
                        status: sr.status === 'failed' ? 'failed' as const : 'completed' as const,
                        progress: 100,
                    }))
                );

                // Step 4: Complete
                setCurrentStep(4);
                await new Promise(r => setTimeout(r, 1000));

                setShowLoadingModal(false);
                setShowResultsModal(true);
                await loadData();
                await loadRecentOpportunities();
            } else {
                const errorText = await response.text();
                console.error('Scrape failed:', response.status, errorText);
                let errorMsg = `Server error ${response.status}`;
                try { errorMsg = JSON.parse(errorText).message || errorMsg; } catch { /* noop */ }
                setModalError(`Backend error: ${errorMsg}`);
                setScrapeResult({ success: false, error: errorMsg });
            }
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('Scrape cancelled by user');
                setModalError(null);
            } else {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                console.error('Scrape error:', error);
                const hint = msg.includes('Failed to fetch')
                    ? `Cannot reach backend. Make sure it is running on port 3000:\n  cd backend/services/services/api && npm run start:dev`
                    : msg;
                setModalError(hint);
                setScrapeResult({ success: false, error: hint });
            }
        }
        setScraping(false);
        abortControllerRef.current = null;
    }

    async function toggleSource(source: ScrapeSource) {
        await supabase
            .from('scraping_sources')
            .update({ enabled: !source.enabled })
            .eq('id', source.id);
        loadData();
    }

    async function deleteSource(id: number) {
        if (!confirm('Delete this source?')) return;
        await supabase.from('scraping_sources').delete().eq('id', id);
        loadData();
    }

    async function addSource(parentId: number | null = null, asGroup: boolean = false) {
        if (!newSource.name || (!newSource.url && !asGroup)) {
            showNotification('Please fill in required fields', 'warning');
            return;
        }

        try {
            const { error } = await supabase.from('scraping_sources').insert({
                name: newSource.name,
                url: asGroup ? '' : newSource.url,
                category: newSource.category,
                tier: 2,
                enabled: true,
                priority: sources.length + 1,
                parent_id: parentId,
                is_group: asGroup
            });

            if (error) {
                if (error.code === '23505') {
                    showNotification('Source with this URL already exists', 'error');
                } else {
                    showNotification(`Error adding source: ${error.message}`, 'error');
                }
                return;
            }

            showNotification(asGroup ? 'Group created' : 'Source added', 'success');
            setNewSource({ name: '', url: '', category: 'scholarship' });
            setShowAddSource(false);
            loadData();
        } catch (err: any) {
            showNotification(`Unexpected error: ${err.message}`, 'error');
        }
    }

    const toggleGroup = (id: number) => {
        const next = new Set(expandedGroups);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedGroups(next);
    };

    const filteredSources = sources.filter(s => {
        if (filter === 'enabled') return s.enabled;
        if (filter === 'disabled') return !s.enabled;
        return true;
    });

    // Filter opportunities based on search
    const filteredOpportunities = scrapeResult?.opportunities?.filter(opp =>
        !opportunityFilter ||
        opp.title.toLowerCase().includes(opportunityFilter.toLowerCase()) ||
        opp.organization?.toLowerCase().includes(opportunityFilter.toLowerCase()) ||
        opp.category?.toLowerCase().includes(opportunityFilter.toLowerCase())
    ) || [];

    const toggleOpportunitySelection = (index: number) => {
        const newSelection = new Set(selectedOpportunities);
        if (newSelection.has(index)) {
            newSelection.delete(index);
        } else {
            newSelection.add(index);
        }
        setSelectedOpportunities(newSelection);
    };

    const selectAllOpportunities = () => {
        if (selectedOpportunities.size === filteredOpportunities.length) {
            setSelectedOpportunities(new Set());
        } else {
            setSelectedOpportunities(new Set(filteredOpportunities.map((_, i) => i)));
        }
    };

    const addSelectedOpportunities = async () => {
        if (selectedOpportunities.size === 0) return;
        setIsSaving(true);
        let saved = 0;
        const oppsToSave = filteredOpportunities.filter((_, i) => selectedOpportunities.has(i));

        for (const opp of oppsToSave) {
            try {
                const { error } = await supabase.from('opportunities').upsert(
                    {
                        title: opp.title,
                        organization: opp.organization || null,
                        category: opp.category || null,
                        deadline: opp.deadline || null,
                        location: opp.location || null,
                        description: opp.description || null,
                        apply_url: opp.applyUrl || null,
                        amount: opp.amount || null,
                        source: opp.source || 'manual',
                        source_url: opp.sourceUrl || null,
                        status: 'active',
                        created_at: new Date().toISOString(),
                    },
                    { onConflict: 'apply_url', ignoreDuplicates: true }
                );
                if (!error) saved++;
            } catch (err) {
                console.error('Failed to save opportunity:', err);
            }
        }

        showNotification(`Successfully added ${saved} opportunities`, 'success');
        setIsSaving(false);
        setSelectedOpportunities(new Set());
        await loadRecentOpportunities();
        await loadData();
        setShowResultsModal(false);
        setScrapeResult(prev => prev ? {
            ...prev,
            success: true,
            totalResults: (prev.totalResults || 0),
        } : null);
        showNotification(`Successfully saved ${saved} opportunities`, 'success');
    };

    // Grouping logic for the table
    const rootSources = filteredSources.filter(s => !s.parent_id || !sources.find(ps => ps.id === s.parent_id));
    const getChildren = (parentId: number) => filteredSources.filter(s => s.parent_id === parentId);

    const renderSourceRow = (source: ScrapeSource, depth: number = 0) => {
        const children = getChildren(source.id);
        const isExpanded = expandedGroups.has(source.id);
        const hasChildren = children.length > 0 || source.is_group;

        return (
            <React.Fragment key={source.id}>
                <tr style={{
                    borderTop: '1px solid var(--border-light)',
                    transition: 'background 0.15s ease',
                    cursor: hasChildren ? 'pointer' : 'default',
                    background: source.is_group ? 'var(--bg-tertiary)' : 'transparent'
                }}
                    onClick={() => hasChildren && toggleGroup(source.id)}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-tertiary)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = source.is_group ? 'var(--bg-tertiary)' : 'transparent';
                    }}
                >
                    <td style={{ padding: '16px 24px', paddingLeft: 24 + (depth * 32) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {hasChildren && (
                                <ChevronRight
                                    size={16}
                                    style={{
                                        transform: isExpanded ? 'rotate(90deg)' : 'none',
                                        transition: 'transform 0.2s',
                                        color: 'var(--text-tertiary)'
                                    }}
                                />
                            )}
                            <div>
                                <p style={{
                                    fontWeight: source.is_group ? 600 : 500,
                                    color: 'var(--text-primary)',
                                    marginBottom: 4,
                                    fontSize: source.is_group ? 15 : 14
                                }}>
                                    {source.name}
                                    {source.is_group && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400, textTransform: 'uppercase' }}>Website Group</span>}
                                </p>
                                {source.url && (
                                    <a
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--link-blue)',
                                            textDecoration: 'none',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        {source.url.length > 40 ? `${source.url.slice(0, 40)}...` : source.url}
                                        <ExternalLink size={10} />
                                    </a>
                                )}
                            </div>
                        </div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                        <span style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: source.tier === 1 ? 'rgba(0, 113, 227, 0.1)' : source.tier === 2 ? 'rgba(52, 199, 89, 0.1)' : 'rgba(175, 82, 222, 0.1)',
                            color: source.tier === 1 ? '#0071e3' : source.tier === 2 ? '#34c759' : '#af52de',
                        }}>
                            Tier {source.tier}
                        </span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleSource(source); }}
                            style={{
                                padding: '6px 12px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 500,
                                border: 'none',
                                cursor: 'pointer',
                                background: source.enabled ? 'rgba(52, 199, 89, 0.1)' : 'var(--bg-tertiary)',
                                color: source.enabled ? '#34c759' : 'var(--text-tertiary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            {source.enabled ? <CheckCircle2 size={12} /> : <Pause size={12} />}
                            {source.enabled ? 'Active' : 'Disabled'}
                        </button>
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: 13, color: 'var(--text-tertiary)' }}>
                        {formatDate(source.last_scraped)}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                        {source.total_scraped + source.total_failed > 0 ? (
                            <span style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: 'var(--text-primary)'
                            }}>
                                {Math.round(
                                    (source.total_scraped / (source.total_scraped + source.total_failed)) * 100
                                )}%
                            </span>
                        ) : (
                            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>-</span>
                        )}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                        <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => {
                                    if (source.is_group) {
                                        showNotification(`Starting scrape for all ${source.name} sources`, 'info');
                                    }
                                    startScrape(source.id);
                                }}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#0071e3',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(0, 113, 227, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                }}
                                title={source.is_group ? "Scrape all in group" : "Scrape this source"}
                            >
                                <Play size={14} />
                                {source.is_group && <span style={{ fontSize: 11, fontWeight: 600 }}>RUN ALL</span>}
                            </button>
                            <button
                                onClick={() => deleteSource(source.id)}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#ff3b30',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 59, 48, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                }}
                                title="Delete source"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </td>
                </tr>
                {isExpanded && children.map(child => renderSourceRow(child, depth + 1))}
            </React.Fragment>
        );
    };



    const enabledSourcesCount = sources.filter(s => s.enabled).length;

    const mainStats = [
        {
            icon: BarChart3,
            label: 'Total Opportunities',
            value: stats?.total_opportunities || 0,
            gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            iconColor: '#ffffff',
        },
        {
            icon: Globe,
            label: 'Active Sources',
            value: enabledSourcesCount,
            gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            iconColor: '#ffffff',
        },
        {
            icon: Clock,
            label: 'Recent Jobs',
            value: stats?.recent_scrape_count || 0,
            gradient: 'linear-gradient(135deg, #ff6600 0%, #ff4500 100%)',
            iconColor: '#ffffff',
        },
        {
            icon: Activity,
            label: 'Failed Jobs',
            value: jobs.filter(j => j.status === 'failed').length,
            gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            iconColor: '#ffffff',
        },
    ];

    return (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '32px'
            }}>
                <div>
                    <h1 style={{
                        fontSize: '28px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '4px'
                    }}>
                        <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white'
                        }}>
                            <Bug size={20} strokeWidth={2} />
                        </div>
                        Edutu Engine
                    </h1>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>
                        Manage scholarship scraping sources and jobs
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => startScrape()}
                        disabled={scraping || enabledSourcesCount === 0}
                        title={enabledSourcesCount === 0 ? 'No enabled sources — enable at least one source first' : undefined}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 20px',
                            background: (scraping || enabledSourcesCount === 0) ? 'var(--border-medium)' : 'var(--apple-blue)',
                            color: (scraping || enabledSourcesCount === 0) ? 'var(--text-tertiary)' : 'white',
                            border: 'none',
                            borderRadius: 10,
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: (scraping || enabledSourcesCount === 0) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                            if (!scraping && enabledSourcesCount !== 0) {
                                e.currentTarget.style.background = 'var(--apple-blue-hover)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!scraping && enabledSourcesCount !== 0) {
                                e.currentTarget.style.background = 'var(--apple-blue)';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }
                        }}
                    >
                        {scraping ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                        {scraping ? 'Scraping...' : enabledSourcesCount === 0 ? 'No Sources' : 'Start Scrape'}
                    </button>
                    <button
                        onClick={loadData}
                        style={{
                            padding: '10px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 10,
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--bg-tertiary)';
                            e.currentTarget.style.borderColor = 'var(--border-medium)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--bg-secondary)';
                            e.currentTarget.style.borderColor = 'var(--border-light)';
                        }}
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            {/* Scrape Result */}
            {scrapeResult && (
                <div style={{
                    padding: '16px 20px',
                    borderRadius: 12,
                    border: `1px solid ${scrapeResult.success ? 'rgba(52, 199, 89, 0.3)' : 'rgba(255, 59, 48, 0.3)'}`,
                    background: scrapeResult.success ? 'rgba(52, 199, 89, 0.05)' : 'rgba(255, 59, 48, 0.05)',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                }}>
                    {scrapeResult.success ? (
                        <CheckCircle2 size={20} color="#34c759" />
                    ) : (
                        <AlertCircle size={20} color="#ff3b30" />
                    )}
                    <div>
                        <span style={{
                            fontWeight: 600,
                            color: scrapeResult.success ? '#34c759' : '#ff3b30',
                            fontSize: 14
                        }}>
                            {scrapeResult.success ? '✓ Scrape Complete!' : '✕ Scrape Failed'}
                        </span>
                        {scrapeResult.success && (
                            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                {scrapeResult.sourcesScraped} sources • {scrapeResult.totalResults} results • {scrapeResult.duration}s
                            </div>
                        )}
                        {!scrapeResult.success && (
                            <div style={{ fontSize: 13, color: '#ff3b30', marginTop: '2px' }}>
                                {scrapeResult.error}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Stats Grid - Google Material Style */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px',
                marginBottom: '24px'
            }}>
                {mainStats.map((stat, index) => (
                    <div
                        key={index}
                        style={{
                            padding: '20px',
                            background: stat.gradient,
                            borderRadius: 12,
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
                        }}
                    >
                        {/* Value */}
                        <div style={{
                            fontSize: 28,
                            fontWeight: 700,
                            color: '#ffffff',
                            marginBottom: '4px',
                            textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                        }}>
                            {loading ? '-' : stat.value.toLocaleString()}
                        </div>

                        {/* Label */}
                        <div style={{
                            fontSize: 13,
                            color: 'rgba(255,255,255,0.9)',
                            fontWeight: 500,
                        }}>
                            {stat.label}
                        </div>

                        {/* Icon - Top Right Corner - Minimal */}
                        <div style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            opacity: 0.9,
                        }}>
                            <stat.icon size={24} strokeWidth={1.5} style={{ color: stat.iconColor }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Sources Table */}
            <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: 14,
                border: '1px solid var(--border-light)',
                overflow: 'hidden',
                marginBottom: '24px',
            }}>
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid var(--border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <h2 style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <Globe size={18} style={{ color: 'var(--text-tertiary)' }} />
                        Sources
                    </h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value as any)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border-medium)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            <option value="all">All Sources</option>
                            <option value="enabled">Enabled</option>
                            <option value="disabled">Disabled</option>
                        </select>
                        <button
                            onClick={() => setShowAddSource(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border-medium)',
                                borderRadius: 8,
                                color: 'var(--text-primary)',
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--border-light)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'var(--bg-tertiary)';
                            }}
                        >
                            <Plus size={14} />
                            Add Source
                        </button>
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-tertiary)' }}>
                                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Source</th>
                                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tier</th>
                                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last Scraped</th>
                                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Success Rate</th>
                                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rootSources.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center' }}>
                                        <AlertCircle size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
                                        <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
                                            No sources found matching your frequency/filter.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                rootSources.map(source => renderSourceRow(source))
                            )}
                        </tbody>

                    </table>
                </div>
            </div>

            {/* Automation Settings */}
            <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: 14,
                border: '1px solid var(--border-light)',
                overflow: 'hidden',
                marginBottom: '24px',
                padding: '20px 24px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Zap size={18} style={{ color: '#0071e3' }} />
                        Scraper Automation
                    </h2>
                    <button
                        onClick={handleUpdateSettings}
                        disabled={isSavingSettings}
                        style={{
                            padding: '8px 16px',
                            background: '#0071e3',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        {isSavingSettings ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Settings
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                            onClick={() => setAutoRunEnabled(!autoRunEnabled)}
                            style={{
                                width: '44px',
                                height: '24px',
                                background: autoRunEnabled ? '#34c759' : 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                position: 'relative',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                border: '1px solid var(--border-medium)'
                            }}
                        >
                            <div style={{
                                width: '18px',
                                height: '18px',
                                background: 'white',
                                borderRadius: '50%',
                                position: 'absolute',
                                top: '2px',
                                left: autoRunEnabled ? '22px' : '2px',
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }} />
                        </div>
                        <div>
                            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Automatic Background Scrape</p>
                            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{autoRunEnabled ? 'Currently running on schedule' : 'Manually triggered only'}</p>
                        </div>
                    </div>
                    <div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>Schedule (Cron Expression)</p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Clock size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                <input
                                    type="text"
                                    value={cronSchedule}
                                    onChange={(e) => setCronSchedule(e.target.value)}
                                    placeholder="0 0 * * *"
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px 8px 32px',
                                        borderRadius: 8,
                                        border: '1px solid var(--border-medium)',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)',
                                        fontSize: 14,
                                        fontFamily: 'monospace'
                                    }}
                                />
                            </div>
                            <select
                                onChange={(e) => e.target.value && setCronSchedule(e.target.value)}
                                defaultValue=""
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px solid var(--border-medium)',
                                    background: 'var(--bg-tertiary)',
                                    color: 'var(--text-primary)',
                                    fontSize: 13,
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="" disabled>Presets</option>
                                <option value="0 * * * *">Every Hour</option>
                                <option value="0 0 * * *">Daily (Midnight)</option>
                                <option value="0 0 * * 1">Weekly (Mon)</option>
                                <option value="0 0 1 * *">Monthly (1st)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Data Retention */}
            <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: 14,
                border: '1px solid var(--border-light)',
                overflow: 'hidden',
                marginBottom: '24px',
                padding: '20px 24px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Database size={18} style={{ color: '#ff9500' }} />
                        Data Retention
                    </h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div>
                            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Opportunities Retention Policy</p>
                            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Automatically purge old data. Currently: <strong style={{ color: 'var(--primary)' }}>{dataRetentionDays ? `${dataRetentionDays} Days` : 'Off'}</strong></p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Off', value: null },
                            { label: '30 Days', value: 30 },
                            { label: '3 Months', value: 90 },
                            { label: '1 Year', value: 365 }
                        ].map((opt) => {
                            const isActive = dataRetentionDays === opt.value;
                            return (
                                <button
                                    key={String(opt.value)}
                                    onClick={() => handleSetRetention(opt.value)}
                                    disabled={isPurging}
                                    style={{
                                        padding: '8px 16px',
                                        background: isActive ? 'var(--primary)' : 'rgba(255, 149, 0, 0.08)',
                                        color: isActive ? 'white' : '#ff9500',
                                        border: isActive ? '1px solid var(--primary)' : '1px solid rgba(255, 149, 0, 0.2)',
                                        borderRadius: 8,
                                        fontSize: 13,
                                        fontWeight: 600,
                                        cursor: isPurging ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        opacity: isPurging ? 0.6 : 1,
                                        boxShadow: isActive ? '0 4px 12px rgba(0, 113, 227, 0.2)' : 'none'
                                    }}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}

                        <div style={{ width: '1px', height: '24px', background: 'var(--border-light)', margin: '0 8px' }} />

                        <button
                            onClick={async () => {
                                if (!confirm('Purge all opportunities that are missing images?')) return;
                                setIsPurging(true);
                                try {
                                    const { error } = await supabase.from('opportunities').delete().is('image_url', null);
                                    if (error) throw error;
                                    showNotification('Opportunities without images purged', 'success');
                                    loadRecentOpportunities();
                                } catch (e) {
                                    showNotification('Purge failed', 'error');
                                } finally {
                                    setIsPurging(false);
                                }
                            }}
                            disabled={isPurging}
                            style={{
                                padding: '8px 16px',
                                background: 'rgba(255, 59, 48, 0.08)',
                                color: '#ff3b30',
                                border: '1px solid rgba(255, 59, 48, 0.2)',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: isPurging ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            Purge No-Image
                        </button>
                    </div>
                </div>
            </div>

            {/* Recent Jobs */}
            <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: 14,
                border: '1px solid var(--border-light)',
                overflow: 'hidden',
                marginBottom: '24px',
            }}>
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid var(--border-light)'
                }}>
                    <h2 style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <Clock size={18} style={{ color: 'var(--text-tertiary)' }} />
                        Recent Jobs
                    </h2>
                </div>
                <div style={{
                    padding: '0 24px 24px 24px'
                }}>
                    {jobs.length === 0 ? (
                        <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                            <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>No scrape jobs yet</p>
                        </div>
                    ) : (
                        <>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '16px',
                                marginTop: '16px'
                            }}>
                                {(showAllJobs ? jobs : jobs.slice(0, 6)).map(job => {
                                    const statusColor = getStatusColor(job.status);

                                    let displayName = job.source_name || (job.source_id ? `Source #${job.source_id}` : 'Manual Extraction');
                                    if (job.source_results) {
                                        try {
                                            const results = typeof job.source_results === 'string'
                                                ? JSON.parse(job.source_results)
                                                : job.source_results;
                                            if (Array.isArray(results) && results.length > 0) {
                                                if (results.length === 1) {
                                                    displayName = results[0].name;
                                                } else {
                                                    displayName = `${results.length} Sources (${results[0].name}, etc.)`;
                                                }
                                            }
                                        } catch (e) {
                                            // Ignore parse error
                                        }
                                    }

                                    const itemsSaved = job.items_found !== undefined ? job.items_found : (job.urls_saved || 0);

                                    return (
                                        <div
                                            key={job.id}
                                            onClick={() => handleInspectJob(job)}
                                            style={{
                                                padding: '16px 20px',
                                                border: '1px solid var(--border-light)',
                                                borderRadius: '12px',
                                                background: 'rgba(0, 113, 227, 0.03)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'space-between',
                                                transition: 'all 0.15s ease',
                                                minHeight: '120px',
                                                cursor: 'pointer'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(0, 113, 227, 0.08)';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'rgba(0, 113, 227, 0.03)';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }}
                                        >
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13, lineHeight: '1.4', paddingRight: '12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <Search size={12} style={{ color: 'var(--text-tertiary)' }} />
                                                        {displayName}
                                                    </span>
                                                    <span style={{
                                                        padding: '3px 8px',
                                                        borderRadius: 6,
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        background: statusColor.bg,
                                                        color: statusColor.text,
                                                        flexShrink: 0,
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {job.status}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                                                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                        {itemsSaved} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>opportunities</span>
                                                    </p>
                                                    <span style={{ height: 10, width: 1, background: 'var(--border-medium)' }} />
                                                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                        {job.duration_seconds}s
                                                    </p>
                                                </div>
                                                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, opacity: 0.8 }}>
                                                    {new Date(job.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteJob(job.id);
                                                    }}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        color: '#ff3b30',
                                                        padding: '6px',
                                                        borderRadius: '8px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'background 0.2s',
                                                    }}
                                                    title="Delete this job and all opportunities scraped via it"
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 59, 48, 0.1)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {jobs.length > 6 && !showAllJobs && (
                                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
                                    <button
                                        onClick={() => setShowAllJobs(true)}
                                        style={{
                                            background: 'var(--surface)',
                                            border: '1px solid var(--border-light)',
                                            color: 'var(--primary)',
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            fontSize: 14,
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'var(--bg-secondary)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'var(--surface)';
                                        }}
                                    >
                                        See More Jobs ({jobs.length - 6} hidden)
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Recent Opportunities */}
            {
                recentOpportunities.length > 0 && (
                    <div style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: 14,
                        border: '1px solid var(--border-light)',
                        overflow: 'hidden',
                        marginBottom: '24px',
                    }}>
                        <div style={{
                            padding: '20px 24px',
                            borderBottom: '1px solid var(--border-light)'
                        }}>
                            <h2 style={{
                                fontSize: 16,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <Zap size={18} style={{ color: 'var(--text-tertiary)' }} />
                                Recently Scraped Opportunities
                            </h2>
                        </div>
                        <div style={{
                            maxHeight: '400px',
                            overflowY: 'auto'
                        }}>
                            {recentOpportunities.map(opp => (
                                <div
                                    key={opp.id}
                                    style={{
                                        padding: '16px 24px',
                                        borderTop: '1px solid var(--border-light)',
                                        transition: 'background 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--bg-tertiary)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1 }}>
                                            <h3 style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 14, marginBottom: 4 }}>
                                                {opp.title}
                                            </h3>
                                            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                                                {opp.organization} • {opp.category}
                                            </p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                {opp.amount && (
                                                    <span style={{
                                                        color: '#34c759',
                                                        fontWeight: 500,
                                                        padding: '2px 8px',
                                                        background: 'rgba(52, 199, 89, 0.1)',
                                                        borderRadius: 4
                                                    }}>
                                                        ${opp.amount.toLocaleString()}
                                                    </span>
                                                )}
                                                {opp.deadline && (
                                                    <span>Deadline: {new Date(opp.deadline).toLocaleDateString()}</span>
                                                )}
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Globe size={10} />
                                                    {opp.location}
                                                </span>
                                            </div>
                                        </div>
                                        {opp.applyUrl && (
                                            <a
                                                href={opp.applyUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    fontSize: 13,
                                                    color: 'var(--link-blue)',
                                                    textDecoration: 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontWeight: 500,
                                                    padding: '6px 12px',
                                                    borderRadius: 6,
                                                    background: 'rgba(0, 113, 227, 0.05)',
                                                    transition: 'background 0.15s ease',
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'rgba(0, 113, 227, 0.1)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'rgba(0, 113, 227, 0.05)';
                                                }}
                                            >
                                                View <ExternalLink size={12} />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {/* Add Source Modal */}
            {
                showAddSource && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                    }} onClick={() => setShowAddSource(false)}>
                        <div
                            style={{
                                background: 'var(--bg-secondary)',
                                borderRadius: 16,
                                padding: '24px',
                                width: '100%',
                                maxWidth: 440,
                                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '20px'
                            }}>
                                <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Add New Source
                                </h3>
                                <button
                                    onClick={() => setShowAddSource(false)}
                                    style={{
                                        padding: '4px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-tertiary)',
                                        cursor: 'pointer',
                                        borderRadius: 4,
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--bg-tertiary)';
                                        e.currentTarget.style.color = 'var(--text-primary)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = 'var(--text-tertiary)';
                                    }}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontWeight: 500,
                                        color: 'var(--text-primary)',
                                        marginBottom: 6,
                                        fontSize: 13
                                    }}>Name</label>
                                    <input
                                        type="text"
                                        value={newSource.name}
                                        onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 8,
                                            border: '1px solid var(--border-medium)',
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                            fontSize: 14,
                                            outline: 'none',
                                        }}
                                        placeholder="Fastweb"
                                    />
                                </div>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontWeight: 500,
                                        color: 'var(--text-primary)',
                                        marginBottom: 6,
                                        fontSize: 13
                                    }}>URL</label>
                                    <input
                                        type="url"
                                        value={newSource.url}
                                        onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 8,
                                            border: '1px solid var(--border-medium)',
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                            fontSize: 14,
                                            outline: 'none',
                                        }}
                                        placeholder="https://www.fastweb.com/scholarships"
                                    />
                                </div>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontWeight: 500,
                                        color: 'var(--text-primary)',
                                        marginBottom: 6,
                                        fontSize: 13
                                    }}>Category</label>
                                    <select
                                        value={newSource.category}
                                        onChange={(e) => setNewSource({ ...newSource, category: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 8,
                                            border: '1px solid var(--border-medium)',
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                            fontSize: 14,
                                            outline: 'none',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <option value="scholarship">Scholarship</option>
                                        <option value="internship">Internship</option>
                                        <option value="fellowship">Fellowship</option>
                                        <option value="grant">Grant</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        fontWeight: 500,
                                        color: 'var(--text-primary)',
                                        marginBottom: 6,
                                        fontSize: 13
                                    }}>Max Pages</label>
                                    <input
                                        type="number"
                                        value={maxPages}
                                        onChange={(e) => setMaxPages(parseInt(e.target.value) || 3)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 8,
                                            border: '1px solid var(--border-medium)',
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                            fontSize: 14,
                                            outline: 'none',
                                        }}
                                        min={1}
                                        max={20}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '16px 0 12px 0' }}>
                                <input
                                    type="checkbox"
                                    id="asGroup"
                                    checked={newSource.asGroup || false}
                                    onChange={(e) => setNewSource({ ...newSource, asGroup: e.target.checked })}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                                <label htmlFor="asGroup" style={{ fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}>
                                    Create as Website Group (Parent)
                                </label>
                            </div>

                            {!newSource.asGroup && (
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{
                                        display: 'block',
                                        fontWeight: 500,
                                        color: 'var(--text-primary)',
                                        marginBottom: 6,
                                        fontSize: 13
                                    }}>Parent Group (Optional)</label>
                                    <select
                                        value={newSource.parentId || ''}
                                        onChange={(e) => setNewSource({ ...newSource, parentId: e.target.value ? parseInt(e.target.value) : undefined })}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: 8,
                                            border: '1px solid var(--border-medium)',
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                            fontSize: 14,
                                            outline: 'none',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <option value="">None</option>
                                        {sources.filter(s => s.is_group).map(group => (
                                            <option key={group.id} value={group.id}>{group.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '8px',
                            marginTop: '24px'
                        }}>
                            <button
                                onClick={() => setShowAddSource(false)}
                                style={{
                                    padding: '10px 18px',
                                    background: 'transparent',
                                    border: '1px solid var(--border-medium)',
                                    borderRadius: 8,
                                    color: 'var(--text-primary)',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => addSource(newSource.parentId || null, newSource.asGroup || false)}
                                style={{
                                    padding: '10px 18px',
                                    background: 'var(--apple-blue)',
                                    border: 'none',
                                    borderRadius: 8,
                                    color: 'white',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'var(--apple-blue-hover)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'var(--apple-blue)';
                                }}
                            >
                                {newSource.asGroup ? 'Create Group' : 'Add Source'}
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Loading Modal - Step by Step */}
            {
                showLoadingModal && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.6)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        animation: 'fadeIn 0.2s ease',
                    }}>
                        <div style={{
                            background: 'var(--bg-primary)',
                            borderRadius: 20,
                            padding: '40px',
                            width: '90%',
                            maxWidth: 600,
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            animation: 'slideUp 0.3s ease',
                        }}>
                            {/* Header */}
                            <div style={{ textAlign: 'center', marginBottom: modalError ? 16 : 32 }}>
                                <div style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 16,
                                    background: modalError
                                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                                        : 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 16px',
                                    animation: currentStep < 4 && !modalError ? 'pulse 2s ease-in-out infinite' : 'none',
                                }}>
                                    {modalError ? (
                                        <AlertCircle size={32} color="white" />
                                    ) : currentStep === 4 ? (
                                        <CheckCircle2 size={32} color="white" />
                                    ) : (
                                        <Loader2 size={32} color="white" className="animate-spin" />
                                    )}
                                </div>
                                <h2 style={{
                                    fontSize: 24,
                                    fontWeight: 600,
                                    color: modalError ? '#ff3b30' : 'var(--text-primary)',
                                    margin: 0,
                                }}>
                                    {modalError ? 'Scraping Failed' : currentStep === 4 ? 'Scraping Complete!' : 'Scraping in Progress...'}
                                </h2>
                                <p style={{
                                    color: 'var(--text-tertiary)',
                                    marginTop: 8,
                                    fontSize: 14,
                                }}>
                                    {modalError
                                        ? 'An error occurred — see details below.'
                                        : currentStep === 4
                                            ? `Found ${scrapeResult?.totalResults || 0} opportunities from ${scrapeResult?.sourcesScraped || 0} sources`
                                            : 'Please wait while we gather scholarship opportunities'
                                    }
                                </p>
                            </div>

                            {/* Error Panel */}
                            {modalError && (
                                <div style={{
                                    padding: '14px 16px',
                                    borderRadius: 12,
                                    background: 'rgba(255, 59, 48, 0.08)',
                                    border: '1px solid rgba(255, 59, 48, 0.3)',
                                    marginBottom: 24,
                                    fontSize: 13,
                                    color: '#ff3b30',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.6,
                                }}>
                                    <strong>Error:</strong> {modalError}
                                </div>
                            )}

                            {/* Steps (hidden on error) */}
                            {!modalError && (
                                <div style={{ marginBottom: 32 }}>
                                    {[
                                        { step: 1, label: 'Connecting to sources', icon: Globe },
                                        { step: 2, label: 'Scraping data', icon: Search },
                                        { step: 3, label: 'Processing results', icon: Database },
                                        { step: 4, label: 'Complete', icon: CheckCircle2 },
                                    ].map(({ step, label, icon: Icon }) => {
                                        const isActive = currentStep === step;
                                        const isComplete = currentStep > step;
                                        const isPending = currentStep < step;

                                        return (
                                            <div
                                                key={step}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 16,
                                                    padding: '16px',
                                                    borderRadius: 12,
                                                    marginBottom: 8,
                                                    background: isActive ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                                                    border: `1px solid ${isActive ? 'rgba(139, 92, 246, 0.3)' : 'transparent'}`,
                                                    transition: 'all 0.3s ease',
                                                    opacity: isPending ? 0.5 : 1,
                                                }}
                                            >
                                                <div style={{
                                                    width: 40,
                                                    height: 40,
                                                    borderRadius: 10,
                                                    background: isComplete ? '#34c759' : isActive ? '#8b5cf6' : 'var(--bg-tertiary)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'white',
                                                }}>
                                                    {isComplete ? (
                                                        <CheckCircle2 size={20} />
                                                    ) : (
                                                        <Icon size={20} />
                                                    )}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{
                                                        fontWeight: 500,
                                                        color: isActive ? '#8b5cf6' : 'var(--text-primary)',
                                                        fontSize: 15,
                                                    }}>
                                                        {label}
                                                    </div>
                                                    {isActive && step === 2 && scrapingProgress.length > 0 && (
                                                        <div style={{ marginTop: 8 }}>
                                                            {scrapingProgress.map((progress, idx) => (
                                                                <div key={idx} style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 8,
                                                                    marginTop: 6,
                                                                    fontSize: 13,
                                                                    color: 'var(--text-tertiary)',
                                                                }}>
                                                                    {progress.status === 'pending' && <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ccc' }} />}
                                                                    {progress.status === 'scraping' && <Loader2 size={12} className="animate-spin" />}
                                                                    {progress.status === 'completed' && <CheckCircle2 size={12} color="#34c759" />}
                                                                    {progress.status === 'failed' && <AlertCircle size={12} color="#ff3b30" />}
                                                                    <span>{progress.source}</span>
                                                                    <span style={{ marginLeft: 'auto' }}>
                                                                        {progress.status === 'completed' && `${progress.progress}%`}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                {isActive && step < 4 && (
                                                    <Loader2 size={20} color="#8b5cf6" className="animate-spin" />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Progress Bar (hidden on error) */}
                            {!modalError && (
                                <div style={{
                                    height: 4,
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                    marginBottom: 24,
                                }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${(currentStep / 4) * 100}%`,
                                        background: 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)',
                                        borderRadius: 2,
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>
                            )}

                            {/* Stop / Dismiss Button */}
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
                                <button
                                    onClick={stopScrape}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '10px 28px',
                                        background: modalError ? 'var(--apple-blue)' : 'rgba(255, 59, 48, 0.1)',
                                        border: `1px solid ${modalError ? 'transparent' : 'rgba(255, 59, 48, 0.3)'}`,
                                        borderRadius: 10,
                                        color: modalError ? 'white' : '#ff3b30',
                                        fontSize: 14,
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        transition: 'opacity 0.2s ease',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                                >
                                    {modalError
                                        ? <><CheckCircle2 size={16} /> Dismiss</>
                                        : <><X size={16} /> Stop Scraping</>
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Results Modal */}
            {
                showResultsModal && scrapeResult?.success && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.6)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        animation: 'fadeIn 0.2s ease',
                    }}>
                        <div style={{
                            background: 'var(--bg-primary)',
                            borderRadius: 20,
                            width: '95%',
                            maxWidth: 900,
                            maxHeight: '90vh',
                            overflow: 'hidden',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            animation: 'slideUp 0.3s ease',
                        }}>
                            {/* Header */}
                            <div style={{
                                padding: '24px 32px',
                                borderBottom: '1px solid var(--border-light)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}>
                                <div>
                                    <h2 style={{
                                        fontSize: 22,
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                        margin: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                    }}>
                                        <CheckCircle2 size={28} color="#34c759" />
                                        Scraping Results
                                    </h2>
                                    <p style={{ color: 'var(--text-tertiary)', margin: '8px 0 0', fontSize: 14 }}>
                                        Found {scrapeResult.totalResults} opportunities from {scrapeResult.sourcesScraped} sources
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowResultsModal(false)}
                                    style={{
                                        padding: 8,
                                        background: 'transparent',
                                        border: 'none',
                                        borderRadius: 8,
                                        cursor: 'pointer',
                                        color: 'var(--text-tertiary)',
                                    }}
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Sources Summary */}
                            <div style={{
                                padding: '20px 32px',
                                background: 'var(--bg-secondary)',
                                borderBottom: '1px solid var(--border-light)',
                            }}>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {scrapeResult.sourceResults?.map((source, idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                padding: '8px 16px',
                                                background: source.status === 'success' ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)',
                                                borderRadius: 8,
                                                border: `1px solid ${source.status === 'success' ? 'rgba(52, 199, 89, 0.2)' : 'rgba(255, 59, 48, 0.2)'}`,
                                            }}
                                        >
                                            {source.status === 'success'
                                                ? <CheckCircle2 size={16} color="#34c759" />
                                                : <AlertCircle size={16} color="#ff3b30" />
                                            }
                                            <span style={{ fontSize: 13, fontWeight: 500, color: source.status === 'success' ? '#34c759' : '#ff3b30' }}>
                                                {source.name}
                                            </span>
                                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                ({source.itemsFound} found, {source.itemsSaved} saved)
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Filter Bar */}
                            <div style={{
                                padding: '16px 32px',
                                borderBottom: '1px solid var(--border-light)',
                                display: 'flex',
                                gap: 12,
                                alignItems: 'center',
                            }}>
                                <div style={{ flex: 1, position: 'relative' }}>
                                    <Search size={16} style={{
                                        position: 'absolute', left: 12, top: '50%',
                                        transform: 'translateY(-50%)', color: 'var(--text-tertiary)',
                                    }} />
                                    <input
                                        type="text"
                                        placeholder="Filter opportunities..."
                                        value={opportunityFilter}
                                        onChange={(e) => setOpportunityFilter(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px 10px 40px',
                                            borderRadius: 8,
                                            border: '1px solid var(--border-medium)',
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                            fontSize: 14,
                                            outline: 'none',
                                        }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => setViewMode('list')} style={{
                                        padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-medium)',
                                        background: viewMode === 'list' ? 'var(--apple-blue)' : 'var(--bg-secondary)',
                                        color: viewMode === 'list' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
                                    }}>List</button>
                                    <button onClick={() => setViewMode('grid')} style={{
                                        padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-medium)',
                                        background: viewMode === 'grid' ? 'var(--apple-blue)' : 'var(--bg-secondary)',
                                        color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
                                    }}>Grid</button>
                                </div>
                            </div>

                            {/* Opportunities List */}
                            <div style={{ maxHeight: '50vh', overflow: 'auto', padding: '16px 32px' }}>
                                {filteredOpportunities.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)' }}>
                                        <Filter size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                                        <p>No opportunities match your filter</p>
                                    </div>
                                ) : (
                                    <div style={{
                                        display: viewMode === 'grid' ? 'grid' : 'flex',
                                        gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(300px, 1fr))' : undefined,
                                        gap: 12,
                                        flexDirection: viewMode === 'list' ? 'column' : undefined,
                                    }}>
                                        {filteredOpportunities.map((opp, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => toggleOpportunitySelection(idx)}
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    border: `2px solid ${selectedOpportunities.has(idx) ? '#8b5cf6' : 'var(--border-light)'}`,
                                                    background: selectedOpportunities.has(idx) ? 'rgba(139, 92, 246, 0.05)' : 'var(--bg-secondary)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                                    <div style={{
                                                        width: 20, height: 20, borderRadius: 4,
                                                        border: `2px solid ${selectedOpportunities.has(idx) ? '#8b5cf6' : 'var(--border-medium)'}`,
                                                        background: selectedOpportunities.has(idx) ? '#8b5cf6' : 'transparent',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
                                                    }}>
                                                        {selectedOpportunities.has(idx) && <CheckCircle2 size={14} color="white" />}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <h4 style={{
                                                            fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                                                            margin: '0 0 4px', lineHeight: 1.4,
                                                        }}>{opp.title}</h4>
                                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                                                            {opp.organization && (
                                                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{opp.organization}</span>
                                                            )}
                                                            {opp.category && (
                                                                <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-secondary)' }}>
                                                                    {opp.category}
                                                                </span>
                                                            )}
                                                            {opp.amount && (
                                                                <span style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(52, 199, 89, 0.1)', borderRadius: 4, color: '#34c759', fontWeight: 500 }}>
                                                                    ${opp.amount.toLocaleString()}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p style={{
                                                            fontSize: 13, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5,
                                                            display: '-webkit-box', WebkitLineClamp: 2,
                                                            WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                                        }}>{opp.description || 'No description available'}</p>
                                                        {opp.sourceUrl && (
                                                            <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12, color: '#8b5cf6', textDecoration: 'none' }}>
                                                                <ExternalLink size={12} /> View Source
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Footer Actions */}
                            <div style={{
                                padding: '20px 32px',
                                borderTop: '1px solid var(--border-light)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'var(--bg-secondary)',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <button
                                        onClick={selectAllOpportunities}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
                                            background: 'transparent', border: '1px solid var(--border-medium)',
                                            borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                                        }}
                                    >
                                        <FileCheck size={18} />
                                        {selectedOpportunities.size === filteredOpportunities.length ? 'Deselect All' : 'Select All'}
                                    </button>
                                    <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
                                        {selectedOpportunities.size} of {filteredOpportunities.length} selected
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button
                                        onClick={() => setShowResultsModal(false)}
                                        style={{
                                            padding: '10px 20px', background: 'transparent', border: '1px solid var(--border-medium)',
                                            borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                                        }}
                                    >Cancel</button>
                                    <button
                                        onClick={addSelectedOpportunities}
                                        disabled={selectedOpportunities.size === 0 || isSaving}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                                            background: (selectedOpportunities.size > 0 && !isSaving) ? '#34c759' : 'var(--border-medium)',
                                            border: 'none', borderRadius: 8, color: 'white',
                                            cursor: (selectedOpportunities.size > 0 && !isSaving) ? 'pointer' : 'not-allowed',
                                            fontSize: 14, fontWeight: 500, transition: 'all 0.2s',
                                        }}
                                    >
                                        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                        {isSaving ? 'Saving...' : `Add ${selectedOpportunities.size > 0 ? `(${selectedOpportunities.size})` : ''}`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Notifications UI */}
            <div className="notifications-container">
                {notifications.map(n => (
                    <div key={n.id} className={`notification-toast notification-${n.type}`}>
                        <div className="notification-icon">
                            {n.type === 'success' && <CheckCircle2 size={18} color="#34c759" />}
                            {n.type === 'error' && <AlertCircle size={18} color="#ff3b30" />}
                            {n.type === 'warning' && <AlertTriangle size={18} color="#ff9500" />}
                            {n.type === 'info' && <Loader2 size={18} color="#007aff" className="animate-spin" />}
                        </div>
                        <div className="notification-content">{n.message}</div>
                        <button
                            className="notification-close"
                            onClick={() => setNotifications(prev => prev.filter(item => item.id !== n.id))}
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Animations & Notifications Styles */}
            <style>{`
                .notifications-container {
                    position: fixed;
                    top: 24px;
                    right: 24px;
                    z-index: 1000;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    pointer-events: none;
                }
                .notification-toast {
                    pointer-events: auto;
                    min-width: 300px;
                    max-width: 450px;
                    padding: 16px;
                    border-radius: 12px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-light);
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .notification-icon {
                    flex-shrink: 0;
                    margin-top: 2px;
                }
                .notification-content {
                    flex: 1;
                    font-size: 14px;
                    line-height: 1.5;
                    color: var(--text-primary);
                }
                .notification-close {
                    flex-shrink: 0;
                    padding: 4px;
                    border-radius: 6px;
                    color: var(--text-tertiary);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .notification-close:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }
                .notification-success { border-left: 4px solid #34c759; }
                .notification-error { border-left: 4px solid #ff3b30; }
                .notification-warning { border-left: 4px solid #ff9500; }
                .notification-info { border-left: 4px solid #007aff; }

                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
            {/* Inspect Job Modal */}
            {inspectJobDetails && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '24px',
                    animation: 'fadeIn 0.2s ease'
                }}>
                    <div style={{
                        background: 'var(--bg-primary)',
                        width: '100%',
                        maxWidth: '1000px',
                        maxHeight: '90vh',
                        borderRadius: '20px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        border: '1px solid var(--border-light)'
                    }}>
                        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <button
                                    onClick={() => setInspectJobDetails(null)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--text-secondary)',
                                        padding: '4px',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                >
                                    <ArrowLeft size={20} />
                                </button>
                                <div>
                                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                        Job Details: {inspectJobDetails.source_name || 'Manual Extraction'}
                                    </h3>
                                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '4px 0 0 0' }}>
                                        Scraped on {new Date(inspectJobDetails.started_at).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{
                                    padding: '4px 12px',
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    background: getStatusColor(inspectJobDetails.status).bg,
                                    color: getStatusColor(inspectJobDetails.status).text
                                }}>
                                    {inspectJobDetails.status}
                                </span>
                                <button
                                    onClick={() => setInspectJobDetails(null)}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                            {isLoadingInspect ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: 16 }}>
                                    <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} />
                                    <p style={{ color: 'var(--text-secondary)' }}>Loading associated opportunities...</p>
                                </div>
                            ) : inspectOpportunities.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '64px 32px' }}>
                                    <div style={{ display: 'inline-flex', padding: 16, background: 'var(--bg-tertiary)', borderRadius: '50%', marginBottom: 16 }}>
                                        <Database size={32} style={{ color: 'var(--text-tertiary)' }} />
                                    </div>
                                    <h4 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>No metadata records found</h4>
                                    <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>This job might have been run before the tracking system was updated, or it didn't find any opportunities.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                                    {inspectOpportunities.map(opp => (
                                        <div key={opp.id} style={{
                                            padding: '20px',
                                            borderRadius: '14px',
                                            border: '1px solid var(--border-light)',
                                            background: 'var(--bg-secondary)',
                                            position: 'relative'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                                <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>{opp.title}</h4>
                                                {opp.image_url ? (
                                                    <img src={opp.image_url} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} alt="" />
                                                ) : (
                                                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
                                                    </div>
                                                )}
                                            </div>
                                            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, lineClamp: 3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                {opp.description || 'No description provided.'}
                                            </p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                                                <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-secondary)' }}>{opp.category}</span>
                                                {opp.amount && <span style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(52, 199, 89, 0.1)', borderRadius: 4, color: '#34c759' }}>${opp.amount.toLocaleString()}</span>}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: 12, marginTop: 'auto' }}>
                                                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{opp.location}</span>
                                                <a href={opp.application_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    View <ExternalLink size={12} />
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '20px 32px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setInspectJobDetails(null)}
                                style={{
                                    padding: '10px 24px',
                                    background: 'var(--text-primary)',
                                    color: 'var(--bg-primary)',
                                    border: 'none',
                                    borderRadius: 10,
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}

const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getStatusColor = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
        completed: { bg: 'rgba(52, 199, 89, 0.1)', text: '#34c759' },
        running: { bg: 'rgba(0, 113, 227, 0.1)', text: '#0071e3' },
        failed: { bg: 'rgba(255, 59, 48, 0.1)', text: '#ff3b30' },
        partial: { bg: 'rgba(255, 102, 0, 0.1)', text: '#ff6600' },
    };
    return colors[status] || colors.running;
};
