import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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


interface OpportunityBatch {
    /** null for rows scraped before metadata.scrape_job_id existed. */
    jobId: string | null;
    count: number;
    firstSeen: string | null;
    lastSeen: string | null;
    runType: string | null;
    startedAt: string | null;
}

interface OpportunitySite {
    host: string;
    total: number;
    batches: OpportunityBatch[];
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
        recheckAfterDays?: number;
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
    itemsSkipped?: number;
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
    itemsSkipped?: number;
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

// Shape of GET /api/scraper/run/status — the server-side truth for the crawl.
interface RunStatus {
    running: boolean;
    paused: boolean;
    stopping: boolean;
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

// Per-category accent colors used across source cards, badges and the add modal.
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    scholarship: { bg: 'rgba(20, 110, 245, 0.12)', text: '#4f9cf9', border: 'rgba(20, 110, 245, 0.35)' },
    internship: { bg: 'rgba(52, 199, 89, 0.12)', text: '#34c759', border: 'rgba(52, 199, 89, 0.35)' },
    fellowship: { bg: 'rgba(122, 61, 255, 0.12)', text: '#a78bfa', border: 'rgba(122, 61, 255, 0.35)' },
    grant: { bg: 'rgba(255, 149, 0, 0.14)', text: '#ff9500', border: 'rgba(255, 149, 0, 0.35)' },
    program: { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981', border: 'rgba(16, 185, 129, 0.35)' },
    graduate_program: { bg: 'rgba(124, 58, 237, 0.12)', text: '#8b5cf6', border: 'rgba(124, 58, 237, 0.35)' },
    bootcamp: { bg: 'rgba(219, 39, 119, 0.12)', text: '#ec4899', border: 'rgba(219, 39, 119, 0.35)' },
    event: { bg: 'rgba(14, 165, 233, 0.12)', text: '#38bdf8', border: 'rgba(14, 165, 233, 0.35)' },
};

const getCategoryColor = (category?: string) =>
    CATEGORY_COLORS[(category || '').toLowerCase()]
    ?? { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)', border: 'var(--border-medium)' };

export default function ScraperDashboard() {
    const location = useLocation();
    const navigate = useNavigate();
    // Which engine view the route asks for. Base /engine = sources.
    const engineSection: 'sources' | 'runs' | 'status' =
        location.pathname.endsWith('/runs')
            ? 'runs'
            : location.pathname.endsWith('/status')
                ? 'status'
                : 'sources';

    const [sources, setSources] = useState<ScrapeSource[]>([]);
    // Harvested opportunities grouped by originating site. Keyed on URL host,
    // not scraping_sources.id — deleting a source orphans its opportunities, so
    // source-keyed grouping would hide them entirely.
    const [sites, setSites] = useState<OpportunitySite[]>([]);
    const [expandedSite, setExpandedSite] = useState<string | null>(null);
    const [siteBusy, setSiteBusy] = useState<string | null>(null);
    const [jobs, setJobs] = useState<ScrapeJob[]>([]);
    const [showAllJobs, setShowAllJobs] = useState(false);
    const [stats, setStats] = useState<ScrapeStats | null>(null);
    const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [maxPages, setMaxPages] = useState(3);
    // Incremental mode: skip items scraped within the recheck window instead
    // of re-fetching + re-enriching everything. Uncheck to force a full run.
    const [incrementalRun, setIncrementalRun] = useState(true);
    const [liveSkippedCount, setLiveSkippedCount] = useState(0);
    // Automation Settings State
    const [autoRunEnabled, setAutoRunEnabled] = useState(false);
    const [cronSchedule, setCronSchedule] = useState('0 0 * * *');
    const [dataRetentionDays, setDataRetentionDays] = useState<number | null>(null);
    const [recheckAfterDays, setRecheckAfterDays] = useState(3);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    const API_URL = `${getBackendBaseUrl()}/api/scraper`;
    const [showAddSource, setShowAddSource] = useState(false);
    const [newSource, setNewSource] = useState<{ name: string; url: string; category: string; asGroup?: boolean; parentId?: number; bulkText?: string }>({ name: '', url: '', category: 'scholarship', asGroup: false, bulkText: '' });
    const [isAddingSource, setIsAddingSource] = useState(false);
    // Pre-run review panel for a group's "Run all" (lists sources + editable pages).
    const [runGroupConfirm, setRunGroupConfirm] = useState<ScrapeSource | null>(null);
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
    // Background-run UX: when the modal is minimized the scrape keeps running.
    const [isBackground, setIsBackground] = useState(false);
    const [liveFoundCount, setLiveFoundCount] = useState(0);
    // Live pause/stop + real progress tracking.
    const [isPaused, setIsPaused] = useState(false);
    const [isStopping, setIsStopping] = useState(false);
    const [sourcesTotal, setSourcesTotal] = useState(0);
    const [sourcesDone, setSourcesDone] = useState(0);
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
    // Minimize-to-pill animation flag: plays shrinkToCorner before hiding the modal.
    const [isMinimizing, setIsMinimizing] = useState(false);
    // Pre-AI snapshots keyed by source index — lets the user compare before/after.
    const [aiBefore, setAiBefore] = useState<Record<number, ScrapedOpportunity>>({});
    // Result cards expanded inline (full description + AI comparison).
    const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
    const [expandedJobGroups, setExpandedJobGroups] = useState<Set<string>>(new Set());
    const toggleJobGroup = (key: string) => {
        setExpandedJobGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };
    const abortControllerRef = useRef<AbortController | null>(null);
    // Mirrors isBackground for the async scrape closure (state would be stale).
    const isBackgroundRef = useRef(false);
    // Rehydrated run: after a refresh/navigation we reconnected to a scrape that is
    // still executing server-side. The SSE stream can't be re-attached (the backend
    // Subject only feeds the tab that started the run), so we poll run/status instead.
    const [isRehydratedRun, setIsRehydratedRun] = useState(false);
    // Mirrors isRehydratedRun for async closures (startScrape guard).
    const isRehydratedRunRef = useRef(false);

    useEffect(() => {
        // Keep ticking while the modal is open, minimized to the background pill,
        // OR reconnected to a server-side run after a refresh.
        if (!(showLoadingModal || isBackground || isRehydratedRun) || !scrapingStartedAt || modalError || currentStep >= 4) return;

        const interval = window.setInterval(() => {
            setScrapingElapsedSeconds(Math.max(0, Math.floor((Date.now() - scrapingStartedAt) / 1000)));
        }, 1000);

        return () => window.clearInterval(interval);
    }, [showLoadingModal, isBackground, isRehydratedRun, scrapingStartedAt, modalError, currentStep]);

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
                setRecheckAfterDays(Number(data.recheck_after_days) || 3);
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
                    data_retention_days: dataRetentionDays,
                    recheck_after_days: recheckAfterDays
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

    const [isSavingInspect, setIsSavingInspect] = useState(false);
    const [isImprovingInspect, setIsImprovingInspect] = useState(false);

    // Save every opportunity from the inspected job into the live catalogue.
    const saveInspectOpportunities = async () => {
        if (inspectOpportunities.length === 0) return;
        setIsSavingInspect(true);
        const items = inspectOpportunities.map(opp => {
            const sourceUrl = opp.sourceUrl || opp.source_url || opp.applyUrl || opp.apply_url || '';
            const applyUrl = opp.applyUrl || opp.apply_url || opp.application_url || sourceUrl;
            if (!sourceUrl) return null;
            return {
                title: opp.title, summary: opp.summary || undefined, description: opp.description || undefined,
                category: opp.category || undefined, organization: opp.organization || undefined, location: opp.location || undefined,
                type: 'scholarship', eligibilityCriteria: opp.requirements?.length ? opp.requirements.join('\n') : undefined,
                fundingType: opp.funding_type || undefined, targetRegion: opp.target_region || undefined,
                deadline: opp.deadline || undefined, sourceUrl, applyUrl,
                imageUrl: opp.imageUrl || opp.image_url || undefined, eligibility: opp.eligibility || undefined,
                isFeatured: false, isRemote: true, status: 'pending', tags: [] as string[],
            };
        }).filter((i): i is NonNullable<typeof i> => Boolean(i));
        if (items.length === 0) { setIsSavingInspect(false); showNotification('No valid opportunities to save', 'warning'); return; }
        let inserted = 0, skipped = 0;
        const batches: Array<typeof items> = [];
        for (let i = 0; i < items.length; i += 100) batches.push(items.slice(i, i + 100));
        // Parallel batches — the backend dedupes on URL, so a single round-trip wins.
        await Promise.all(batches.map(async (batch) => {
            try {
                const result = await backendFetchJson<{ success: boolean; inserted?: number; skipped?: number }>(
                    `/opportunities/admin/bulk-import`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: batch }) },
                );
                inserted += result.inserted || 0; skipped += result.skipped || 0;
            } catch (e) { console.error('inspect save batch failed', e); }
        }));
        setIsSavingInspect(false);
        showNotification(`Saved ${inserted} opportunities${skipped ? `, skipped ${skipped}` : ''}`, 'success');
        void loadRecentOpportunities(); void loadData();
    };

    // Improve every opportunity in the inspected job with AI (updates the list live).
    // Runs up to 4 enhancements concurrently instead of one-by-one.
    const improveInspectOpportunities = async () => {
        if (inspectOpportunities.length === 0) return;
        setIsImprovingInspect(true);
        const updated = [...inspectOpportunities];
        const authHeaders = await getAuthHeaders();
        let cursor = 0;
        const worker = async () => {
            while (cursor < updated.length) {
                const i = cursor++;
                try {
                    const response = await fetch(`${API_URL}/enhance-preview`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders },
                        body: JSON.stringify(updated[i]),
                    });
                    const result = await response.json();
                    if (response.ok && result.success && result.opportunity) {
                        updated[i] = result.opportunity;
                        setInspectOpportunities([...updated]);
                    }
                } catch (e) { console.warn('AI improve failed for item', i, e); }
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, updated.length) }, worker));
        setIsImprovingInspect(false);
        showNotification('AI improvement complete', 'success');
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
            const [engineStatusData, sourcesData, jobsData, statsData, sitesData] = await Promise.allSettled([
                backendFetchJson<EngineStatus>(`/api/scraper/engine-status`, { headers: authHeaders }),
                backendFetchJson<ScrapeSource[]>(`/api/scraper/sources`, { headers: authHeaders }),
                backendFetchJson<ScrapeJob[]>(`/api/scraper/jobs?limit=100`, { headers: authHeaders }),
                backendFetchJson<{ total: number; bySource: Record<string, number> }>(
                    `/api/scraper/stats`,
                    { headers: authHeaders },
                ),
                backendFetchJson<OpportunitySite[]>(`/api/scraper/sites`, { headers: authHeaders }),
            ]);

            setSites(
                sitesData.status === 'fulfilled' && Array.isArray(sitesData.value)
                    ? sitesData.value
                    : [],
            );

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

    // Server-side run status — the source of truth that survives page refreshes.
    const fetchRunStatus = useCallback(async (): Promise<RunStatus | null> => {
        try {
            return await backendFetchJson<RunStatus>(
                `/api/scraper/run/status`,
                { headers: await getAuthHeaders() },
            );
        } catch {
            return null; // treat as unknown — callers fail open
        }
    }, []);

    // Enter the "reconnected to an in-flight server run" UI state.
    const enterRehydratedRun = useCallback((status: RunStatus) => {
        isRehydratedRunRef.current = true;
        setIsRehydratedRun(true);
        setScraping(true);
        setIsPaused(Boolean(status.paused));
        setIsStopping(Boolean(status.stopping));
        // We don't know the real start time (the stream owner has it), so show
        // elapsed time since we reconnected — enough to signal liveness.
        setScrapingStartedAt(Date.now());
        setScrapingElapsedSeconds(0);
    }, []);

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
                    setJobs(current => [payload.new as ScrapeJob, ...current].slice(0, 100));
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

    // ── Survive page refreshes: on mount, check whether a scrape is still running
    // server-side (started before this page load) and rehydrate the running UI.
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const status = await fetchRunStatus();
            if (cancelled || !status?.running) return;
            // This tab already owns a live stream — nothing to rehydrate.
            if (abortControllerRef.current || isRehydratedRunRef.current) return;
            enterRehydratedRun(status);
            showNotification(
                'Reconnected to a scrape run started earlier — it is still running on the server.',
                'info',
            );
        })();
        return () => { cancelled = true; };
        // showNotification is intentionally omitted (recreated every render).
    }, [enterRehydratedRun, fetchRunStatus]);

    // While rehydrated-running, poll run/status (and refresh the jobs list) every
    // ~5s until the run finishes, then surface the completion like the normal
    // background path does. The interval is cleared on unmount / state flip.
    useEffect(() => {
        if (!isRehydratedRun) return;
        let disposed = false;
        let inFlight = false;
        const interval = window.setInterval(() => {
            if (inFlight) return; // don't stack requests on slow responses
            inFlight = true;
            void (async () => {
                try {
                    const status = await fetchRunStatus();
                    if (disposed || !status) return;
                    if (status.running) {
                        setIsPaused(Boolean(status.paused));
                        setIsStopping(Boolean(status.stopping));
                        // Keep Recent Scrapes fresh without the full loadData()
                        // pass (which flashes the stat tiles into loading state).
                        try {
                            const jobsData = await backendFetchJson<ScrapeJob[]>(
                                `/api/scraper/jobs?limit=100`,
                                { headers: await getAuthHeaders() },
                            );
                            if (!disposed && Array.isArray(jobsData)) setJobs(jobsData);
                        } catch { /* transient — next poll retries */ }
                    } else {
                        // Run finished server-side — reuse the background completion flow.
                        isRehydratedRunRef.current = false;
                        setIsRehydratedRun(false);
                        setShowLoadingModal(false);
                        setScraping(false);
                        setIsPaused(false);
                        setIsStopping(false);
                        setScrapingStartedAt(null);
                        setScrapingElapsedSeconds(0);
                        showNotification(
                            'Background scrape complete — open it from Recent Scrapes below.',
                            'success',
                        );
                        await loadData();
                        await loadRecentOpportunities();
                    }
                } finally {
                    inFlight = false;
                }
            })();
        }, 5000);
        return () => {
            disposed = true;
            window.clearInterval(interval);
        };
        // showNotification is intentionally omitted (recreated every render).
    }, [isRehydratedRun, fetchRunStatus, loadData, loadRecentOpportunities]);

    // Explicit cancel: aborts the in-flight scrape and resets everything.
    function stopScrape() {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setScraping(false);
        setShowLoadingModal(false);
        setIsBackground(false);
        isBackgroundRef.current = false;
        setModalError(null);
        setScrapingStartedAt(null);
        setScrapingElapsedSeconds(0);
        setLiveFoundCount(0);
        setIsStopping(false);
    }

    // Minimize: hide the modal but let the scrape keep running in the background.
    // The fetch promise in startScrape is NOT aborted, so it completes normally.
    // Plays a shrink-to-corner animation toward the floating pill first.
    function minimizeScrape() {
        setIsMinimizing(true);
        window.setTimeout(() => {
            setIsMinimizing(false);
            setShowLoadingModal(false);
            if (!isRehydratedRunRef.current) {
                setIsBackground(true);
                isBackgroundRef.current = true;
            }
        }, 280);
    }

    // Re-open the progress modal from the floating background pill.
    function restoreScrape() {
        setIsBackground(false);
        isBackgroundRef.current = false;
        setShowLoadingModal(true);
    }

    // Live run controls — hit the backend so the crawl actually pauses/stops.
    const postRunControl = async (action: 'pause' | 'resume' | 'stop'): Promise<boolean> => {
        try {
            const res = await fetch(`${API_URL}/run/${action}`, {
                method: 'POST',
                headers: await getAuthHeaders(),
            });
            if (!res.ok) {
                console.warn(`Failed to ${action} scrape run`, res.status);
                return false;
            }
            return true;
        } catch (e) {
            console.warn(`Failed to ${action} scrape run`, e);
            return false;
        }
    };
    const pauseScrape = () => {
        void postRunControl('pause').then(ok => {
            if (ok) setIsPaused(true);
            else showNotification('Failed to pause the scrape — please try again.', 'error');
        });
    };
    const resumeScrape = () => {
        void postRunControl('resume').then(ok => {
            if (ok) setIsPaused(false);
            else showNotification('Failed to resume the scrape — please try again.', 'error');
        });
    };
    // Graceful stop: the backend finalizes with partial results and the stream
    // sends `done`, so the normal completion path renders what was gathered.
    const requestStopScrape = () => {
        void postRunControl('stop').then(ok => {
            if (ok) {
                setIsStopping(true);
                showNotification('Stopping scrape — finishing the current item…', 'info');
            } else {
                showNotification('Failed to stop the scrape — please try again.', 'error');
            }
        });
    };

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
        // Guard: the backend runs at most one crawl at a time — never double-start.
        if (isRehydratedRunRef.current) {
            showNotification('A scrape is already running on the server. Stop it or wait for it to finish.', 'warning');
            return;
        }
        const existingRun = await fetchRunStatus();
        if (existingRun?.running) {
            if (abortControllerRef.current) {
                // This tab already owns the live stream — just block the duplicate.
                showNotification('A scrape is already running. Wait for it to finish or stop it first.', 'warning');
                return;
            }
            // A run is active server-side (started before a refresh or from another
            // tab) — reconnect to it instead of kicking off a duplicate.
            enterRehydratedRun(existingRun);
            showNotification('A scrape is already running on the server — reconnected to it instead of starting a new one.', 'warning');
            return;
        }

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
        setAiBefore({});
        setExpandedResults(new Set());
        setSelectedOpportunities(new Set());
        setIsBackground(false);
        isBackgroundRef.current = false;
        setLiveFoundCount(0);
        setLiveSkippedCount(0);
        setIsPaused(false);
        setIsStopping(false);
        setSourcesTotal(0);
        setSourcesDone(0);
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
            const backendUrl = getBackendBaseUrl();

            // Step 1 → 2
            setCurrentStep(1);
            await new Promise(r => setTimeout(r, 300));
            setCurrentStep(2);
            setScrapingProgress(sourcesToScrape.map(s => ({ source: s.name, status: 'pending' as const, progress: 0 })));

            const params = new URLSearchParams({ maxPages: String(maxPages) });
            if (sourceId) params.set('sourceId', String(sourceId));
            else params.set('allSources', 'true');
            params.set('incremental', incrementalRun ? 'true' : 'false');

            // GET the SSE stream via fetch (so auth headers are sent; EventSource can't).
            const response = await fetch(`${backendUrl}/api/scraper/run/stream?${params.toString()}`, {
                method: 'GET',
                headers: { ...(await getAuthHeaders()) },
                signal: controller.signal,
            });

            if (!response.ok || !response.body) {
                const errorText = await response.text().catch(() => '');
                let errorMsg = `Server error ${response.status}`;
                try { errorMsg = JSON.parse(errorText).message || errorMsg; } catch { /* noop */ }
                throw new Error(errorMsg);
            }

            // ── Consume the Server-Sent-Events stream: each event is `data: <json>\n\n` ──
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const streamed: ScrapedOpportunity[] = [];
            let buffer = '';
            let finalResult: Record<string, unknown> | null = null;
            let streamError: string | null = null;

            const markSource = (name: string, status: 'pending' | 'scraping' | 'completed' | 'failed') =>
                setScrapingProgress(prev => prev.map(p =>
                    p.source === name ? { ...p, status, progress: status === 'completed' ? 100 : p.progress } : p));

            streamLoop: while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const chunks = buffer.split('\n\n');
                buffer = chunks.pop() || '';
                for (const chunk of chunks) {
                    const dataLine = chunk.split('\n').find(l => l.startsWith('data:'));
                    if (!dataLine) continue;
                    let evt: Record<string, unknown>;
                    try { evt = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }

                    switch (evt.type) {
                        case 'start': {
                            setCurrentStep(2);
                            const names = Array.isArray(evt.sources) ? (evt.sources as string[]) : sourcesToScrape.map(s => s.name);
                            setScrapingProgress(names.map(n => ({ source: n, status: 'pending' as const, progress: 0 })));
                            setSourcesTotal(names.length);
                            setSourcesDone(0);
                            break;
                        }
                        case 'source-start':
                            markSource(String(evt.name), 'scraping');
                            break;
                        case 'source-skip':
                            // Incremental mode skipped already-scraped items on this page.
                            setLiveSkippedCount(prev => prev + (Number(evt.skipped) || 0));
                            break;
                        case 'control':
                            setIsPaused(evt.state === 'paused');
                            break;
                        case 'opportunity':
                            // Live append — this is what makes items stream in one by one.
                            streamed.push(evt.opportunity as ScrapedOpportunity);
                            setLiveFoundCount(streamed.length);
                            setCurrentStep(3);
                            setScrapeResult({
                                success: true,
                                sourcesScraped: sourcesToScrape.length,
                                totalResults: streamed.length,
                                opportunities: [...streamed],
                            });
                            break;
                        case 'source-done':
                            markSource(String(evt.name), evt.error ? 'failed' : 'completed');
                            setSourcesDone(prev => prev + 1);
                            break;
                        case 'done':
                            finalResult = (evt.result as Record<string, unknown>) || {};
                            break;
                        case 'error':
                            streamError = String(evt.error || 'Scrape failed');
                            break streamLoop;
                    }
                }
            }

            if (streamError) throw new Error(streamError);

            // Final mapped result (prefer streamed items; fall back to the done payload).
            const doneOpps = Array.isArray(finalResult?.opportunities) ? (finalResult!.opportunities as ScrapedOpportunity[]) : [];
            const opportunities = streamed.length ? streamed : doneOpps;
            const mapped: ScrapeResult = {
                success: (finalResult?.success as boolean) ?? true,
                sourcesScraped: (finalResult?.sourcesScraped as number) ?? sourcesToScrape.length,
                totalResults: (finalResult?.totalResults as number) ?? opportunities.length,
                itemsSkipped: (finalResult?.itemsSkipped as number) ?? undefined,
                duration: finalResult?.duration as number | undefined,
                jobId: (finalResult?.jobId as string) ?? (finalResult?.jobLogId as string) ?? undefined,
                sourceResults: (finalResult?.sourceResults as SourceResult[]) ?? undefined,
                opportunities,
            };

            setScrapeResult(mapped);
            setLiveFoundCount(mapped.opportunities?.length ?? mapped.totalResults ?? 0);
            setScrapingProgress(prev => prev.map(p =>
                p.status === 'scraping' || p.status === 'pending' ? { ...p, status: 'completed' as const, progress: 100 } : p));

            // Step 4: Complete (background-aware)
            setCurrentStep(4);
            const foundCount = mapped.opportunities?.length ?? mapped.totalResults ?? 0;
            await new Promise(r => setTimeout(r, 800));
            setScrapingStartedAt(null);

            if (isBackgroundRef.current) {
                setIsBackground(false);
                isBackgroundRef.current = false;
                setShowLoadingModal(false);
                showNotification(
                    `Background scrape complete — ${foundCount} opportunities found${mapped.itemsSkipped ? `, ${mapped.itemsSkipped} skipped (already scraped)` : ''}. Open it from Recent Scrapes below.`,
                    'success',
                );
            } else {
                setShowLoadingModal(false);
                setShowResultsModal(true);
            }
            await loadData();
            await loadRecentOpportunities();
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
        // If an error surfaced while the modal was minimized, bring it back so the
        // user actually sees what went wrong (success path already cleared the ref).
        if (isBackgroundRef.current) {
            setIsBackground(false);
            isBackgroundRef.current = false;
            setShowLoadingModal(true);
        }
        setScraping(false);
        abortControllerRef.current = null;
    }

    async function toggleSource(source: ScrapeSource) {
        try {
            // NOTE: backendFetchJson prepends the backend base URL — pass paths only.
            const result = await backendFetchJson<{ success: boolean; error?: string }>(
                `/api/scraper/sources/${source.id}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: !source.enabled }),
                }
            );
            if (!result.success) throw new Error(result.error || 'Update failed');
            showNotification(`${source.enabled ? 'Disabled' : 'Enabled'} "${source.name}"`, 'success');
            loadData();
        } catch (error) {
            console.error('Failed to toggle source:', error);
            showNotification(`Failed to update source: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    }

    // Deletes one scrape batch and every opportunity it produced
    // (metadata.scrape_job_id = jobId), via the existing job-delete endpoint.
    async function deleteBatch(site: OpportunitySite, batch: OpportunityBatch) {
        if (!batch.jobId) return;
        if (!confirm(
            `Delete this batch from ${site.host}?\n\n` +
            `${batch.count} opportunit${batch.count === 1 ? 'y' : 'ies'} scraped ` +
            `${batch.startedAt ? `on ${new Date(batch.startedAt).toLocaleDateString()}` : 'in this run'} ` +
            `will be permanently deleted. This cannot be undone.`,
        )) return;

        setSiteBusy(`${site.host}:${batch.jobId}`);
        try {
            const result = await backendFetchJson<{ success: boolean; error?: string }>(
                `/api/scraper/jobs/${batch.jobId}`,
                { method: 'DELETE', headers: await getAuthHeaders() },
            );
            if (!result?.success) throw new Error(result?.error || 'Batch delete failed');
            await loadData();
        } catch (e) {
            alert(`Could not delete batch: ${e instanceof Error ? e.message : 'unknown error'}`);
        } finally {
            setSiteBusy(null);
        }
    }

    // Deletes every opportunity from a site, including unattributed rows a
    // batch-by-batch delete can never reach.
    async function deleteSiteOpportunities(site: OpportunitySite) {
        const orphaned = site.batches.find((b) => !b.jobId)?.count ?? 0;
        if (!confirm(
            `Delete ALL ${site.total} opportunit${site.total === 1 ? 'y' : 'ies'} from ${site.host}?\n\n` +
            `This spans ${site.batches.filter((b) => b.jobId).length} batch(es)` +
            (orphaned ? ` plus ${orphaned} unattributed row(s)` : '') +
            `.\n\nPermanent — there is no soft delete. Anything still open will disappear from the app.`,
        )) return;

        setSiteBusy(site.host);
        try {
            const result = await backendFetchJson<{ success: boolean; deleted: number; error?: string }>(
                `/api/scraper/sites/opportunities?host=${encodeURIComponent(site.host)}`,
                { method: 'DELETE', headers: await getAuthHeaders() },
            );
            if (!result?.success) throw new Error(result?.error || 'Site delete failed');
            alert(`Deleted ${result.deleted} opportunit${result.deleted === 1 ? 'y' : 'ies'} from ${site.host}.`);
            await loadData();
        } catch (e) {
            alert(`Could not delete site: ${e instanceof Error ? e.message : 'unknown error'}`);
        } finally {
            setSiteBusy(null);
        }
    }

    async function deleteSource(id: number) {
        const target = sources.find(s => s.id === id);
        const children = target ? sources.filter(s => s.parent_id === id) : [];
        if (!confirm(
            children.length
                ? `Delete "${target?.name}" and detach its ${children.length} child source${children.length === 1 ? '' : 's'}?`
                : `Delete source "${target?.name ?? id}"?`,
        )) return;
        try {
            const result = await backendFetchJson<{ success: boolean; error?: string }>(
                `/api/scraper/sources/${id}`,
                { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }
            );
            if (!result.success) throw new Error(result.error || 'Delete failed');
            showNotification('Source deleted', 'success');
            loadData();
        } catch (error) {
            console.error('Failed to delete source:', error);
            showNotification(`Failed to delete source: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    }

    // Parse "Name | URL" or bare-URL lines into child-source payloads.
    const parseBulkSourceLines = (text: string) =>
        text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
            const [left, right] = line.split('|').map(part => part.trim());
            const url = right || left;
            if (!/^https?:\/\//i.test(url)) return null;
            let name = right ? left : '';
            if (!name) {
                try { name = new URL(url).hostname.replace(/^www\./, ''); } catch { name = url; }
            }
            return { name, url };
        }).filter((entry): entry is { name: string; url: string } => Boolean(entry));

    const postSource = (body: Record<string, unknown>) =>
        backendFetchJson<{ success: boolean; duplicate?: boolean; error?: string; data?: { id: number } }>(
            `/api/scraper/sources`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        );

    const normalizeUrl = (url: string) => url.trim().toLowerCase().replace(/\/+$/, '');

    // Outcome per entry: added, skipped (URL already exists), or failed.
    const postSourceEntries = async (
        entries: Array<{ name: string; url: string }>,
        parentId?: number,
    ) => {
        // Skip URLs we already track (and dedupe within the paste itself)
        // before hitting the backend, so duplicates never abort the whole add.
        const known = new Set(sources.filter(s => !s.is_group && s.url).map(s => normalizeUrl(s.url)));
        const toPost: typeof entries = [];
        let skipped = 0;
        for (const entry of entries) {
            const key = normalizeUrl(entry.url);
            if (known.has(key)) { skipped++; continue; }
            known.add(key);
            toPost.push(entry);
        }
        const results = await Promise.all(toPost.map(entry =>
            postSource({ ...entry, category: newSource.category, tier: 2, parent_id: parentId ?? undefined })
                .then(r => (r.success ? 'added' : r.duplicate ? 'skipped' : (r.error || 'failed')))
                .catch(e => (e instanceof Error ? e.message : 'failed'))
        ));
        return {
            added: results.filter(r => r === 'added').length,
            skipped: skipped + results.filter(r => r === 'skipped').length,
            failed: results.filter(r => r !== 'added' && r !== 'skipped') as string[],
        };
    };

    const describeAddOutcome = (outcome: { added: number; skipped: number; failed: string[] }) => {
        const parts = [];
        if (outcome.added) parts.push(`added ${outcome.added}`);
        if (outcome.skipped) parts.push(`${outcome.skipped} already existed`);
        if (outcome.failed.length) parts.push(`${outcome.failed.length} failed (${outcome.failed[0]})`);
        return parts.join(', ') || 'nothing to add';
    };

    async function addSource() {
        const bulkEntries = parseBulkSourceLines(newSource.bulkText || '');
        if (!newSource.name.trim()) {
            showNotification(newSource.asGroup ? 'Give the group a name' : 'Give the source a name', 'warning');
            return;
        }
        if (!newSource.asGroup && !newSource.url && bulkEntries.length === 0) {
            showNotification('Add a URL (or paste several, one per line)', 'warning');
            return;
        }

        setIsAddingSource(true);
        try {
            if (newSource.asGroup) {
                // Create the group first, then attach every pasted source to it.
                // (The backend gives groups a synthetic unique URL — duplicate
                // group names come back as a friendly "already exists" error.)
                const groupResult = await postSource({
                    name: newSource.name.trim(), category: newSource.category, tier: 2, is_group: true,
                });
                if (!groupResult.success || !groupResult.data?.id) {
                    throw new Error(groupResult.error || 'Failed to create group');
                }
                const outcome = await postSourceEntries(bulkEntries, groupResult.data.id);
                showNotification(
                    `Group "${newSource.name}" created — ${bulkEntries.length ? describeAddOutcome(outcome) : 'empty for now'}`,
                    outcome.failed.length ? 'warning' : 'success',
                );
            } else {
                // Single source, plus any extra pasted lines — all under the chosen parent.
                const entries = [
                    ...(newSource.url ? [{ name: newSource.name.trim(), url: newSource.url.trim() }] : []),
                    ...bulkEntries,
                ];
                const outcome = await postSourceEntries(entries, newSource.parentId);
                if (outcome.added === 0 && outcome.failed.length) {
                    throw new Error(outcome.failed[0]);
                }
                showNotification(
                    `Sources: ${describeAddOutcome(outcome)}`,
                    outcome.added === 0 || outcome.failed.length ? 'warning' : 'success',
                );
            }
            setNewSource({ name: '', url: '', category: 'scholarship', asGroup: false, bulkText: '' });
            setShowAddSource(false);
            loadData();
        } catch (err: unknown) {
            showNotification(`Could not add: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
        } finally {
            setIsAddingSource(false);
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

    const toggleResultExpanded = (index: number) => {
        setExpandedResults(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index); else next.add(index);
            return next;
        });
    };

    // Compact facts used for the AI before/after comparison table.
    const summarizeForCompare = (opp: ScrapedOpportunity) => ({
        score: getOpportunityQuality(opp).score,
        descriptionChars: (opp.description || opp.summary || '').trim().length,
        deadline: opp.deadline || 'Not stated',
        requirements: opp.requirements?.length || 0,
        benefits: opp.benefits?.length || 0,
        image: (opp.imageUrl || opp.image_url) ? 'Yes' : 'No',
        applyLink: (opp.applyUrl || opp.apply_url || opp.application_url) ? 'Yes' : 'No',
    });

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

            // Keep the pre-AI version so the card can show a before/after comparison.
            setAiBefore(prev => (prev[targetIndex] ? prev : { ...prev, [targetIndex]: opp }));
            setScrapeResult(prev => {
                if (!prev?.opportunities) return prev;
                const next = [...prev.opportunities];
                next[targetIndex] = result.opportunity;
                return { ...prev, opportunities: next };
            });
            setExpandedResults(prev => new Set(prev).add(targetIndex));
            setDetailsOpportunity(current => (current ? result.opportunity : current));
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
    // Before the backend reports the total source count we have no real signal,
    // so show an indeterminate "Starting…" state instead of a fabricated ramp.
    const progressIsIndeterminate = !modalError && currentStep < 4 && sourcesTotal <= 0;
    const estimatedProgress = modalError
        ? 0
        : currentStep >= 4
            ? 100
            // Real progress once the source count is known (sources completed / total).
            : sourcesTotal > 0
                ? Math.min(99, Math.max(2, Math.round((sourcesDone / sourcesTotal) * 100)))
                : 0;
    const progressLabel = progressIsIndeterminate ? 'Starting…' : `${estimatedProgress}%`;

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
        let failed = 0;
        const batches: Array<typeof items> = [];
        for (let i = 0; i < items.length; i += 100) {
            batches.push(items.slice(i, i + 100));
        }

        // All batches fire in parallel — the backend dedupes on URL, so order
        // doesn't matter and this cuts save time to a single round-trip.
        await Promise.all(batches.map(async (batch) => {
            try {
                const result = await backendFetchJson<{ success: boolean; inserted?: number; skipped?: number }>(
                    `/opportunities/admin/bulk-import`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items: batch }),
                    },
                );
                if (!result.success) throw new Error('Bulk import failed');
                inserted += result.inserted || 0;
                skipped += result.skipped || 0;
            } catch (err) {
                failed += batch.length;
                console.error('Failed to save opportunity batch:', err);
            }
        }));

        // Unblock the UI right away; refresh the lists in the background.
        setIsSaving(false);
        setSelectedOpportunities(new Set());
        setShowResultsModal(false);
        showNotification(
            failed
                ? `Saved ${inserted}, skipped ${skipped}, failed ${failed} — check the console`
                : `Saved ${inserted} opportunities${skipped ? `, skipped ${skipped}` : ''}`,
            failed ? 'warning' : 'success'
        );
        void loadRecentOpportunities();
        void loadData();
    };

    // Grouping logic for the table
    const rootSources = filteredSources.filter(s => !s.parent_id || !sources.find(ps => ps.id === s.parent_id));
    const getChildren = (parentId: number) => filteredSources.filter(s => s.parent_id === parentId);

    // Groups render first (full-width banners), then ungrouped sources — mixing
    // them leaves loose cards stranded around the banners and reading as group
    // members. Alphabetical within each section keeps the order predictable.
    const isGroupSource = (s: ScrapeSource) => Boolean(s.is_group || getChildren(s.id).length > 0);
    const byName = (a: ScrapeSource, b: ScrapeSource) => (a.name || '').localeCompare(b.name || '');
    const groupRoots = rootSources.filter(isGroupSource).sort(byName);
    const plainRoots = rootSources.filter(s => !isGroupSource(s)).sort(byName);

    // Compact row used for sources nested inside a group's dropdown.
    const renderChildSourceRow = (source: ScrapeSource) => {
        const palette = getCategoryColor(source.category);
        const successRate = source.total_scraped + source.total_failed > 0
            ? Math.round((source.total_scraped / (source.total_scraped + source.total_failed)) * 100)
            : null;
        return (
            <div key={source.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
            }}>
                <span title={source.category} style={{ width: 8, height: 8, borderRadius: '50%', background: palette.text, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {source.name}
                    </div>
                    {source.url && (
                        <a href={source.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 11, color: 'var(--link-blue)', textDecoration: 'none' }}>
                            {source.url.replace(/^https?:\/\//, '').slice(0, 44)}
                        </a>
                    )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {successRate !== null ? `${successRate}%` : '—'}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); toggleSource(source); }}
                    title={source.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                    style={{
                        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6,
                        fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                        background: source.enabled ? 'rgba(52, 199, 89, 0.12)' : 'var(--bg-tertiary)',
                        color: source.enabled ? '#34c759' : 'var(--text-tertiary)',
                    }}
                >
                    {source.enabled ? <CheckCircle2 size={11} /> : <Pause size={11} />}
                    {source.enabled ? 'On' : 'Off'}
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); startScrape(source.id); }}
                    title="Scrape this source"
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(0,113,227,0.3)', background: 'rgba(0,113,227,0.08)', color: '#0071e3', cursor: 'pointer' }}
                >
                    <Play size={12} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); deleteSource(source.id); }}
                    title="Delete source"
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(255,59,48,0.25)', background: 'transparent', color: '#ff3b30', cursor: 'pointer' }}
                >
                    <Trash2 size={12} />
                </button>
            </div>
        );
    };

    // Source card (grid layout). Groups render full-width with a colored header
    // and a dropdown of their child sources; plain sources get a category accent.
    const renderSourceCard = (source: ScrapeSource): React.ReactNode => {
        const children = getChildren(source.id);
        const isExpanded = expandedGroups.has(source.id);
        const isGroup = Boolean(source.is_group || children.length > 0);
        const palette = getCategoryColor(source.category);
        const successRate = source.total_scraped + source.total_failed > 0
            ? Math.round((source.total_scraped / (source.total_scraped + source.total_failed)) * 100)
            : null;

        if (isGroup) {
            const enabledChildren = children.filter(c => c.enabled).length;
            return (
                <div key={source.id} style={{
                    gridColumn: '1 / -1',
                    background: 'var(--bg-secondary)',
                    border: `1px solid ${isExpanded ? palette.border : 'var(--border-light)'}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    transition: 'border-color 0.2s ease',
                }}>
                    {/* Group header — click anywhere to expand/collapse */}
                    <div
                        onClick={() => toggleGroup(source.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
                            cursor: 'pointer', background: palette.bg,
                        }}
                    >
                        <ChevronRight size={16} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', color: palette.text, flexShrink: 0 }} />
                        <span style={{
                            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                            background: palette.text, color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Globe size={16} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {source.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                {children.length} source{children.length === 1 ? '' : 's'} · {enabledChildren} active
                            </div>
                        </div>
                        <span style={{
                            padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                            textTransform: 'uppercase', letterSpacing: 0.5,
                            background: 'var(--bg-primary)', color: palette.text, border: `1px solid ${palette.border}`,
                            flexShrink: 0,
                        }}>
                            {source.category || 'group'}
                        </span>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => setRunGroupConfirm(source)}
                                title="Review the group's sources, then scrape them all"
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: `1px solid ${palette.border}`, background: 'var(--bg-primary)', color: palette.text, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                            >
                                <Play size={12} /> Run all
                            </button>
                            <button
                                onClick={() => {
                                    setNewSource({ name: '', url: '', category: source.category || 'scholarship', asGroup: false, parentId: source.id, bulkText: '' });
                                    setShowAddSource(true);
                                }}
                                title="Add sources to this group"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-medium)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                            >
                                <Plus size={14} />
                            </button>
                            <button
                                onClick={() => deleteSource(source.id)}
                                title="Delete group"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,59,48,0.25)', background: 'var(--bg-primary)', color: '#ff3b30', cursor: 'pointer' }}
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    </div>
                    {/* Dropdown body */}
                    {isExpanded && (
                        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-tertiary)', animation: 'fadeIn 0.2s ease' }}>
                            {children.length === 0 ? (
                                <div style={{ padding: '14px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
                                    No sources in this group yet — use the “+” button to add some.
                                </div>
                            ) : children.map(renderChildSourceRow)}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div key={source.id} style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-light)',
                borderTop: `3px solid ${palette.text}`,
                borderRadius: 12, padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 10,
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {source.name}
                        </span>
                        {source.url && (
                            <a href={source.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: 11, color: 'var(--link-blue)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {source.url.replace(/^https?:\/\//, '').slice(0, 34)}<ExternalLink size={9} />
                            </a>
                        )}
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleSource(source); }}
                        title={source.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                        style={{
                            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6,
                            fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                            background: source.enabled ? 'rgba(52, 199, 89, 0.12)' : 'var(--bg-tertiary)',
                            color: source.enabled ? '#34c759' : 'var(--text-tertiary)',
                        }}
                    >
                        {source.enabled ? <CheckCircle2 size={11} /> : <Pause size={11} />}
                        {source.enabled ? 'Active' : 'Off'}
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                        textTransform: 'capitalize', background: palette.bg, color: palette.text,
                    }}>
                        {source.category || 'other'}
                    </span>
                    <span>{source.last_scraped ? formatDate(source.last_scraped) : 'Never scraped'}</span>
                    <span>{successRate !== null ? `${successRate}% success` : '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button
                        onClick={() => startScrape(source.id)}
                        title="Scrape this source"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(0,113,227,0.3)', background: 'rgba(0,113,227,0.08)', color: '#0071e3', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                    >
                        <Play size={13} /> Run
                    </button>
                    <button
                        onClick={() => deleteSource(source.id)}
                        title="Delete source"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,59,48,0.25)', background: 'transparent', color: '#ff3b30', cursor: 'pointer' }}
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>
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

            {/* Sub-nav: Sources / Live Runs / Status */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border-light)' }}>
                {([
                    { key: 'sources', label: 'Sources', to: '/engine' },
                    { key: 'runs', label: 'Live Runs', to: '/engine/runs' },
                    { key: 'status', label: 'Status', to: '/engine/status' },
                ] as const).map((t) => {
                    const active = engineSection === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => navigate(t.to)}
                            style={{
                                padding: '8px 16px',
                                border: 'none',
                                background: 'transparent',
                                color: active ? 'var(--apple-blue)' : 'var(--text-secondary)',
                                fontSize: 14,
                                fontWeight: active ? 600 : 500,
                                cursor: 'pointer',
                                borderBottom: active ? '2px solid var(--apple-blue)' : '2px solid transparent',
                                marginBottom: -1,
                            }}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {engineSection === 'sources' && (
              <>
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
                {rootSources.length === 0 ? (
                    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                        <AlertCircle size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
                        <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
                            No sources found matching your filter.
                        </p>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: 12,
                        padding: '16px 24px 24px',
                    }}>
                        {groupRoots.map(source => renderSourceCard(source))}
                        {groupRoots.length > 0 && plainRoots.length > 0 && (
                            <div style={{
                                gridColumn: '1 / -1',
                                display: 'flex', alignItems: 'center', gap: 10,
                                margin: '8px 0 0',
                            }}>
                                <span style={{
                                    fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                                    textTransform: 'uppercase', color: 'var(--text-tertiary)',
                                    flexShrink: 0,
                                }}>
                                    Individual sources · {plainRoots.length}
                                </span>
                                <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
                            </div>
                        )}
                        {plainRoots.map(source => renderSourceCard(source))}
                    </div>
                )}
            </div>

            {/* Harvested opportunities, grouped by site → batch */}
            <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: 14,
                border: '1px solid var(--border-light)',
                overflow: 'hidden',
                marginBottom: '24px',
                padding: '20px 24px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Database size={18} style={{ color: '#0071e3' }} />
                        Opportunities by site
                    </h2>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {sites.length} site{sites.length === 1 ? '' : 's'} · {sites.reduce((n, s) => n + s.total, 0)} opportunities
                    </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 14px' }}>
                    Grouped by the site each opportunity actually came from, so sites whose
                    source row was deleted still show up here. Expand one to delete individual
                    scrape batches.
                </p>

                {sites.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>
                        No harvested opportunities.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {sites.map((site) => {
                            const isOpen = expandedSite === site.host;
                            const busy = siteBusy === site.host;
                            return (
                                <div key={site.host} style={{
                                    border: '1px solid var(--border-light)',
                                    borderRadius: 10,
                                    overflow: 'hidden',
                                }}>
                                    <div
                                        onClick={() => setExpandedSite(isOpen ? null : site.host)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            padding: '10px 12px', cursor: 'pointer',
                                            background: isOpen ? 'var(--hover-bg)' : 'transparent',
                                        }}
                                    >
                                        <ChevronRight
                                            size={15}
                                            style={{
                                                color: 'var(--text-tertiary)', flexShrink: 0,
                                                transform: isOpen ? 'rotate(90deg)' : 'none',
                                                transition: 'transform 0.15s',
                                            }}
                                        />
                                        <span style={{
                                            fontSize: 13, fontWeight: 600, flex: 1,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {site.host}
                                        </span>
                                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                            {site.total} · {site.batches.length} batch{site.batches.length === 1 ? '' : 'es'}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            disabled={busy}
                                            onClick={(e) => { e.stopPropagation(); void deleteSiteOpportunities(site); }}
                                            title={`Delete all ${site.total} opportunities from ${site.host}`}
                                            style={{ color: '#ef4444', padding: '4px 10px', fontSize: 12, flexShrink: 0 }}
                                        >
                                            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                            Delete all
                                        </button>
                                    </div>

                                    {isOpen && (
                                        <div style={{ borderTop: '1px solid var(--border-light)', padding: '6px 12px 10px 34px' }}>
                                            {site.batches.map((batch, i) => {
                                                const key = `${site.host}:${batch.jobId ?? 'none'}`;
                                                const batchBusy = siteBusy === key;
                                                return (
                                                    <div key={key + i} style={{
                                                        display: 'flex', alignItems: 'center', gap: '10px',
                                                        padding: '7px 0',
                                                        borderBottom: i < site.batches.length - 1 ? '1px solid var(--border-light)' : 'none',
                                                    }}>
                                                        <span style={{ fontSize: 12, flex: 1, color: 'var(--text-secondary)' }}>
                                                            {batch.jobId ? (
                                                                <>
                                                                    {batch.startedAt
                                                                        ? new Date(batch.startedAt).toLocaleString(undefined, {
                                                                            month: 'short', day: 'numeric', year: 'numeric',
                                                                            hour: '2-digit', minute: '2-digit',
                                                                        })
                                                                        : batch.firstSeen
                                                                            ? new Date(batch.firstSeen).toLocaleDateString()
                                                                            : 'Unknown date'}
                                                                    {batch.runType && (
                                                                        <span style={{ color: 'var(--text-tertiary)' }}> · {batch.runType}</span>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                // Predates metadata.scrape_job_id — no batch to delete.
                                                                <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                                                    Not attributed to a run · only "Delete all" can remove these
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                                            {batch.count}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary"
                                                            disabled={!batch.jobId || batchBusy}
                                                            onClick={() => void deleteBatch(site, batch)}
                                                            title={batch.jobId
                                                                ? `Delete this batch of ${batch.count}`
                                                                : 'These rows have no batch id'}
                                                            style={{
                                                                color: batch.jobId ? '#ef4444' : 'var(--text-tertiary)',
                                                                padding: '3px 9px', fontSize: 12, flexShrink: 0,
                                                            }}
                                                        >
                                                            {batchBusy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

              </>
            )}

            {engineSection === 'status' && (
              <>
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
                                <option value="0 */6 * * *">Every 6 Hours</option>
                                <option value="0 0 * * *">Daily (Midnight)</option>
                                <option value="0 0 * * 1">Weekly (Mon)</option>
                                <option value="0 0 1 * *">Monthly (1st)</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>Re-check Known Items After (Days)</p>
                        <input
                            type="number"
                            min={1}
                            max={30}
                            value={recheckAfterDays}
                            onChange={(e) => setRecheckAfterDays(Math.min(30, Math.max(1, parseInt(e.target.value) || 3)))}
                            style={{
                                width: 90,
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border-medium)',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                fontSize: 14,
                                fontWeight: 600,
                                textAlign: 'center'
                            }}
                        />
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: '6px' }}>
                            Incremental runs skip items scraped within this window, then re-check them for updates (deadline changes, edits) once it passes.
                        </p>
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

              </>
            )}

            {engineSection === 'runs' && (
              <>
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
                                    const isExpanded = expandedJobGroups.has(group.displayName);
                                    const totalFound = group.jobs.reduce((s, j) => s + getJobFoundCount(j), 0);
                                    const totalSaved = group.jobs.reduce((s, j) => s + getJobSavedCount(j), 0);
                                    const latestRunning = latestJob.status === 'running' || latestJob.status === 'in_progress';

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

                                            {/* Total outcomes across all runs in this group */}
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                                <span style={{ padding: '4px 8px', borderRadius: 999, background: 'rgba(0, 113, 227, 0.08)', color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>
                                                    {totalFound} found
                                                </span>
                                                <span style={{ padding: '4px 8px', borderRadius: 999, background: 'rgba(52, 199, 89, 0.1)', color: '#34c759', fontSize: 11, fontWeight: 600 }}>
                                                    {totalSaved} saved
                                                </span>
                                                <span style={{ padding: '4px 8px', borderRadius: 999, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}>
                                                    {group.jobs.length} run{group.jobs.length === 1 ? '' : 's'}
                                                </span>
                                            </div>

                                            {/* Live progress for the active run */}
                                            {latestRunning && scraping && (
                                                <div style={{ marginBottom: 12 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                                                        <span>{isPaused ? 'Paused' : 'Scraping'} · {liveFoundCount} found</span>
                                                        <span>{progressLabel}</span>
                                                    </div>
                                                    <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
                                                        {progressIsIndeterminate
                                                            ? <div style={{ height: '100%', width: '35%', background: 'linear-gradient(90deg,#146ef5,#60a5fa)', borderRadius: 2, animation: 'indeterminateBar 1.4s ease-in-out infinite' }} />
                                                            : <div style={{ height: '100%', width: `${estimatedProgress}%`, background: 'linear-gradient(90deg,#146ef5,#60a5fa)', borderRadius: 2, transition: 'width 0.5s ease' }} />}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Actions: View & Save · (running) pause/stop · expand runs */}
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <button
                                                    onClick={() => handleInspectJob(latestJob)}
                                                    title="View this run's opportunities — save them or improve with AI"
                                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,113,227,0.25)', background: 'rgba(0,113,227,0.08)', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                                                >
                                                    <Save size={13} /> View &amp; Save
                                                </button>
                                                {latestRunning && scraping && (
                                                    <>
                                                        <button onClick={isPaused ? resumeScrape : pauseScrape} title={isPaused ? 'Resume' : 'Pause'}
                                                            style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border-medium)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {isPaused ? <Play size={14} /> : <Pause size={14} />}
                                                        </button>
                                                        <button onClick={requestStopScrape} title="Stop"
                                                            style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.1)', color: '#ff3b30', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <X size={14} />
                                                        </button>
                                                    </>
                                                )}
                                                <button onClick={() => toggleJobGroup(group.displayName)} title={isExpanded ? 'Hide runs' : 'Show runs'}
                                                    style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border-medium)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <ChevronRight size={16} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                                                </button>
                                            </div>

                                            {isExpanded && (
                                            <div style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 8,
                                                marginTop: 12,
                                                borderTop: '1px solid var(--border-light)',
                                                paddingTop: 12,
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
                                            )}
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

              </>
            )}

            {/* Run-all review panel: see the group's websites + edit pages before starting */}
            {runGroupConfirm && (() => {
                const group = runGroupConfirm;
                const palette = getCategoryColor(group.category);
                const groupChildren = sources.filter(s => s.parent_id === group.id);
                const activeChildren = groupChildren.filter(s => s.enabled);
                return (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
                    }} onClick={() => setRunGroupConfirm(null)}>
                        <div
                            style={{
                                background: 'var(--bg-primary)', borderRadius: 16, width: '100%', maxWidth: 560,
                                maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                                border: '1px solid var(--border-light)', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                                animation: 'slideUp 0.25s ease',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 12, background: palette.bg }}>
                                <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: palette.text, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Globe size={18} />
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                        Run all — {group.name}
                                    </h3>
                                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
                                        {activeChildren.length} of {groupChildren.length} source{groupChildren.length === 1 ? '' : 's'} will be scraped · toggle any off to skip it
                                    </p>
                                </div>
                                <button
                                    onClick={() => setRunGroupConfirm(null)}
                                    style={{ padding: 4, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 6 }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Websites in this group */}
                            <div style={{ padding: '14px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                                {groupChildren.length === 0 ? (
                                    <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
                                        This group has no sources yet — add some first.
                                    </div>
                                ) : groupChildren.map(child => (
                                    <div key={child.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                                        borderRadius: 10, border: '1px solid var(--border-light)',
                                        background: child.enabled ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                                        opacity: child.enabled ? 1 : 0.6,
                                    }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: child.enabled ? '#34c759' : 'var(--border-medium)', flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {child.name}
                                            </div>
                                            {child.url && (
                                                <a href={child.url} target="_blank" rel="noopener noreferrer"
                                                    style={{ fontSize: 11, color: 'var(--link-blue)', textDecoration: 'none' }}>
                                                    {child.url.replace(/^https?:\/\//, '').slice(0, 52)}
                                                </a>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => toggleSource(child)}
                                            title={child.enabled ? 'Included — click to skip' : 'Skipped — click to include'}
                                            style={{
                                                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 999,
                                                fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
                                                background: child.enabled ? 'rgba(52, 199, 89, 0.12)' : 'var(--bg-primary)',
                                                color: child.enabled ? '#34c759' : 'var(--text-tertiary)',
                                            }}
                                        >
                                            {child.enabled ? <CheckCircle2 size={11} /> : <Pause size={11} />}
                                            {child.enabled ? 'Included' : 'Skipped'}
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Footer: editable pages + start */}
                            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-secondary)', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <label htmlFor="run-all-pages" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        Pages per source
                                    </label>
                                    <input
                                        id="run-all-pages"
                                        type="number"
                                        min={1}
                                        max={20}
                                        value={maxPages}
                                        onChange={(e) => setMaxPages(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                                        style={{ width: 72, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-medium)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, textAlign: 'center', outline: 'none' }}
                                    />
                                </div>
                                <label
                                    htmlFor="run-incremental"
                                    title="Skip items scraped recently and stop paginating once a page is fully known. Uncheck to force a full re-scrape."
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}
                                >
                                    <input
                                        id="run-incremental"
                                        type="checkbox"
                                        checked={incrementalRun}
                                        onChange={(e) => setIncrementalRun(e.target.checked)}
                                        style={{ width: 16, height: 16, accentColor: 'var(--apple-blue)', cursor: 'pointer' }}
                                    />
                                    Skip already-scraped items
                                </label>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={() => setRunGroupConfirm(null)}
                                        style={{ padding: '10px 18px', background: 'transparent', border: '1px solid var(--border-medium)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            setRunGroupConfirm(null);
                                            showNotification(`Starting scrape for ${activeChildren.length} ${group.name} source${activeChildren.length === 1 ? '' : 's'}`, 'info');
                                            void startScrape(group.id);
                                        }}
                                        disabled={activeChildren.length === 0}
                                        title={activeChildren.length === 0 ? 'Enable at least one source first' : undefined}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                                            background: activeChildren.length === 0 ? 'var(--border-medium)' : 'var(--apple-blue)',
                                            border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 700,
                                            cursor: activeChildren.length === 0 ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        <Play size={15} /> Start scrape ({activeChildren.length})
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

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
                        padding: 20,
                    }} onClick={() => setShowAddSource(false)}>
                        <div
                            style={{
                                background: 'var(--bg-primary)',
                                borderRadius: 16,
                                width: '100%',
                                maxWidth: 520,
                                maxHeight: '88vh',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                border: '1px solid var(--border-light)',
                                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                                animation: 'slideUp 0.25s ease',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                    {newSource.asGroup ? 'New Website Group' : 'Add Sources'}
                                </h3>
                                <button
                                    onClick={() => setShowAddSource(false)}
                                    style={{ padding: 4, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 6 }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {/* Mode toggle: single source vs group */}
                                <div style={{ display: 'flex', gap: 8, padding: 4, background: 'var(--bg-tertiary)', borderRadius: 10 }}>
                                    {([
                                        { group: false, label: 'Source(s)', hint: 'Add one or many sources' },
                                        { group: true, label: 'Website group', hint: 'A folder that holds sources' },
                                    ]).map(mode => (
                                        <button
                                            key={String(mode.group)}
                                            onClick={() => setNewSource({ ...newSource, asGroup: mode.group, parentId: mode.group ? undefined : newSource.parentId })}
                                            title={mode.hint}
                                            style={{
                                                flex: 1, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                                fontSize: 13, fontWeight: 700,
                                                background: (newSource.asGroup || false) === mode.group ? 'var(--bg-primary)' : 'transparent',
                                                color: (newSource.asGroup || false) === mode.group ? 'var(--apple-blue)' : 'var(--text-tertiary)',
                                                boxShadow: (newSource.asGroup || false) === mode.group ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
                                                transition: 'all 0.15s ease',
                                            }}
                                        >
                                            {mode.label}
                                        </button>
                                    ))}
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, fontSize: 13 }}>
                                        {newSource.asGroup ? 'Group name' : 'Name'}
                                    </label>
                                    <input
                                        type="text"
                                        value={newSource.name}
                                        onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-medium)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}
                                        placeholder={newSource.asGroup ? 'e.g. Opportunity Desk' : 'e.g. Fastweb'}
                                    />
                                </div>

                                {!newSource.asGroup && (
                                    <div>
                                        <label style={{ display: 'block', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, fontSize: 13 }}>URL</label>
                                        <input
                                            type="url"
                                            value={newSource.url}
                                            onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-medium)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}
                                            placeholder="https://www.fastweb.com/scholarships"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, fontSize: 13 }}>Category</label>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {Object.keys(CATEGORY_COLORS).map(category => {
                                            const palette = CATEGORY_COLORS[category];
                                            const isActive = newSource.category === category;
                                            return (
                                                <button
                                                    key={category}
                                                    onClick={() => setNewSource({ ...newSource, category })}
                                                    style={{
                                                        padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                                        textTransform: 'capitalize',
                                                        border: `1px solid ${isActive ? palette.text : 'var(--border-medium)'}`,
                                                        background: isActive ? palette.bg : 'transparent',
                                                        color: isActive ? palette.text : 'var(--text-tertiary)',
                                                        transition: 'all 0.15s ease',
                                                    }}
                                                >
                                                    {category}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {!newSource.asGroup && sources.some(s => s.is_group) && (
                                    <div>
                                        <label style={{ display: 'block', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, fontSize: 13 }}>Parent group (optional)</label>
                                        <select
                                            value={newSource.parentId || ''}
                                            onChange={(e) => setNewSource({ ...newSource, parentId: e.target.value ? parseInt(e.target.value) : undefined })}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-medium)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', cursor: 'pointer' }}
                                        >
                                            <option value="">None — top level</option>
                                            {sources.filter(s => s.is_group).map(group => (
                                                <option key={group.id} value={group.id}>{group.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Bulk add — always available for groups; optional extra lines for single mode */}
                                <div>
                                    <label style={{ display: 'block', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, fontSize: 13 }}>
                                        {newSource.asGroup ? 'Sources in this group' : 'Add more at once (optional)'}
                                    </label>
                                    <textarea
                                        value={newSource.bulkText || ''}
                                        onChange={(e) => setNewSource({ ...newSource, bulkText: e.target.value })}
                                        rows={newSource.asGroup ? 6 : 3}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-medium)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.6 }}
                                        placeholder={'One per line — either:\nOpportunity Desk | https://opportunitydesk.org\nhttps://scholarshipregion.com'}
                                    />
                                    <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
                                        Format: <code>Name | URL</code> or just a URL (the name is taken from the domain).
                                        {(() => {
                                            const count = parseBulkSourceLines(newSource.bulkText || '').length;
                                            return count ? ` ${count} valid source${count === 1 ? '' : 's'} detected.` : '';
                                        })()}
                                    </p>
                                </div>
                            </div>

                            {/* Footer — inside the card so clicks don't bubble to the overlay */}
                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: 'var(--bg-secondary)' }}>
                                <button
                                    onClick={() => setShowAddSource(false)}
                                    style={{ padding: '10px 18px', background: 'transparent', border: '1px solid var(--border-medium)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => void addSource()}
                                    disabled={isAddingSource}
                                    style={{
                                        padding: '10px 18px', background: 'var(--apple-blue)', border: 'none', borderRadius: 8,
                                        color: 'white', fontSize: 14, fontWeight: 600, cursor: isAddingSource ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 8, opacity: isAddingSource ? 0.7 : 1,
                                    }}
                                >
                                    {isAddingSource ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                                    {isAddingSource
                                        ? 'Adding…'
                                        : newSource.asGroup ? 'Create group' : 'Add source(s)'}
                                </button>
                            </div>
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
                        animation: isMinimizing ? 'fadeOut 0.28s ease forwards' : 'fadeIn 0.2s ease',
                    }}>
                        <div style={{
                            background: 'var(--bg-primary)',
                            borderRadius: 20,
                            padding: 0,
                            width: '90%',
                            maxWidth: 600,
                            maxHeight: '88vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            animation: isMinimizing ? 'shrinkToCorner 0.28s ease-in forwards' : 'slideUp 0.3s ease',
                        }}>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 36px 8px' }}>
                            {/* Header */}
                            <div style={{ textAlign: 'center', marginBottom: modalError ? 16 : 28 }}>
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
                                    ) : isPaused ? (
                                        <Pause size={30} color="white" />
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
                                    {modalError
                                        ? 'Scraping Failed'
                                        : isRehydratedRun
                                            ? (isStopping ? 'Stopping Server Scrape…' : isPaused ? 'Server Scrape Paused' : 'Server Scrape Running')
                                            : currentStep === 4 ? 'Scraping Complete!' : isPaused ? 'Scrape Paused' : 'Scraping in Progress...'}
                                </h2>
                                <p style={{
                                    color: 'var(--text-tertiary)',
                                    marginTop: 8,
                                    fontSize: 14,
                                }}>
                                    {modalError
                                        ? 'An error occurred — see details below.'
                                        : isRehydratedRun
                                            ? 'Reconnected to a run started earlier — results will appear in Recent Scrapes when it finishes.'
                                            : currentStep === 4
                                                ? `Found ${scrapeResult?.totalResults || 0} opportunities from ${scrapeResult?.sourcesScraped || 0} sources${(scrapeResult?.itemsSkipped ?? liveSkippedCount) ? ` (${scrapeResult?.itemsSkipped ?? liveSkippedCount} already scraped, skipped)` : ''}`
                                                : liveSkippedCount > 0
                                                    ? `Please wait while we gather scholarship opportunities — ${liveSkippedCount} already-scraped item${liveSkippedCount === 1 ? '' : 's'} skipped so far`
                                                    : 'Please wait while we gather scholarship opportunities'
                                    }
                                </p>
                            </div>

                            {!modalError && (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: isRehydratedRun ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)',
                                    gap: 10,
                                    marginBottom: 24,
                                }}>
                                    {(isRehydratedRun
                                        ? [
                                            { label: 'Status', value: isStopping ? 'Stopping' : isPaused ? 'Paused' : 'Running' },
                                            { label: 'Reconnected', value: formatElapsed(scrapingElapsedSeconds) },
                                            { label: 'Checks', value: 'every 5s' },
                                        ]
                                        : [
                                            { label: 'Progress', value: progressLabel },
                                            { label: 'Elapsed', value: formatElapsed(scrapingElapsedSeconds) },
                                            { label: 'Sources', value: totalScrapeSources ? `${completedScrapeSources + failedScrapeSources}/${totalScrapeSources}` : '0/0' },
                                            { label: 'Pages', value: `${maxPages} max` },
                                        ]).map((item) => (
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

                            {/* Steps (hidden on error / rehydrated runs) */}
                            {!modalError && !isRehydratedRun && (
                                <div style={{ marginBottom: 24 }}>
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
                                                                <span>{progressLabel} • {formatElapsed(scrapingElapsedSeconds)}</span>
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
                                                                        {progress.status === 'scraping' && progressLabel}
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

                            {/* Progress Bar (hidden on error / rehydrated runs) */}
                            {!modalError && !isRehydratedRun && (
                                <div style={{
                                    height: 4,
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                    marginBottom: 24,
                                }}>
                                    {progressIsIndeterminate ? (
                                        <div style={{
                                            height: '100%',
                                            width: '35%',
                                            background: 'linear-gradient(90deg, #146ef5 0%, #60a5fa 100%)',
                                            borderRadius: 2,
                                            animation: 'indeterminateBar 1.4s ease-in-out infinite',
                                        }} />
                                    ) : (
                                        <div style={{
                                            height: '100%',
                                            width: `${estimatedProgress}%`,
                                            background: 'linear-gradient(90deg, #146ef5 0%, #60a5fa 100%)',
                                            borderRadius: 2,
                                            transition: 'width 0.5s ease',
                                        }} />
                                    )}
                                </div>
                            )}

                            {/* Live opportunity count + per-item loading skeletons */}
                            {!modalError && !isRehydratedRun && (
                                <div style={{ marginBottom: 4 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                            {currentStep === 4 ? 'Opportunities found' : 'Opportunities incoming'}
                                        </span>
                                        <span style={{ fontSize: 15, fontWeight: 700, color: '#146ef5', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            {currentStep === 4
                                                ? liveFoundCount
                                                : <><Loader2 size={13} className="animate-spin" /> scanning…</>}
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                                        {(scrapeResult?.opportunities ?? []).map((opp, i) => (
                                            <div key={`opp-${i}`} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', animation: 'fadeIn 0.3s ease' }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.title}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.organization || opp.source}</div>
                                            </div>
                                        ))}
                                        {currentStep < 4 && Array.from({ length: Math.max(0, 4 - Math.min(4, scrapeResult?.opportunities?.length ?? 0)) }).map((_, i) => (
                                            <div key={`sk-${i}`} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
                                                <div style={{ height: 10, width: '80%', borderRadius: 4, background: 'var(--bg-tertiary)', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />
                                                <div style={{ height: 8, width: '55%', borderRadius: 4, background: 'var(--bg-tertiary)', marginTop: 8, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.15 + 0.2}s` }} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                        {/* Footer actions: minimize (keep running) vs cancel; Dismiss on error/complete */}
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '16px 36px 24px', borderTop: '1px solid var(--border-light)', flexShrink: 0, background: 'var(--bg-primary)' }}>
                                {modalError || currentStep === 4 ? (
                                    <button
                                        onClick={stopScrape}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '10px 28px', background: 'var(--apple-blue)',
                                            border: '1px solid transparent', borderRadius: 10,
                                            color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                                            transition: 'opacity 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                                    >
                                        <CheckCircle2 size={16} /> Dismiss
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={isPaused ? resumeScrape : pauseScrape}
                                            title={isPaused ? 'Resume the scrape' : 'Pause the scrape'}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '10px 22px', background: isPaused ? 'rgba(52, 199, 89, 0.12)' : 'var(--bg-tertiary)',
                                                border: `1px solid ${isPaused ? 'rgba(52, 199, 89, 0.35)' : 'var(--border-medium)'}`, borderRadius: 10,
                                                color: isPaused ? '#34c759' : 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                                transition: 'opacity 0.2s ease',
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                                        >
                                            {isPaused ? <><Play size={16} /> Resume</> : <><Pause size={16} /> Pause</>}
                                        </button>
                                        <button
                                            onClick={requestStopScrape}
                                            title="Stop and keep what was gathered so far"
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '10px 22px', background: 'rgba(255, 59, 48, 0.1)',
                                                border: '1px solid rgba(255, 59, 48, 0.3)', borderRadius: 10,
                                                color: '#ff3b30', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                                                transition: 'opacity 0.2s ease',
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                                        >
                                            <X size={16} /> Stop
                                        </button>
                                        <button
                                            onClick={minimizeScrape}
                                            title="Keep the scrape running and close this window"
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '10px 22px', background: 'var(--apple-blue)',
                                                border: '1px solid transparent', borderRadius: 10,
                                                color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                                transition: 'opacity 0.2s ease',
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                                        >
                                            <ArrowLeft size={16} /> Background
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Floating background-scrape pill (shown while minimized) */}
            {scraping && isBackground && !showLoadingModal && (
                <div
                    style={{
                        position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px 10px 14px', borderRadius: 18,
                        background: 'var(--bg-primary)', border: '1px solid var(--border-medium)',
                        boxShadow: '0 12px 30px -8px rgba(0,0,0,0.35)',
                        color: 'var(--text-primary)', animation: 'slideUp 0.3s ease',
                    }}
                >
                    <button
                        onClick={restoreScrape}
                        title="Tap to view scrape progress"
                        style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                    >
                        <span style={{ width: 34, height: 34, borderRadius: 10, background: isPaused ? 'var(--bg-tertiary)' : 'linear-gradient(135deg,#146ef5,#60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isPaused ? 'var(--text-secondary)' : 'white' }}>
                            {isPaused ? <Pause size={17} /> : <Loader2 size={18} className="animate-spin" />}
                        </span>
                        <span style={{ textAlign: 'left' }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
                                {isPaused ? 'Scrape paused' : 'Scraping…'} <span style={{ color: '#146ef5' }}>{liveFoundCount}</span> found · {progressLabel}
                            </span>
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>
                                {formatElapsed(scrapingElapsedSeconds)} elapsed · tap to view
                            </span>
                        </span>
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                        <button
                            onClick={isPaused ? resumeScrape : pauseScrape}
                            title={isPaused ? 'Resume' : 'Pause'}
                            style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border-light)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            {isPaused ? <Play size={15} /> : <Pause size={15} />}
                        </button>
                        <button
                            onClick={requestStopScrape}
                            title="Stop (keep what was gathered)"
                            style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.1)', color: '#ff3b30', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <X size={15} />
                        </button>
                    </div>
                </div>
            )}

            {/* Floating pill for a rehydrated server-side run (started before a refresh).
                The SSE stream can't be re-attached, so there is no live item feed here —
                just run status, pause/resume/stop, and completion detection via polling. */}
            {isRehydratedRun && !showLoadingModal && (
                <div
                    style={{
                        position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
                        display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340,
                        padding: '12px 14px', borderRadius: 18,
                        background: 'var(--bg-primary)', border: '1px solid var(--border-medium)',
                        boxShadow: '0 12px 30px -8px rgba(0,0,0,0.35)',
                        color: 'var(--text-primary)', animation: 'slideUp 0.3s ease',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                            onClick={() => setShowLoadingModal(true)}
                            title="Tap to view run status"
                            style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                        >
                        <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: isPaused ? 'var(--bg-tertiary)' : 'linear-gradient(135deg,#146ef5,#60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isPaused ? 'var(--text-secondary)' : 'white' }}>
                            {isPaused ? <Pause size={17} /> : <Loader2 size={18} className="animate-spin" />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
                                {isStopping ? 'Stopping server scrape…' : isPaused ? 'Server scrape paused' : 'Server scrape running…'}
                            </span>
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>
                                {formatElapsed(scrapingElapsedSeconds)} since reconnect · tap to view
                            </span>
                        </span>
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                                onClick={isPaused ? resumeScrape : pauseScrape}
                                title={isPaused ? 'Resume' : 'Pause'}
                                disabled={isStopping}
                                style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border-light)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: isStopping ? 'not-allowed' : 'pointer', opacity: isStopping ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                {isPaused ? <Play size={15} /> : <Pause size={15} />}
                            </button>
                            <button
                                onClick={requestStopScrape}
                                title="Stop (keep what was gathered)"
                                disabled={isStopping}
                                style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.1)', color: '#ff3b30', cursor: isStopping ? 'not-allowed' : 'pointer', opacity: isStopping ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <X size={15} />
                            </button>
                        </div>
                    </div>
                    <span style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
                        Reconnected to a run started earlier — live item feed unavailable. Results will appear in Recent Scrapes when it finishes.
                    </span>
                </div>
            )}

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
                                            const isExpanded = expandedResults.has(sourceIndex);
                                            const before = aiBefore[sourceIndex];
                                            const beforeFacts = before ? summarizeForCompare(before) : null;
                                            const afterFacts = before ? summarizeForCompare(opp) : null;

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
                                                            display: isExpanded ? 'block' : '-webkit-box', WebkitLineClamp: isExpanded ? undefined : 2,
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
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); toggleResultExpanded(sourceIndex); }}
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto',
                                                                    padding: '7px 10px', borderRadius: 8, border: 'none',
                                                                    background: 'transparent', color: 'var(--text-tertiary)',
                                                                    cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                                                }}
                                                            >
                                                                {before ? 'AI compare' : isExpanded ? 'Less' : 'More'}
                                                                <ChevronRight size={13} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                                                            </button>
                                                        </div>

                                                        {/* Expanded: full details + AI before/after comparison */}
                                                        {isExpanded && (
                                                            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 12, borderTop: '1px solid var(--border-light)', paddingTop: 12, animation: 'fadeIn 0.2s ease', cursor: 'default' }}>
                                                                {beforeFacts && afterFacts ? (
                                                                    <>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                                            <Zap size={13} color="#60a5fa" />
                                                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>AI improvement — before vs after</span>
                                                                            <span style={{
                                                                                fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                                                                                background: afterFacts.score >= beforeFacts.score ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)',
                                                                                color: afterFacts.score >= beforeFacts.score ? '#34c759' : '#ff3b30',
                                                                            }}>
                                                                                {afterFacts.score >= beforeFacts.score ? '▲' : '▼'} {beforeFacts.score}% → {afterFacts.score}%
                                                                            </span>
                                                                        </div>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '6px 14px', fontSize: 12 }}>
                                                                            <span />
                                                                            <span style={{ fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Before</span>
                                                                            <span style={{ fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>After AI</span>
                                                                            {([
                                                                                ['Quality score', `${beforeFacts.score}%`, `${afterFacts.score}%`],
                                                                                ['Description', `${beforeFacts.descriptionChars} chars`, `${afterFacts.descriptionChars} chars`],
                                                                                ['Deadline', beforeFacts.deadline, afterFacts.deadline],
                                                                                ['Requirements', String(beforeFacts.requirements), String(afterFacts.requirements)],
                                                                                ['Benefits', String(beforeFacts.benefits), String(afterFacts.benefits)],
                                                                                ['Image', beforeFacts.image, afterFacts.image],
                                                                                ['Apply link', beforeFacts.applyLink, afterFacts.applyLink],
                                                                            ] as Array<[string, string, string]>).map(([label, b, a]) => (
                                                                                <React.Fragment key={label}>
                                                                                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>{label}</span>
                                                                                    <span style={{ color: 'var(--text-secondary)' }}>{b}</span>
                                                                                    <span style={{ color: b === a ? 'var(--text-secondary)' : '#34c759', fontWeight: b === a ? 400 : 700 }}>{a}</span>
                                                                                </React.Fragment>
                                                                            ))}
                                                                        </div>
                                                                        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                                            <div style={{ padding: 10, borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}>
                                                                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Original description</div>
                                                                                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto' }}>
                                                                                    {(before.description || before.summary || 'None').trim()}
                                                                                </p>
                                                                            </div>
                                                                            <div style={{ padding: 10, borderRadius: 10, background: 'rgba(20,110,245,0.06)', border: '1px solid rgba(20,110,245,0.2)' }}>
                                                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>AI description</div>
                                                                                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto' }}>
                                                                                    {(opp.description || opp.summary || 'None').trim()}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <div style={{ display: 'grid', gap: 10 }}>
                                                                        {opp.requirements?.length ? (
                                                                            <div>
                                                                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Requirements</div>
                                                                                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                                                    {opp.requirements.slice(0, 6).map((item, i) => <li key={i}>{item}</li>)}
                                                                                </ul>
                                                                            </div>
                                                                        ) : null}
                                                                        {opp.benefits?.length ? (
                                                                            <div>
                                                                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Benefits</div>
                                                                                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                                                    {opp.benefits.slice(0, 6).map((item, i) => <li key={i}>{item}</li>)}
                                                                                </ul>
                                                                            </div>
                                                                        ) : null}
                                                                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                                            Run “AI Improve” to see a before/after comparison here.
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
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
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                @keyframes shrinkToCorner {
                    from { opacity: 1; transform: translate(0, 0) scale(1); }
                    to { opacity: 0; transform: translate(38vw, 40vh) scale(0.12); }
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

                        <div style={{ padding: '20px 32px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                                {inspectOpportunities.length} opportunit{inspectOpportunities.length === 1 ? 'y' : 'ies'} in this run
                            </span>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <button
                                    onClick={improveInspectOpportunities}
                                    disabled={isImprovingInspect || isSavingInspect || inspectOpportunities.length === 0}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'rgba(122,61,255,0.1)', color: '#7a3dff', border: '1px solid rgba(122,61,255,0.3)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: (isImprovingInspect || inspectOpportunities.length === 0) ? 'not-allowed' : 'pointer', opacity: (isImprovingInspect || inspectOpportunities.length === 0) ? 0.6 : 1 }}
                                >
                                    {isImprovingInspect ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                                    {isImprovingInspect ? 'Improving…' : 'Improve with AI'}
                                </button>
                                <button
                                    onClick={saveInspectOpportunities}
                                    disabled={isSavingInspect || isImprovingInspect || inspectOpportunities.length === 0}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--apple-blue)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: (isSavingInspect || inspectOpportunities.length === 0) ? 'not-allowed' : 'pointer', opacity: (isSavingInspect || inspectOpportunities.length === 0) ? 0.6 : 1 }}
                                >
                                    {isSavingInspect ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    {isSavingInspect ? 'Saving…' : `Save all${inspectOpportunities.length ? ` (${inspectOpportunities.length})` : ''}`}
                                </button>
                                <button
                                    onClick={() => setInspectJobDetails(null)}
                                    style={{ padding: '10px 20px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Close
                                </button>
                            </div>
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
