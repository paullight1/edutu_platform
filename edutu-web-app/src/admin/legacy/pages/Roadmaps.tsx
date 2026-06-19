import { useEffect, useState, useCallback } from 'react';
import {
    BookOpen, CheckCircle, XCircle, Clock, TrendingUp,
    Search, Trash2, ChevronDown, ChevronUp,
    Loader2, AlertCircle, CheckCircle2,
    Star, FileText, X, Plus, Sparkles, ArrowRight, ArrowLeft, Edit3, Eye, Users, ThumbsUp
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

interface RoadmapStep {
    id: string;
    title: string;
    description: string;
    duration?: string;
}

interface RoadmapResource {
    id: string;
    title: string;
    url: string;
    type: string;
}

interface Roadmap {
    id: string;
    title: string;
    slug: string;
    description: string;
    category: string;
    difficulty: string;
    estimated_duration: string;
    target_audience: string;
    prerequisites: string;
    outcomes: string;
    cover_image: string;
    status: string;
    creator_name: string;
    is_featured: boolean;
    enrollment_count: number;
    rating_avg: number;
    rating_count: number;
    steps: RoadmapStep[];
    resources: RoadmapResource[];
    ai_intent_tags: string[];
    satisfaction_score: number;
    created_at: string;
    published_at: string;
}

interface AIQuestion {
    id: string;
    question: string;
    type: 'text' | 'select' | 'multiselect';
    options?: string[];
}

interface AIRoadmapSuggestion {
    title: string;
    description: string;
    steps: Array<{ title: string; description: string; duration: string }>;
}

interface AIAssistResponse {
    questions: AIQuestion[];
    roadmapSuggestion: AIRoadmapSuggestion;
}

const Roadmaps = () => {
    const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [stats, setStats] = useState({ total_roadmaps: 0, published_roadmaps: 0, draft_roadmaps: 0, total_enrollments: 0, avg_satisfaction: 0 });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createStep, setCreateStep] = useState(1);
    const [isCreating, setIsCreating] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');

    const [topic, setTopic] = useState('');
    const [aiQuestions, setAiQuestions] = useState<AIQuestion[]>([]);
    const [aiAnswers, setAiAnswers] = useState<Record<string, string>>({});
    const [aiSuggestion, setAiSuggestion] = useState<AIRoadmapSuggestion | null>(null);

    const [formData, setFormData] = useState({
        title: '', description: '', category: 'general', difficulty: 'beginner',
        estimatedDuration: '', targetAudience: '', prerequisites: '', outcomes: '',
        coverImage: '', isFeatured: false,
    });
    const [steps, setSteps] = useState<RoadmapStep[]>([{ id: crypto.randomUUID(), title: '', description: '', duration: '' }]);
    const [resources, setResources] = useState<RoadmapResource[]>([]);

    const fetchRoadmaps = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/roadmaps?status=${statusFilter === 'all' ? '' : statusFilter}&limit=100`);
            if (res.ok) {
                const data = await res.json();
                setRoadmaps(data);
            }

            const statsRes = await fetch(`${API_URL}/roadmaps/stats`, {
                headers: { 'Authorization': `Bearer ${await getAuthToken()}` },
            });
            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setStats(statsData);
            }
        } catch (e) {
            console.error('Failed to fetch roadmaps:', e);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    const getAuthToken = async () => {
        const { data } = await supabase.auth.getSession();
        return data?.session?.access_token || '';
    };

    useEffect(() => { fetchRoadmaps(); }, [fetchRoadmaps]);

    const handleAIGenerate = async () => {
        if (!topic.trim()) return;
        setAiLoading(true);
        setAiError('');
        try {
            const res = await fetch(`${API_URL}/roadmaps/ai/assist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, category: formData.category }),
            });
            if (!res.ok) throw new Error('AI request failed');
            const data: AIAssistResponse = await res.json();
            setAiQuestions(data.questions);
            setAiSuggestion(data.roadmapSuggestion);
            setAiAnswers({});
            setCreateStep(2);
        } catch (e) {
            setAiError('Failed to generate AI questions. Try again.');
            console.error(e);
        } finally {
            setAiLoading(false);
        }
    };

    const handleApplySuggestion = () => {
        if (!aiSuggestion) return;
        setFormData(prev => ({
            ...prev,
            title: aiSuggestion.title,
            description: aiSuggestion.description,
        }));
        setSteps(aiSuggestion.steps.map(s => ({
            id: crypto.randomUUID(),
            title: s.title,
            description: s.description,
            duration: s.duration,
        })));
        setCreateStep(3);
    };

    const handleCreateRoadmap = async () => {
        if (!formData.title || !formData.description || steps.length === 0) return;
        setIsCreating(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${API_URL}/roadmaps`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    ...formData,
                    steps: steps.filter(s => s.title.trim()),
                    resources: resources.filter(r => r.title.trim()),
                }),
            });
            if (!res.ok) throw new Error('Failed to create roadmap');
            setIsCreateModalOpen(false);
            resetForm();
            fetchRoadmaps();
        } catch (e) {
            console.error('Failed to create roadmap:', e);
            alert('Failed to create roadmap');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this roadmap?')) return;
        const token = await getAuthToken();
        await fetch(`${API_URL}/roadmaps/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        fetchRoadmaps();
    };

    const handleStatusToggle = async (roadmap: Roadmap) => {
        const token = await getAuthToken();
        const newStatus = roadmap.status === 'published' ? 'draft' : 'published';
        await fetch(`${API_URL}/roadmaps/${roadmap.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status: newStatus }),
        });
        fetchRoadmaps();
    };

    const resetForm = () => {
        setCreateStep(1);
        setTopic('');
        setAiQuestions([]);
        setAiAnswers({});
        setAiSuggestion(null);
        setFormData({ title: '', description: '', category: 'general', difficulty: 'beginner', estimatedDuration: '', targetAudience: '', prerequisites: '', outcomes: '', coverImage: '', isFeatured: false });
        setSteps([{ id: crypto.randomUUID(), title: '', description: '', duration: '' }]);
        setResources([]);
    };

    const filteredRoadmaps = roadmaps.filter(r => {
        if (searchQuery && !r.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
        return true;
    });

    const categories = ['all', 'scholarship', 'career', 'education', 'skills', 'business', 'tech', 'personal', 'general'];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Roadmaps</h1>
                    <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0 0', fontSize: '15px' }}>
                        Create and manage learning roadmaps with AI assistance
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => { resetForm(); setIsCreateModalOpen(true); }}>
                    <Plus size={18} /> Create Roadmap
                </button>
            </div>

            <div className="grid grid-cols-4">
                {[
                    { label: 'Total Roadmaps', value: stats.total_roadmaps, icon: BookOpen, gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' },
                    { label: 'Published', value: stats.published_roadmaps, icon: CheckCircle, gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
                    { label: 'Total Enrollments', value: stats.total_enrollments, icon: Users, gradient: 'linear-gradient(135deg, #ff6600 0%, #ff4500 100%)' },
                    { label: 'Avg Satisfaction', value: stats.avg_satisfaction ? `${Number(stats.avg_satisfaction).toFixed(1)}/5` : 'N/A', icon: Star, gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' },
                ].map((stat, i) => (
                    <div key={i} className="card card-hover" style={{ padding: '24px', position: 'relative', overflow: 'hidden', background: stat.gradient }}>
                        <div style={{ fontSize: '28px', marginBottom: '4px', color: '#ffffff', fontWeight: 700 }}>{stat.value}</div>
                        <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '14px' }}>{stat.label}</div>
                        <div style={{ position: 'absolute', top: '20px', right: '20px', opacity: 0.95 }}>
                            <stat.icon size={28} strokeWidth={1.5} style={{ color: '#ffffff' }} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input className="input-field" placeholder="Search roadmaps..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ paddingLeft: '40px' }} />
                    </div>
                    <select className="input-field" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ width: '160px' }}>
                        {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select>
                    <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={{ width: '140px' }}>
                        <option value="all">All Status</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                    </select>
                </div>
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}><Loader2 size={40} className="animate-spin" style={{ margin: '0 auto 16px' }} /><p style={{ color: 'var(--text-tertiary)' }}>Loading roadmaps...</p></div>
                ) : filteredRoadmaps.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}><BookOpen size={48} style={{ opacity: 0.3, marginBottom: '16px' }} /><p style={{ color: 'var(--text-tertiary)' }}>No roadmaps found</p></div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}></th>
                                    <th>Roadmap</th>
                                    <th>Category</th>
                                    <th>Difficulty</th>
                                    <th>Steps</th>
                                    <th>Enrollments</th>
                                    <th>Rating</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRoadmaps.map((item) => (
                                    <>
                                        <tr key={item.id}>
                                            <td>
                                                <button onClick={() => { const n = new Set(expandedRows); if (n.has(item.id)) { n.delete(item.id); } else { n.add(item.id); } setExpandedRows(n); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                                                    {expandedRows.has(item.id) ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                </button>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--apple-blue)' }}><FileText size={20} /></div>
                                                    <div>
                                                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.title}</div>
                                                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{item.creator_name}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td><span className="badge badge-primary">{item.category}</span></td>
                                            <td><span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{item.difficulty}</span></td>
                                            <td><span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{item.steps?.length || 0}</span></td>
                                            <td><span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{item.enrollment_count}</span></td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Star size={12} color="#F59E0B" fill="#F59E0B" />
                                                    <span style={{ fontSize: '13px' }}>{item.rating_avg ? (item.rating_avg / 10).toFixed(1) : 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                {item.status === 'published' ? (
                                                    <span className="badge badge-success"><CheckCircle size={12} style={{ marginRight: '4px' }} /> Published</span>
                                                ) : (
                                                    <span className="badge" style={{ background: 'rgba(255, 102, 0, 0.15)', color: '#ff6600' }}><Clock size={12} style={{ marginRight: '4px' }} /> Draft</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                    <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => handleStatusToggle(item)}>
                                                        {item.status === 'published' ? <XCircle size={14} /> : <CheckCircle size={14} />}
                                                        {item.status === 'published' ? 'Unpublish' : 'Publish'}
                                                    </button>
                                                    <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => handleDelete(item.id)}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedRows.has(item.id) && (
                                            <tr>
                                                <td colSpan={9} style={{ background: 'var(--bg-tertiary)', padding: '20px' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                                        <div>
                                                            <h4 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>Description</h4>
                                                            <p style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>{item.description}</p>
                                                            {item.target_audience && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '8px' }}><strong>Target:</strong> {item.target_audience}</p>}
                                                            {item.prerequisites && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}><strong>Prerequisites:</strong> {item.prerequisites}</p>}
                                                            {item.outcomes && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}><strong>Outcomes:</strong> {item.outcomes}</p>}
                                                        </div>
                                                        <div>
                                                            <h4 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>Steps ({item.steps?.length || 0})</h4>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                {item.steps?.map((step, idx) => (
                                                                    <div key={step.id || idx} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--apple-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>{idx + 1}</span>
                                                                        <div><strong>{step.title}</strong>{step.duration && <span style={{ color: 'var(--text-tertiary)' }}> — {step.duration}</span>}<br /><span style={{ fontSize: '12px' }}>{step.description}</span></div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {isCreateModalOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                    <div className="card" style={{ width: '800px', maxHeight: '92vh', overflowY: 'auto', padding: '0', borderRadius: '20px' }}>
                        <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-light)', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', borderRadius: '20px 20px 0 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: 'white', margin: 0 }}>Create Roadmap</h2>
                                <button onClick={() => { setIsCreateModalOpen(false); resetForm(); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: 'white', padding: '8px', borderRadius: '8px' }}><X size={20} /></button>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                                {[1, 2, 3].map(step => (
                                    <div key={step} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: createStep >= step ? 'white' : 'rgba(255,255,255,0.3)', color: createStep >= step ? '#8b5cf6' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px' }}>
                                            {createStep > step ? <CheckCircle size={16} /> : step}
                                        </div>
                                        <span style={{ color: 'white', fontSize: '12px', fontWeight: 600, opacity: 0.9 }}>{step === 1 ? 'Topic' : step === 2 ? 'AI Intent' : 'Details'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ padding: '28px' }}>
                            {createStep === 1 && (
                                <div>
                                    <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>What topic is this roadmap for?</h3>
                                    <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', marginBottom: '24px' }}>Enter a topic and our AI will ask clarifying questions to understand user intent, then suggest a roadmap structure.</p>
                                    <input type="text" className="input-field" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Master Data Science for Beginners, Scholarship Application Guide..." style={{ fontSize: '16px', padding: '16px', marginBottom: '24px' }} />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>Category</label>
                                            <select className="input-field" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                                <option value="scholarship">Scholarship</option>
                                                <option value="career">Career</option>
                                                <option value="education">Education</option>
                                                <option value="skills">Skills</option>
                                                <option value="business">Business</option>
                                                <option value="tech">Tech</option>
                                                <option value="personal">Personal</option>
                                                <option value="general">General</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>Difficulty</label>
                                            <select className="input-field" value={formData.difficulty} onChange={e => setFormData({ ...formData, difficulty: e.target.value })}>
                                                <option value="beginner">Beginner</option>
                                                <option value="intermediate">Intermediate</option>
                                                <option value="advanced">Advanced</option>
                                            </select>
                                        </div>
                                    </div>
                                    {aiError && <div style={{ padding: '12px', background: 'rgba(255,59,48,0.1)', borderRadius: '8px', color: '#ff3b30', fontSize: '14px', marginBottom: '16px' }}><AlertCircle size={16} style={{ marginRight: '8px' }} />{aiError}</div>}
                                    <button className="btn btn-primary" onClick={handleAIGenerate} disabled={aiLoading || !topic.trim()} style={{ width: '100%', padding: '14px', fontSize: '15px' }}>
                                        {aiLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                        {aiLoading ? 'Generating Questions...' : 'Generate AI Questions'}
                                    </button>
                                </div>
                            )}

                            {createStep === 2 && (
                                <div>
                                    <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>AI Intent Questions</h3>
                                    <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', marginBottom: '24px' }}>Answer these questions to help us understand what users need from this roadmap. This ensures the roadmap truly satisfies user intent.</p>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
                                        {aiQuestions.map((q) => (
                                            <div key={q.id}>
                                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>{q.question}</label>
                                                {q.type === 'select' && q.options ? (
                                                    <select className="input-field" value={aiAnswers[q.id] || ''} onChange={e => setAiAnswers({ ...aiAnswers, [q.id]: e.target.value })}>
                                                        <option value="">Select...</option>
                                                        {q.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                ) : (
                                                    <textarea className="input-field" value={aiAnswers[q.id] || ''} onChange={e => setAiAnswers({ ...aiAnswers, [q.id]: e.target.value })} placeholder="Type your answer..." style={{ minHeight: '80px' }} />
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {aiSuggestion && (
                                        <div style={{ padding: '20px', background: 'rgba(139,92,246,0.05)', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.2)', marginBottom: '24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><Sparkles size={18} color="#8b5cf6" /><h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>AI Roadmap Suggestion</h4></div>
                                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}><strong>{aiSuggestion.title}</strong></p>
                                            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>{aiSuggestion.description}</p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {aiSuggestion.steps.map((s, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
                                                        <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#8b5cf6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>{i + 1}</span>
                                                        <div><strong>{s.title}</strong> — {s.duration}<br /><span style={{ color: 'var(--text-tertiary)' }}>{s.description}</span></div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button className="btn btn-secondary" onClick={() => setCreateStep(1)} style={{ flex: 1 }}><ArrowLeft size={16} /> Back</button>
                                        <button className="btn btn-primary" onClick={handleApplySuggestion} style={{ flex: 2 }}>
                                            <Sparkles size={16} /> Apply Suggestion & Continue
                                        </button>
                                    </div>
                                </div>
                            )}

                            {createStep === 3 && (
                                <div>
                                    <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Review & Customize</h3>
                                    <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', marginBottom: '24px' }}>Review the AI-suggested roadmap, make any edits, then publish.</p>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>Title</label>
                                            <input className="input-field" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>Description</label>
                                            <textarea className="input-field" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} style={{ minHeight: '100px' }} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>Duration</label>
                                                <input className="input-field" value={formData.estimatedDuration} onChange={e => setFormData({ ...formData, estimatedDuration: e.target.value })} placeholder="e.g. 8 weeks" />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>Target Audience</label>
                                                <input className="input-field" value={formData.targetAudience} onChange={e => setFormData({ ...formData, targetAudience: e.target.value })} placeholder="e.g. Undergraduates" />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>Prerequisites</label>
                                                <input className="input-field" value={formData.prerequisites} onChange={e => setFormData({ ...formData, prerequisites: e.target.value })} placeholder="e.g. None" />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}>Expected Outcomes</label>
                                            <textarea className="input-field" value={formData.outcomes} onChange={e => setFormData({ ...formData, outcomes: e.target.value })} placeholder="What will users achieve?" style={{ minHeight: '80px' }} />
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                <label style={{ fontWeight: 600, fontSize: '14px' }}>Steps</label>
                                                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => setSteps([...steps, { id: crypto.randomUUID(), title: '', description: '', duration: '' }])}><Plus size={14} /> Add Step</button>
                                            </div>
                                            {steps.map((step, i) => (
                                                <div key={step.id} style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '8px', display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 40px', gap: '8px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Step {i + 1}</span>
                                                    <input className="input-field" value={step.title} onChange={e => { const n = [...steps]; n[i].title = e.target.value; setSteps(n); }} placeholder="Step title" style={{ fontSize: '13px', padding: '8px' }} />
                                                    <input className="input-field" value={step.duration || ''} onChange={e => { const n = [...steps]; n[i].duration = e.target.value; setSteps(n); }} placeholder="Duration" style={{ fontSize: '13px', padding: '8px' }} />
                                                    <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff3b30' }}><X size={16} /></button>
                                                    <textarea className="input-field" value={step.description} onChange={e => { const n = [...steps]; n[i].description = e.target.value; setSteps(n); }} placeholder="Description" style={{ gridColumn: '2 / 4', fontSize: '13px', padding: '8px', minHeight: '60px' }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button className="btn btn-secondary" onClick={() => setCreateStep(2)} style={{ flex: 1 }}><ArrowLeft size={16} /> Back</button>
                                        <button className="btn btn-primary" onClick={handleCreateRoadmap} disabled={isCreating || !formData.title || !formData.description || !steps.some(s => s.title)} style={{ flex: 2 }}>
                                            {isCreating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                            {isCreating ? 'Creating...' : 'Create Roadmap'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Roadmaps;
