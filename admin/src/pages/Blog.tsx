import { useState, useEffect } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { 
    Plus, 
    Search, 
    Edit3, 
    Trash2, 
    Eye, 
    Save,
    X,
    Image as ImageIcon,
    Link as LinkIcon,
    FileText,
    Clock,
    CheckCircle2,
    AlertCircle,
    MoreVertical,
    Download
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface BlogPost {
    id: string;
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    cover_image: string | null;
    status: 'draft' | 'published';
    author_id: string;
    author_name: string;
    created_at: string;
    updated_at: string;
    published_at: string | null;
    tags: string[];
    views: number;
}

const Blog = () => {
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
    
    // Editor state
    const [showEditor, setShowEditor] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editorContent, setEditorContent] = useState('');
    const [postTitle, setPostTitle] = useState('');
    const [postExcerpt, setPostExcerpt] = useState('');
    const [postTags, setPostTags] = useState('');
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [postStatus, setPostStatus] = useState<'draft' | 'published'>('draft');
    const [saving, setSaving] = useState(false);

    // Stats
    const [stats, setStats] = useState({
        total: 0,
        published: 0,
        drafts: 0,
        views: 0
    });

    useEffect(() => {
        fetchPosts();
    }, []);

    async function fetchPosts() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('blog_posts')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            const postsData = data || [];
            setPosts(postsData);
            
            // Calculate stats
            setStats({
                total: postsData.length,
                published: postsData.filter(p => p.status === 'published').length,
                drafts: postsData.filter(p => p.status === 'draft').length,
                views: postsData.reduce((sum, p) => sum + (p.views || 0), 0)
            });
        } catch (error) {
            console.error('Error fetching posts:', error);
            // For demo, set empty array
            setPosts([]);
            setStats({ total: 0, published: 0, drafts: 0, views: 0 });
        }
        setLoading(false);
    }

    const filteredPosts = posts.filter(post => {
        const matchesSearch = 
            post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
            post.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
        
        const matchesStatus = statusFilter === 'all' || post.status === statusFilter;
        
        return matchesSearch && matchesStatus;
    });

    const handleSave = async () => {
        if (!postTitle.trim()) {
            alert('Please enter a title');
            return;
        }

        setSaving(true);
        
        try {
            const slug = postTitle.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            
            const postData = {
                title: postTitle,
                slug: slug + '-' + Date.now(),
                content: editorContent,
                excerpt: postExcerpt || postTitle.slice(0, 150) + '...',
                cover_image: coverImage,
                status: postStatus,
                tags: postTags.split(',').map(tag => tag.trim()).filter(Boolean),
                updated_at: new Date().toISOString(),
                published_at: postStatus === 'published' ? new Date().toISOString() : null
            };

            if (editingId) {
                const { error } = await supabase
                    .from('blog_posts')
                    .update(postData)
                    .eq('id', editingId);
                if (error) throw error;
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                const { error } = await supabase
                    .from('blog_posts')
                    .insert([{
                        ...postData,
                        author_id: user?.id || 'admin',
                        author_name: 'Admin'
                    }]);
                if (error) throw error;
            }

            resetEditor();
            fetchPosts();
        } catch (error) {
            console.error('Error saving post:', error);
            alert('Error saving post. Please try again.');
        }
        
        setSaving(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this post?')) return;
        
        try {
            const { error } = await supabase
                .from('blog_posts')
                .delete()
                .eq('id', id);
            if (error) throw error;
            fetchPosts();
        } catch (error) {
            console.error('Error deleting post:', error);
        }
    };

    const handleEdit = (post: BlogPost) => {
        setEditingId(post.id);
        setPostTitle(post.title);
        setPostExcerpt(post.excerpt || '');
        setEditorContent(post.content);
        setPostTags(post.tags?.join(', ') || '');
        setCoverImage(post.cover_image);
        setPostStatus(post.status);
        setShowEditor(true);
    };

    const resetEditor = () => {
        setEditingId(null);
        setPostTitle('');
        setPostExcerpt('');
        setEditorContent('');
        setPostTags('');
        setCoverImage(null);
        setPostStatus('draft');
        setShowEditor(false);
    };

    const handleImageUpload = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}.${fileExt}`;
                const filePath = `blog-images/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('blog-images')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('blog-images')
                    .getPublicUrl(filePath);

                setCoverImage(publicUrl);
            } catch (error) {
                console.error('Error uploading image:', error);
                alert('Error uploading image');
            }
        };
        input.click();
    };

    const quillModules = {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'align': [] }],
            ['blockquote', 'code-block'],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            [{ 'indent': '-1'}, { 'indent': '+1' }],
            ['link', 'image', 'video'],
            ['clean']
        ],
        clipboard: {
            matchVisual: false
        }
    };

    const quillFormats = [
        'header',
        'bold', 'italic', 'underline', 'strike',
        'color', 'background',
        'align',
        'blockquote', 'code-block',
        'list', 'bullet', 'indent',
        'link', 'image', 'video'
    ];

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
                    <button 
                        className="btn btn-primary"
                        onClick={() => {
                            resetEditor();
                            setShowEditor(true);
                        }}
                    >
                        <Plus size={18} />
                        New Post
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
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

            {/* Editor Modal */}
            {showEditor && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '1200px',
                        maxHeight: '90vh',
                        overflow: 'auto',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
                    }}>
                        {/* Editor Header */}
                        <div style={{
                            padding: '20px 24px',
                            borderBottom: '1px solid var(--border-light)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <h2 style={{ fontSize: '20px', fontWeight: 600 }}>
                                {editingId ? 'Edit Post' : 'Create New Post'}
                            </h2>
                            <button 
                                onClick={resetEditor}
                                style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    cursor: 'pointer',
                                    padding: '8px',
                                    borderRadius: '8px'
                                }}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Editor Content */}
                        <div style={{ padding: '24px' }}>
                            {/* Title Input */}
                            <div style={{ marginBottom: '20px' }}>
                                <input
                                    type="text"
                                    placeholder="Post Title"
                                    value={postTitle}
                                    onChange={(e) => setPostTitle(e.target.value)}
                                    style={{
                                        width: '100%',
                                        fontSize: '28px',
                                        fontWeight: 700,
                                        border: 'none',
                                        borderBottom: '2px solid var(--border-light)',
                                        background: 'transparent',
                                        padding: '12px 0',
                                        color: 'var(--text-primary)',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            {/* Cover Image */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    marginBottom: '12px'
                                }}>
                                    <button
                                        onClick={handleImageUpload}
                                        className="btn btn-secondary"
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        <ImageIcon size={16} />
                                        {coverImage ? 'Change Cover Image' : 'Add Cover Image'}
                                    </button>
                                    {coverImage && (
                                        <button
                                            onClick={() => setCoverImage(null)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--danger)',
                                                cursor: 'pointer',
                                                fontSize: '14px'
                                            }}
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                                {coverImage && (
                                    <img 
                                        src={coverImage} 
                                        alt="Cover" 
                                        style={{
                                            width: '100%',
                                            maxHeight: '300px',
                                            objectFit: 'cover',
                                            borderRadius: '12px'
                                        }}
                                    />
                                )}
                            </div>

                            {/* Excerpt */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '8px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'var(--text-secondary)'
                                }}>
                                    Excerpt
                                </label>
                                <textarea
                                    placeholder="Brief summary of the post..."
                                    value={postExcerpt}
                                    onChange={(e) => setPostExcerpt(e.target.value)}
                                    style={{
                                        width: '100%',
                                        minHeight: '80px',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        border: '1px solid var(--border-light)',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '15px',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>

                            {/* Rich Text Editor */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '8px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'var(--text-secondary)'
                                }}>
                                    Content
                                </label>
                                <div style={{ 
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-light)',
                                    overflow: 'hidden'
                                }}>
                                    <ReactQuill
                                        theme="snow"
                                        value={editorContent}
                                        onChange={setEditorContent}
                                        modules={quillModules}
                                        formats={quillFormats}
                                        style={{
                                            minHeight: '400px'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Tags */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ 
                                    display: 'block', 
                                    marginBottom: '8px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'var(--text-secondary)'
                                }}>
                                    Tags (comma separated)
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g., scholarships, education, tips"
                                    value={postTags}
                                    onChange={(e) => setPostTags(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        border: '1px solid var(--border-light)',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '15px'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Editor Footer */}
                        <div style={{
                            padding: '20px 24px',
                            borderTop: '1px solid var(--border-light)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>Status:</span>
                                <select
                                    value={postStatus}
                                    onChange={(e) => setPostStatus(e.target.value as 'draft' | 'published')}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-light)',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '14px'
                                    }}
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button 
                                    className="btn btn-secondary"
                                    onClick={resetEditor}
                                >
                                    Cancel
                                </button>
                                <button 
                                    className="btn btn-primary"
                                    onClick={handleSave}
                                    disabled={saving}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    {saving ? (
                                        <Clock size={18} className="animate-spin" />
                                    ) : (
                                        <Save size={18} />
                                    )}
                                    {saving ? 'Saving...' : 'Save Post'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={18} style={{ 
                            position: 'absolute', 
                            left: '12px', 
                            top: '50%', 
                            transform: 'translateY(-50%)', 
                            color: 'var(--text-tertiary)' 
                        }} />
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
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'draft' | 'published')}
                        style={{ width: '150px' }}
                    >
                        <option value="all">All Posts</option>
                        <option value="published">Published</option>
                        <option value="draft">Drafts</option>
                    </select>
                </div>
            </div>

            {/* Posts Grid */}
            <div className="card" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        Loading posts...
                    </div>
                ) : filteredPosts.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}>
                        <FileText size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                        <p style={{ color: 'var(--text-tertiary)', marginBottom: '16px' }}>
                            No posts found
                        </p>
                        <button 
                            className="btn btn-primary"
                            onClick={() => {
                                resetEditor();
                                setShowEditor(true);
                            }}
                        >
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
                                style={{ 
                                    overflow: 'hidden',
                                    cursor: 'pointer'
                                }}
                                onClick={() => handleEdit(post)}
                            >
                                {post.cover_image && (
                                    <div style={{ height: '180px', overflow: 'hidden' }}>
                                        <img 
                                            src={post.cover_image} 
                                            alt={post.title}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover'
                                            }}
                                        />
                                    </div>
                                )}
                                <div style={{ padding: '20px' }}>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '8px',
                                        marginBottom: '12px'
                                    }}>
                                        <span style={{
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            background: post.status === 'published' 
                                                ? 'rgba(16, 185, 129, 0.15)' 
                                                : 'rgba(255, 102, 0, 0.15)',
                                            color: post.status === 'published' ? '#10b981' : '#ff6600'
                                        }}>
                                            {post.status === 'published' ? 'Published' : 'Draft'}
                                        </span>
                                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                            <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                            {new Date(post.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <h3 style={{ 
                                        fontSize: '18px', 
                                        fontWeight: 600,
                                        marginBottom: '8px',
                                        lineHeight: 1.4
                                    }}>
                                        {post.title}
                                    </h3>
                                    <p style={{ 
                                        fontSize: '14px', 
                                        color: 'var(--text-secondary)',
                                        lineHeight: 1.5,
                                        marginBottom: '16px'
                                    }}>
                                        {post.excerpt}
                                    </p>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {post.tags?.slice(0, 3).map((tag, idx) => (
                                                <span 
                                                    key={idx}
                                                    style={{
                                                        padding: '4px 8px',
                                                        background: 'var(--bg-tertiary)',
                                                        borderRadius: '4px',
                                                        fontSize: '12px',
                                                        color: 'var(--text-secondary)'
                                                    }}
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEdit(post);
                                                }}
                                                className="btn btn-secondary"
                                                style={{ padding: '8px' }}
                                            >
                                                <Edit3 size={16} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(post.id);
                                                }}
                                                className="btn btn-secondary"
                                                style={{ 
                                                    padding: '8px',
                                                    color: 'var(--danger)'
                                                }}
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

            {/* Custom Styles for Quill Editor */}
            <style>{`
                .ql-toolbar {
                    background: var(--bg-tertiary) !important;
                    border-color: var(--border-light) !important;
                    border-radius: 10px 10px 0 0;
                }
                .ql-container {
                    background: var(--bg-secondary) !important;
                    border-color: var(--border-light) !important;
                    border-radius: 0 0 10px 10px;
                    min-height: 350px;
                }
                .ql-editor {
                    min-height: 350px;
                    font-size: 16px;
                    color: var(--text-primary);
                }
                .ql-editor p {
                    color: var(--text-primary);
                }
                .ql-snow .ql-picker {
                    color: var(--text-primary);
                }
                .ql-snow .ql-picker-options {
                    background: var(--bg-secondary);
                    border-color: var(--border-light);
                }
                .ql-snow .ql-picker-label {
                    color: var(--text-primary);
                }
                .ql-snow .ql-stroke {
                    stroke: var(--text-secondary);
                }
                .ql-snow .ql-fill {
                    fill: var(--text-secondary);
                }
                .ql-snow button:hover .ql-stroke,
                .ql-snow button.ql-active .ql-stroke {
                    stroke: var(--apple-blue);
                }
                .ql-snow button:hover .ql-fill,
                .ql-snow button.ql-active .ql-fill {
                    fill: var(--apple-blue);
                }
                .ql-snow .ql-tooltip {
                    background: var(--bg-secondary);
                    border-color: var(--border-light);
                    color: var(--text-primary);
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                }
                .ql-snow .ql-tooltip input[type=text] {
                    background: var(--bg-tertiary);
                    border-color: var(--border-light);
                    color: var(--text-primary);
                }
                .ql-snow .ql-tooltip a.ql-action {
                    color: var(--apple-blue);
                }
            `}</style>
        </div>
    );
};

export default Blog;
