import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Flag,
  Loader2,
  Megaphone,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  mobileControlApi,
  type MobileCampaign,
  type MobileFeatureFlag,
  type WidgetFeed,
} from '../lib/mobileControlApi';

type Tab = 'campaigns' | 'flags' | 'widgets';

const campaignTemplate: MobileCampaign = {
  key: '',
  title: '',
  body: '',
  campaign_type: 'popup',
  placement: 'global',
  status: 'draft',
  priority: 0,
  audience: {},
  creative: { ctaLabel: 'Open', ctaRoute: '/opportunities' },
  frequency: { mode: 'once' },
};

const flagTemplate: MobileFeatureFlag = {
  key: '',
  label: '',
  description: '',
  enabled: false,
  default_value: false,
  rollout: { percent: 100 },
  requires_pro: false,
  sort_order: 0,
};

const widgetTemplate: WidgetFeed = {
  key: '',
  title: '',
  feed_type: 'opportunities',
  placement: 'home',
  status: 'draft',
  priority: 0,
  items: [],
  audience: {},
};

const TAB_META: Record<Tab, { label: string; hint: string }> = {
  campaigns: {
    label: 'Messages',
    hint: 'Popups, banners, and announcements shown inside the app.',
  },
  flags: {
    label: 'Feature Switches',
    hint: 'Turn app features on or off remotely, with optional gradual rollout.',
  },
  widgets: {
    label: 'Widget Feeds',
    hint: 'Content for home-screen and lock-screen widgets.',
  },
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/* JSON editor that surfaces invalid input instead of silently reverting */
function JsonField({
  label,
  hint,
  value,
  onChange,
  onValidity,
}: {
  label: string;
  hint?: string;
  value: unknown;
  onChange: (value: unknown) => void;
  onValidity?: (valid: boolean) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    // Only re-sync from the outside when the parsed value actually changed
    // (e.g. an item was loaded for editing), so typing isn't interrupted.
    try {
      if (JSON.stringify(JSON.parse(text)) === JSON.stringify(value)) return;
    } catch { /* fall through and resync */ }
    setText(JSON.stringify(value, null, 2));
    setInvalid(false);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <label className="mc-field mc-field-wide">
      <span className="mc-label-row">
        {label}
        {invalid && <em className="mc-invalid"><AlertTriangle size={12} /> Invalid JSON — fix before saving</em>}
      </span>
      <textarea
        className={invalid ? 'mc-textarea-invalid' : ''}
        value={text}
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          try {
            const parsed = next.trim() ? JSON.parse(next) : {};
            setInvalid(false);
            onValidity?.(true);
            onChange(parsed);
          } catch {
            setInvalid(true);
            onValidity?.(false);
          }
        }}
        rows={5}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function MobileControl() {
  const [activeTab, setActiveTab] = useState<Tab>('campaigns');
  const [campaigns, setCampaigns] = useState<MobileCampaign[]>([]);
  const [flags, setFlags] = useState<MobileFeatureFlag[]>([]);
  const [widgets, setWidgets] = useState<WidgetFeed[]>([]);
  const [campaignDraft, setCampaignDraft] = useState<MobileCampaign>(campaignTemplate);
  const [flagDraft, setFlagDraft] = useState<MobileFeatureFlag>(flagTemplate);
  const [widgetDraft, setWidgetDraft] = useState<WidgetFeed>(widgetTemplate);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jsonValid, setJsonValid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const stats = useMemo(() => ({
    activeCampaigns: campaigns.filter((item) => item.status === 'active').length,
    enabledFlags: flags.filter((item) => item.enabled).length,
    activeWidgets: widgets.filter((item) => item.status === 'active').length,
  }), [campaigns, flags, widgets]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [nextCampaigns, nextFlags, nextWidgets] = await Promise.all([
        mobileControlApi.list<MobileCampaign>('campaigns'),
        mobileControlApi.list<MobileFeatureFlag>('feature-flags'),
        mobileControlApi.list<WidgetFeed>('widget-feeds'),
      ]);
      setCampaigns(nextCampaigns);
      setFlags(nextFlags);
      setWidgets(nextWidgets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load app content');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function persist<T extends { id?: string }>(
    resource: 'campaigns' | 'feature-flags' | 'widget-feeds',
    draft: T,
    apply: (saved: T) => void,
    reset: () => void,
    what: string,
  ) {
    setSaving(true);
    setError(null);
    try {
      const saved = draft.id
        ? await mobileControlApi.update<T>(resource, draft)
        : await mobileControlApi.create<T>(resource, draft);
      apply(saved);
      reset();
      setNotice(`${what} ${draft.id ? 'updated' : 'created'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not save ${what.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  }

  const saveCampaign = () => persist('campaigns', campaignDraft,
    (saved) => setCampaigns((items) => upsert(items, saved)),
    () => setCampaignDraft(campaignTemplate), 'Message');

  const saveFlag = () => persist('feature-flags', flagDraft,
    (saved) => setFlags((items) => upsert(items, saved)),
    () => setFlagDraft(flagTemplate), 'Feature switch');

  const saveWidget = () => persist('widget-feeds', widgetDraft,
    (saved) => setWidgets((items) => upsert(items, saved)),
    () => setWidgetDraft(widgetTemplate), 'Widget feed');

  async function remove(tab: Tab, item: { id?: string; title?: string; label?: string; key: string }) {
    if (!item.id) return;
    const name = item.title || item.label || item.key;
    if (!window.confirm(`Delete "${name}"? Users will stop seeing it immediately.`)) return;
    const resource = tab === 'campaigns' ? 'campaigns' : tab === 'flags' ? 'feature-flags' : 'widget-feeds';
    setError(null);
    try {
      await mobileControlApi.remove(resource, item.id);
      if (tab === 'campaigns') setCampaigns((items) => items.filter((c) => c.id !== item.id));
      if (tab === 'flags') setFlags((items) => items.filter((f) => f.id !== item.id));
      if (tab === 'widgets') setWidgets((items) => items.filter((w) => w.id !== item.id));
      setNotice(`"${name}" deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function toggleCampaignStatus(item: MobileCampaign) {
    const next: MobileCampaign = { ...item, status: item.status === 'active' ? 'paused' : 'active' };
    try {
      const saved = await mobileControlApi.update<MobileCampaign>('campaigns', next);
      setCampaigns((items) => upsert(items, saved));
      setNotice(saved.status === 'active' ? 'Message is now live.' : 'Message paused.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change status');
    }
  }

  async function toggleWidgetStatus(item: WidgetFeed) {
    const next: WidgetFeed = { ...item, status: item.status === 'active' ? 'paused' : 'active' };
    try {
      const saved = await mobileControlApi.update<WidgetFeed>('widget-feeds', next);
      setWidgets((items) => upsert(items, saved));
      setNotice(saved.status === 'active' ? 'Widget feed is now live.' : 'Widget feed paused.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change status');
    }
  }

  async function toggleFlag(item: MobileFeatureFlag) {
    const next: MobileFeatureFlag = { ...item, enabled: !item.enabled };
    try {
      const saved = await mobileControlApi.update<MobileFeatureFlag>('feature-flags', next);
      setFlags((items) => upsert(items, saved));
      setNotice(saved.enabled ? `"${saved.label}" enabled.` : `"${saved.label}" disabled.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change flag');
    }
  }

  return (
    <div className="mc-page">
      <header className="mc-header">
        <div>
          <h1>App Content</h1>
          <p>
            Publish in-app messages, switch features on or off, and update widget feeds —
            changes reach the mobile app instantly, no app-store release needed.
          </p>
        </div>
        <button className="mc-button mc-button-secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </header>

      <nav className="mc-tabs" aria-label="App content sections">
        <TabButton icon={<Megaphone size={16} />} active={activeTab === 'campaigns'} onClick={() => setActiveTab('campaigns')} label={TAB_META.campaigns.label} count={stats.activeCampaigns} total={campaigns.length} />
        <TabButton icon={<Flag size={16} />} active={activeTab === 'flags'} onClick={() => setActiveTab('flags')} label={TAB_META.flags.label} count={stats.enabledFlags} total={flags.length} />
        <TabButton icon={<Bell size={16} />} active={activeTab === 'widgets'} onClick={() => setActiveTab('widgets')} label={TAB_META.widgets.label} count={stats.activeWidgets} total={widgets.length} />
      </nav>
      <p className="mc-tab-hint">{TAB_META[activeTab].hint}</p>

      {error && <div className="mc-alert" role="alert"><AlertTriangle size={16} /> {error}</div>}
      {notice && <div className="mc-notice" role="status"><CheckCircle2 size={16} /> {notice}</div>}

      {loading ? (
        <div className="mc-grid" aria-hidden>
          <div className="mc-panel"><div className="mc-skeleton" /><div className="mc-skeleton" /><div className="mc-skeleton short" /></div>
          <div className="mc-panel"><div className="mc-skeleton" /><div className="mc-skeleton" /><div className="mc-skeleton short" /></div>
        </div>
      ) : (
        <div className="mc-grid">
          {activeTab === 'campaigns' && (
            <>
              <CampaignForm value={campaignDraft} onChange={setCampaignDraft} onSave={saveCampaign} onCancel={() => setCampaignDraft(campaignTemplate)} saving={saving} onValidity={setJsonValid} jsonValid={jsonValid} />
              <ItemList
                title="Published & draft messages"
                items={campaigns}
                emptyText="No messages yet. Create one on the left — start it as a draft, then set it to “active” when it should appear in the app."
                editingId={campaignDraft.id}
                onEdit={setCampaignDraft}
                onRemove={(item) => void remove('campaigns', item)}
                onToggle={(item) => void toggleCampaignStatus(item)}
                renderMeta={(item) => `${item.campaign_type} · shows on ${item.placement === 'global' ? 'every screen' : item.placement}`}
              />
            </>
          )}
          {activeTab === 'flags' && (
            <>
              <FlagForm value={flagDraft} onChange={setFlagDraft} onSave={saveFlag} onCancel={() => setFlagDraft(flagTemplate)} saving={saving} onValidity={setJsonValid} jsonValid={jsonValid} />
              <FlagList items={flags} editingId={flagDraft.id} onEdit={setFlagDraft} onToggle={(item) => void toggleFlag(item)} onRemove={(item) => void remove('flags', item)} />
            </>
          )}
          {activeTab === 'widgets' && (
            <>
              <WidgetForm value={widgetDraft} onChange={setWidgetDraft} onSave={saveWidget} onCancel={() => setWidgetDraft(widgetTemplate)} saving={saving} onValidity={setJsonValid} jsonValid={jsonValid} />
              <ItemList
                title="Widget feeds"
                items={widgets}
                emptyText="No widget feeds yet. Feeds power the home-screen and lock-screen widgets on users’ phones."
                editingId={widgetDraft.id}
                onEdit={setWidgetDraft}
                onRemove={(item) => void remove('widgets', item)}
                onToggle={(item) => void toggleWidgetStatus(item)}
                renderMeta={(item) => `${item.feed_type.replace('_', ' ')} · ${item.placement.replace('_', ' ')}`}
              />
            </>
          )}
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}

function upsert<T extends { id?: string }>(items: T[], item: T): T[] {
  return item.id && items.some((existing) => existing.id === item.id)
    ? items.map((existing) => existing.id === item.id ? item : existing)
    : [item, ...items];
}

function TabButton({ icon, label, count, total, active, onClick }: {
  icon: React.ReactNode; label: string; count: number; total: number; active: boolean; onClick: () => void;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick} aria-pressed={active}>
      {icon} {label}
      <span className="mc-tab-count" title={`${count} live of ${total}`}>{count}/{total}</span>
    </button>
  );
}

function FormShell({ title, editing, children, onSave, onCancel, saving, canSave, saveLabel }: {
  title: string; editing: boolean; children: React.ReactNode;
  onSave: () => void; onCancel: () => void; saving: boolean; canSave: boolean; saveLabel: string;
}) {
  return (
    <section className="mc-panel">
      <div className="mc-panel-head">
        <h2>{title}</h2>
        {editing && (
          <button className="mc-button mc-button-ghost" onClick={onCancel}>
            <X size={14} /> Cancel edit
          </button>
        )}
      </div>
      <div className="mc-form">{children}</div>
      <button className="mc-button" onClick={onSave} disabled={saving || !canSave}>
        {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} {saveLabel}
      </button>
    </section>
  );
}

function Advanced({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mc-advanced mc-field-wide">
      <button type="button" className="mc-advanced-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronDown size={14} className={open ? 'open' : ''} /> Advanced settings
      </button>
      {open && <div className="mc-form mc-advanced-body">{children}</div>}
    </div>
  );
}

function CampaignForm({ value, onChange, onSave, onCancel, saving, onValidity, jsonValid }: {
  value: MobileCampaign; onChange: (value: MobileCampaign) => void;
  onSave: () => void; onCancel: () => void; saving: boolean;
  onValidity: (valid: boolean) => void; jsonValid: boolean;
}) {
  const creative = value.creative || {};
  const setCreative = (patch: Record<string, unknown>) => onChange({ ...value, creative: { ...creative, ...patch } });
  return (
    <FormShell
      title={value.id ? 'Edit message' : 'New message'}
      editing={Boolean(value.id)}
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
      canSave={Boolean(value.key && value.title) && jsonValid}
      saveLabel={value.id ? 'Save changes' : 'Create message'}
    >
      <TextField
        label="Title" placeholder="e.g. New scholarships this week"
        value={value.title}
        onChange={(title) => onChange({ ...value, title, key: value.id || value.key ? value.key : slugify(title) })}
      />
      <TextField label="Key" hint="Unique ID, auto-filled from the title." placeholder="new_scholarships_week" value={value.key} onChange={(key) => onChange({ ...value, key: slugify(key) })} />
      <TextField label="Body" placeholder="Short message users will read" value={value.body || ''} onChange={(body) => onChange({ ...value, body })} wide />
      <SelectField label="Format" value={value.campaign_type} options={['popup', 'banner', 'notification', 'interstitial', 'announcement']} onChange={(campaign_type) => onChange({ ...value, campaign_type: campaign_type as MobileCampaign['campaign_type'] })} />
      <SelectField label="Shows on" value={value.placement} options={['global', 'home', 'opportunities', 'goals', 'notifications']} onChange={(placement) => onChange({ ...value, placement: placement as MobileCampaign['placement'] })} />
      <SelectField label="Status" hint="Only “active” is visible to users." value={value.status} options={['draft', 'scheduled', 'active', 'paused', 'archived']} onChange={(status) => onChange({ ...value, status: status as MobileCampaign['status'] })} />
      <NumberField label="Priority" hint="Higher shows first." value={value.priority} onChange={(priority) => onChange({ ...value, priority })} />
      <TextField label="Button label" placeholder="Open" value={String(creative.ctaLabel ?? '')} onChange={(ctaLabel) => setCreative({ ctaLabel })} />
      <TextField label="Button opens" placeholder="/opportunities" value={String(creative.ctaRoute ?? '')} onChange={(ctaRoute) => setCreative({ ctaRoute })} />
      <Advanced>
        <JsonField label="Creative JSON" hint="Full creative payload — the button fields above edit ctaLabel/ctaRoute here." value={value.creative} onChange={(creative) => onChange({ ...value, creative: creative as Record<string, unknown> })} onValidity={onValidity} />
        <JsonField label="Audience JSON" hint="Targeting rules; leave {} to show to everyone." value={value.audience} onChange={(audience) => onChange({ ...value, audience: audience as Record<string, unknown> })} onValidity={onValidity} />
        <JsonField label="Frequency JSON" hint='How often users see it, e.g. {"mode":"once"}.' value={value.frequency} onChange={(frequency) => onChange({ ...value, frequency: frequency as Record<string, unknown> })} onValidity={onValidity} />
      </Advanced>
    </FormShell>
  );
}

function FlagForm({ value, onChange, onSave, onCancel, saving, onValidity, jsonValid }: {
  value: MobileFeatureFlag; onChange: (value: MobileFeatureFlag) => void;
  onSave: () => void; onCancel: () => void; saving: boolean;
  onValidity: (valid: boolean) => void; jsonValid: boolean;
}) {
  return (
    <FormShell
      title={value.id ? 'Edit feature switch' : 'New feature switch'}
      editing={Boolean(value.id)}
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
      canSave={Boolean(value.key && value.label) && jsonValid}
      saveLabel={value.id ? 'Save changes' : 'Create switch'}
    >
      <TextField
        label="Name" placeholder="e.g. Voice mode"
        value={value.label}
        onChange={(label) => onChange({ ...value, label, key: value.id || value.key ? value.key : slugify(label) })}
      />
      <TextField label="Key" hint="Unique ID the app reads." placeholder="voice_mode" value={value.key} onChange={(key) => onChange({ ...value, key: slugify(key) })} />
      <TextField label="Description" placeholder="What does this switch control?" value={value.description || ''} onChange={(description) => onChange({ ...value, description })} wide />
      <NumberField label="Sort order" value={value.sort_order} onChange={(sort_order) => onChange({ ...value, sort_order })} />
      <div className="mc-field">
        <span>Options</span>
        <label className="mc-check"><input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /> Enabled (live in the app)</label>
        <label className="mc-check"><input type="checkbox" checked={value.requires_pro} onChange={(event) => onChange({ ...value, requires_pro: event.target.checked })} /> Pro users only</label>
      </div>
      <Advanced>
        <JsonField label="Default value JSON" hint="Value the app uses when the switch is off." value={value.default_value} onChange={(default_value) => onChange({ ...value, default_value })} onValidity={onValidity} />
        <JsonField label="Rollout JSON" hint='Gradual rollout, e.g. {"percent":25} for 25% of users.' value={value.rollout} onChange={(rollout) => onChange({ ...value, rollout: rollout as Record<string, unknown> })} onValidity={onValidity} />
      </Advanced>
    </FormShell>
  );
}

function WidgetForm({ value, onChange, onSave, onCancel, saving, onValidity, jsonValid }: {
  value: WidgetFeed; onChange: (value: WidgetFeed) => void;
  onSave: () => void; onCancel: () => void; saving: boolean;
  onValidity: (valid: boolean) => void; jsonValid: boolean;
}) {
  return (
    <FormShell
      title={value.id ? 'Edit widget feed' : 'New widget feed'}
      editing={Boolean(value.id)}
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
      canSave={Boolean(value.key && value.title) && jsonValid}
      saveLabel={value.id ? 'Save changes' : 'Create feed'}
    >
      <TextField
        label="Title" placeholder="e.g. Top matches"
        value={value.title}
        onChange={(title) => onChange({ ...value, title, key: value.id || value.key ? value.key : slugify(title) })}
      />
      <TextField label="Key" hint="Unique ID the widget reads." placeholder="top_matches" value={value.key} onChange={(key) => onChange({ ...value, key: slugify(key) })} />
      <SelectField label="Feed type" value={value.feed_type} options={['opportunities', 'saved', 'sponsored', 'quick_actions']} onChange={(feed_type) => onChange({ ...value, feed_type: feed_type as WidgetFeed['feed_type'] })} />
      <SelectField label="Widget location" value={value.placement} options={['home', 'lock_screen', 'android_home']} onChange={(placement) => onChange({ ...value, placement: placement as WidgetFeed['placement'] })} />
      <SelectField label="Status" hint="Only “active” feeds reach widgets." value={value.status} options={['draft', 'active', 'paused', 'archived']} onChange={(status) => onChange({ ...value, status: status as WidgetFeed['status'] })} />
      <NumberField label="Priority" hint="Higher shows first." value={value.priority} onChange={(priority) => onChange({ ...value, priority })} />
      <Advanced>
        <JsonField label="Items JSON" hint="Array of feed items the widget renders." value={value.items} onChange={(items) => onChange({ ...value, items: Array.isArray(items) ? items as Array<Record<string, unknown>> : [] })} onValidity={onValidity} />
        <JsonField label="Audience JSON" hint="Targeting rules; leave {} for everyone." value={value.audience} onChange={(audience) => onChange({ ...value, audience: audience as Record<string, unknown> })} onValidity={onValidity} />
      </Advanced>
    </FormShell>
  );
}

function TextField({ label, hint, placeholder, value, onChange, wide }: { label: string; hint?: string; placeholder?: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
  return (
    <label className={`mc-field ${wide ? 'mc-field-wide' : ''}`}>
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function NumberField({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="mc-field">
      <span>{label}</span>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function SelectField({ label, hint, value, options, onChange }: { label: string; hint?: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="mc-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function FlagList({ items, editingId, onEdit, onToggle, onRemove }: {
  items: MobileFeatureFlag[]; editingId?: string;
  onEdit: (item: MobileFeatureFlag) => void;
  onToggle: (item: MobileFeatureFlag) => void;
  onRemove: (item: MobileFeatureFlag) => void;
}) {
  return (
    <section className="mc-panel">
      <div className="mc-panel-head"><h2>Feature switches</h2></div>
      <div className="mc-list">
        {items.length === 0 && (
          <div className="mc-empty">
            No feature switches yet. Create one on the left — the app reads them on launch,
            so you can enable or disable features without a new release.
          </div>
        )}
        {items.map((item) => (
          <article key={item.id || item.key} className={`mc-row ${editingId && editingId === item.id ? 'editing' : ''}`}>
            <button
              type="button"
              role="switch"
              aria-checked={item.enabled}
              aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.label}`}
              className={`mc-switch ${item.enabled ? 'on' : ''}`}
              onClick={() => onToggle(item)}
            >
              <span className="mc-switch-thumb" />
            </button>
            <div className="mc-row-main">
              <strong>{item.label}</strong>
              <span>
                {item.key}
                {item.requires_pro ? ' · Pro only' : ''}
                {item.description ? ` — ${item.description}` : ''}
              </span>
            </div>
            <button className="mc-icon" onClick={() => onEdit(item)} title="Edit" aria-label={`Edit ${item.label}`}><Pencil size={15} /></button>
            <button className="mc-icon mc-icon-danger" onClick={() => onRemove(item)} title="Delete" aria-label={`Delete ${item.label}`}><Trash2 size={15} /></button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ItemList<T extends { id?: string; title?: string; key: string; status?: string }>({
  title,
  items,
  emptyText,
  editingId,
  onEdit,
  onRemove,
  onToggle,
  renderMeta,
}: {
  title: string;
  items: T[];
  emptyText: string;
  editingId?: string;
  onEdit: (item: T) => void;
  onRemove: (item: T) => void;
  onToggle: (item: T) => void;
  renderMeta: (item: T) => string;
}) {
  return (
    <section className="mc-panel">
      <div className="mc-panel-head"><h2>{title}</h2></div>
      <div className="mc-list">
        {items.length === 0 && <div className="mc-empty">{emptyText}</div>}
        {items.map((item) => {
          const status = item.status || 'draft';
          const canToggle = status === 'active' || status === 'paused' || status === 'draft';
          return (
            <article key={item.id || item.key} className={`mc-row ${editingId && editingId === item.id ? 'editing' : ''}`}>
              <div className="mc-row-main">
                <strong>{item.title || item.key}</strong>
                <span>{item.key} · {renderMeta(item)}</span>
              </div>
              <span className={`mc-status status-${status}`}>{status === 'active' ? 'live' : status}</span>
              {canToggle && (
                <button
                  className="mc-icon"
                  onClick={() => onToggle(item)}
                  title={status === 'active' ? 'Pause' : 'Set live'}
                  aria-label={`${status === 'active' ? 'Pause' : 'Set live'}: ${item.title || item.key}`}
                >
                  {status === 'active' ? <Pause size={15} /> : <Play size={15} />}
                </button>
              )}
              <button className="mc-icon" onClick={() => onEdit(item)} title="Edit" aria-label={`Edit ${item.title || item.key}`}><Pencil size={15} /></button>
              <button className="mc-icon mc-icon-danger" onClick={() => onRemove(item)} title="Delete" aria-label={`Delete ${item.title || item.key}`}><Trash2 size={15} /></button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const styles = `
.mc-page{padding:28px;color:var(--text-primary);max-width:1280px;margin:0 auto}
.mc-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}
.mc-header h1{margin:0;font-size:28px;font-weight:700;letter-spacing:-0.01em}
.mc-header p{margin:8px 0 0;color:var(--text-tertiary);max-width:62ch;font-size:15px;line-height:1.5}
.mc-button{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:8px;background:var(--accent);color:#fff;padding:10px 14px;font-weight:600;font-size:14px;cursor:pointer;transition:background var(--transition-fast)}
.mc-button:hover:not(:disabled){background:var(--accent-hover)}
.mc-button:disabled{opacity:.45;cursor:not-allowed}
.mc-button-secondary{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-medium)}
.mc-button-secondary:hover:not(:disabled){background:var(--hover-bg)}
.mc-button-ghost{background:transparent;color:var(--text-tertiary);padding:6px 10px;font-size:13px}
.mc-button-ghost:hover:not(:disabled){background:transparent;color:var(--text-primary)}
.mc-tabs{display:flex;gap:8px;flex-wrap:wrap}
.mc-tabs button{display:flex;align-items:center;gap:8px;border:1px solid var(--border-medium);background:var(--bg-secondary);color:var(--text-primary);border-radius:8px;padding:9px 13px;font-size:14px;font-weight:500;cursor:pointer;transition:background var(--transition-fast),border-color var(--transition-fast)}
.mc-tabs button:hover{background:var(--hover-bg)}
.mc-tabs button.active{background:var(--accent);border-color:var(--accent);color:#fff}
.mc-tab-count{font-size:12px;font-weight:600;background:rgba(127,127,127,.16);border-radius:999px;padding:2px 8px}
.mc-tabs button.active .mc-tab-count{background:rgba(255,255,255,.22)}
.mc-tab-hint{margin:10px 0 18px;color:var(--text-tertiary);font-size:13.5px}
.mc-grid{display:grid;grid-template-columns:minmax(340px,460px) 1fr;gap:16px;align-items:start}
.mc-panel{background:var(--bg-secondary);border:1px solid var(--border-medium);border-radius:12px;padding:20px}
.mc-panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.mc-panel h2{margin:0;font-size:16px;font-weight:600}
.mc-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:16px}
.mc-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.mc-field>span{color:var(--text-secondary);font-size:13px;font-weight:600}
.mc-field small{color:var(--text-tertiary);font-size:12px;line-height:1.4}
.mc-field-wide{grid-column:1/-1}
.mc-field input,.mc-field select,.mc-field textarea{background:var(--bg-primary);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);padding:9px 11px;font-size:14px;min-width:0;font-family:inherit;transition:border-color var(--transition-fast)}
.mc-field input:focus,.mc-field select:focus,.mc-field textarea:focus{outline:none;border-color:var(--accent)}
.mc-field input::placeholder{color:var(--text-tertiary)}
.mc-field textarea{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px;resize:vertical;line-height:1.5}
.mc-textarea-invalid{border-color:var(--danger)!important}
.mc-label-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.mc-invalid{display:inline-flex;align-items:center;gap:4px;color:var(--danger);font-style:normal;font-size:12px;font-weight:500}
.mc-check{display:flex;align-items:center;gap:8px;color:var(--text-primary);font-size:14px;cursor:pointer}
.mc-check input{accent-color:var(--accent)}
.mc-advanced-toggle{display:inline-flex;align-items:center;gap:6px;background:transparent;border:0;color:var(--text-tertiary);font-size:13px;font-weight:600;cursor:pointer;padding:4px 0}
.mc-advanced-toggle:hover{color:var(--text-primary)}
.mc-advanced-toggle svg{transition:transform var(--transition-fast)}
.mc-advanced-toggle svg.open{transform:rotate(180deg)}
.mc-advanced-body{margin-top:12px;margin-bottom:0}
.mc-list{display:flex;flex-direction:column;gap:10px}
.mc-row{display:flex;align-items:center;gap:12px;border:1px solid var(--border-medium);border-radius:10px;padding:12px 14px;transition:border-color var(--transition-fast)}
.mc-row:hover{border-color:var(--accent)}
.mc-row.editing{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.mc-row-main{flex:1;min-width:0}
.mc-row-main strong{display:block;font-size:14.5px;font-weight:600}
.mc-row-main span{display:block;color:var(--text-tertiary);font-size:13px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-icon{display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid var(--border-medium);color:var(--text-secondary);border-radius:8px;width:32px;height:32px;cursor:pointer;flex-shrink:0;transition:background var(--transition-fast)}
.mc-icon:hover{background:var(--hover-bg)}
.mc-icon-danger{color:var(--danger)}
.mc-switch{position:relative;width:42px;height:25px;border-radius:999px;border:0;background:var(--border-medium);cursor:pointer;flex-shrink:0;transition:background var(--transition-base)}
.mc-switch.on{background:var(--success)}
.mc-switch-thumb{position:absolute;top:2.5px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform var(--transition-base)}
.mc-switch.on .mc-switch-thumb{transform:translateX(16px)}
.mc-status{border-radius:999px;padding:4px 10px;background:var(--hover-bg);color:var(--text-secondary);font-size:12px;font-weight:600;flex-shrink:0;text-transform:capitalize}
.status-active{background:rgba(52,199,89,.14);color:var(--success)}
.status-paused,.status-draft,.status-scheduled{background:rgba(255,149,0,.14);color:var(--warning)}
.mc-empty{color:var(--text-tertiary);padding:22px 6px;font-size:14px;line-height:1.55;max-width:52ch}
.mc-alert,.mc-notice{display:flex;align-items:center;gap:8px;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:14px}
.mc-alert{background:rgba(255,59,48,.1);border:1px solid rgba(255,59,48,.3);color:var(--danger)}
.mc-notice{background:rgba(52,199,89,.1);border:1px solid rgba(52,199,89,.3);color:var(--success)}
.mc-skeleton{height:44px;border-radius:8px;background:var(--hover-bg);margin-bottom:12px;animation:mc-pulse 1.4s ease-in-out infinite}
.mc-skeleton.short{width:55%}
@keyframes mc-pulse{0%,100%{opacity:.55}50%{opacity:1}}
.spin{animation:mc-spin 1s linear infinite}
@keyframes mc-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.spin,.mc-skeleton{animation:none}.mc-switch,.mc-switch-thumb,.mc-row{transition:none}}
@media (max-width:1024px){.mc-grid{grid-template-columns:1fr}.mc-header{flex-direction:column}}
@media (max-width:640px){.mc-page{padding:18px}.mc-form{grid-template-columns:1fr}}
`;
