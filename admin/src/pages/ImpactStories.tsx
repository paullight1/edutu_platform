import { useCallback, useEffect, useState } from 'react';
import {
    Plus,
    Edit3,
    Trash2,
    ExternalLink,
    Heart,
    Info,
} from 'lucide-react';
import { backendFetchJson } from '../lib/backend';
import ImpactStoryEditorModal from '../components/ImpactStoryEditorModal';
import type { ImpactStory } from '../types/impactStory';

/**
 * Edutu For You impact stories.
 *
 * Backs the story cards and story pages on the public /edutuforyou route.
 * Seeded with nine composites; the intent is that these are replaced one by
 * one with real, consented user stories over time.
 */
const ImpactStories = () => {
    const [stories, setStories] = useState<ImpactStory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editor, setEditor] = useState<{ open: boolean; story: ImpactStory | null }>({
        open: false,
        story: null,
    });

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // The admin listing includes drafts; the public one does not.
            setStories(await backendFetchJson<ImpactStory[]>('/impact-stories/admin'));
        } catch (loadError) {
            setError(
                loadError instanceof Error ? loadError.message : 'Failed to load stories',
            );
            setStories([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const remove = async (story: ImpactStory) => {
        if (
            !window.confirm(
                `Delete "${story.name}, ${story.age}"? This removes the story and its page.`,
            )
        ) {
            return;
        }
        try {
            await backendFetchJson(`/impact-stories/${story.id}`, { method: 'DELETE' });
            await load();
        } catch (deleteError) {
            setError(
                deleteError instanceof Error ? deleteError.message : 'Failed to delete',
            );
        }
    };

    const composites = stories.filter((story) => story.isComposite).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                }}
            >
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px' }}>Impact stories</h1>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-tertiary)', fontSize: '14px' }}>
                        The beneficiary stories on{' '}
                        <a
                            href="https://www.edutu.org/edutuforyou#stories"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--primary)' }}
                        >
                            /edutuforyou <ExternalLink size={12} style={{ display: 'inline' }} />
                        </a>
                    </p>
                </div>
                <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setEditor({ open: true, story: null })}
                >
                    <Plus size={16} /> New story
                </button>
            </div>

            {composites > 0 ? (
                <div
                    className="card"
                    style={{
                        padding: '14px 16px',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <Info size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>
                        {composites} of {stories.length} stories are illustrative composites,
                        and the public page shows a disclosure line while any of them are.
                        Replacing one with a real, consented story and unticking
                        &ldquo;illustrative composite&rdquo; retires that line for it.
                    </span>
                </div>
            ) : null}

            {error ? (
                <div
                    className="card"
                    style={{ padding: '14px 16px', color: '#dc2626', fontSize: '14px' }}
                >
                    {error}
                </div>
            ) : null}

            <div className="card" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        Loading stories…
                    </div>
                ) : stories.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}>
                        <Heart size={44} style={{ opacity: 0.3, marginBottom: '14px' }} />
                        <p style={{ color: 'var(--text-tertiary)' }}>No stories yet</p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                <th style={{ padding: '12px 16px' }}>Story</th>
                                <th style={{ padding: '12px 16px' }}>Outcome</th>
                                <th style={{ padding: '12px 16px' }}>Type</th>
                                <th style={{ padding: '12px 16px' }}>Status</th>
                                <th style={{ padding: '12px 16px', width: '110px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stories.map((story) => (
                                <tr key={story.id} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <img
                                                src={story.portrait}
                                                alt=""
                                                style={{ width: '40px', height: '52px', objectFit: 'cover', borderRadius: '6px' }}
                                            />
                                            <div>
                                                <div style={{ fontWeight: 600 }}>
                                                    {story.name}
                                                    {story.age ? `, ${story.age}` : ''}
                                                </div>
                                                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                                                    {story.place}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>{story.outcome}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                                        {story.isComposite ? (
                                            <span style={{ color: 'var(--text-tertiary)' }}>Composite</span>
                                        ) : (
                                            <span style={{ color: '#16a34a', fontWeight: 600 }}>Real story</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                                        <span
                                            style={{
                                                padding: '3px 10px',
                                                borderRadius: '999px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                background:
                                                    story.status === 'published'
                                                        ? 'rgba(22,163,74,0.12)'
                                                        : 'rgba(100,116,139,0.15)',
                                                color: story.status === 'published' ? '#16a34a' : '#64748b',
                                            }}
                                        >
                                            {story.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                aria-label={`Edit ${story.name}`}
                                                onClick={() => setEditor({ open: true, story })}
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                aria-label={`Delete ${story.name}`}
                                                onClick={() => void remove(story)}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {editor.open ? (
                <ImpactStoryEditorModal
                    story={editor.story}
                    onClose={() => setEditor({ open: false, story: null })}
                    onSaved={() => {
                        setEditor({ open: false, story: null });
                        void load();
                    }}
                />
            ) : null}
        </div>
    );
};

export default ImpactStories;
