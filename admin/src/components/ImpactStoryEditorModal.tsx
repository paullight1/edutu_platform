import { useState } from 'react';
import { Plus, Save, Trash2, X, AlertTriangle } from 'lucide-react';
import { backendFetchJson } from '../lib/backend';
import {
    EMPTY_STORY,
    type ImpactStory,
    type ImpactStoryDraft,
} from '../types/impactStory';

interface Props {
    story: ImpactStory | null;
    onClose: () => void;
    onSaved: () => void;
}

const label: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '6px',
    color: 'var(--text-secondary)',
};

const row: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '16px',
};

const ImpactStoryEditorModal = ({ story, onClose, onSaved }: Props) => {
    const [draft, setDraft] = useState<ImpactStoryDraft>(
        story ? { ...story } : { ...EMPTY_STORY },
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const set = <K extends keyof ImpactStoryDraft>(
        key: K,
        value: ImpactStoryDraft[K],
    ) => setDraft((current) => ({ ...current, [key]: value }));

    /* ── Chapters ──────────────────────────────────────────────────────── */
    const setChapter = (index: number, patch: Partial<ImpactStoryDraft['chapters'][number]>) =>
        setDraft((current) => ({
            ...current,
            chapters: current.chapters.map((chapter, i) =>
                i === index ? { ...chapter, ...patch } : chapter,
            ),
        }));

    const addChapter = () =>
        setDraft((current) => ({
            ...current,
            chapters: [...current.chapters, { heading: '', body: [''] }],
        }));

    const removeChapter = (index: number) =>
        setDraft((current) => ({
            ...current,
            chapters: current.chapters.filter((_, i) => i !== index),
        }));

    /* ── Stats ─────────────────────────────────────────────────────────── */
    // Always operate on a dense three-slot array. Assigning into a sparse array
    // leaves holes, which JSON.stringify emits as null and the API's schema
    // rejects.
    const setStatField = (index: number, field: 'value' | 'label', value: string) =>
        setDraft((current) => {
            const next = [0, 1, 2].map(
                (i) => current.stats[i] ?? { value: '', label: '' },
            );
            next[index] = { ...next[index], [field]: value };
            return { ...current, stats: next };
        });

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            // Paragraphs are edited as one textarea per chapter, split on blank
            // lines — the shape the public page renders.
            const payload = {
                ...draft,
                age: draft.age === null || Number.isNaN(draft.age) ? null : Number(draft.age),
                barrier: draft.barrier || null,
                chapters: draft.chapters
                    .filter((chapter) => chapter.heading.trim())
                    .map((chapter) => ({
                        heading: chapter.heading.trim(),
                        body: chapter.body
                            .join('\n\n')
                            .split(/\n{2,}/)
                            .map((paragraph) => paragraph.trim())
                            .filter(Boolean),
                    }))
                    .filter((chapter) => chapter.body.length > 0),
                stats: draft.stats.filter((stat) => stat.value.trim() && stat.label.trim()),
            };

            if (story) {
                await backendFetchJson(`/impact-stories/${story.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                await backendFetchJson('/impact-stories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }
            onSaved();
        } catch (saveError) {
            setError(
                saveError instanceof Error ? saveError.message : 'Failed to save story',
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={story ? 'Edit story' : 'New story'}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '32px 16px',
                overflowY: 'auto',
                zIndex: 1000,
            }}
        >
            <div
                className="card"
                style={{ width: '100%', maxWidth: '820px', padding: '24px' }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '20px',
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: '20px' }}>
                        {story ? `Edit ${story.name}` : 'New impact story'}
                    </h2>
                    <button type="button" className="btn-secondary" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                {error ? (
                    <div
                        style={{
                            padding: '12px',
                            marginBottom: '16px',
                            borderRadius: '8px',
                            background: 'rgba(220,38,38,0.1)',
                            color: '#dc2626',
                            fontSize: '14px',
                        }}
                    >
                        {error}
                    </div>
                ) : null}

                <div style={row}>
                    <div>
                        <label style={label} htmlFor="story-name">Name</label>
                        <input id="story-name" className="input-field" value={draft.name}
                            onChange={(e) => set('name', e.target.value)} />
                    </div>
                    <div>
                        <label style={label} htmlFor="story-slug">Slug (URL)</label>
                        <input id="story-slug" className="input-field" value={draft.slug}
                            placeholder="aisha-kano"
                            onChange={(e) => set('slug', e.target.value)} />
                    </div>
                </div>

                <div style={row}>
                    <div>
                        <label style={label} htmlFor="story-age">Age</label>
                        <input id="story-age" className="input-field" type="number" value={draft.age ?? ''}
                            onChange={(e) => set('age', e.target.value ? Number(e.target.value) : null)} />
                    </div>
                    <div>
                        <label style={label} htmlFor="story-place">Place</label>
                        <input id="story-place" className="input-field" value={draft.place}
                            placeholder="Kano, Nigeria"
                            onChange={(e) => set('place', e.target.value)} />
                    </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={label} htmlFor="story-outcome">Outcome badge</label>
                    <input id="story-outcome" className="input-field" value={draft.outcome}
                        placeholder="Fully-funded fellowship"
                        onChange={(e) => set('outcome', e.target.value)} />
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={label} htmlFor="story-quote">Pull quote</label>
                    <input id="story-quote" className="input-field" value={draft.quote}
                        onChange={(e) => set('quote', e.target.value)} />
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={label} htmlFor="story-teaser">Card teaser (one sentence)</label>
                    <textarea id="story-teaser" className="input-field" rows={2} value={draft.teaser}
                        onChange={(e) => set('teaser', e.target.value)} />
                </div>

                <div style={row}>
                    <div>
                        <label style={label} htmlFor="story-portrait">Portrait image URL</label>
                        <input id="story-portrait" className="input-field" value={draft.portrait}
                            onChange={(e) => set('portrait', e.target.value)} />
                    </div>
                    <div>
                        <label style={label} htmlFor="story-portrait-alt">Portrait alt text</label>
                        <input id="story-portrait-alt" className="input-field" value={draft.portraitAlt}
                            onChange={(e) => set('portraitAlt', e.target.value)} />
                    </div>
                </div>

                <div style={row}>
                    <div>
                        <label style={label} htmlFor="story-hero">Hero image URL</label>
                        <input id="story-hero" className="input-field" value={draft.heroImage}
                            onChange={(e) => set('heroImage', e.target.value)} />
                    </div>
                    <div>
                        <label style={label} htmlFor="story-hero-alt">Hero alt text</label>
                        <input id="story-hero-alt" className="input-field" value={draft.heroAlt}
                            onChange={(e) => set('heroAlt', e.target.value)} />
                    </div>
                </div>

                {(draft.portrait || draft.heroImage) ? (
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                        {draft.portrait ? (
                            <img src={draft.portrait} alt="" style={{ width: '90px', height: '120px', objectFit: 'cover', borderRadius: '8px' }} />
                        ) : null}
                        {draft.heroImage ? (
                            <img src={draft.heroImage} alt="" style={{ width: '213px', height: '120px', objectFit: 'cover', borderRadius: '8px' }} />
                        ) : null}
                    </div>
                ) : null}

                {/* ── Chapters ──────────────────────────────────────────── */}
                <h3 style={{ fontSize: '15px', margin: '24px 0 12px' }}>Story chapters</h3>
                {draft.chapters.map((chapter, index) => (
                    <div key={index} className="card" style={{ padding: '16px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                            <input
                                className="input-field"
                                placeholder="Chapter heading"
                                value={chapter.heading}
                                onChange={(e) => setChapter(index, { heading: e.target.value })}
                            />
                            <button
                                type="button"
                                className="btn-secondary"
                                aria-label={`Remove chapter ${index + 1}`}
                                onClick={() => removeChapter(index)}
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                        <textarea
                            className="input-field"
                            rows={5}
                            placeholder="Paragraphs — separate each with a blank line."
                            value={chapter.body.join('\n\n')}
                            onChange={(e) => setChapter(index, { body: e.target.value.split(/\n{2,}/) })}
                        />
                    </div>
                ))}
                <button type="button" className="btn-secondary" onClick={addChapter}>
                    <Plus size={15} /> Add chapter
                </button>

                {/* ── Stats ─────────────────────────────────────────────── */}
                <h3 style={{ fontSize: '15px', margin: '24px 0 12px' }}>Stats (up to 3 shown)</h3>
                {[0, 1, 2].map((index) => {
                    const stat = draft.stats[index] ?? { value: '', label: '' };
                    return (
                        <div key={index} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px', marginBottom: '10px' }}>
                            <input
                                className="input-field"
                                placeholder="2 years"
                                aria-label={`Stat ${index + 1} value`}
                                value={stat.value}
                                onChange={(e) => setStatField(index, 'value', e.target.value)}
                            />
                            <input
                                className="input-field"
                                placeholder="the fellowship was open before she heard of it"
                                aria-label={`Stat ${index + 1} label`}
                                value={stat.label}
                                onChange={(e) => setStatField(index, 'label', e.target.value)}
                            />
                        </div>
                    );
                })}

                <div style={{ margin: '20px 0' }}>
                    <label style={label} htmlFor="story-barrier">Closing pull-out (the barrier)</label>
                    <textarea id="story-barrier" className="input-field" rows={2} value={draft.barrier ?? ''}
                        onChange={(e) => set('barrier', e.target.value)} />
                </div>

                {/* ── Publication ───────────────────────────────────────── */}
                <div style={row}>
                    <div>
                        <label style={label} htmlFor="story-status">Status</label>
                        <select id="story-status" className="input-field" value={draft.status}
                            onChange={(e) => set('status', e.target.value as 'draft' | 'published')}>
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                        </select>
                    </div>
                    <div>
                        <label style={label} htmlFor="story-order">Sort order</label>
                        <input id="story-order" className="input-field" type="number" value={draft.sortOrder}
                            onChange={(e) => set('sortOrder', Number(e.target.value) || 0)} />
                    </div>
                </div>

                {/*
                  The disclosure switch. Deliberately verbose: clearing it
                  removes the "composite" line from the public page, so it must
                  never be flipped by someone who has not read what it means.
                */}
                <div
                    style={{
                        padding: '16px',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                        background: draft.isComposite ? 'transparent' : 'rgba(245,158,11,0.08)',
                        marginBottom: '20px',
                    }}
                >
                    <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={draft.isComposite}
                            onChange={(e) => set('isComposite', e.target.checked)}
                            style={{ marginTop: '3px' }}
                        />
                        <span>
                            <span style={{ fontWeight: 600, display: 'block' }}>
                                This is an illustrative composite
                            </span>
                            <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                                Keep this ticked for any story that is written rather than told
                                to us. The public page shows a short line explaining that
                                composites are not real users.
                            </span>
                        </span>
                    </label>

                    {!draft.isComposite ? (
                        <div
                            style={{
                                display: 'flex',
                                gap: '8px',
                                marginTop: '12px',
                                fontSize: '13px',
                                color: '#b45309',
                            }}
                        >
                            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                            <span>
                                This story will be published as a real person's account, with no
                                disclosure. Only do this for a real user who has given consent,
                                using a photograph you have the right to use.
                            </span>
                        </div>
                    ) : null}
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="button" className="btn-primary" onClick={save} disabled={saving}>
                        <Save size={16} /> {saving ? 'Saving…' : 'Save story'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImpactStoryEditorModal;
