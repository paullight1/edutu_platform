import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Plus,
  Rocket,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  appControlApi,
  HOME_BLOCK_TYPES,
  type CustomFeature,
  type CustomFeatureOpenMode,
  type CustomFeaturePlacement,
  type HomeBlock,
  type HomeLayout,
  type MobileAppSettings,
} from '../lib/mobileControlApi';

interface Props {
  value: MobileAppSettings;
  onChange: (next: MobileAppSettings) => void;
  onNotice: (notice: string) => void;
  onError: (error: string | null) => void;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function layoutOf(value: MobileAppSettings): HomeLayout {
  return value.homeLayout ?? { draft: [], published: [], lastPublished: [] };
}

/**
 * Server-driven home composer + custom features + reveal flags. Edits the
 * shared mobileApp state and saves the whole object (the backend merges by
 * group, so unrelated settings are never touched). Publish/rollback move blocks
 * between draft, published and lastPublished so users only ever see published.
 */
export function ServerDrivenPanel({ value, onChange, onNotice, onError }: Props) {
  const [saving, setSaving] = useState(false);
  const layout = layoutOf(value);
  const features = value.customFeatures ?? [];
  const flags = value.featureFlags ?? {};

  async function saveWhole(next: MobileAppSettings, message: string) {
    setSaving(true);
    onError(null);
    try {
      const saved = await appControlApi.saveMobileApp(next);
      onChange(saved);
      onNotice(message);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  // ── Home layout (draft) ────────────────────────────────────────────────────
  function setLayout(next: HomeLayout) {
    onChange({ ...value, homeLayout: next });
  }
  function setDraft(draft: HomeBlock[]) {
    setLayout({ ...layout, draft });
  }
  function addBlock(type: string) {
    setDraft([...layout.draft, { id: newId(), type, props: {}, enabled: true }]);
  }
  function updateBlock(id: string, patch: Partial<HomeBlock>) {
    setDraft(layout.draft.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function setProp(id: string, key: string, val: unknown) {
    const block = layout.draft.find((b) => b.id === id);
    if (!block) return;
    updateBlock(id, { props: { ...block.props, [key]: val } });
  }
  function removeBlock(id: string) {
    setDraft(layout.draft.filter((b) => b.id !== id));
  }
  function move(id: string, dir: -1 | 1) {
    const idx = layout.draft.findIndex((b) => b.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= layout.draft.length) return;
    const next = [...layout.draft];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setDraft(next);
  }

  function saveDraft() {
    void saveWhole({ ...value, homeLayout: layout }, 'Draft saved — users are unaffected until you publish.');
  }
  function publish() {
    if (!window.confirm('Publish this layout to every user on their next app open?')) return;
    const next: HomeLayout = {
      draft: layout.draft,
      published: layout.draft,
      lastPublished: layout.published,
    };
    void saveWhole({ ...value, homeLayout: next }, 'Layout published — live on next app open.');
  }
  function rollback() {
    if (!layout.lastPublished.length && !layout.published.length) return;
    if (!window.confirm('Roll back to the previously published layout?')) return;
    const next: HomeLayout = {
      draft: layout.draft,
      published: layout.lastPublished,
      lastPublished: layout.published,
    };
    void saveWhole({ ...value, homeLayout: next }, 'Rolled back to the previous published layout.');
  }

  const publishedCount = layout.published.length;
  const draftDirty = useMemo(
    () => JSON.stringify(layout.draft) !== JSON.stringify(layout.published),
    [layout.draft, layout.published],
  );

  // ── Custom features ────────────────────────────────────────────────────────
  function setFeatures(next: CustomFeature[]) {
    onChange({ ...value, customFeatures: next });
  }
  function addFeature() {
    setFeatures([
      ...features,
      {
        id: newId(),
        title: '',
        subtitle: '',
        icon: '',
        url: '',
        openMode: 'webview',
        placement: 'tools',
        enabled: true,
      },
    ]);
  }
  function updateFeature(id: string, patch: Partial<CustomFeature>) {
    setFeatures(features.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function removeFeature(id: string) {
    setFeatures(features.filter((f) => f.id !== id));
  }
  function saveFeatures() {
    const bad = features.find((f) => !f.title.trim() || !f.url.trim());
    if (bad) {
      onError('Every custom feature needs a title and a URL.');
      return;
    }
    void saveWhole({ ...value, customFeatures: features }, 'Custom features saved — live on next app open.');
  }

  // ── Reveal flags ───────────────────────────────────────────────────────────
  const [newFlagKey, setNewFlagKey] = useState('');
  function setFlags(next: Record<string, boolean>) {
    onChange({ ...value, featureFlags: next });
  }
  function addFlag() {
    const key = newFlagKey.trim();
    if (!key) return;
    setFlags({ ...flags, [key]: flags[key] ?? false });
    setNewFlagKey('');
  }
  function saveFlags() {
    void saveWhole({ ...value, featureFlags: flags }, 'Reveal flags saved — live on next app open.');
  }

  return (
    <>
      {/* ── Home layout composer ── */}
      <section className="mc-panel">
        <div className="mc-panel-head">
          <h2>Home layout</h2>
          <span className="mc-chip">{publishedCount} live block{publishedCount === 1 ? '' : 's'}</span>
        </div>
        <p className="mc-panel-sub">
          Compose the blocks users see at the top of the mobile home screen. Edits stay a draft
          until you Publish. {draftDirty ? 'Draft has unpublished changes.' : 'Draft matches what is live.'}
        </p>

        <div className="mc-form" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {HOME_BLOCK_TYPES.map((t) => (
            <button key={t.type} className="mc-button mc-button-ghost" title={t.hint} onClick={() => addBlock(t.type)}>
              <Plus size={14} /> {t.label}
            </button>
          ))}
        </div>

        <div className="mc-form" style={{ marginTop: 12 }}>
          {layout.draft.length === 0 && (
            <p className="mc-panel-sub">No blocks yet — add one above. An empty layout means the app shows its built-in home.</p>
          )}
          {layout.draft.map((block, index) => (
            <div key={block.id} className="mc-block">
              <div className="mc-block-head">
                <strong>{HOME_BLOCK_TYPES.find((t) => t.type === block.type)?.label ?? block.type}</strong>
                <div className="mc-block-actions">
                  <button className="mc-icon" title="Move up" disabled={index === 0} onClick={() => move(block.id, -1)}><ArrowUp size={14} /></button>
                  <button className="mc-icon" title="Move down" disabled={index === layout.draft.length - 1} onClick={() => move(block.id, 1)}><ArrowDown size={14} /></button>
                  <button className="mc-icon" title={block.enabled ? 'Enabled' : 'Disabled'} onClick={() => updateBlock(block.id, { enabled: !block.enabled })}>
                    {block.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button className="mc-icon danger" title="Remove" onClick={() => removeBlock(block.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <BlockPropsEditor block={block} features={features} onProp={(k, v) => setProp(block.id, k, v)} />
            </div>
          ))}
        </div>

        <div className="mc-form" style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <button className="mc-button" onClick={saveDraft} disabled={saving}><Save size={14} /> Save draft</button>
          <button className="mc-button" onClick={publish} disabled={saving}><Rocket size={14} /> Publish</button>
          <button className="mc-button mc-button-ghost" onClick={rollback} disabled={saving || (!layout.lastPublished.length && !layout.published.length)}><RotateCcw size={14} /> Rollback</button>
        </div>
      </section>

      {/* ── Custom features ── */}
      <section className="mc-panel">
        <div className="mc-panel-head">
          <h2>Custom features</h2>
          <button className="mc-button mc-button-ghost" onClick={addFeature}><Plus size={14} /> Add feature</button>
        </div>
        <p className="mc-panel-sub">
          Add a whole new feature that opens a web page inside the app — no store release needed.
          Point it at any URL (e.g. a page on edutu.org).
        </p>
        <div className="mc-form">
          {features.length === 0 && <p className="mc-panel-sub">No custom features yet.</p>}
          {features.map((f) => (
            <div key={f.id} className="mc-block">
              <div className="mc-block-head">
                <strong>{f.title || 'Untitled feature'}</strong>
                <div className="mc-block-actions">
                  <button className="mc-icon" title={f.enabled ? 'Enabled' : 'Disabled'} onClick={() => updateFeature(f.id, { enabled: !f.enabled })}>
                    {f.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button className="mc-icon danger" title="Remove" onClick={() => removeFeature(f.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <label className="mc-field"><span>Title</span>
                <input value={f.title} onChange={(e) => updateFeature(f.id, { title: e.target.value })} placeholder="Community" />
              </label>
              <label className="mc-field"><span>Subtitle</span>
                <input value={f.subtitle} onChange={(e) => updateFeature(f.id, { subtitle: e.target.value })} placeholder="Optional short description" />
              </label>
              <label className="mc-field"><span>URL</span>
                <input value={f.url} onChange={(e) => updateFeature(f.id, { url: e.target.value })} placeholder="https://edutu.org/community" />
              </label>
              <label className="mc-field"><span>Icon (emoji or name)</span>
                <input value={f.icon} onChange={(e) => updateFeature(f.id, { icon: e.target.value })} placeholder="Optional" />
              </label>
              <div className="mc-form" style={{ flexDirection: 'row', gap: 8 }}>
                <label className="mc-field" style={{ flex: 1 }}><span>Opens in</span>
                  <select value={f.openMode} onChange={(e) => updateFeature(f.id, { openMode: e.target.value as CustomFeatureOpenMode })}>
                    <option value="webview">In-app</option>
                    <option value="external">System browser</option>
                  </select>
                </label>
                <label className="mc-field" style={{ flex: 1 }}><span>Shows in</span>
                  <select value={f.placement} onChange={(e) => updateFeature(f.id, { placement: e.target.value as CustomFeaturePlacement })}>
                    <option value="tools">Tools</option>
                    <option value="home">Home</option>
                    <option value="both">Both</option>
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="mc-form" style={{ marginTop: 8 }}>
          <button className="mc-button" onClick={saveFeatures} disabled={saving}><Save size={14} /> Save features</button>
        </div>
      </section>

      {/* ── Reveal flags ── */}
      <section className="mc-panel">
        <div className="mc-panel-head"><h2>Reveal flags</h2></div>
        <p className="mc-panel-sub">
          Simple on/off switches for features shipped “dark”. Flip one on to reveal that feature to
          everyone on next app open — no store release.
        </p>
        <div className="mc-form">
          {Object.keys(flags).length === 0 && <p className="mc-panel-sub">No flags yet.</p>}
          {Object.entries(flags).map(([key, on]) => (
            <div key={key} className="mc-flag-row">
              <code>{key}</code>
              <div className="mc-block-actions">
                <button className="mc-icon" title={on ? 'On' : 'Off'} onClick={() => setFlags({ ...flags, [key]: !on })}>
                  {on ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button className="mc-icon danger" title="Remove" onClick={() => {
                  const next = { ...flags };
                  delete next[key];
                  setFlags(next);
                }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="mc-form" style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <input value={newFlagKey} onChange={(e) => setNewFlagKey(e.target.value)} placeholder="new_feature_key" />
          <button className="mc-button mc-button-ghost" onClick={addFlag}><Plus size={14} /> Add</button>
          <button className="mc-button" onClick={saveFlags} disabled={saving}><Save size={14} /> Save flags</button>
        </div>
      </section>

      <style>{panelStyles}</style>
    </>
  );
}

function BlockPropsEditor({
  block,
  features,
  onProp,
}: {
  block: HomeBlock;
  features: CustomFeature[];
  onProp: (key: string, value: unknown) => void;
}) {
  const p = block.props as Record<string, string | undefined>;
  const text = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');

  switch (block.type) {
    case 'announcement':
      return (
        <>
          <Field label="Title" value={text('title')} onChange={(v) => onProp('title', v)} />
          <Field label="Body" value={text('body')} onChange={(v) => onProp('body', v)} textarea />
          <Field label="Button label" value={text('ctaLabel')} onChange={(v) => onProp('ctaLabel', v)} />
          <Field label="Button link (URL or /route)" value={text('ctaUrl')} onChange={(v) => onProp('ctaUrl', v)} />
          <Field label="Accent color (hex)" value={text('accentColor')} onChange={(v) => onProp('accentColor', v)} placeholder="#6366F1" />
        </>
      );
    case 'promo_banner':
      return (
        <>
          <Field label="Image URL" value={text('imageUrl')} onChange={(v) => onProp('imageUrl', v)} />
          <Field label="Link (URL or /route)" value={text('linkUrl')} onChange={(v) => onProp('linkUrl', v)} />
          <Field label="Overlay title" value={text('title')} onChange={(v) => onProp('title', v)} />
        </>
      );
    case 'info_card':
      return (
        <>
          <Field label="Title" value={text('title')} onChange={(v) => onProp('title', v)} />
          <Field label="Body" value={text('body')} onChange={(v) => onProp('body', v)} textarea />
          <Field label="Button label" value={text('ctaLabel')} onChange={(v) => onProp('ctaLabel', v)} />
          <Field label="Button link (URL or /route)" value={text('ctaUrl')} onChange={(v) => onProp('ctaUrl', v)} />
        </>
      );
    case 'curated_rail':
      return (
        <>
          <Field label="Rail title" value={text('title')} onChange={(v) => onProp('title', v)} />
          <Field
            label="Opportunity IDs (comma-separated)"
            value={Array.isArray(block.props.opportunityIds) ? (block.props.opportunityIds as string[]).join(', ') : ''}
            onChange={(v) => onProp('opportunityIds', v.split(',').map((s) => s.trim()).filter(Boolean))}
            textarea
          />
        </>
      );
    case 'web_feature':
      return (
        <label className="mc-field"><span>Feature</span>
          <select value={text('featureId')} onChange={(e) => onProp('featureId', e.target.value)}>
            <option value="">Select a custom feature…</option>
            {features.map((f) => (
              <option key={f.id} value={f.id}>{f.title || f.id}</option>
            ))}
          </select>
        </label>
      );
    default:
      return <p className="mc-panel-sub">This block type has no editable fields here.</p>;
  }
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="mc-field">
      <span>{label}</span>
      {textarea ? (
        <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={2} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

const panelStyles = `
.mc-block { border: 1px solid var(--mc-border, #e2e8f0); border-radius: 12px; padding: 12px; margin-bottom: 12px; background: var(--mc-block-bg, rgba(0,0,0,0.02)); }
.mc-block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.mc-block-actions { display: flex; gap: 6px; }
.mc-icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--mc-border, #e2e8f0); background: transparent; cursor: pointer; }
.mc-icon:disabled { opacity: 0.4; cursor: not-allowed; }
.mc-icon.danger { color: #dc2626; }
.mc-flag-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--mc-border, #e2e8f0); }
.mc-pill { font-size: 12px; padding: 2px 10px; border-radius: 999px; background: rgba(99,102,241,0.12); color: #4f46e5; }
`;
