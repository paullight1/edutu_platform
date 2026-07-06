import { useState, useEffect, useCallback } from 'react';
import {
    Plus,
    Search,
    Edit3,
    Trash2,
    Eye,
    FileText,
    Clock,
    CheckCircle2,
    AlertCircle,
    Download,
} from 'lucide-react';
import { backendFetchJson } from '../lib/backend';
import BlogEditorModal from '../components/BlogEditorModal';
import type { BlogPost, BlogStatus } from '../types/blog';

const Blog = () => {
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | BlogStatus>('all');

    // Editor: closed, or open for a new post (null) / an existing post.
    const [editor, setEditor] = useState<{ open: boolean; post: BlogPost | null }>({
        open: false,
        post: null,
    });

    const [stats, setStats] = useState({ total: 0, published: 0, drafts: 0, views: 0 });

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        try {
            const postsData = await backendFetchJson<BlogPost[]>('/blog?status=all&limit=100');
            setPosts(postsData);
            setStats({
                total: postsData.length,
                published: postsData.filter((p) => p.status === 'published').length,
                drafts: postsData.filter((p) => p.status === 'draft').length,
                views: postsData.reduce((sum, p) => sum + (p.views || 0), 0),
            });
        } catch (error) {
            console.error('Error fetching posts:', error);
            setPosts([]);
            setStats({ total: 0, published: 0, drafts: 0, views: 0 });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchPosts();
    }, [fetchPosts]);

    const filteredPosts = posts.filter((post) => {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
            post.title.toLowerCase().includes(query) ||
            (post.excerpt || '').toLowerCase().includes(query) ||
            post.tags?.some((tag) => tag.toLowerCase().includes(query));
        const matchesStatus = statusFilter === 'all' || post.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this post?')) return;
        try {
            await backendFetchJson<void>(`/blog/${id}`, { method: 'DELETE' });
            await fetchPosts();
        } catch (error) {
            console.error('Error deleting post:', error);
            alert('Could not delete this post. Please try again.');
        }
    };

    const openNew = () => setEditor({ open: true, post: null });
    const openEdit = (post: BlogPost) => setEditor({ open: true, post });
    const closeEditor = () => setEditor({ open: false, post: null });

    const existingSlugs = new Set(posts.map((post) => post.slug).filter(Boolean));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Blog Management</h1>
                    <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0 0', fontSize: '15px' }}>
                        Create and manage blog posts with rich content
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-secondary">
                        <Download size={18} />
                        Export
                    </button>
                    <button className="btn btn-primary" onClick={openNew}>
                        <Plus size={18} />
                        New Post
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-grid">
                {[
                    { label: 'Total Posts', value: stats.total, icon: FileText, gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' },
                    { label: 'Published', value: stats.published, icon: CheckCircle2, gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
                    { label: 'Drafts', value: stats.drafts, icon: AlertCircle, gradient: 'linear-gradient(135deg, #ff6600 0%, #ff4500 100%)' },
                    { label: 'Total Views', value: stats.views, icon: Eye, gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
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
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        }}
                    >
                        <div style={{ position: 'absolute', top: '20px', right: '20px', opacity: 0.9 }}>
                            <stat.icon size={28} strokeWidth={1.5} style={{ color: 'white' }} />
                        </div>
                        <div style={{ fontSize: '36px', fontWeight: 700, color: '#ffffff', marginBottom: '8px', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                            {stat.value}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
                            {stat.label}
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Search posts..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '40px' }}
                        />
                    </div>
                    <select
                        className="input-field"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | BlogStatus)}
                        style={{ width: '150px' }}
                    >
                        <option value="all">All Posts</option>
                        <option value="published">Published</option>
                        <option value="draft">Drafts</option>
                        <option value="archived">Archived</option>
                    </select>
                </div>
            </div>

            {/* Posts */}
            <div className="card" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        Loading posts...
                    </div>
                ) : filteredPosts.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}>
                        <FileText size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                        <p style={{ color: 'var(--text-tertiary)', marginBottom: '16px' }}>No posts found</p>
                        <button className="btn btn-primary" onClick={openNew}>
                            <Plus size={18} />
                            Create First Post
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px', padding: '20px' }}>
                        {filteredPosts.map((post) => (
                            <div
                                key={post.id}
                                className="card card-hover"
                                style={{ overflow: 'hidden', cursor: 'pointer' }}
                                onClick={() => openEdit(post)}
                            >
                                {post.coverImage && (
                                    <div style={{ height: '180px', overflow: 'hidden' }}>
                                        <img src={post.coverImage} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                )}
                                <div style={{ padding: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                        <span
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                background:
                                                    post.status === 'published'
                                                        ? 'rgba(16, 185, 129, 0.15)'
                                                        : post.status === 'archived'
                                                            ? 'rgba(107, 114, 128, 0.15)'
                                                            : 'rgba(255, 102, 0, 0.15)',
                                                color:
                                                    post.status === 'published'
                                                        ? '#10b981'
                                                        : post.status === 'archived'
                                                            ? '#6b7280'
                                                            : '#ff6600',
                                            }}
                                        >
                                            {post.status === 'published' ? 'Published' : post.status === 'archived' ? 'Archived' : 'Draft'}
                                        </span>
                                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                            <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                            {new Date(post.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', lineHeight: 1.4 }}>
                                        {post.title}
                                    </h3>
                                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
                                        {post.excerpt}
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {post.tags?.slice(0, 3).map((tag, idx) => (
                                                <span
                                                    key={idx}
                                                    style={{ padding: '4px 8px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openEdit(post);
                                                }}
                                                className="btn btn-secondary"
                                                style={{ padding: '8px' }}
                                                aria-label="Edit post"
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    void handleDelete(post.id);
                                                }}
                                                className="btn btn-secondary"
                                                style={{ padding: '8px', color: 'var(--danger)' }}
                                                aria-label="Delete post"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {editor.open && (
                <BlogEditorModal
                    key={editor.post?.id ?? 'new'}
                    post={editor.post}
                    existingSlugs={existingSlugs}
                    onClose={closeEditor}
                    onSaved={fetchPosts}
                />
            )}
        </div>
    );
};

export default Blog;
