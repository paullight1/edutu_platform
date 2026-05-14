import { useEffect, useState, useRef, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import {
    Target,
    Plus,
    Trash2,
    MapPin,
    Building,
    Search,
    Download,
    Upload,
    Link as LinkIcon,
    FileSpreadsheet,
    X,
    ChevronDown,
    Calendar,
    Star,
    Edit3,
    ExternalLink,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Sparkles,
    RefreshCw,
    GraduationCap,
    Cpu,
    Scissors,
    Table2,
    LayoutGrid,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';

interface Opportunity {
    id: string;
    title: string;
    summary: string;
    description: string;
    category: string;
    organization: string;
    location: string;
    is_remote: boolean;
    application_url: string;
    source_url?: string;
    close_date: string;
    image_url: string;
    is_featured: boolean;
    status: 'active' | 'closed' | 'draft' | 'pending_review' | 'rejected';
    created_at: string;
    views: number;
    applications: number;
    metadata?: {
        extraction_quality_score?: number;
        extraction_missing_fields?: string[];
        description_length?: number;
        needs_review?: boolean;
        [key: string]: unknown;
    };
    eligibility?: {
        school?: string;
        major?: string;
        min_cgpa?: number;
        countries?: string[];
    };
}

interface Stats {
    total: number;
    active: number;
    featured: number;
    expiringSoon: number;
    needsReview: number;
}

type OpportunityStatus = Opportunity['status'];

type CreationMode = 'manual' | 'url' | 'bulk';
type ViewMode = 'table' | 'grid';

interface OpportunityListResponse {
    data: Opportunity[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
}

export default function Opportunities() {
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [filteredOpps, setFilteredOpps] = useState<Opportunity[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<Stats>({ total: 0, active: 0, featured: 0, expiringSoon: 0, needsReview: 0 });

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [creationMode, setCreationMode] = useState<CreationMode>('manual');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isScraping, setIsScraping] = useState(false);
    const [showAddDropdown, setShowAddDropdown] = useState(false);
    const [showLoadingModal, setShowLoadingModal] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState<{ message: string; progress: number; source?: string; phase?: string; opportunities?: any[] }>({ message: 'Initializing...', progress: 0 });
    const [loadedResults, setLoadedResults] = useState<any[]>([]);
    const [scrapedData, setScrapedData] = useState<any>(null);
    const [urlInput, setUrlInput] = useState('');
    const [bulkPreview, setBulkPreview] = useState<any[]>([]);

    const addMethods = [
        { id: 'manual', name: 'Manual Entry', icon: <Plus size={16} />, desc: 'Create manually', action: () => { setShowAddDropdown(false); setShowModal(true); } },
        { id: 'url', name: 'From URL', icon: <LinkIcon size={16} />, desc: 'Scrape from URL', action: () => { setShowAddDropdown(false); setCreationMode('url'); setShowModal(true); } },
        { id: 'divider', name: '─── Data Sources ───', icon: null, desc: '', action: () => {} },
        { id: 'apify-all', name: 'All Sources', icon: <RefreshCw size={16} />, desc: 'Sync all sources', action: () => { setShowAddDropdown(false); triggerApifySync('intel,custom,scholarship-api'); } },
        { id: 'apify-intel', name: 'Scholarship Intel', icon: <GraduationCap size={16} />, desc: 'US scholarships & grants', action: () => { setShowAddDropdown(false); triggerApifySync('intel'); } },
        { id: 'apify-custom', name: 'My Actor', icon: <Cpu size={16} />, desc: 'Custom scraper', action: () => { setShowAddDropdown(false); triggerApifySync('custom'); } },
        { id: 'apify-edutu', name: 'Edutu Engine', icon: <Scissors size={16} />, desc: 'Edutu Engine', action: () => { setShowAddDropdown(false); triggerApifySync('edutu'); } },
        { id: 'apify-scholarship-api', name: 'ScholarshipAPI', icon: <Sparkles size={16} />, desc: 'Global scholarship database', action: () => { setShowAddDropdown(false); triggerApifySync('scholarship-api'); } },
    ];

    async function triggerApifySync(sourceId: string) {
        setShowLoadingModal(true);
        setLoadedResults([]);
        setLoadingStatus({ message: 'Connecting to Apify...', progress: 10, source: sourceId, phase: 'preview' });
        
        try {
            setLoadingStatus({ message: `Running ${sourceId} scraper...`, progress: 30, source: sourceId, phase: 'preview' });
            const { data: { session } } = await supabase.auth.getSession();
            
            setLoadingStatus({ message: 'Fetching opportunities...', progress: 50, source: sourceId, phase: 'preview' });
            const response = await fetch(`${API_URL}/api/opportunities/apify-preview?sources=${sourceId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
            });
            
            setLoadingStatus({ message: 'Processing results...', progress: 70, source: sourceId, phase: 'preview' });
            const result = await response.json();
            
            if (result.success && result.opportunities && result.opportunities.length > 0) {
                console.log('[Preview] Opportunities:', result.opportunities);
                setLoadedResults(result.opportunities);
                setLoadingStatus({ message: `Found ${result.opportunities.length} opportunities`, progress: 100, source: sourceId, phase: 'preview' });
            } else {
                const errMsg = result.errors?.[0] || result.error || 'No opportunities found';
                setLoadingStatus({ message: errMsg, progress: 100, source: sourceId, phase: 'error' });
            }
        } catch (error: any) {
            setLoadingStatus({ message: 'Error: ' + error.message, progress: 100, source: sourceId, phase: 'preview' });
            setTimeout(() => {
                setShowLoadingModal(false);
                alert('Preview failed: ' + error.message);
            }, 2000);
        }
    }

    async function saveOpportunities(opps: any[]) {
        setLoadingStatus({ message: 'Saving to database...', progress: 30, source: loadingStatus.source || '', phase: 'save' });
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(`${API_URL}/api/opportunities/apify-save`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${session?.access_token || ''}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ opportunities: opps })
            });
            
            const result = await response.json();
            
            if (result.success) {
                setLoadingStatus({ message: `Saved ${result.inserted} opportunities!`, progress: 100, source: loadingStatus.source || '', phase: 'save' });
                setShowLoadingModal(false);
                fetchOpportunities();
                alert(`Successfully saved ${result.inserted} opportunities!\nSkipped (duplicates): ${result.skipped}`);
            } else {
                alert('Save failed: ' + result.error);
            }
        } catch (error: any) {
            alert('Save failed: ' + error.message);
        }
    }

    async function refineWithAI(opps: any[]) {
        setLoadingStatus({ message: 'Analyzing with AI...', progress: 50, source: loadingStatus.source || '', phase: 'refine' });
        // For now, just save - AI refinement can be added later
        alert('AI refinement coming soon! Saving without AI for now.');
        saveOpportunities(opps);
    }

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('newest');
    const [viewMode, setViewMode] = useState<ViewMode>('table');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalOpportunities, setTotalOpportunities] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    // Form data
    const [formData, setFormData] = useState({
        title: '',
        summary: '',
        description: '',
        category: 'Scholarships',
        organization: '',
        location: '',
        is_remote: false,
        application_url: '',
        close_date: '',
        image_url: '',
        is_featured: false,
        status: 'active' as OpportunityStatus,
        eligibility: {
            school: '',
            major: '',
            min_cgpa: '',
            countries: [] as string[]
        }
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handle = window.setTimeout(() => {
            fetchOpportunities();
        }, 250);

        return () => window.clearTimeout(handle);
    }, [currentPage, pageSize, searchQuery, categoryFilter, statusFilter, sortBy]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, categoryFilter, statusFilter, sortBy, pageSize]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as HTMLElement;
            if (!target.closest('[data-add-dropdown]')) {
                setShowAddDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const channel = supabase
            .channel('opportunities-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, (payload) => {
                console.log('[Realtime] Opportunity changed:', payload);
                fetchOpportunities();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    async function fetchOpportunities() {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(currentPage),
                limit: String(pageSize),
                sortBy,
            });

            if (searchQuery.trim()) params.set('search', searchQuery.trim());
            if (categoryFilter !== 'all') params.set('category', categoryFilter);
            if (statusFilter !== 'all') params.set('status', statusFilter);

            const [listResponse, statsResponse] = await Promise.all([
                fetch(`${NEST_API_URL}/opportunities/admin/list?${params.toString()}`, {
                    headers: await getAdminHeaders(),
                }),
                fetch(`${NEST_API_URL}/opportunities/admin/stats`, {
                    headers: await getAdminHeaders(),
                }),
            ]);

            if (!listResponse.ok) {
                const error = await listResponse.json().catch(() => ({}));
                throw new Error(error.message || 'Failed to load opportunities');
            }

            const result = (await listResponse.json()) as OpportunityListResponse;
            const opps = result.data || [];
            setOpportunities(opps);
            setFilteredOpps(opps);
            setTotalOpportunities(result.total || 0);
            setTotalPages(result.totalPages || 1);

            if (statsResponse.ok) {
                setStats(await statsResponse.json());
            }
        } catch (error: any) {
            console.error('Failed to load opportunities:', error);
            alert(error.message || 'Failed to load opportunities');
            setOpportunities([]);
            setFilteredOpps([]);
            setTotalOpportunities(0);
            setTotalPages(1);
        } finally {
            setLoading(false);
        }
    }

    function filterOpportunities() {
        setFilteredOpps(opportunities);
    }

    async function handleDelete(id: string) {
        if (!window.confirm('Are you sure you want to delete this opportunity? This action cannot be undone.')) return;
        try {
            const response = await fetch(`${NEST_API_URL}/opportunities/${id}`, {
                method: 'DELETE',
                headers: await getAdminHeaders(),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || 'Failed to delete opportunity');
            }
            fetchOpportunities();
        } catch (error: any) {
            alert(error.message || 'Failed to delete opportunity');
        }
    }

    async function handleStatusUpdate(id: string, status: OpportunityStatus) {
        try {
            const response = await fetch(`${NEST_API_URL}/opportunities/${id}/status`, {
                method: 'PATCH',
                headers: await getAdminHeaders(),
                body: JSON.stringify({ status }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || 'Failed to update status');
            }
            fetchOpportunities();
        } catch (error: any) {
            alert(error.message || 'Failed to update status');
        }
    }

    function handleEdit(opp: Opportunity) {
        setFormData({
            title: opp.title,
            summary: opp.summary || '',
            description: opp.description || '',
            category: opp.category || 'Scholarships',
            organization: opp.organization || '',
            location: opp.location || '',
            is_remote: opp.is_remote || false,
            application_url: opp.application_url || '',
            close_date: opp.close_date ? opp.close_date.split('T')[0] : '',
            image_url: opp.image_url || '',
            is_featured: opp.is_featured || false,
            status: opp.status || 'active',
            eligibility: {
                school: opp.eligibility?.school || '',
                major: opp.eligibility?.major || '',
                min_cgpa: opp.eligibility?.min_cgpa?.toString() || '',
                countries: opp.eligibility?.countries || []
            }
        });
        setEditingId(opp.id);
        setCreationMode('manual');
        setShowModal(true);
    }

    // Backend API URL - adjust based on environment
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const NEST_API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

    async function getAdminHeaders() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            throw new Error('Admin session is required');
        }
        return {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
        };
    }

    async function handleScrapeUrl() {
        if (!urlInput.trim()) return;

        try {
            new URL(urlInput);
        } catch {
            alert('Please enter a valid URL');
            return;
        }

        setIsScraping(true);
        setScrapedData(null);

        try {
            // Get current session for authentication
            const { data: { session } } = await supabase.auth.getSession();

            // Call the local backend server for scraping
            const response = await fetch(`${API_URL}/api/scrape`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token || ''}`
                },
                body: JSON.stringify({ url: urlInput })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();

            if (!result || !result.data) {
                throw new Error('No data received from scraper');
            }

            setScrapedData(result.data);
            setFormData(prev => ({
                ...prev,
                ...result.data,
                application_url: urlInput
            }));

            if (result.confidence < 60) {
                alert(`Warning: Low confidence extraction (${result.confidence}%).`);
            }

        } catch (error: any) {
            console.error('Scraping failed:', error);
            alert(`Scraping failed: ${error.message || 'Check backend connection'}`);
        } finally {
            setIsScraping(false);
        }
    }

    async function handleBulkScrape(urls: string[]) {
        if (!urls.length) return;

        setIsScraping(true);
        setBulkPreview([]);

        try {
            // Get current session for authentication
            const { data: { session } } = await supabase.auth.getSession();

            // Call the local backend server for bulk scraping
            const response = await fetch(`${API_URL}/api/scrape/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token || ''}`
                },
                body: JSON.stringify({ urls })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();

            if (result && result.results) {
                const formattedResults = result.results.map((r: any, idx: number) => ({
                    id: idx,
                    title: r.data?.title || 'Untitled',
                    organization: r.data?.organization || 'Unknown',
                    category: r.data?.category || 'Scholarships',
                    status: (r.data?.confidence || 0) >= 60 ? 'ready' : 'needs_review',
                    confidence: r.data?.confidence || 0,
                    errors: r.errors || []
                }));
                setBulkPreview(formattedResults);
            }

            if (result.errors > 0) {
                alert(`Processed ${urls.length} URLs. ${result.errors} had issues.`);
            }

        } catch (error: any) {
            console.error('Bulk scraping failed:', error);
            alert(`Bulk import failed: ${error.message}`);
        } finally {
            setIsScraping(false);
        }
    }

    async function handleCreate(e: FormEvent) {
        e.preventDefault();
        const payload = {
            ...formData,
            eligibility: {
                ...formData.eligibility,
                min_cgpa: formData.eligibility.min_cgpa ? parseFloat(formData.eligibility.min_cgpa as string) : null
            }
        };

        if (editingId) {
            await supabase.from('opportunities').update(payload).eq('id', editingId);
        } else {
            await supabase.from('opportunities').insert([payload]);
        }
        resetForm();
        setShowModal(false);
        fetchOpportunities();
    }

    function resetForm() {
        setFormData({
            title: '',
            summary: '',
            description: '',
            category: 'Scholarships',
            organization: '',
            location: '',
            is_remote: false,
            application_url: '',
            close_date: '',
            image_url: '',
            is_featured: false,
            status: 'active',
            eligibility: { school: '', major: '', min_cgpa: '', countries: [] }
        });
        setUrlInput('');
        setScrapedData(null);
        setBulkPreview([]);
        setCreationMode('manual');
        setEditingId(null);
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsScraping(true);

        try {
            // Read file content
            const text = await file.text();

            // Parse URLs from CSV
            const lines = text.split('\n');
            const urls = lines
                .map(line => line.trim().split(',')[0]) // First column
                .filter(url => {
                    try {
                        new URL(url);
                        return true;
                    } catch {
                        return false;
                    }
                })
                .slice(0, 50); // Max 50 URLs

            if (urls.length === 0) {
                alert('No valid URLs found in file. Please ensure URLs are in the first column.');
                setIsScraping(false);
                return;
            }

            // Process with backend
            await handleBulkScrape(urls);

        } catch (error) {
            console.error('File processing failed:', error);
            alert('Failed to process file. Please ensure it is a valid CSV/Excel file.');
            setIsScraping(false);
        }
    }

    function toggleRowExpansion(id: string) {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedRows(newExpanded);
    }

    const categories = ['Scholarships', 'Internships', 'Fellowships', 'Grants', 'Programs', 'Competitions'];
    const statuses = [
        { value: 'pending_review', label: 'Needs Review', color: 'var(--warning)' },
        { value: 'active', label: 'Active', color: 'var(--success)' },
        { value: 'closed', label: 'Closed', color: 'var(--text-tertiary)' },
        { value: 'draft', label: 'Draft', color: 'var(--warning)' },
        { value: 'rejected', label: 'Rejected', color: 'var(--danger)' }
    ];

    const getStatusStyle = (status: OpportunityStatus) => {
        if (status === 'active') return { background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' };
        if (status === 'pending_review') return { background: 'rgba(245, 158, 11, 0.18)', color: '#f59e0b' };
        if (status === 'draft') return { background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' };
        return { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' };
    };

    const startRow = totalOpportunities === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endRow = Math.min(currentPage * pageSize, totalOpportunities);

    function renderPagination() {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                borderTop: '1px solid var(--border-color)',
                flexWrap: 'wrap',
            }}>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
                    Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of {totalOpportunities.toLocaleString()}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <select
                        className="input-field"
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        style={{ width: '110px', height: '38px' }}
                    >
                        <option value={25}>25 rows</option>
                        <option value={50}>50 rows</option>
                        <option value={100}>100 rows</option>
                        <option value={200}>200 rows</option>
                    </select>
                    <button
                        className="btn btn-secondary"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                        style={{ padding: '9px 12px' }}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span style={{ minWidth: '96px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        className="btn btn-secondary"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                        style={{ padding: '9px 12px' }}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        );
    }

    function renderOpportunityTable() {
        return (
            <>
                <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ margin: 0, minWidth: '1180px' }}>
                        <thead>
                            <tr>
                                <th>Title</th>
                                <th>Organization</th>
                                <th>Category</th>
                                <th>Status</th>
                                <th>Deadline</th>
                                <th>Location</th>
                                <th>Quality</th>
                                <th>Views</th>
                                <th>Applications</th>
                                <th>Created</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOpps.map((opp) => {
                                const qualityScore = opp.metadata?.extraction_quality_score;
                                const needsReview = opp.status === 'pending_review' || opp.metadata?.needs_review;
                                return (
                                    <tr key={opp.id}>
                                        <td style={{ maxWidth: '320px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <strong style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {opp.title || 'Untitled opportunity'}
                                                </strong>
                                                <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {opp.application_url || opp.source_url || 'No URL'}
                                                </span>
                                            </div>
                                        </td>
                                        <td>{opp.organization || 'Unknown'}</td>
                                        <td>{opp.category || 'Uncategorized'}</td>
                                        <td>
                                            <span style={{
                                                ...getStatusStyle(opp.status),
                                                padding: '4px 9px',
                                                borderRadius: '999px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                textTransform: 'capitalize',
                                            }}>
                                                {needsReview ? 'Needs review' : (opp.status || 'draft').replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td>{opp.close_date ? new Date(opp.close_date).toLocaleDateString() : 'No deadline'}</td>
                                        <td>{opp.is_remote ? 'Remote' : (opp.location || 'Not set')}</td>
                                        <td>{typeof qualityScore === 'number' ? `${qualityScore}%` : 'N/A'}</td>
                                        <td>{(opp.views || 0).toLocaleString()}</td>
                                        <td>{(opp.applications || 0).toLocaleString()}</td>
                                        <td>{opp.created_at ? new Date(opp.created_at).toLocaleDateString() : 'N/A'}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                {needsReview && (
                                                    <button className="btn btn-secondary" title="Approve" onClick={() => handleStatusUpdate(opp.id, 'active')} style={{ padding: '8px' }}>
                                                        <CheckCircle2 size={15} />
                                                    </button>
                                                )}
                                                <button className="btn btn-secondary" title="Open application URL" onClick={() => window.open(opp.application_url || opp.source_url, '_blank')} style={{ padding: '8px' }}>
                                                    <ExternalLink size={15} />
                                                </button>
                                                <button className="btn btn-secondary" title="Edit" onClick={() => handleEdit(opp)} style={{ padding: '8px' }}>
                                                    <Edit3 size={15} />
                                                </button>
                                                <button className="btn btn-secondary" title="Delete" onClick={() => handleDelete(opp.id)} style={{ padding: '8px', color: '#ef4444' }}>
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {renderPagination()}
            </>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Opportunities</h1>
                    <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0 0', fontSize: '15px' }}>
                        Manage and publish opportunities for your users
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={() => { }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px' }}>
                        <Download size={16} />
                        <span className="btn-text">Export</span>
                    </button>
                    <div style={{ position: 'relative' }} data-add-dropdown>
                        <button className="btn btn-primary" onClick={() => setShowAddDropdown(!showAddDropdown)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px' }}>
                            <Plus size={16} />
                            <span className="btn-text">Add Opportunity</span>
                            <ChevronDown size={14} />
                        </button>
                        
                        {showAddDropdown && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '8px',
                                background: 'var(--card-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                                zIndex: 1000,
                                minWidth: '280px',
                                overflow: 'hidden'
                            }}>
                                {addMethods.map((method) => (
                                    method.id === 'divider' ? (
                                        <div key={method.id} style={{ padding: '10px 16px 8px', fontSize: '11px', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            {method.name.replace('─── ', '').replace(' ───', '')}
                                        </div>
                                    ) : (
                                        <button
                                            key={method.id}
                                            onClick={method.action}
                                            style={{
                                                width: '100%',
                                                padding: '14px 16px',
                                                border: 'none',
                                                background: 'transparent',
                                                color: 'var(--text-primary)',
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '14px',
                                                fontSize: '14px',
                                                transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'var(--hover-bg)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'transparent';
                                            }}
                                        >
                                            <div style={{ 
                                                width: 36, 
                                                height: 36, 
                                                borderRadius: 10, 
                                                background: method.id === 'apify-edutu' ? 'linear-gradient(135deg, #ff6600, #ff4500)' : method.id.startsWith('apify') ? 'linear-gradient(135deg, var(--apple-blue), var(--apple-purple))' : 'var(--bg-tertiary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: method.id.startsWith('apify') ? 'white' : 'var(--text-secondary)'
                                            }}>
                                                {method.icon}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 500, marginBottom: 2 }}>{method.name}</div>
                                                {method.desc && (
                                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{method.desc}</div>
                                                )}
                                            </div>
                                        </button>
                                    )
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                {[
                    {
                        label: 'Total Opportunities',
                        value: stats.total,
                        icon: Target,
                        gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                    },
                    {
                        label: 'Active',
                        value: stats.active,
                        icon: CheckCircle2,
                        gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    },
                    {
                        label: 'Featured',
                        value: stats.featured,
                        icon: Star,
                        gradient: 'linear-gradient(135deg, #ff6600 0%, #ff4500 100%)'
                    },
                    {
                        label: 'Expiring Soon',
                        value: stats.expiringSoon,
                        icon: AlertCircle,
                        gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                    },
                    {
                        label: 'Needs Review',
                        value: stats.needsReview,
                        icon: AlertCircle,
                        gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                    },
                ].map((stat, index) => (
                    <div 
                        key={index} 
                        className="stat-card card-hover"
                        style={{
                            background: stat.gradient,
                            borderRadius: '16px',
                            padding: '24px',
                            position: 'relative',
                            overflow: 'hidden',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                        }}
                    >
                        <div style={{ 
                            position: 'absolute', 
                            top: '20px', 
                            right: '20px', 
                            opacity: 0.9 
                        }}>
                            <stat.icon size={28} strokeWidth={1.5} style={{ color: 'white' }} />
                        </div>
                        <div style={{ 
                            fontSize: '36px', 
                            fontWeight: 700, 
                            color: '#ffffff',
                            marginBottom: '8px',
                            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}>
                            {stat.value}
                        </div>
                        <div style={{ 
                            fontSize: '14px', 
                            fontWeight: 600, 
                            color: 'rgba(255,255,255,0.95)'
                        }}>
                            {stat.label}
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters Bar */}
            <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="search-mobile" style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Search opportunities..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '40px' }}
                        />
                    </div>
                    <button className="btn btn-secondary filter-mobile-btn">
                        <ChevronDown size={18} />
                    </button>

                    <select
                        className="input-field"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        style={{ width: '150px' }}
                    >
                        <option value="all">All Categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select
                        className="input-field"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ width: '130px' }}
                    >
                        <option value="all">All Status</option>
                        {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>

                    <select
                        className="input-field"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        style={{ width: '140px' }}
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="deadline">Deadline</option>
                        <option value="featured">Featured</option>
                    </select>

                    <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                        <button
                            className={`btn ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setViewMode('table')}
                            title="Table view"
                            style={{ padding: '10px 12px' }}
                        >
                            <Table2 size={18} />
                        </button>
                        <button
                            className={`btn ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setViewMode('grid')}
                            title="Card view"
                            style={{ padding: '10px 12px' }}
                        >
                            <LayoutGrid size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Opportunities Grid */}
            <div className="card" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        <Loader2 size={40} className="animate-spin" style={{ margin: '0 auto 16px' }} />
                        <p>Loading opportunities...</p>
                    </div>
                ) : filteredOpps.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}>
                        <Target size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                        <p style={{ color: 'var(--text-tertiary)', marginBottom: '16px' }}>No opportunities found</p>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            <Plus size={18} />
                            Create First Opportunity
                        </button>
                    </div>
                ) : viewMode === 'table' ? (
                    renderOpportunityTable()
                ) : (
                    <>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '16px',
                        padding: '20px',
                    }} className="opportunities-grid">
                        {filteredOpps.map((opp, index) => {
                            const gradients = [
                                'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                                'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                                'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                                'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                                'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
                                'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
                                'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
                            ];
                            const gradient = gradients[index % gradients.length];
                            
                            return (
                                <div 
                                    key={opp.id} 
                                    onClick={() => toggleRowExpansion(opp.id)}
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        borderRadius: '16px',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        border: '1px solid var(--border-color)',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                    }}
                                    className="opp-card"
                                >
                                    {opp.image_url ? (
                                        <div style={{ height: '120px', overflow: 'hidden', position: 'relative' }}>
                                            <img 
                                                src={opp.image_url} 
                                                alt="" 
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                            <div style={{
                                                position: 'absolute',
                                                top: '12px',
                                                left: '12px',
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                background: gradient,
                                                fontSize: '10px',
                                                fontWeight: 700,
                                                color: 'white',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                            }}>
                                                {opp.category}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ 
                                            height: '120px', 
                                            background: gradient,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            position: 'relative',
                                        }}>
                                            <Target size={40} style={{ color: 'white', opacity: 0.9 }} />
                                            <div style={{
                                                position: 'absolute',
                                                top: '12px',
                                                left: '12px',
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                background: 'rgba(255,255,255,0.25)',
                                                backdropFilter: 'blur(8px)',
                                                fontSize: '10px',
                                                fontWeight: 700,
                                                color: 'white',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                            }}>
                                                {opp.category}
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div style={{ padding: '14px' }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'space-between',
                                            marginBottom: '8px' 
                                        }}>
                                            {opp.is_featured && (
                                                <span style={{ 
                                                    fontSize: '10px',
                                                    padding: '3px 8px',
                                                    borderRadius: '4px',
                                                    background: 'rgba(255, 102, 0, 0.15)',
                                                    color: '#ff6600',
                                                    fontWeight: 600,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    <Star size={10} fill="#ff6600" />
                                                    Featured
                                                </span>
                                            )}
                                            <span style={{ 
                                                fontSize: '10px',
                                                padding: '3px 8px',
                                                borderRadius: '4px',
                                                ...getStatusStyle(opp.status),
                                                fontWeight: 600,
                                                textTransform: 'uppercase',
                                            }}>
                                                {opp.status.replace('_', ' ')}
                                            </span>
                                        </div>

                                        {(opp.status === 'pending_review' || opp.metadata?.needs_review) && (
                                            <div style={{
                                                marginBottom: '10px',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                background: 'rgba(245, 158, 11, 0.12)',
                                                color: '#f59e0b',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                lineHeight: 1.4
                                            }}>
                                                Quality {opp.metadata?.extraction_quality_score ?? 'n/a'}%
                                                {opp.metadata?.extraction_missing_fields?.length
                                                    ? ` · Missing: ${opp.metadata.extraction_missing_fields.join(', ')}`
                                                    : ''}
                                            </div>
                                        )}
                                        
                                        <h3 style={{ 
                                            fontSize: '14px', 
                                            fontWeight: 700, 
                                            marginBottom: '8px',
                                            lineHeight: 1.4,
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                            color: 'var(--text-primary)',
                                            minHeight: '36px',
                                        }}>
                                            {opp.title}
                                        </h3>
                                        
                                        {opp.organization && (
                                            <p style={{ 
                                                fontSize: '12px', 
                                                color: 'var(--text-secondary)',
                                                marginBottom: '10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                fontWeight: 500,
                                            }}>
                                                <Building size={12} style={{ flexShrink: 0 }} />
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.organization}</span>
                                            </p>
                                        )}
                                        
                                        <div style={{ 
                                            display: 'flex', 
                                            flexDirection: 'column',
                                            gap: '6px',
                                            fontSize: '11px',
                                            color: 'var(--text-tertiary)',
                                            paddingTop: '10px',
                                            borderTop: '1px solid var(--border-light)',
                                        }}>
                                            {opp.location && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <MapPin size={11} style={{ flexShrink: 0, color: 'var(--apple-blue)' }} />
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.is_remote ? 'Remote • ' : ''}{opp.location}</span>
                                                </span>
                                            )}
                                            {opp.close_date && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: new Date(opp.close_date) < new Date() ? '#ef4444' : 'var(--text-tertiary)' }}>
                                                    <Calendar size={11} style={{ flexShrink: 0 }} />
                                                    {new Date(opp.close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                        
                                        {expandedRows.has(opp.id) && (
                                            <div style={{ 
                                                marginTop: '12px', 
                                                paddingTop: '12px', 
                                                borderTop: '1px solid var(--border-color)',
                                                fontSize: '12px',
                                                color: 'var(--text-secondary)',
                                                lineHeight: 1.6
                                            }}>
                                                <p style={{ marginBottom: '10px', fontSize: '13px' }}>{opp.summary || opp.description?.slice(0, 150)}...</p>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {opp.status === 'pending_review' && (
                                                        <>
                                                            <button
                                                                className="btn btn-primary"
                                                                style={{ padding: '8px 12px', fontSize: '12px' }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleStatusUpdate(opp.id, 'active');
                                                                }}
                                                            >
                                                                <CheckCircle2 size={14} />
                                                                Approve
                                                            </button>
                                                            <button
                                                                className="btn btn-secondary"
                                                                style={{ padding: '8px 12px', fontSize: '12px', color: '#ef4444', borderColor: '#ef4444' }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleStatusUpdate(opp.id, 'rejected');
                                                                }}
                                                            >
                                                                <X size={14} />
                                                                Reject
                                                            </button>
                                                        </>
                                                    )}
                                                    <button 
                                                        className="btn btn-primary" 
                                                        style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }}
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            window.open(opp.application_url || opp.source_url, '_blank');
                                                        }}
                                                    >
                                                        <ExternalLink size={14} />
                                                        Apply Now
                                                    </button>
                                                    <button 
                                                        className="btn btn-secondary" 
                                                        style={{ padding: '8px 12px', fontSize: '12px' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleEdit(opp);
                                                        }}
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                    <button 
                                                        className="btn btn-secondary" 
                                                        style={{ padding: '8px 12px', fontSize: '12px', color: '#ef4444', borderColor: '#ef4444' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (confirm('Delete this opportunity?')) {
                                                                handleDelete(opp.id);
                                                            }
                                                        }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {renderPagination()}
                    </>
                )}

                {/* Responsive Grid Styles */}
                <style>{`
                    @media (max-width: 1400px) {
                        .opportunities-grid {
                            grid-template-columns: repeat(3, 1fr) !important;
                        }
                    }
                    @media (max-width: 1024px) {
                        .opportunities-grid {
                            grid-template-columns: repeat(2, 1fr) !important;
                        }
                    }
                    @media (max-width: 640px) {
                        .opportunities-grid {
                            grid-template-columns: 1fr !important;
                            gap: 12px !important;
                            padding: 12px !important;
                        }
                    }
                    .opp-card:hover {
                        transform: translateY(-4px) scale(1.02);
                        box-shadow: 0 12px 32px rgba(0,0,0,0.15);
                        border-color: transparent;
                    }
                `}</style>
            </div>

            {/* Loading Modal */}
            {showLoadingModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 24, maxWidth: 900, width: '95%', textAlign: 'center', maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--border-color)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                        
                        {loadedResults.length > 0 ? (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <div>
                                        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Preview Opportunities</h2>
                                        <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0', fontSize: 13 }}>
                                            {loadedResults.length} opportunities found from {loadingStatus.source === 'intel' ? 'Scholarship Intel' : loadingStatus.source}
                                        </p>
                                    </div>
                                    <button onClick={() => { setShowLoadingModal(false); setLoadedResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}>
                                        <X size={24} />
                                    </button>
                                </div>
                                
                                <div style={{ maxHeight: '50vh', overflow: 'auto', marginBottom: 16, border: '1px solid var(--border-color)', borderRadius: 8 }}>
                                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-tertiary)' }}>
                                            <tr>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Title</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Category</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Organization</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Location</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loadedResults.map((opp: any, i: number) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '10px 12px', maxWidth: 250 }}>
                                                        <div style={{ fontWeight: 500 }}>{opp.title?.slice(0, 50)}{opp.title?.length > 50 ? '...' : ''}</div>
                                                        {opp.summary && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{opp.summary?.slice(0, 80)}...</div>}
                                                    </td>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: 'var(--apple-blue)', color: 'white', fontWeight: 500 }}>
                                                            {opp.category}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 12px' }}>{opp.organization?.slice(0, 20) || '-'}</td>
                                                    <td style={{ padding: '10px 12px' }}>{opp.location?.slice(0, 15) || '-'}</td>
                                                    <td style={{ padding: '10px 12px', color: 'var(--success)', fontWeight: 500 }}>{opp.award_amount || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                    <button className="btn btn-secondary" onClick={() => { setShowLoadingModal(false); setLoadedResults([]); }}>
                                        Cancel
                                    </button>
                                    <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => refineWithAI(loadedResults)}>
                                        <Sparkles size={16} />
                                        Refine with AI
                                    </button>
                                    <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => saveOpportunities(loadedResults)}>
                                        <CheckCircle2 size={16} />
                                        Save All ({loadedResults.length})
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ width: 80, height: 80, borderRadius: '50%', background: loadingStatus.progress < 100 ? 'linear-gradient(135deg, var(--apple-blue), var(--apple-purple))' : (loadingStatus.message.includes('Error') ? '#ef4444' : '#10b981'), display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                                    {loadingStatus.progress < 100 ? <RefreshCw size={36} style={{ color: 'white' }} className="animate-spin" /> : (loadingStatus.message.includes('Error') ? <X size={36} style={{ color: 'white' }} /> : <CheckCircle2 size={36} style={{ color: 'white' }} />)}
                                </div>
                                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
                                    {loadingStatus.progress < 100 ? 'Syncing Opportunities' : (loadingStatus.message.includes('Error') ? 'Sync Failed' : 'Sync Complete')}
                                </h2>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
                                    {loadingStatus.source && (
                                        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: 'var(--bg-tertiary)', fontSize: 12, marginBottom: 12 }}>
                                            {loadingStatus.source === 'intel' ? 'Scholarship Intel' : loadingStatus.source === 'custom' ? 'My Actor' : loadingStatus.source === 'edutu' ? 'Edutu Engine' : loadingStatus.source}
                                        </span>
                                    )}
                                    <br />{loadingStatus.message}
                                </p>
                                
                                {loadingStatus.progress < 100 && (
                                    <>
                                        <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
                                            <div style={{ height: '100%', width: loadingStatus.progress + '%', background: 'linear-gradient(90deg, var(--apple-blue), var(--apple-purple))', borderRadius: 4, transition: 'width 0.5s ease' }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-tertiary)' }}>
                                            <span>Progress</span>
                                            <span>{loadingStatus.progress}%</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
                                            {['Connecting', 'Fetching', 'Processing', 'Complete'].map((step, i) => (
                                                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: loadingStatus.progress >= (i + 1) * 25 ? 'var(--success)' : 'var(--text-tertiary)' }}>
                                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: loadingStatus.progress >= (i + 1) * 25 ? 'var(--success)' : 'var(--bg-tertiary)' }} />
                                                    {step}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                                
                                {loadingStatus.progress >= 100 && (
                                    <button 
                                        className="btn btn-primary"
                                        style={{ marginTop: 24 }}
                                        onClick={() => { setShowLoadingModal(false); setLoadedResults([]); }}
                                    >
                                        Close
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Create Modal - Refactored */}
            {showModal && (
                <div className="modal-overlay" onClick={() => { resetForm(); setShowModal(false); }}>
                    <div
                        className="modal-content"
                        onClick={e => e.stopPropagation()}
                        style={{ maxWidth: creationMode === 'bulk' ? '900px' : '700px', maxHeight: '92vh', overflow: 'auto', borderRadius: '16px' }}
                    >
                        {/* Header */}
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            marginBottom: '24px',
                            paddingBottom: '20px',
                            borderBottom: '1px solid var(--border-color)'
                        }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 600 }}>Add Opportunity</h2>
                                <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--text-tertiary)' }}>
                                    Create a new scholarship, internship, or program
                                </p>
                            </div>
                            <button
                                onClick={() => { resetForm(); setShowModal(false); }}
                                style={{ 
                                    background: 'var(--bg-tertiary)', 
                                    border: 'none', 
                                    cursor: 'pointer', 
                                    color: 'var(--text-primary)',
                                    width: 36,
                                    height: 36,
                                    borderRadius: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Mode Selection Tabs */}
                        <div style={{ 
                            display: 'flex', 
                            gap: '4px', 
                            marginBottom: '28px', 
                            background: 'var(--bg-tertiary)',
                            padding: '4px',
                            borderRadius: '12px'
                        }}>
                            {[
                                { id: 'manual', label: 'Manual', icon: Edit3 },
                                { id: 'url', label: 'From URL', icon: LinkIcon },
                                { id: 'bulk', label: 'Bulk Import', icon: FileSpreadsheet },
                            ].map((mode) => (
                                <button
                                    key={mode.id}
                                    onClick={() => setCreationMode(mode.id as CreationMode)}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        padding: '12px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: creationMode === mode.id ? 'var(--apple-blue)' : 'transparent',
                                        color: creationMode === mode.id ? 'white' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        fontSize: '14px',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <mode.icon size={16} />
                                    {mode.label}
                                </button>
                            ))}
                        </div>

                        {/* URL Scrape Mode */}
                        {creationMode === 'url' && (
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{
                                    padding: '20px',
                                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <LinkIcon size={16} />
                                            Paste Opportunity URL
                                        </label>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <input
                                                type="url"
                                                className="input-field"
                                                placeholder="https://scholarship-provider.com/apply"
                                                value={urlInput}
                                                onChange={(e) => setUrlInput(e.target.value)}
                                                style={{ flex: 1, height: '48px' }}
                                            />
                                            <button
                                                className="btn btn-primary"
                                                onClick={handleScrapeUrl}
                                                disabled={isScraping || !urlInput.trim()}
                                                style={{ height: '48px', padding: '0 24px' }}
                                            >
                                                {isScraping ? (
                                                    <><Loader2 size={18} className="animate-spin" /> Scraping...</>
                                                ) : (
                                                    <><Sparkles size={18} /> Extract</>
                                                )}
                                            </button>
                                        </div>
                                        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '10px' }}>
                                            We'll automatically extract details from the page
                                        </p>
                                    </div>
                                </div>

                                {scrapedData && (
                                    <div style={{
                                        padding: '16px',
                                        background: 'rgba(52, 199, 89, 0.1)',
                                        borderRadius: '10px',
                                        border: '1px solid var(--success)',
                                        marginTop: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px'
                                    }}>
                                        <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
                                        <div>
                                            <span style={{ fontWeight: 500, color: 'var(--success)' }}>Successfully extracted!</span>
                                            <p style={{ fontSize: '13px', margin: '4px 0 0', opacity: 0.8 }}>Review and adjust the details below</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Bulk Import Mode */}
                        {creationMode === 'bulk' && (
                            <div style={{ marginBottom: '24px' }}>
                                {!bulkPreview.length ? (
                                    <div
                                        style={{
                                            padding: '48px',
                                            textAlign: 'center',
                                            border: '2px dashed var(--border-color)',
                                            borderRadius: '16px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onClick={() => fileInputRef.current?.click()}
                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--apple-blue)'}
                                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    >
                                        <div style={{
                                            width: 64,
                                            height: 64,
                                            borderRadius: '16px',
                                            background: 'var(--bg-tertiary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            margin: '0 auto 16px'
                                        }}>
                                            <FileSpreadsheet size={32} style={{ color: 'var(--apple-blue)' }} />
                                        </div>
                                        <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Drop your file here</h4>
                                        <p style={{ color: 'var(--text-tertiary)', margin: '0 0 20px 0', fontSize: '14px' }}>
                                            or click to browse • Supports Excel & CSV
                                        </p>
                                        <button className="btn btn-secondary">
                                            <Upload size={18} />
                                            Choose File
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".xlsx,.csv"
                                            onChange={handleFileUpload}
                                            style={{ display: 'none' }}
                                        />
                                    </div>
                                ) : (
                                    <div style={{
                                        background: 'var(--bg-secondary)',
                                        borderRadius: '12px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{ 
                                            padding: '16px 20px', 
                                            borderBottom: '1px solid var(--border-color)',
                                            display: 'flex', 
                                            justifyContent: 'space-between', 
                                            alignItems: 'center' 
                                        }}>
                                            <div>
                                                <span style={{ fontWeight: 600 }}>{bulkPreview.length}</span>
                                                <span style={{ color: 'var(--text-tertiary)' }}> opportunities ready to import</span>
                                            </div>
                                            <button
                                                onClick={() => setBulkPreview([])}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--text-tertiary)',
                                                    cursor: 'pointer',
                                                    fontSize: '14px'
                                                }}
                                            >
                                                Clear all
                                            </button>
                                        </div>
                                        <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                                            <table className="table" style={{ margin: 0 }}>
                                                <thead>
                                                    <tr>
                                                        <th>Title</th>
                                                        <th>Organization</th>
                                                        <th>Category</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {bulkPreview.slice(0, 10).map((item, idx) => (
                                                        <tr key={idx}>
                                                            <td style={{ fontWeight: 500 }}>{item.title}</td>
                                                            <td>{item.organization || '-'}</td>
                                                            <td><span className="badge badge-primary">{item.category || 'Scholarship'}</span></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {bulkPreview.length > 10 && (
                                            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', borderTop: '1px solid var(--border-color)' }}>
                                                + {bulkPreview.length - 10} more items
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Manual Form */}
                        {(creationMode === 'manual' || creationMode === 'url' && scrapedData) && (
                            <form onSubmit={handleCreate}>
                                {/* Basic Info Section */}
                                <div style={{
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    marginBottom: '16px'
                                }}>
                                    <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        📌 Basic Information
                                    </h4>
                                    
                                    <div className="form-group">
                                        <label className="form-label">Title *</label>
                                        <input
                                            required
                                            className="input-field"
                                            value={formData.title}
                                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="e.g. Tech Innovation Scholarship 2024"
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div className="form-group">
                                            <label className="form-label">Category *</label>
                                            <select
                                                className="input-field"
                                                value={formData.category}
                                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                            >
                                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Status</label>
                                            <select
                                                className="input-field"
                                                value={formData.status}
                                                onChange={e => setFormData({ ...formData, status: e.target.value as OpportunityStatus })}
                                            >
                                                <option value="active">Active</option>
                                                <option value="pending_review">Needs Review</option>
                                                <option value="draft">Draft</option>
                                                <option value="closed">Closed</option>
                                                <option value="rejected">Rejected</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Organization / Provider *</label>
                                        <input
                                            required
                                            className="input-field"
                                            value={formData.organization}
                                            onChange={e => setFormData({ ...formData, organization: e.target.value })}
                                            placeholder="e.g. Microsoft, MIT, Federal Government"
                                        />
                                    </div>
                                </div>

                                {/* Details Section */}
                                <div style={{
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    marginBottom: '16px'
                                }}>
                                    <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        📝 Description & Links
                                    </h4>

                                    <div className="form-group">
                                        <label className="form-label">Summary * <span style={{fontWeight: 400, color: 'var(--text-tertiary)'}}>(shown in cards)</span></label>
                                        <input
                                            required
                                            className="input-field"
                                            value={formData.summary}
                                            onChange={e => setFormData({ ...formData, summary: e.target.value })}
                                            placeholder="Brief summary (max 150 characters)"
                                            maxLength={150}
                                        />
                                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px', textAlign: 'right' }}>
                                            {formData.summary.length}/150
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Full Description</label>
                                        <textarea
                                            className="input-field"
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                            rows={4}
                                            placeholder="Complete details about the opportunity..."
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div className="form-group">
                                            <label className="form-label">Application URL *</label>
                                            <input
                                                required
                                                type="url"
                                                className="input-field"
                                                value={formData.application_url}
                                                onChange={e => setFormData({ ...formData, application_url: e.target.value })}
                                                placeholder="https://..."
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Image URL</label>
                                            <input
                                                type="url"
                                                className="input-field"
                                                value={formData.image_url}
                                                onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                                                placeholder="https://... (poster image)"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Location & Deadline */}
                                <div style={{
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    marginBottom: '16px'
                                }}>
                                    <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        📍 Location & Deadline
                                    </h4>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div className="form-group">
                                            <label className="form-label">Location</label>
                                            <input
                                                className="input-field"
                                                value={formData.location}
                                                onChange={e => setFormData({ ...formData, location: e.target.value })}
                                                placeholder="e.g. New York, NY or Remote"
                                                disabled={formData.is_remote}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Deadline</label>
                                            <input
                                                type="date"
                                                className="input-field"
                                                value={formData.close_date}
                                                onChange={e => setFormData({ ...formData, close_date: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <label style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '10px', 
                                        cursor: 'pointer',
                                        padding: '12px 16px',
                                        background: formData.is_remote ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)',
                                        borderRadius: '8px',
                                        marginTop: '8px'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.is_remote}
                                            onChange={e => setFormData({ ...formData, is_remote: e.target.checked, location: e.target.checked ? '' : formData.location })}
                                            style={{ width: 18, height: 18 }}
                                        />
                                        <span style={{ fontWeight: 500 }}>🌐 This is a remote opportunity</span>
                                    </label>
                                </div>

                                {/* Eligibility Section */}
                                <div style={{
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    marginBottom: '16px'
                                }}>
                                    <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        🎯 Eligibility Criteria
                                    </h4>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div className="form-group">
                                            <label className="form-label">Target School / University</label>
                                            <input
                                                className="input-field"
                                                value={formData.eligibility.school}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    eligibility: { ...formData.eligibility, school: e.target.value }
                                                })}
                                                placeholder="e.g. Any University"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Field of Study / Major</label>
                                            <input
                                                className="input-field"
                                                value={formData.eligibility.major}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    eligibility: { ...formData.eligibility, major: e.target.value }
                                                })}
                                                placeholder="e.g. Computer Science, Business"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Minimum CGPA</label>
                                            <input
                                                className="input-field"
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                max="5"
                                                value={formData.eligibility.min_cgpa}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    eligibility: { ...formData.eligibility, min_cgpa: e.target.value }
                                                })}
                                                placeholder="e.g. 3.0"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Country</label>
                                            <input
                                                className="input-field"
                                                value={formData.eligibility.countries?.[0] || ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    eligibility: { ...formData.eligibility, countries: [e.target.value] }
                                                })}
                                                placeholder="e.g. USA, Nigeria, UK"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Featured Toggle */}
                                <label style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '12px', 
                                    cursor: 'pointer',
                                    padding: '16px 20px',
                                    background: formData.is_featured ? 'rgba(255, 102, 0, 0.1)' : 'var(--bg-secondary)',
                                    borderRadius: '12px',
                                    marginBottom: '24px',
                                    border: formData.is_featured ? '1px solid #ff6600' : '1px solid var(--border-color)'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.is_featured}
                                        onChange={e => setFormData({ ...formData, is_featured: e.target.checked })}
                                        style={{ width: 20, height: 20 }}
                                    />
                                    <div>
                                        <span style={{ fontWeight: 500 }}>⭐ Feature this opportunity</span>
                                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-tertiary)' }}>Featured opportunities appear at the top of listings</p>
                                    </div>
                                </label>

                                {/* Action Buttons */}
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => { resetForm(); setShowModal(false); }}
                                        style={{ height: '48px', padding: '0 24px' }}
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary" style={{ height: '48px', padding: '0 32px' }}>
                                        <Plus size={18} />
                                        {creationMode === 'url' ? 'Create from URL' : 'Create Opportunity'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Bulk Import Actions */}
                        {creationMode === 'bulk' && bulkPreview.length > 0 && (
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => { resetForm(); setShowModal(false); }}
                                >
                                    Cancel
                                </button>
                                <button className="btn btn-primary">
                                    <Upload size={18} />
                                    Import {bulkPreview.length} Opportunities
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
