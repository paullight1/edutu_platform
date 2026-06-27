import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { backendFetchJson, getAdminAuthHeaders, getBackendBaseUrl } from '../lib/backend';
import { isLocalAdminBypassEnabled } from '../lib/localAdmin';
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
    source_results?: string | Array<Record<string, unknown>> | Record<string, unknown> | null;
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

interface EngineStatus {
    success: boolean;
    database?: {
        configured: boolean;
        reachable?: boolean;
        error?: string;
    };
    ai?: {
        deepseekConfigured: boolean;
        geminiConfigured?: boolean;
        source: string;
        feature: string;
        provider: string;
        model: string;
        enabled: boolean;
    };
    scraper?: {
        schedulerEnabled: boolean;
        autoRunEnabled: boolean;
        cronSchedule: string;
        dataRetentionDays: number | null;
        enrichConcurrency: number;
        maxPagesCap: number;
        minPublishQualityScore: number;
    };
    error?: string;
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
    id?: string | number;
    title: string;
    organization?: string;
    category?: string;
    deadline?: string | null;
    location?: string;
    description?: string;
    summary?: string;
    applyUrl?: string;
    apply_url?: string;
    imageUrl?: string;
    image_url?: string;
    application_url?: string;
    amount?: number | null;
    source: string;
    sourceUrl?: string;
    source_url?: string;
    requirements?: string[];
    benefits?: string[];
    application_process?: string[];
    eligibility?: Record<string, unknown>;
    funding_type?: string | null;
    target_region?: string | null;
    metadata?: {
        extraction_quality_score?: number;
        extraction_missing_fields?: string[];
        needs_review?: boolean;
        ai_improved_at?: string;
        [key: string]: unknown;
    };
}

interface ScrapeResult {
    success: boolean;
    sourcesScraped?: number;
    totalResults?: number;
    duration?: number;
    jobId?: string;
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

async function getAuthHeaders() {
    return getAdminAuthHeaders();
}

export default function ScraperDashboard() {
    const [sources, setSources] = useState<ScrapeSource[]>([]);
    const [jobs, setJobs] = useState<ScrapeJob[]>([]);
    const [showAllJobs, setShowAllJobs] = useState(false);
    const [stats, setStats] = useState<ScrapeStats | null>(null);
    const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [maxPages, setMaxPages] = useState(3);
    // Automation Settings State
    const [autoRunEnabled, setAutoRunEnabled] = useState(false);
    const [cronSchedule, setCronSchedule] = useState('0 0 * * *');
    const [dataRetentionDays, setDataRetentionDays] = useState<number | null>(null);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    const API_URL = `${getBackendBaseUrl()}/api/scraper`;
    const [showAddSource, setShowAddSource] = useState(false);
    const [newSource, setNewSource] = useState<{ name: string; url: string; category: string; asGroup?: boolean; parentId?: number }>({ name: '', url: '', category: 'scholarship', asGroup: false });
    const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
    const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
    const [recentOpportunities, setRecentOpportunities] = useState<Opportunity[]>([]);

    // Inspect Job & Data Retention
    const [inspectJobDetails, setInspectJobDetails] = useState<ScrapeJob | null>(null);
    const [inspectOpportunities, setInspectOpportunities] = useState<ScrapedOpportunity[]>([]);
    const [isLoadingInspect, setIsLoadingInspect] = useState(false);
    const [isPurging, setIsPurging] = useState(false);

    // New state for enhanced UX
    const [showLoadingModal, setShowLoadingModal] = useState(false);
    const [showResultsModal, setShowResultsModal] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [scrapingProgress, setScrapingProgress] = useState<{ source: string; status: 'pending' | 'scraping' | 'completed' | 'failed'; progress: number }[]>([]);
    const [scrapingStartedAt, setScrapingStartedAt] = useState<number | null>(null);
    const [scrapingElapsedSeconds, setScrapingElapsedSeconds] = useState(0);
    const [selectedOpportunities, setSelectedOpportunities] = useState<Set<number>>(new Set());
    const [activeScrapeJobId, setActiveScrapeJobId] = useState<string | null>(null);
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
    const [enhancingIndexes, setEnhancingIndexes] = useState<Set<number>>(new Set());
    const [detailsOpportunity, setDetailsOpportunity] = useState<ScrapedOpportunity | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!showLoadingModal || !scrapingStartedAt || modalError || currentStep >= 4) return;

        const interval = window.setInterval(() => {
            setScrapingElapsedSeconds(Math.max(0, Math.floor((Date.now() - scrapingStartedAt) / 1000)));
        }, 1000);

        return () => window.clearInterval(interval);
    }, [showLoadingModal, scrapingStartedAt, modalError, currentStep]);

    const fetchSettings = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/settings`, {
                headers: await getAuthHeaders()
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
    }, [API_URL]);

    const handleUpdateSettings = async () => {
        setIsSavingSettings(true);
        try {
            const response = await fetch(`${API_URL}/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(await getAuthHeaders())
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
            const result = await backendFetchJson<{ success: boolean; deletedCount: number }>(
                '/opportunities/admin/purge',
                {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ olderThanDays: days }),
                }
            );

            showNotification(
                `Opportunities older than ${days} days purged (${result.deletedCount} deleted).`,
                'success',
            );
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
            await fetch(`${API_URL}/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(await getAuthHeaders())
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
            const data = await backendFetchJson<ScrapedOpportunity[]>(
                `/api/scraper/jobs/${job.id}/opportunities`,
                { headers: await getAuthHeaders() },
            );
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
            const response = await fetch(`${API_URL}/jobs/${id}`, {
                method: 'DELETE',
                headers: await getAuthHeaders()
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

    const loadRecentOpportunities = useCallback(async () => {
        try {
            const data = await backendFetchJson<{ data: Array<Record<string, unknown>> }>(
                `/opportunities/admin/list?limit=10&sortBy=newest`,
                { headers: await getAuthHeaders() },
            );
            const mappedRecentOpportunities = (data.data || []).map((row: Record<string, unknown>) => ({
                id: String(row.id ?? ''),
                title: String(row.title ?? ''),
                organization: String(row.organization ?? row.provider_name ?? row.source ?? ''),
                category: String(row.category ?? row.canonical_category ?? row.type ?? ''),
                deadline: typeof row.close_date === 'string'
                    ? row.close_date
                    : typeof row.deadline === 'string'
                        ? row.deadline
                        : null,
                location: String(row.location ?? ''),
                description: String(row.description ?? row.summary ?? ''),
                applyUrl: String(row.application_url ?? row.apply_url ?? row.source_url ?? ''),
                amount: row.stipend === null || row.stipend === undefined
                    ? null
                    : Number(row.stipend),
                source: String(row.source ?? 'manual'),
                createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
            })) as Opportunity[];
            setRecentOpportunities(mappedRecentOpportunities);
        } catch (e) {
            console.warn('Could not load recent opportunities:', e);
        }
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const authHeaders = await getAuthHeaders();
            const [engineStatusData, sourcesData, jobsData, statsData] = await Promise.allSettled([
                backendFetchJson<EngineStatus>(`/api/scraper/engine-status`, { headers: authHeaders }),
                backendFetchJson<ScrapeSource[]>(`/api/scraper/sources`, { headers: authHeaders }),
                backendFetchJson<ScrapeJob[]>(`/api/scraper/jobs`, { headers: authHeaders }),
                backendFetchJson<{ total: number; bySource: Record<string, number> }>(
                    `/api/scraper/stats`,
                    { headers: authHeaders },
                ),
            ]);

            setEngineStatus(
                engineStatusData.status === 'fulfilled'
                    ? engineStatusData.value
                    : {
                        success: false,
                        error: engineStatusData.reason instanceof Error
                            ? engineStatusData.reason.message
                            : 'Engine status unavailable',
                    },
            );
            setSources(
                sourcesData.status === 'fulfilled' && Array.isArray(sourcesData.value)
                    ? sourcesData.value
                    : [],
            );
            setJobs(
                jobsData.status === 'fulfilled' && Array.isArray(jobsData.value)
                    ? jobsData.value
                    : [],
            );
            setStats({
                total_opportunities: statsData.status === 'fulfilled' ? statsData.value.total || 0 : 0,
                by_source: statsData.status === 'fulfilled' ? statsData.value.bySource || {} : {},
                recent_scrape_count:
                    jobsData.status === 'fulfilled' && Array.isArray(jobsData.value)
                        ? jobsData.value.filter((j) => j.status === 'completed').length || 0
                        : 0,
            });
            await loadRecentOpportunities();
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setLoading(false);
    }, [loadRecentOpportunities]);

    useEffect(() => {
        void loadData();
        void loadRecentOpportunities();
        void fetchSettings();

        if (isLocalAdminBypassEnabled()) {
            return undefined;
        }

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
    }, [fetchSettings, loadData, loadRecentOpportunities]);

    function stopScrape() {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setScraping(false);
        setShowLoadingModal(false);
        setModalError(null);
        setScrapingStartedAt(null);
        setScrapingElapsedSeconds(0);
    }

    const getJobSourceResults = (job: ScrapeJob) => {
        if (!job.source_results) return [];
        try {
            const results = typeof job.source_results === 'string'
                ? JSON.parse(job.source_results)
                : job.source_results;
            return Array.isArray(results) ? results : [];
        } catch {
            return [];
        }
    };

    const getJobDisplayName = (job: ScrapeJob) => {
        let displayName = job.source_name || (job.source_id ? `Source #${job.source_id}` : 'Manual Extraction');
        const results = getJobSourceResults(job);
        if (results.length > 0) {
            if (results.length === 1) {
                displayName = results[0].name;
            } else {
                displayName = `${results.length} Sources (${results[0].name}, etc.)`;
            }
        }
        return displayName;
    };

    const getJobFoundCount = (job: ScrapeJob) => {
        if (typeof job.items_found === 'number' && job.items_found > 0) return job.items_found;
        if (typeof job.urls_scraped === 'number' && job.urls_scraped > 0) return job.urls_scraped;
        if (typeof job.urls_saved === 'number' && job.urls_saved > 0) return job.urls_saved;
        return 0;
    };

    const getJobSavedCount = (job: ScrapeJob) => {
        if (typeof job.urls_saved === 'number') return job.urls_saved;
        return 0;
    };

    const groupedJobs = Object.values(
        jobs.reduce<Record<string, { displayName: string; jobs: ScrapeJob[] }>>((acc, job) => {
            const displayName = getJobDisplayName(job);
            if (!acc[displayName]) {
                acc[displayName] = { displayName, jobs: [] };
            }
            acc[displayName].jobs.push(job);
            return acc;
        }, {}),
    )
        .map((group) => ({
            ...group,
            jobs: [...group.jobs].sort(
                (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
            ),
        }))
        .sort((a, b) => {
            const aTime = new Date(a.jobs[0]?.started_at || 0).getTime();
            const bTime = new Date(b.jobs[0]?.started_at || 0).getTime();
            return bTime - aTime;
        });

    const visibleJobGroups = showAllJobs ? groupedJobs : groupedJobs.slice(0, 6);

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
        setActiveScrapeJobId(null);
        setShowLoadingModal(true);
        setCurrentStep(1);
        setScrapingStartedAt(Date.now());
        setScrapingElapsedSeconds(0);

        // Initialize progress tracking
        setScrapingProgress(
            sourcesToScrape.map(s => ({ source: s.name, status: 'pending' as const, progress: 0 }))
        );

        // Create an AbortController so we can cancel
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            // Use port 3000 (NestJS default) unless overridden by env
            const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'https://edutu-api.onrender.com').replace(/\/$/, '');

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
                    ...(await getAuthHeaders()),
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
                    jobId: result.jobId ?? result.jobLogId ?? undefined,
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
                setActiveScrapeJobId(mapped.jobId ?? null);

                setScrapingProgress(
                    (result.sourceResults ?? sourcesToScrape.map(s => ({ name: s.name, status: 'success' as const }))).map(
                        (sr: SourceResult | { name: string; status: 'success' | 'failed' | 'skipped' | 'pending' }) => ({
                            source: sr.name,
                            status: sr.status === 'failed' ? 'failed' as const : 'completed' as const,
                            progress: 100,
                        })
                    )
                );

                // Step 4: Complete
                setCurrentStep(4);
                await new Promise(r => setTimeout(r, 1000));

                setShowLoadingModal(false);
                setShowResultsModal(true);
                setScrapingStartedAt(null);
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
        try {
            await backendFetchJson(
                `${API_URL}/sources/${source.id}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: !source.enabled }),
                }
            );
            showNotification(`${source.enabled ? 'Disabled' : 'Enabled'} "${source.name}"`, 'success');
            loadData();
        } catch (error) {
            console.error('Failed to toggle source:', error);
            showNotification('Failed to update source', 'error');
        }
    }

    async function deleteSource(id: number) {
        if (!confirm('Delete this source?')) return;
        try {
            await backendFetchJson(
                `${API_URL}/sources/${id}`,
                {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                }
            );
            showNotification('Source deleted', 'success');
            loadData();
        } catch (error) {
            console.error('Failed to delete source:', error);
            showNotification('Failed to delete source', 'error');
        }
    }

    async function addSource(parentId: number | null = null, asGroup: boolean = false) {
        if (!newSource.name || (!newSource.url && !asGroup)) {
            showNotification('Please fill in required fields', 'warning');
            return;
        }

        try {
            await backendFetchJson(
                `${API_URL}/sources`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: newSource.name,
                        url: asGroup ? '' : newSource.url,
                        category: newSource.category,
                        tier: 2,
                        parent_id: parentId ?? undefined,
                        is_group: asGroup,
                    }),
                }
            );
            showNotification(asGroup ? 'Group created' : 'Source added', 'success');
            setNewSource({ name: '', url: '', category: 'scholarship' });
            setShowAddSource(false);
            loadData();
        } catch (err: unknown) {
            showNotification(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
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

    const getOpportunityQuality = (opp: ScrapedOpportunity) => {
        const metadataScore = opp.metadata?.extraction_quality_score;
        if (typeof metadataScore === 'number') {
            return {
                score: metadataScore,
                status: metadataScore >= 70 ? 'complete' : 'not_complete',
                missing: opp.metadata?.extraction_missing_fields || [],
            };
        }

        const missing: string[] = [];
        let score = 0;
        if (opp.title?.trim().length >= 8) score += 15; else missing.push('title');
        if ((opp.description || opp.summary || '').trim().length >= 180) score += 25; else missing.push('description');
        if ((opp.applyUrl || opp.apply_url || '').startsWith('http')) score += 15; else missing.push('apply link');
        if ((opp.sourceUrl || opp.source_url || '').startsWith('http')) score += 10; else missing.push('source link');
        if (opp.imageUrl || opp.image_url) score += 10; else missing.push('image');
        if (opp.deadline) score += 10; else missing.push('deadline');
        if (opp.requirements?.length) score += 10; else missing.push('requirements');
        if (opp.benefits?.length) score += 5; else missing.push('benefits');

        return {
            score: Math.min(100, score),
            status: score >= 70 ? 'complete' : 'not_complete',
            missing,
        };
    };

    const improveOpportunityWithAI = async (opp: ScrapedOpportunity, filteredIndex: number) => {
        const sourceIndex = scrapeResult?.opportunities?.findIndex(item =>
            item === opp ||
            ((item.applyUrl || item.apply_url || item.sourceUrl || item.source_url) === (opp.applyUrl || opp.apply_url || opp.sourceUrl || opp.source_url) && item.title === opp.title)
        ) ?? -1;
        const targetIndex = sourceIndex >= 0 ? sourceIndex : filteredIndex;

        setEnhancingIndexes(prev => new Set(prev).add(targetIndex));
        try {
            const response = await fetch(`${API_URL}/enhance-preview`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(await getAuthHeaders()),
                },
                body: JSON.stringify(opp),
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'AI improvement failed');
            }

            setScrapeResult(prev => {
                if (!prev?.opportunities) return prev;
                const next = [...prev.opportunities];
                next[targetIndex] = result.opportunity;
                return { ...prev, opportunities: next };
            });
            setDetailsOpportunity(result.opportunity);
            showNotification(`AI improved "${result.opportunity.title}"`, 'success');
        } catch (error: unknown) {
            showNotification(error instanceof Error ? error.message : 'AI improvement failed', 'error');
        } finally {
            setEnhancingIndexes(prev => {
                const next = new Set(prev);
                next.delete(targetIndex);
                return next;
            });
        }
    };

    const formatElapsed = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    };

    const activeScrapeSources = scrapingProgress.filter(progress => progress.status === 'scraping').length;
    const completedScrapeSources = scrapingProgress.filter(progress => progress.status === 'completed').length;
    const failedScrapeSources = scrapingProgress.filter(progress => progress.status === 'failed').length;
    const totalScrapeSources = scrapingProgress.length;
    const estimatedProgress = modalError
        ? 0
        : currentStep >= 4
            ? 100
            : currentStep === 3
                ? Math.min(96, 78 + Math.floor(scrapingElapsedSeconds / 3))
                : currentStep === 2
                    ? Math.min(76, 28 + Math.floor(scrapingElapsedSeconds * 1.6))
                    : Math.min(24, 8 + Math.floor(scrapingElapsedSeconds * 2));

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
        const oppsToSave = filteredOpportunities.filter((_, i) => selectedOpportunities.has(i));
        const normalizeEligibilityCriteria = (values: string[] | undefined) =>
            values?.length ? values.join('\n') : undefined;
        const toBulkItem = (opp: ScrapedOpportunity) => {
            const sourceUrl = opp.sourceUrl || opp.source_url || opp.applyUrl || opp.apply_url || '';
            const applyUrl = opp.applyUrl || opp.apply_url || opp.application_url || sourceUrl;

            if (!sourceUrl) return null;

            return {
                title: opp.title,
                summary: opp.summary || undefined,
                description: opp.description || undefined,
                category: opp.category || undefined,
                organization: opp.organization || undefined,
                location: opp.location || undefined,
                type: 'scholarship',
                eligibilityCriteria: normalizeEligibilityCriteria(opp.requirements),
                fundingType: opp.funding_type || undefined,
                targetRegion: opp.target_region || undefined,
                deadline: opp.deadline || undefined,
                sourceUrl,
                applyUrl,
                imageUrl: opp.imageUrl || opp.image_url || undefined,
                eligibility: opp.eligibility || undefined,
                isFeatured: false,
                isRemote: true,
                status: 'pending',
                tags: [],
            };
        };
        const items = oppsToSave.map(toBulkItem).filter((item): item is NonNullable<ReturnType<typeof toBulkItem>> => Boolean(item));

        if (items.length === 0) {
            setIsSaving(false);
            showNotification('No valid opportunities to save', 'warning');
            return;
        }

        let inserted = 0;
        let skipped = 0;
        const batches: Array<typeof items> = [];
        for (let i = 0; i < items.length; i += 100) {
            batches.push(items.slice(i, i + 100));
        }

        for (const batch of batches) {
            try {
                const result = await backendFetchJson<{ success: boolean; inserted?: number; skipped?: number }>(
                    `/opportunities/admin/bulk-import`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items: batch }),
                    },
                );

                if (!result.success) {
                    throw new Error('Bulk import failed');
                }

                inserted += result.inserted || 0;
                skipped += result.skipped || 0;
            } catch (err) {
                console.error('Failed to save opportunity batch:', err);
            }
        }

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
        showNotification(
            activeScrapeJobId
                ? `Saved ${inserted} opportunities from this run${skipped ? `, skipped ${skipped}` : ''}`
                : `Saved ${inserted} opportunities${skipped ? `, skipped ${skipped}` : ''}`,
            'success'
        );
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
                            background: 'linear-gradient(135deg, #146ef5 0%, #60a5fa 100%)',
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
            {engineStatus && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                    marginBottom: '24px'
                }}>
                    {[
                        {
                            icon: Database,
                            label: 'Database',
                            value: engineStatus.database?.reachable
                                ? 'Connected'
                                : engineStatus.database?.configured
                                    ? 'Unreachable'
                                    : 'Missing',
                            ok: Boolean(engineStatus.database?.reachable),
                            detail: engineStatus.database?.error || 'Supabase service role',
                        },
                        {
                            icon: Zap,
                            label: 'DeepSeek',
                            value: engineStatus.ai?.deepseekConfigured || engineStatus.ai?.geminiConfigured ? 'Ready' : 'Missing key',
                            ok: Boolean((engineStatus.ai?.deepseekConfigured || engineStatus.ai?.geminiConfigured) && engineStatus.ai.enabled),
                            detail: engineStatus.ai?.model || 'scraper.extract',
                        },
                        {
                            icon: Activity,
                            label: 'Scheduler',
                            value: engineStatus.scraper?.schedulerEnabled ? 'Enabled' : 'Disabled',
                            ok: Boolean(engineStatus.scraper?.schedulerEnabled),
                            detail: engineStatus.scraper?.autoRunEnabled
                                ? engineStatus.scraper.cronSchedule
                                : 'Manual / external cron',
                        },
                        {
                            icon: FileCheck,
                            label: 'Quality Gate',
                            value: `${engineStatus.scraper?.minPublishQualityScore ?? 60}+`,
                            ok: true,
                            detail: `${engineStatus.scraper?.enrichConcurrency ?? 3} concurrent enrichers`,
                        },
                    ].map((item) => (
                        <div
                            key={item.label}
                            style={{
                                padding: '16px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-light)',
                                borderRadius: 12,
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 12,
                            }}
                        >
                            <div style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: item.ok ? 'rgba(52, 199, 89, 0.12)' : 'rgba(255, 149, 0, 0.14)',
                                color: item.ok ? '#34c759' : '#ff9500',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <item.icon size={18} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                    {item.label}
                                </div>
                                <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 700, marginTop: 2 }}>
                                    {item.value}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3, wordBreak: 'break-word' }}>
                                    {item.detail}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {engineStatus?.database?.configured && !engineStatus.database.reachable && (
                <div style={{
                    padding: '14px 16px',
                    marginBottom: '20px',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 149, 0, 0.28)',
                    background: 'rgba(255, 149, 0, 0.08)',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                }}>
                    <AlertTriangle size={18} style={{ color: '#ff9500', marginTop: 2, flexShrink: 0 }} />
                    <div>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>Database access is unavailable</div>
                        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                            The backend has Supabase credentials, but the scraper database cannot be reached from this environment.
                            {engineStatus.database.error ? ` ${engineStatus.database.error}` : ''}
                        </div>
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
                            onChange={(e) => setFilter(e.target.value as typeof filter)}
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
                                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last Scraped</th>
                                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Success Rate</th>
                                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rootSources.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ padding: '48px 24px', textAlign: 'center' }}>
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
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                            value={dataRetentionDays ?? 'off'}
                            onChange={(event) => {
                                const value = event.target.value === 'off' ? null : Number(event.target.value);
                                handleSetRetention(value);
                            }}
                            disabled={isPurging}
                            style={{
                                minWidth: 170,
                                padding: '9px 36px 9px 12px',
                                background: 'rgba(255, 149, 0, 0.08)',
                                color: '#ff9500',
                                border: '1px solid rgba(255, 149, 0, 0.2)',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: isPurging ? 'not-allowed' : 'pointer',
                                opacity: isPurging ? 0.6 : 1,
                                outline: 'none'
                            }}
                        >
                            <option value="off">Off</option>
                            <option value="30">30 Days</option>
                            <option value="90">3 Months</option>
                            <option value="365">1 Year</option>
                        </select>

                        <div style={{ width: '1px', height: '24px', background: 'var(--border-light)', margin: '0 8px' }} />

                        <button
                            onClick={async () => {
                                if (!confirm('Purge all opportunities that are missing images?')) return;
                                setIsPurging(true);
                                try {
                                    const result = await backendFetchJson<{ success: boolean; deletedCount: number }>(
                                        '/opportunities/admin/purge',
                                        {
                                            method: 'DELETE',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ missingImagesOnly: true }),
                                        }
                                    );
                                    showNotification(`Opportunities without images purged (${result.deletedCount} deleted)`, 'success');
                                    loadRecentOpportunities();
                                } catch {
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
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
                        Grouped by source or run type. Open any run to inspect the opportunities it produced.
                    </p>
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
                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: '16px',
                                marginTop: '16px'
                            }}>
                                {visibleJobGroups.map(group => {
                                    const latestJob = group.jobs[0];
                                    const statusColor = getStatusColor(latestJob.status);

                                    return (
                                        <div
                                            key={group.displayName}
                                            style={{
                                                padding: '16px',
                                                border: '1px solid var(--border-light)',
                                                borderRadius: '12px',
                                                background: 'rgba(0, 113, 227, 0.03)',
                                                transition: 'all 0.15s ease',
                                                minHeight: '120px',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(0, 113, 227, 0.06)';
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'rgba(0, 113, 227, 0.03)';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }}
                                        >
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                justifyContent: 'space-between',
                                                gap: 12,
                                                marginBottom: 12,
                                            }}>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{
                                                        fontWeight: 700,
                                                        color: 'var(--text-primary)',
                                                        fontSize: 14,
                                                        lineHeight: 1.35,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                        flexWrap: 'wrap',
                                                    }}>
                                                        <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
                                                        <span style={{ wordBreak: 'break-word' }}>{group.displayName}</span>
                                                    </div>
                                                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                                        {group.jobs.length} run{group.jobs.length === 1 ? '' : 's'} · latest {new Date(latestJob.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                                    </p>
                                                </div>
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
                                                    {latestJob.status}
                                                </span>
                                            </div>

                                            <div style={{
                                                display: 'flex',
                                                gap: 8,
                                                flexWrap: 'wrap',
                                                marginBottom: 12,
                                            }}>
                                                <span style={{
                                                    padding: '4px 8px',
                                                    borderRadius: 999,
                                                    background: 'rgba(0, 113, 227, 0.08)',
                                                    color: 'var(--text-primary)',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                }}>
                                                    {getJobFoundCount(latestJob)} opportunities found
                                                </span>
                                                <span style={{
                                                    padding: '4px 8px',
                                                    borderRadius: 999,
                                                    background: 'rgba(52, 199, 89, 0.1)',
                                                    color: '#34c759',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                }}>
                                                    {getJobSavedCount(latestJob)} saved
                                                </span>
                                                <span style={{
                                                    padding: '4px 8px',
                                                    borderRadius: 999,
                                                    background: 'var(--bg-tertiary)',
                                                    color: 'var(--text-secondary)',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                }}>
                                                    {latestJob.duration_seconds}s
                                                </span>
                                            </div>

                                            <div style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 8,
                                            }}>
                                                {group.jobs.slice(0, showAllJobs ? group.jobs.length : 3).map(job => {
                                                    const jobStatus = getStatusColor(job.status);
                                                    const foundCount = getJobFoundCount(job);
                                                    const savedCount = getJobSavedCount(job);

                                                    return (
                                                        <div
                                                            key={job.id}
                                                            onClick={() => handleInspectJob(job)}
                                                            style={{
                                                                padding: '12px 14px',
                                                                borderRadius: 10,
                                                                border: '1px solid var(--border-light)',
                                                                background: 'rgba(0, 0, 0, 0.02)',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s ease',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                gap: 12,
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.background = 'rgba(0, 113, 227, 0.06)';
                                                                e.currentTarget.style.borderColor = 'rgba(0, 113, 227, 0.2)';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.02)';
                                                                e.currentTarget.style.borderColor = 'var(--border-light)';
                                                            }}
                                                        >
                                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                                <div style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 8,
                                                                    flexWrap: 'wrap',
                                                                    marginBottom: 4,
                                                                }}>
                                                                    <span style={{
                                                                        fontWeight: 600,
                                                                        color: 'var(--text-primary)',
                                                                        fontSize: 13,
                                                                        lineHeight: '1.4',
                                                                    }}>
                                                                        {new Date(job.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                                                    </span>
                                                                    <span style={{
                                                                        padding: '3px 8px',
                                                                        borderRadius: 999,
                                                                        fontSize: 10,
                                                                        fontWeight: 700,
                                                                        background: jobStatus.bg,
                                                                        color: jobStatus.text,
                                                                        textTransform: 'uppercase'
                                                                    }}>
                                                                        {job.status}
                                                                    </span>
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                                        {foundCount} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>found</span>
                                                                    </span>
                                                                    <span style={{ height: 10, width: 1, background: 'var(--border-medium)' }} />
                                                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                                                        {savedCount} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>saved</span>
                                                                    </span>
                                                                    <span style={{ height: 10, width: 1, background: 'var(--border-medium)' }} />
                                                                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                                        {job.duration_seconds}s
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleInspectJob(job);
                                                                    }}
                                                                    style={{
                                                                        padding: '8px 10px',
                                                                        borderRadius: 8,
                                                                        border: '1px solid rgba(0, 113, 227, 0.18)',
                                                                        background: 'rgba(0, 113, 227, 0.08)',
                                                                        color: 'var(--primary)',
                                                                        cursor: 'pointer',
                                                                        fontSize: 12,
                                                                        fontWeight: 700,
                                                                    }}
                                                                >
                                                                    View
                                                                </button>
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
                                        </div>
                                    );
                                })}
                            </div>

                            {groupedJobs.length > 6 && !showAllJobs && (
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
                                        See More Job Groups ({groupedJobs.length - 6} hidden)
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
                                        : 'linear-gradient(135deg, #146ef5 0%, #60a5fa 100%)',
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

                            {!modalError && (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(4, 1fr)',
                                    gap: 10,
                                    marginBottom: 24,
                                }}>
                                    {[
                                        { label: 'Progress', value: `${estimatedProgress}%` },
                                        { label: 'Elapsed', value: formatElapsed(scrapingElapsedSeconds) },
                                        { label: 'Sources', value: totalScrapeSources ? `${completedScrapeSources + failedScrapeSources}/${totalScrapeSources}` : '0/0' },
                                        { label: 'Pages', value: `${maxPages} max` },
                                    ].map((item) => (
                                        <div
                                            key={item.label}
                                            style={{
                                                padding: '12px 10px',
                                                borderRadius: 12,
                                                background: 'rgba(20, 110, 245, 0.08)',
                                                border: '1px solid rgba(20, 110, 245, 0.18)',
                                                textAlign: 'center',
                                            }}
                                        >
                                            <div style={{
                                                fontSize: 18,
                                                fontWeight: 700,
                                                color: item.label === 'Progress' ? '#60a5fa' : 'var(--text-primary)',
                                                lineHeight: 1.1,
                                            }}>
                                                {item.value}
                                            </div>
                                            <div style={{
                                                fontSize: 11,
                                                color: 'var(--text-tertiary)',
                                                marginTop: 5,
                                                textTransform: 'uppercase',
                                                letterSpacing: 0.5,
                                            }}>
                                                {item.label}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

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
                                                    background: isActive ? 'rgba(20, 110, 245, 0.1)' : 'transparent',
                                                    border: `1px solid ${isActive ? 'rgba(20, 110, 245, 0.3)' : 'transparent'}`,
                                                    transition: 'all 0.3s ease',
                                                    opacity: isPending ? 0.5 : 1,
                                                }}
                                            >
                                                <div style={{
                                                    width: 40,
                                                    height: 40,
                                                    borderRadius: 10,
                                                    background: isComplete ? '#34c759' : isActive ? '#146ef5' : 'var(--bg-tertiary)',
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
                                                        color: isActive ? '#146ef5' : 'var(--text-primary)',
                                                        fontSize: 15,
                                                    }}>
                                                        {label}
                                                    </div>
                                                    {isActive && step === 2 && scrapingProgress.length > 0 && (
                                                        <div style={{ marginTop: 8 }}>
                                                            <div style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                marginBottom: 8,
                                                                fontSize: 12,
                                                                color: 'var(--text-tertiary)',
                                                            }}>
                                                                <span>{activeScrapeSources || totalScrapeSources} active source{(activeScrapeSources || totalScrapeSources) === 1 ? '' : 's'}</span>
                                                                <span>{estimatedProgress}% • {formatElapsed(scrapingElapsedSeconds)}</span>
                                                            </div>
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
                                                                        {progress.status === 'scraping' && `${estimatedProgress}%`}
                                                                        {progress.status === 'completed' && `${progress.progress}%`}
                                                                        {progress.status === 'failed' && 'Failed'}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                {isActive && step < 4 && (
                                                    <Loader2 size={20} color="#146ef5" className="animate-spin" />
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
                                        width: `${estimatedProgress}%`,
                                        background: 'linear-gradient(90deg, #146ef5 0%, #60a5fa 100%)',
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
                                        {filteredOpportunities.map((opp, idx) => {
                                            const quality = getOpportunityQuality(opp);
                                            const sourceIndex = scrapeResult?.opportunities?.findIndex(item =>
                                                item === opp ||
                                                ((item.applyUrl || item.apply_url || item.sourceUrl || item.source_url) === (opp.applyUrl || opp.apply_url || opp.sourceUrl || opp.source_url) && item.title === opp.title)
                                            ) ?? idx;
                                            const isEnhancing = enhancingIndexes.has(sourceIndex);

                                            return (
                                            <div
                                                key={idx}
                                                onClick={() => toggleOpportunitySelection(idx)}
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    border: `2px solid ${selectedOpportunities.has(idx) ? '#146ef5' : 'var(--border-light)'}`,
                                                    background: selectedOpportunities.has(idx) ? 'rgba(20, 110, 245, 0.05)' : 'var(--bg-secondary)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                                    <div style={{
                                                        width: 20, height: 20, borderRadius: 4,
                                                        border: `2px solid ${selectedOpportunities.has(idx) ? '#146ef5' : 'var(--border-medium)'}`,
                                                        background: selectedOpportunities.has(idx) ? '#146ef5' : 'transparent',
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
                                                            <span style={{
                                                                fontSize: 11,
                                                                padding: '2px 8px',
                                                                background: quality.status === 'complete' ? 'rgba(52, 199, 89, 0.12)' : 'rgba(255, 149, 0, 0.14)',
                                                                borderRadius: 4,
                                                                color: quality.status === 'complete' ? '#34c759' : '#ff9500',
                                                                fontWeight: 700,
                                                            }}>
                                                                {quality.status === 'complete' ? 'Complete' : 'Not complete'} · {quality.score}%
                                                            </span>
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
                                                        }}>{opp.description || opp.summary || 'No description available'}</p>
                                                        {quality.missing.length > 0 && (
                                                            <p style={{ fontSize: 11, color: '#ff9500', margin: '8px 0 0' }}>
                                                                Missing: {quality.missing.slice(0, 4).join(', ')}
                                                            </p>
                                                        )}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    improveOpportunityWithAI(opp, idx);
                                                                }}
                                                                disabled={isEnhancing}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: 6,
                                                                    padding: '7px 10px',
                                                                    borderRadius: 8,
                                                                    border: '1px solid rgba(20, 110, 245, 0.35)',
                                                                    background: 'rgba(20, 110, 245, 0.12)',
                                                                    color: '#60a5fa',
                                                                    cursor: isEnhancing ? 'wait' : 'pointer',
                                                                    fontSize: 12,
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                {isEnhancing ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                                                                {isEnhancing ? 'Improving...' : 'AI Improve'}
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setDetailsOpportunity(opp);
                                                                }}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: 6,
                                                                    padding: '7px 10px',
                                                                    borderRadius: 8,
                                                                    border: '1px solid var(--border-medium)',
                                                                    background: 'transparent',
                                                                    color: 'var(--text-secondary)',
                                                                    cursor: 'pointer',
                                                                    fontSize: 12,
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                <FileCheck size={13} /> Details
                                                            </button>
                                                            {(opp.sourceUrl || opp.source_url || opp.applyUrl || opp.apply_url) && (
                                                                <a href={opp.sourceUrl || opp.source_url || opp.applyUrl || opp.apply_url} target="_blank" rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#146ef5', textDecoration: 'none' }}>
                                                                    <ExternalLink size={12} /> Source
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            );
                                        })}
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

            {detailsOpportunity && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.68)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1100,
                    padding: 24,
                }}>
                    <div style={{
                        width: 'min(760px, 96vw)',
                        maxHeight: '88vh',
                        overflow: 'auto',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 20,
                        boxShadow: '0 30px 70px rgba(0,0,0,0.35)',
                    }}>
                        {(() => {
                            const quality = getOpportunityQuality(detailsOpportunity);
                            const imageUrl = detailsOpportunity.imageUrl || detailsOpportunity.image_url;
                            const applyUrl = detailsOpportunity.applyUrl || detailsOpportunity.apply_url;
                            const sourceUrl = detailsOpportunity.sourceUrl || detailsOpportunity.source_url || applyUrl;
                            const improvedAt = detailsOpportunity.metadata?.ai_improved_at;

                            return (
                                <>
                                    <div style={{
                                        padding: 24,
                                        borderBottom: '1px solid var(--border-light)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: 16,
                                    }}>
                                        <div>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                                                <span style={{
                                                    fontSize: 12,
                                                    fontWeight: 800,
                                                    padding: '4px 10px',
                                                    borderRadius: 999,
                                                    background: quality.status === 'complete' ? 'rgba(52, 199, 89, 0.12)' : 'rgba(255, 149, 0, 0.14)',
                                                    color: quality.status === 'complete' ? '#34c759' : '#ff9500',
                                                }}>
                                                    {quality.status === 'complete' ? 'Complete details' : 'Not complete'} · {quality.score}%
                                                </span>
                                                {improvedAt && (
                                                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                        AI improved {new Date(improvedAt).toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 22, lineHeight: 1.3 }}>
                                                {detailsOpportunity.title}
                                            </h2>
                                            <p style={{ color: 'var(--text-tertiary)', margin: '8px 0 0', fontSize: 13 }}>
                                                Latest checked: {new Date().toLocaleDateString()} · {detailsOpportunity.source || 'Edutu Engine'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setDetailsOpportunity(null)}
                                            style={{ border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', height: 36 }}
                                        >
                                            <X size={24} />
                                        </button>
                                    </div>

                                    {imageUrl && (
                                        <img
                                            src={imageUrl}
                                            alt=""
                                            style={{ width: '100%', maxHeight: 260, objectFit: 'cover', display: 'block' }}
                                        />
                                    )}

                                    <div style={{ padding: 24, display: 'grid', gap: 18 }}>
                                        {quality.missing.length > 0 && (
                                            <div style={{
                                                padding: 14,
                                                borderRadius: 12,
                                                background: 'rgba(255, 149, 0, 0.1)',
                                                border: '1px solid rgba(255, 149, 0, 0.22)',
                                                color: '#ffb454',
                                                fontSize: 13,
                                            }}>
                                                Needs AI/detail review: {quality.missing.join(', ')}
                                            </div>
                                        )}

                                        <section>
                                            <h3 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-secondary)' }}>Description</h3>
                                            <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                                                {detailsOpportunity.description || detailsOpportunity.summary || 'No description available yet.'}
                                            </p>
                                        </section>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                                            {[
                                                ['Category', detailsOpportunity.category],
                                                ['Deadline', detailsOpportunity.deadline || 'Not stated'],
                                                ['Location', detailsOpportunity.location || detailsOpportunity.target_region || 'Worldwide'],
                                                ['Funding', detailsOpportunity.funding_type || (detailsOpportunity.amount ? `$${detailsOpportunity.amount.toLocaleString()}` : 'Not stated')],
                                            ].map(([label, value]) => (
                                                <div key={label} style={{ padding: 12, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
                                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                                                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 700, marginTop: 5 }}>{value || 'Not stated'}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {(detailsOpportunity.requirements?.length || detailsOpportunity.benefits?.length) && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                                                {detailsOpportunity.requirements?.length ? (
                                                    <section>
                                                        <h3 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-secondary)' }}>Requirements</h3>
                                                        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                                                            {detailsOpportunity.requirements.slice(0, 8).map((item, index) => <li key={index}>{item}</li>)}
                                                        </ul>
                                                    </section>
                                                ) : null}
                                                {detailsOpportunity.benefits?.length ? (
                                                    <section>
                                                        <h3 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-secondary)' }}>Benefits</h3>
                                                        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                                                            {detailsOpportunity.benefits.slice(0, 8).map((item, index) => <li key={index}>{item}</li>)}
                                                        </ul>
                                                    </section>
                                                ) : null}
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', borderTop: '1px solid var(--border-light)', paddingTop: 18 }}>
                                            <button
                                                onClick={() => improveOpportunityWithAI(detailsOpportunity, 0)}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    padding: '10px 14px',
                                                    borderRadius: 10,
                                                    border: '1px solid rgba(20, 110, 245, 0.35)',
                                                    background: 'rgba(20, 110, 245, 0.12)',
                                                    color: '#60a5fa',
                                                    cursor: 'pointer',
                                                    fontWeight: 800,
                                                }}
                                            >
                                                <Zap size={16} /> Improve with AI
                                            </button>
                                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                {sourceUrl && (
                                                    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                        padding: '10px 14px',
                                                        borderRadius: 10,
                                                        border: '1px solid var(--border-medium)',
                                                        color: 'var(--text-primary)',
                                                        textDecoration: 'none',
                                                        fontWeight: 700,
                                                    }}>
                                                        <ExternalLink size={16} /> Source
                                                    </a>
                                                )}
                                                {applyUrl && (
                                                    <a href={applyUrl} target="_blank" rel="noopener noreferrer" style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                        padding: '10px 14px',
                                                        borderRadius: 10,
                                                        border: 'none',
                                                        background: '#34c759',
                                                        color: 'white',
                                                        textDecoration: 'none',
                                                        fontWeight: 800,
                                                    }}>
                                                        <ExternalLink size={16} /> Apply link
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

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
