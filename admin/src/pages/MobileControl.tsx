import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Pencil,
  Pin,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  appControlApi,
  DEFAULT_MOBILE_APP_SETTINGS,
  LOCKABLE_MODULES,
  mobileControlApi,
  type MobileAppSettings,
  type MobileCampaign,
  type MobileFeatureFlag,
  type ModuleAccess,
  type WidgetFeed,
} from '../lib/mobileControlApi';
import { ServerDrivenPanel } from '../components/ServerDrivenPanel';
import {
  OPPORTUNITY_PIPELINE_FLAG_DEFINITIONS,
  normalizeOpportunityPipelineFlags,
  type OpportunityPipelineFlagKey,
} from '../lib/opportunityPipelineFlags';

type Tab = 'campaigns' | 'flags' | 'widgets' | 'serverUi' | 'appControl';

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

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/* While an item is new, its ID keeps following the title until the admin edits it by hand. */
function keyFollowsTitle(item: { id?: string; key: string }, currentTitle: string) {
  return !item.id && (!item.key || item.key === slugify(currentTitle));
}

function friendlyError(message: string) {
  return /failed to fetch|networkerror|load failed|fetch failed/i.test(message)
    ? 'Couldn’t reach the backend — check that the API is running, then press Refresh.'
    : message;
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

  // Only re-sync from the outside when the parsed value actually changed
  // (e.g. an item was loaded for editing), so typing isn't interrupted.
  // Adjusting state during render is React's documented alternative to an
  // effect here (https://react.dev/learn/you-might-not-need-an-effect); it
  // also avoids committing the stale text for a frame before correcting it.
  const canonical = JSON.stringify(value);
  const [syncedCanonical, setSyncedCanonical] = useState(canonical);
  if (canonical !== syncedCanonical) {
    setSyncedCanonical(canonical);
    let alreadyShowing = false;
    try {
      alreadyShowing = JSON.stringify(JSON.parse(text)) === canonical;
    } catch { /* unparseable draft — resync */ }
    if (!alreadyShowing) {
      setText(JSON.stringify(value, null, 2));
      setInvalid(false);
    }
  }

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
  const location = useLocation();
  // The active section is driven entirely by the route (the sidebar submenu
  // owns switching now); default to Home Blocks for the base /app path.
  const activeTab: Tab = location.pathname.endsWith('/campaigns')
    ? 'campaigns'
    : location.pathname.endsWith('/flags')
      ? 'flags'
      : location.pathname.endsWith('/widgets')
        ? 'widgets'
        : location.pathname.endsWith('/control')
          ? 'appControl'
          : 'serverUi';
  const [campaigns, setCampaigns] = useState<MobileCampaign[]>([]);
  const [flags, setFlags] = useState<MobileFeatureFlag[]>([]);
  const [widgets, setWidgets] = useState<WidgetFeed[]>([]);
  const [campaignDraft, setCampaignDraft] = useState<MobileCampaign>(campaignTemplate);
  const [flagDraft, setFlagDraft] = useState<MobileFeatureFlag>(flagTemplate);
  const [widgetDraft, setWidgetDraft] = useState<WidgetFeed>(widgetTemplate);
  const [appControl, setAppControl] = useState<MobileAppSettings>(DEFAULT_MOBILE_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jsonValid, setJsonValid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [nextCampaigns, nextFlags, nextWidgets, nextAppControl] = await Promise.all([
        mobileControlApi.list<MobileCampaign>('campaigns'),
        mobileControlApi.list<MobileFeatureFlag>('feature-flags'),
        mobileControlApi.list<WidgetFeed>('widget-feeds'),
        appControlApi.getMobileApp().catch(() => DEFAULT_MOBILE_APP_SETTINGS),
      ]);
      setCampaigns(nextCampaigns);
      setFlags(nextFlags);
      setWidgets(nextWidgets);
      setAppControl(nextAppControl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load app content');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function persist<T extends { id?: string; status?: string }>(
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
      const asDraft = !draft.id && typeof saved.status === 'string' && saved.status !== 'active';
      setNotice(`${what} ${draft.id ? 'updated' : 'created'}${asDraft ? ' as a draft — flip it Live when ready' : ''}.`);
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

  async function setCampaignStatus(item: MobileCampaign, status: MobileCampaign['status']) {
    try {
      const saved = await mobileControlApi.update<MobileCampaign>('campaigns', { ...item, status });
      setCampaigns((items) => upsert(items, saved));
      setNotice(
        status === 'active' ? 'Message is now live.'
          : status === 'archived' ? 'Message archived — users no longer see it.'
            : 'Message taken off — saved as a draft.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change status');
    }
  }

  async function setWidgetStatus(item: WidgetFeed, status: WidgetFeed['status']) {
    try {
      const saved = await mobileControlApi.update<WidgetFeed>('widget-feeds', { ...item, status });
      setWidgets((items) => upsert(items, saved));
      setNotice(
        status === 'active' ? 'Widget feed is now live.'
          : status === 'archived' ? 'Widget feed archived — widgets no longer show it.'
            : 'Widget feed taken off — saved as a draft.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change status');
    }
  }

  async function toggleFlag(item: MobileFeatureFlag) {
    const next: MobileFeatureFlag = { ...item, enabled: !item.enabled };
    try {
      const saved = await mobileControlApi.update<MobileFeatureFlag>('feature-flags', next);
      setFlags((items) => upsert(items, saved));
      setNotice(saved.enabled ? `"${saved.label}" is now on.` : `"${saved.label}" is now off.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change switch');
    }
  }

  return (
    <div className="mc-page">
      <header className="mc-header">
        <div>
          <h1>App Content</h1>
          <p>
            Publish in-app messages and banner adverts, switch features on or off, and pull the
            emergency levers (force update, maintenance, feature locks) — changes reach the mobile
            app instantly, no app-store release needed.
          </p>
        </div>
        <button className="mc-button mc-button-secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </header>


      {error && (
        <div className="mc-alert" role="alert">
          <AlertTriangle size={16} />
          <span className="mc-alert-body">{friendlyError(error)}</span>
          <button className="mc-alert-dismiss" onClick={() => setError(null)} aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}
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
                title="Your messages"
                items={campaigns}
                emptyTitle="No messages yet"
                emptyText="Messages are the popups and banners users see inside the app. Create your first message with the form on the left — it stays a draft until you flip it Live."
                editingId={campaignDraft.id}
                onEdit={(item) => setCampaignDraft(item)}
                onRemove={(item) => void remove('campaigns', item)}
                onSetLive={(item, live) => void setCampaignStatus(item, live ? 'active' : 'draft')}
                onArchive={(item) => void setCampaignStatus(item, 'archived')}
                renderMeta={(item) => `${item.campaign_type} · shows on ${item.placement === 'global' ? 'every screen' : item.placement === 'community' ? 'Explore community hero' : item.placement}`}
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
                title="Your widget feeds"
                items={widgets}
                emptyTitle="No widget feeds yet"
                emptyText="Feeds decide what appears on the home-screen and lock-screen widgets on users’ phones. Create your first feed with the form on the left — it stays a draft until you flip it Live."
                editingId={widgetDraft.id}
                onEdit={(item) => setWidgetDraft(item)}
                onRemove={(item) => void remove('widgets', item)}
                onSetLive={(item, live) => void setWidgetStatus(item, live ? 'active' : 'draft')}
                onArchive={(item) => void setWidgetStatus(item, 'archived')}
                renderMeta={(item) => `${item.feed_type.replace('_', ' ')} · ${item.placement.replace('_', ' ')}`}
              />
            </>
          )}
          {activeTab === 'serverUi' && (
            <ServerDrivenPanel value={appControl} onChange={setAppControl} onNotice={setNotice} onError={setError} />
          )}
          {activeTab === 'appControl' && (
            <AppControlPanel value={appControl} onChange={setAppControl} onNotice={setNotice} onError={setError} />
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

/* Single per-form disclosure that hides everything JSON-shaped from everyday admins. */
function Advanced({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mc-advanced mc-field-wide">
      <button type="button" className="mc-advanced-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronDown size={14} className={open ? 'open' : ''} /> Advanced (JSON) <em>for developers</em>
      </button>
      {open && <div className="mc-form mc-advanced-body">{children}</div>}
    </div>
  );
}

/* The raw key, tucked behind a muted "ID: … (edit)" line instead of a co-equal input. */
function KeyField({ value, onChange, example }: { value: string; onChange: (value: string) => void; example: string }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div className="mc-key-line mc-field-wide">
        <span>ID: <code>{value || `auto-filled from the title, e.g. ${example}`}</code></span>
        <button type="button" onClick={() => setEditing(true)}>edit</button>
      </div>
    );
  }
  return (
    <label className="mc-field mc-field-wide">
      <span>ID</span>
      <input
        value={value}
        autoFocus
        placeholder={example}
        onChange={(event) => onChange(slugify(event.target.value))}
        onBlur={() => setEditing(false)}
      />
      <small>Unique ID the app reads — lowercase letters, numbers, and underscores. You rarely need to change it.</small>
    </label>
  );
}

/* Labeled toggle switch — the friendly replacement for status dropdowns and number inputs. */
function SwitchRow({ label, hint, on, onToggle }: {
  label: string; hint?: string; on: boolean; onToggle: () => void;
}) {
  return (
    <div className="mc-field">
      <div className="mc-switch-row">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          className={`mc-switch ${on ? 'on' : ''}`}
          onClick={onToggle}
        >
          <span className="mc-switch-thumb" />
        </button>
        <div className="mc-switch-text">
          <span>{label}</span>
          {hint && <small>{hint}</small>}
        </div>
      </div>
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
  const live = value.status === 'active';
  const pinned = value.priority > 0;
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
        label="Title" wide placeholder="e.g. New scholarships this week"
        value={value.title}
        onChange={(title) => onChange({ ...value, title, key: keyFollowsTitle(value, value.title) ? slugify(title) : value.key })}
      />
      <TextField label="Message" wide placeholder="e.g. 12 new scholarships match your profile — take a look." hint="One or two short sentences users will read." value={value.body || ''} onChange={(body) => onChange({ ...value, body })} />
      <SelectField label="Format" hint="Popup = card over the screen · banner = strip with an image." value={value.campaign_type} options={['popup', 'banner', 'notification', 'interstitial', 'announcement']} onChange={(campaign_type) => onChange({ ...value, campaign_type: campaign_type as MobileCampaign['campaign_type'] })} />
      <SelectField label="Shows on" hint="Which screen of the app displays it. Community banners rotate in the Explore hero card." value={value.placement} options={['global', 'home', 'opportunities', 'goals', 'notifications', 'community']} onChange={(placement) => onChange({ ...value, placement: placement as MobileCampaign['placement'] })} />
      <TextField label="Button label" placeholder="e.g. See them" hint="Text on the message’s button." value={String(creative.ctaLabel ?? '')} onChange={(ctaLabel) => setCreative({ ctaLabel })} />
      <TextField label="Button opens" placeholder="e.g. /opportunities" hint="App screen or link the button opens." value={String(creative.ctaRoute ?? '')} onChange={(ctaRoute) => setCreative({ ctaRoute })} />
      <TextField
        label="Advert image URL" wide
        hint="Optional. Shown as a thumbnail on banners and a header image on popups — use a hosted https:// image."
        placeholder="https://example.com/advert.png"
        value={String(creative.imageUrl ?? '')}
        onChange={(imageUrl) => setCreative({ imageUrl: imageUrl.trim() || undefined })}
      />
      {typeof creative.imageUrl === 'string' && /^https?:\/\//.test(creative.imageUrl) && (
        <div className="mc-field mc-field-wide">
          <span>Image preview</span>
          <img className="mc-img-preview" src={creative.imageUrl} alt="Campaign advert preview" />
        </div>
      )}
      <SwitchRow
        label="Live"
        hint={live ? 'Users can see this message.' : 'Off = saved as a draft, hidden from users.'}
        on={live}
        onToggle={() => onChange({ ...value, status: live ? 'draft' : 'active' })}
      />
      <SwitchRow
        label="Pin to top"
        hint="Show this before other messages."
        on={pinned}
        onToggle={() => onChange({ ...value, priority: pinned ? 0 : 100 })}
      />
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} example="new_scholarships_week" />
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
        label="Name" wide placeholder="e.g. Voice mode"
        value={value.label}
        onChange={(label) => onChange({ ...value, label, key: keyFollowsTitle(value, value.label) ? slugify(label) : value.key })}
      />
      <TextField label="Description" wide placeholder="e.g. Lets users talk to Edutu out loud." hint="A plain-language note about what this switch controls." value={value.description || ''} onChange={(description) => onChange({ ...value, description })} />
      <SwitchRow
        label="On"
        hint={value.enabled ? 'The feature is live in the app.' : 'Off = the feature is hidden in the app.'}
        on={value.enabled}
        onToggle={() => onChange({ ...value, enabled: !value.enabled })}
      />
      <SwitchRow
        label="Pro users only"
        hint="Only paying subscribers get this feature."
        on={value.requires_pro}
        onToggle={() => onChange({ ...value, requires_pro: !value.requires_pro })}
      />
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} example="voice_mode" />
      <Advanced>
        <JsonField label="Default value JSON" hint="Value the app uses when the switch is off." value={value.default_value} onChange={(default_value) => onChange({ ...value, default_value })} onValidity={onValidity} />
        <JsonField label="Rollout JSON" hint='Gradual rollout, e.g. {"percent":25} for 25% of users.' value={value.rollout} onChange={(rollout) => onChange({ ...value, rollout: rollout as Record<string, unknown> })} onValidity={onValidity} />
        <NumberField label="Sort order" hint="Where this switch sorts in the app’s internal list." value={value.sort_order} onChange={(sort_order) => onChange({ ...value, sort_order })} />
      </Advanced>
    </FormShell>
  );
}

function WidgetForm({ value, onChange, onSave, onCancel, saving, onValidity, jsonValid }: {
  value: WidgetFeed; onChange: (value: WidgetFeed) => void;
  onSave: () => void; onCancel: () => void; saving: boolean;
  onValidity: (valid: boolean) => void; jsonValid: boolean;
}) {
  const live = value.status === 'active';
  const pinned = value.priority > 0;
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
        label="Title" wide placeholder="e.g. Top matches"
        value={value.title}
        onChange={(title) => onChange({ ...value, title, key: keyFollowsTitle(value, value.title) ? slugify(title) : value.key })}
      />
      <SelectField label="Feed type" hint="What the widget shows — “opportunities” fills itself automatically." value={value.feed_type} options={['opportunities', 'saved', 'sponsored', 'quick_actions']} onChange={(feed_type) => onChange({ ...value, feed_type: feed_type as WidgetFeed['feed_type'] })} />
      <SelectField label="Widget location" hint="Which phone widget uses this feed." value={value.placement} options={['home', 'lock_screen', 'android_home']} onChange={(placement) => onChange({ ...value, placement: placement as WidgetFeed['placement'] })} />
      <SwitchRow
        label="Live"
        hint={live ? 'Widgets are showing this feed.' : 'Off = saved as a draft, widgets don’t show it.'}
        on={live}
        onToggle={() => onChange({ ...value, status: live ? 'draft' : 'active' })}
      />
      <SwitchRow
        label="Pin to top"
        hint="Show this feed before other feeds."
        on={pinned}
        onToggle={() => onChange({ ...value, priority: pinned ? 0 : 100 })}
      />
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} example="top_matches" />
      <Advanced>
        <JsonField label="Items JSON" hint="Array of feed items the widget renders." value={value.items} onChange={(items) => onChange({ ...value, items: Array.isArray(items) ? items as Array<Record<string, unknown>> : [] })} onValidity={onValidity} />
        <JsonField label="Audience JSON" hint="Targeting rules; leave {} for everyone." value={value.audience} onChange={(audience) => onChange({ ...value, audience: audience as Record<string, unknown> })} onValidity={onValidity} />
      </Advanced>
    </FormShell>
  );
}

const MIN_VERSION_PATTERN = /^\d+(\.\d+){0,3}$/;

/* Force update / maintenance / module locks — admin_settings.mobileApp. */
function AppControlPanel({ value, onChange, onNotice, onError }: {
  value: MobileAppSettings;
  onChange: (value: MobileAppSettings) => void;
  onNotice: (notice: string) => void;
  onError: (error: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(value));
  const dirty = JSON.stringify(value) !== savedSnapshot;

  const versionInvalid = !MIN_VERSION_PATTERN.test(value.forceUpdate.minVersion.trim());
  const forceUpdateIncomplete =
    !value.forceUpdate.title.trim() || !value.forceUpdate.message.trim() || versionInvalid;
  const maintenanceIncomplete = !value.maintenance.title.trim() || !value.maintenance.message.trim();
  const canSave = !forceUpdateIncomplete && !maintenanceIncomplete;

  const setForceUpdate = (patch: Partial<MobileAppSettings['forceUpdate']>) =>
    onChange({ ...value, forceUpdate: { ...value.forceUpdate, ...patch } });
  const setMaintenance = (patch: Partial<MobileAppSettings['maintenance']>) =>
    onChange({ ...value, maintenance: { ...value.maintenance, ...patch } });
  const setLock = (key: string, access: ModuleAccess) =>
    onChange({ ...value, moduleLocks: { ...value.moduleLocks, [key]: access } });
  const pipelineFlags = normalizeOpportunityPipelineFlags(value.featureFlags);
  const setPipelineFlag = (key: OpportunityPipelineFlagKey, enabled: boolean) =>
    onChange({
      ...value,
      featureFlags: {
        ...(value.featureFlags ?? {}),
        [key]: enabled,
      },
    });

  async function save() {
    if (value.forceUpdate.enabled || value.maintenance.enabled) {
      const gates = [
        value.forceUpdate.enabled && `force update (below v${value.forceUpdate.minVersion})`,
        value.maintenance.enabled && 'maintenance mode (blocks the whole app)',
      ].filter(Boolean).join(' and ');
      if (!window.confirm(`This will enable ${gates} for every user on next app launch. Continue?`)) return;
    }
    setSaving(true);
    onError(null);
    try {
      const saved = await appControlApi.saveMobileApp(value);
      onChange(saved);
      setSavedSnapshot(JSON.stringify(saved));
      onNotice('App control settings are live — the app picks them up on next launch.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save app control settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="mc-panel">
        <div className="mc-panel-head"><h2>Force update</h2>
          <GateSwitch on={value.forceUpdate.enabled} onToggle={() => setForceUpdate({ enabled: !value.forceUpdate.enabled })} label="force update" />
        </div>
        <p className="mc-panel-sub">
          Users on a version older than the minimum get a blocking screen that sends them to the
          store{value.forceUpdate.otaFirst ? ' (after trying an instant over-the-air update first)' : ''}.
        </p>
        <div className="mc-form">
          <label className="mc-field">
            <span className="mc-label-row">Minimum version {versionInvalid && <em className="mc-invalid"><AlertTriangle size={12} /> use e.g. 1.2.3</em>}</span>
            <input value={value.forceUpdate.minVersion} placeholder="1.2.3" onChange={(e) => setForceUpdate({ minVersion: e.target.value })} />
            <small>Anything older than this is blocked.</small>
          </label>
          <TextField label="Screen title" value={value.forceUpdate.title} onChange={(title) => setForceUpdate({ title })} />
          <TextField label="Screen message" wide value={value.forceUpdate.message} onChange={(message) => setForceUpdate({ message })} />
          <TextField label="App Store URL (iOS)" placeholder="https://apps.apple.com/…" value={value.forceUpdate.iosStoreUrl} onChange={(iosStoreUrl) => setForceUpdate({ iosStoreUrl })} />
          <TextField label="Play Store URL (Android)" placeholder="https://play.google.com/…" value={value.forceUpdate.androidStoreUrl} onChange={(androidStoreUrl) => setForceUpdate({ androidStoreUrl })} />
          <div className="mc-field mc-field-wide">
            <label className="mc-check">
              <input type="checkbox" checked={value.forceUpdate.otaFirst} onChange={(e) => setForceUpdate({ otaFirst: e.target.checked })} />
              Try an over-the-air update before sending users to the store
            </label>
          </div>
        </div>

        <div className="mc-panel-head" style={{ marginTop: 8 }}><h2>Maintenance mode</h2>
          <GateSwitch on={value.maintenance.enabled} onToggle={() => setMaintenance({ enabled: !value.maintenance.enabled })} label="maintenance mode" />
        </div>
        <p className="mc-panel-sub">Blocks the whole app with a notice — use during backend migrations or incidents.</p>
        <div className="mc-form">
          <TextField label="Notice title" value={value.maintenance.title} onChange={(title) => setMaintenance({ title })} />
          <TextField label="Notice message" wide value={value.maintenance.message} onChange={(message) => setMaintenance({ message })} />
        </div>

        <button className="mc-button" onClick={() => void save()} disabled={saving || !canSave || !dirty}>
          {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} {dirty ? 'Publish app control' : 'Published'}
        </button>
      </section>

      <section className="mc-panel">
        <div className="mc-panel-head"><h2>Feature locks</h2></div>
        <p className="mc-panel-sub">
          Lock a whole feature to Pro subscribers or switch it off for everyone — the app covers
          locked screens automatically, including deep links and widgets. Admins bypass locks.
        </p>
        <div className="mc-list">
          {LOCKABLE_MODULES.map(({ key, label, hint }) => {
            const access = value.moduleLocks[key] ?? 'free';
            return (
              <article key={key} className="mc-row">
                <div className="mc-row-main">
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </div>
                <div className="mc-lock-options" role="radiogroup" aria-label={`${label} access`}>
                  {(['free', 'pro', 'disabled'] as ModuleAccess[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={access === option}
                      className={`mc-lock-option ${access === option ? `on lock-${option}` : ''}`}
                      onClick={() => setLock(key, option)}
                    >
                      {option === 'free' ? 'Everyone' : option === 'pro' ? 'Pro only' : 'Off'}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
        <div className="mc-panel-head" style={{ marginTop: 24 }}>
          <h2>Opportunity pipeline rollout</h2>
        </div>
        <p className="mc-panel-sub">
          Dark-ship the intentional opportunity flow without changing the current
          mobile theme or navigation. All switches are off by default.
        </p>
        <div className="mc-list">
          {OPPORTUNITY_PIPELINE_FLAG_DEFINITIONS.map((definition) => (
            <article key={definition.key} className="mc-row">
              <button
                type="button"
                role="switch"
                aria-checked={pipelineFlags[definition.key]}
                aria-label={`${pipelineFlags[definition.key] ? 'Disable' : 'Enable'} ${definition.label}`}
                className={`mc-switch ${pipelineFlags[definition.key] ? 'on' : ''}`}
                onClick={() =>
                  setPipelineFlag(definition.key, !pipelineFlags[definition.key])
                }
              >
                <span className="mc-switch-thumb" />
              </button>
              <div className="mc-row-main">
                <strong>{definition.label}</strong>
                <span>{definition.description}</span>
              </div>
              <span className={`mc-status ${pipelineFlags[definition.key] ? 'status-active' : ''}`}>
                {pipelineFlags[definition.key] ? 'On' : 'Off'}
              </span>
            </article>
          ))}
        </div>
        <p className="mc-panel-sub" style={{ marginTop: 12 }}>
          Changes take effect when you press <strong>Publish app control</strong> on the left.
          Recommended order: state-aware actions, My Path, focused home, then
          navigation consolidation.
        </p>
      </section>
    </>
  );
}

function GateSwitch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${on ? 'Disable' : 'Enable'} ${label}`}
      className={`mc-switch ${on ? 'on danger' : ''}`}
      onClick={onToggle}
    >
      <span className="mc-switch-thumb" />
    </button>
  );
}

export function TextField({ label, hint, placeholder, value, onChange, wide }: { label: string; hint?: string; placeholder?: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
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

export function SelectField({ label, hint, value, options, onChange }: { label: string; hint?: string; value: string; options: string[]; onChange: (value: string) => void }) {
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
      <div className="mc-panel-head"><h2>Your feature switches</h2></div>
      <div className="mc-list">
        {items.length === 0 && (
          <div className="mc-empty">
            <strong>No feature switches yet</strong>
            <p>
              A switch turns a whole app feature on or off remotely — no new release needed.
              Create your first switch with the form on the left.
            </p>
          </div>
        )}
        {items.map((item) => (
          <article key={item.id || item.key} className={`mc-row ${editingId && editingId === item.id ? 'editing' : ''}`}>
            <button
              type="button"
              role="switch"
              aria-checked={item.enabled}
              aria-label={`${item.enabled ? 'Turn off' : 'Turn on'} ${item.label}`}
              className={`mc-switch ${item.enabled ? 'on' : ''}`}
              onClick={() => onToggle(item)}
            >
              <span className="mc-switch-thumb" />
            </button>
            <div className="mc-row-main">
              <strong>
                {item.label}
                {item.requires_pro && <span className="mc-chip">Pro only</span>}
              </strong>
              <span>{item.description || 'No description'}<code className="mc-key-muted">{item.key}</code></span>
            </div>
            <span className={`mc-status ${item.enabled ? 'status-active' : ''}`}>{item.enabled ? 'On' : 'Off'}</span>
            <button className="mc-icon" onClick={() => onEdit(item)} title="Edit" aria-label={`Edit ${item.label}`}><Pencil size={15} /></button>
            <button className="mc-icon mc-icon-danger" onClick={() => onRemove(item)} title="Delete" aria-label={`Delete ${item.label}`}><Trash2 size={15} /></button>
          </article>
        ))}
      </div>
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Live',
  draft: 'Draft',
  paused: 'Paused',
  scheduled: 'Scheduled',
  archived: 'Archived',
};

function ItemList<T extends { id?: string; title?: string; key: string; status?: string; priority?: number }>({
  title,
  items,
  emptyTitle,
  emptyText,
  editingId,
  onEdit,
  onRemove,
  onSetLive,
  onArchive,
  renderMeta,
}: {
  title: string;
  items: T[];
  emptyTitle: string;
  emptyText: string;
  editingId?: string;
  onEdit: (item: T) => void;
  onRemove: (item: T) => void;
  onSetLive: (item: T, live: boolean) => void;
  onArchive: (item: T) => void;
  renderMeta: (item: T) => string;
}) {
  return (
    <section className="mc-panel">
      <div className="mc-panel-head"><h2>{title}</h2></div>
      <div className="mc-list">
        {items.length === 0 && (
          <div className="mc-empty">
            <strong>{emptyTitle}</strong>
            <p>{emptyText}</p>
          </div>
        )}
        {items.map((item) => {
          const status = item.status || 'draft';
          const live = status === 'active';
          const name = item.title || item.key;
          return (
            <article key={item.id || item.key} className={`mc-row ${editingId && editingId === item.id ? 'editing' : ''} ${status === 'archived' ? 'archived' : ''}`}>
              <button
                type="button"
                role="switch"
                aria-checked={live}
                aria-label={`${live ? 'Take off' : 'Set live'}: ${name}`}
                title={live ? 'Live — click to take off' : 'Click to set live'}
                className={`mc-switch ${live ? 'on' : ''}`}
                onClick={() => onSetLive(item, !live)}
              >
                <span className="mc-switch-thumb" />
              </button>
              <div className="mc-row-main">
                <strong>
                  {name}
                  {(item.priority ?? 0) > 0 && <span className="mc-chip"><Pin size={10} /> Pinned</span>}
                </strong>
                <span>{renderMeta(item)}<code className="mc-key-muted">{item.key}</code></span>
              </div>
              <span className={`mc-status status-${status}`}>{STATUS_LABEL[status] || status}</span>
              {status !== 'archived' && (
                <button className="mc-icon" onClick={() => onArchive(item)} title="Archive — hide it without deleting" aria-label={`Archive ${name}`}><Archive size={15} /></button>
              )}
              <button className="mc-icon" onClick={() => onEdit(item)} title="Edit" aria-label={`Edit ${name}`}><Pencil size={15} /></button>
              <button className="mc-icon mc-icon-danger" onClick={() => onRemove(item)} title="Delete" aria-label={`Delete ${name}`}><Trash2 size={15} /></button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Exported for reuse by other admin pages built on the mc-* primitives.
export const styles = `
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
.mc-switch-row{display:flex;align-items:flex-start;gap:10px}
.mc-switch-row .mc-switch{margin-top:1px}
.mc-switch-text{display:flex;flex-direction:column;gap:3px;min-width:0}
.mc-switch-text>span{color:var(--text-secondary);font-size:13px;font-weight:600}
.mc-key-line{display:flex;align-items:center;gap:8px;color:var(--text-tertiary);font-size:12.5px}
.mc-key-line code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;background:var(--bg-primary);border:1px solid var(--border-medium);border-radius:6px;padding:2px 7px}
.mc-key-line button{border:0;background:transparent;color:var(--accent);font-size:12.5px;font-weight:600;cursor:pointer;padding:0}
.mc-key-line button:hover{text-decoration:underline}
.mc-key-muted{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;color:var(--text-tertiary);opacity:.8;margin-left:8px}
.mc-chip{display:inline-flex;align-items:center;gap:3px;margin-left:8px;font-size:11px;font-weight:600;color:var(--accent);background:rgba(127,127,127,.12);border-radius:999px;padding:2px 7px;vertical-align:1px}
.mc-advanced-toggle{display:inline-flex;align-items:center;gap:6px;background:transparent;border:0;color:var(--text-tertiary);font-size:13px;font-weight:600;cursor:pointer;padding:4px 0}
.mc-advanced-toggle em{font-style:normal;font-weight:500;font-size:12px;opacity:.75}
.mc-advanced-toggle:hover{color:var(--text-primary)}
.mc-advanced-toggle svg{transition:transform var(--transition-fast)}
.mc-advanced-toggle svg.open{transform:rotate(180deg)}
.mc-advanced-body{margin-top:12px;margin-bottom:0}
.mc-list{display:flex;flex-direction:column;gap:10px}
.mc-row{display:flex;align-items:center;gap:12px;border:1px solid var(--border-medium);border-radius:10px;padding:12px 14px;transition:border-color var(--transition-fast)}
.mc-row:hover{border-color:var(--accent)}
.mc-row.editing{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.mc-row.archived{opacity:.65}
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
.mc-status{border-radius:999px;padding:4px 10px;background:var(--hover-bg);color:var(--text-secondary);font-size:12px;font-weight:600;flex-shrink:0}
.status-active{background:rgba(52,199,89,.14);color:var(--success)}
.status-paused,.status-draft,.status-scheduled{background:rgba(255,149,0,.14);color:var(--warning)}
.status-archived{background:var(--hover-bg);color:var(--text-tertiary)}
.mc-empty{color:var(--text-tertiary);padding:22px 6px;font-size:14px;line-height:1.55;max-width:52ch}
.mc-empty strong{display:block;color:var(--text-secondary);font-size:14.5px;margin-bottom:6px}
.mc-empty p{margin:0}
.mc-panel-sub{margin:0 0 14px;color:var(--text-tertiary);font-size:13px;line-height:1.5}
.mc-switch.on.danger{background:var(--danger)}
.mc-tab-alert{border-color:var(--danger)!important}
.mc-tab-alert:not(.active){color:var(--danger)}
.mc-img-preview{max-width:100%;max-height:140px;border-radius:10px;border:1px solid var(--border-medium);object-fit:cover}
.mc-lock-options{display:flex;gap:4px;flex-shrink:0;background:var(--bg-primary);border:1px solid var(--border-medium);border-radius:999px;padding:3px}
.mc-lock-option{border:0;background:transparent;color:var(--text-tertiary);font-size:12.5px;font-weight:600;border-radius:999px;padding:5px 11px;cursor:pointer;transition:background var(--transition-fast),color var(--transition-fast)}
.mc-lock-option:hover{color:var(--text-primary)}
.mc-lock-option.on{color:#fff}
.mc-lock-option.on.lock-free{background:var(--success)}
.mc-lock-option.on.lock-pro{background:var(--accent)}
.mc-lock-option.on.lock-disabled{background:var(--danger)}
.mc-alert,.mc-notice{display:flex;align-items:center;gap:8px;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:14px}
.mc-alert{background:rgba(255,59,48,.1);border:1px solid rgba(255,59,48,.3);color:var(--danger)}
.mc-alert-body{flex:1;min-width:0}
.mc-alert-dismiss{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--danger);cursor:pointer;padding:4px;border-radius:6px;flex-shrink:0}
.mc-alert-dismiss:hover{background:rgba(255,59,48,.12)}
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
