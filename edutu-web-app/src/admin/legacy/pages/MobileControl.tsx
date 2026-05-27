import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Flag,
  LayoutPanelTop,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Save,
  Trash2,
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

function parseJson<T>(value: string, fallback: T): T {
  try {
    return value.trim() ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));

  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
  }, [value]);

  return (
    <label className="mc-field mc-field-wide">
      <span>{label}</span>
      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseJson(event.target.value, value));
        }}
        rows={5}
      />
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
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => ({
    activeCampaigns: campaigns.filter((item) => item.status === 'active').length,
    enabledFlags: flags.filter((item) => item.enabled).length,
    activeWidgets: widgets.filter((item) => item.status === 'active').length,
  }), [campaigns, flags, widgets]);

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
      setError(err instanceof Error ? err.message : 'Could not load mobile control data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveCampaign() {
    setSaving(true);
    try {
      const saved = campaignDraft.id
        ? await mobileControlApi.update<MobileCampaign>('campaigns', campaignDraft)
        : await mobileControlApi.create<MobileCampaign>('campaigns', campaignDraft);
      setCampaigns((items) => upsert(items, saved));
      setCampaignDraft(campaignTemplate);
    } finally {
      setSaving(false);
    }
  }

  async function saveFlag() {
    setSaving(true);
    try {
      const saved = flagDraft.id
        ? await mobileControlApi.update<MobileFeatureFlag>('feature-flags', flagDraft)
        : await mobileControlApi.create<MobileFeatureFlag>('feature-flags', flagDraft);
      setFlags((items) => upsert(items, saved));
      setFlagDraft(flagTemplate);
    } finally {
      setSaving(false);
    }
  }

  async function saveWidget() {
    setSaving(true);
    try {
      const saved = widgetDraft.id
        ? await mobileControlApi.update<WidgetFeed>('widget-feeds', widgetDraft)
        : await mobileControlApi.create<WidgetFeed>('widget-feeds', widgetDraft);
      setWidgets((items) => upsert(items, saved));
      setWidgetDraft(widgetTemplate);
    } finally {
      setSaving(false);
    }
  }

  async function remove(tab: Tab, id?: string) {
    if (!id) return;
    const resource = tab === 'campaigns' ? 'campaigns' : tab === 'flags' ? 'feature-flags' : 'widget-feeds';
    await mobileControlApi.remove(resource, id);
    if (tab === 'campaigns') setCampaigns((items) => items.filter((item) => item.id !== id));
    if (tab === 'flags') setFlags((items) => items.filter((item) => item.id !== id));
    if (tab === 'widgets') setWidgets((items) => items.filter((item) => item.id !== id));
  }

  return (
    <div className="mc-page">
      <header className="mc-header">
        <div>
          <p className="mc-kicker">Edu2Mobile</p>
          <h1>Mobile Control</h1>
          <p>Publish app messages, feature rollouts, ad placements, and widget feeds without shipping a new binary.</p>
        </div>
        <button className="mc-button mc-button-secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      <section className="mc-stats">
        <Metric icon={<Megaphone size={20} />} label="Active campaigns" value={stats.activeCampaigns} />
        <Metric icon={<Flag size={20} />} label="Enabled flags" value={stats.enabledFlags} />
        <Metric icon={<LayoutPanelTop size={20} />} label="Active widget feeds" value={stats.activeWidgets} />
      </section>

      <nav className="mc-tabs">
        <button className={activeTab === 'campaigns' ? 'active' : ''} onClick={() => setActiveTab('campaigns')}><Megaphone size={16} /> Campaigns</button>
        <button className={activeTab === 'flags' ? 'active' : ''} onClick={() => setActiveTab('flags')}><Flag size={16} /> Feature Flags</button>
        <button className={activeTab === 'widgets' ? 'active' : ''} onClick={() => setActiveTab('widgets')}><Bell size={16} /> Widget Feeds</button>
      </nav>

      {error && <div className="mc-alert">{error}</div>}
      {loading ? (
        <div className="mc-loading"><Loader2 className="spin" size={20} /> Loading mobile control data...</div>
      ) : (
        <div className="mc-grid">
          {activeTab === 'campaigns' && (
            <>
              <CampaignForm value={campaignDraft} onChange={setCampaignDraft} onSave={saveCampaign} saving={saving} />
              <CampaignList items={campaigns} onEdit={setCampaignDraft} onRemove={(id) => void remove('campaigns', id)} />
            </>
          )}
          {activeTab === 'flags' && (
            <>
              <FlagForm value={flagDraft} onChange={setFlagDraft} onSave={saveFlag} saving={saving} />
              <FlagList items={flags} onEdit={setFlagDraft} onRemove={(id) => void remove('flags', id)} />
            </>
          )}
          {activeTab === 'widgets' && (
            <>
              <WidgetForm value={widgetDraft} onChange={setWidgetDraft} onSave={saveWidget} saving={saving} />
              <WidgetList items={widgets} onEdit={setWidgetDraft} onRemove={(id) => void remove('widgets', id)} />
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

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="mc-metric">{icon}<span>{label}</span><strong>{value}</strong></div>;
}

function CampaignForm({ value, onChange, onSave, saving }: { value: MobileCampaign; onChange: (value: MobileCampaign) => void; onSave: () => void; saving: boolean }) {
  return (
    <section className="mc-panel">
      <h2>{value.id ? 'Edit campaign' : 'New campaign'}</h2>
      <div className="mc-form">
        <TextField label="Key" value={value.key} onChange={(key) => onChange({ ...value, key })} />
        <TextField label="Title" value={value.title} onChange={(title) => onChange({ ...value, title })} />
        <TextField label="Body" value={value.body || ''} onChange={(body) => onChange({ ...value, body })} wide />
        <SelectField label="Type" value={value.campaign_type} options={['popup', 'banner', 'notification', 'interstitial', 'announcement']} onChange={(campaign_type) => onChange({ ...value, campaign_type: campaign_type as MobileCampaign['campaign_type'] })} />
        <SelectField label="Placement" value={value.placement} options={['global', 'home', 'opportunities', 'goals', 'notifications']} onChange={(placement) => onChange({ ...value, placement: placement as MobileCampaign['placement'] })} />
        <SelectField label="Status" value={value.status} options={['draft', 'scheduled', 'active', 'paused', 'archived']} onChange={(status) => onChange({ ...value, status: status as MobileCampaign['status'] })} />
        <NumberField label="Priority" value={value.priority} onChange={(priority) => onChange({ ...value, priority })} />
        <JsonField label="Creative JSON" value={value.creative} onChange={(creative) => onChange({ ...value, creative: creative as Record<string, unknown> })} />
        <JsonField label="Audience JSON" value={value.audience} onChange={(audience) => onChange({ ...value, audience: audience as Record<string, unknown> })} />
        <JsonField label="Frequency JSON" value={value.frequency} onChange={(frequency) => onChange({ ...value, frequency: frequency as Record<string, unknown> })} />
      </div>
      <button className="mc-button" onClick={onSave} disabled={saving || !value.key || !value.title}><Save size={16} /> Save campaign</button>
    </section>
  );
}

function FlagForm({ value, onChange, onSave, saving }: { value: MobileFeatureFlag; onChange: (value: MobileFeatureFlag) => void; onSave: () => void; saving: boolean }) {
  return (
    <section className="mc-panel">
      <h2>{value.id ? 'Edit feature flag' : 'New feature flag'}</h2>
      <div className="mc-form">
        <TextField label="Key" value={value.key} onChange={(key) => onChange({ ...value, key })} />
        <TextField label="Label" value={value.label} onChange={(label) => onChange({ ...value, label })} />
        <TextField label="Description" value={value.description || ''} onChange={(description) => onChange({ ...value, description })} wide />
        <NumberField label="Sort order" value={value.sort_order} onChange={(sort_order) => onChange({ ...value, sort_order })} />
        <label className="mc-check"><input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /> Enabled</label>
        <label className="mc-check"><input type="checkbox" checked={value.requires_pro} onChange={(event) => onChange({ ...value, requires_pro: event.target.checked })} /> Requires Pro</label>
        <JsonField label="Default value JSON" value={value.default_value} onChange={(default_value) => onChange({ ...value, default_value })} />
        <JsonField label="Rollout JSON" value={value.rollout} onChange={(rollout) => onChange({ ...value, rollout: rollout as Record<string, unknown> })} />
      </div>
      <button className="mc-button" onClick={onSave} disabled={saving || !value.key || !value.label}><Save size={16} /> Save flag</button>
    </section>
  );
}

function WidgetForm({ value, onChange, onSave, saving }: { value: WidgetFeed; onChange: (value: WidgetFeed) => void; onSave: () => void; saving: boolean }) {
  return (
    <section className="mc-panel">
      <h2>{value.id ? 'Edit widget feed' : 'New widget feed'}</h2>
      <div className="mc-form">
        <TextField label="Key" value={value.key} onChange={(key) => onChange({ ...value, key })} />
        <TextField label="Title" value={value.title} onChange={(title) => onChange({ ...value, title })} />
        <SelectField label="Type" value={value.feed_type} options={['opportunities', 'saved', 'sponsored', 'quick_actions']} onChange={(feed_type) => onChange({ ...value, feed_type: feed_type as WidgetFeed['feed_type'] })} />
        <SelectField label="Placement" value={value.placement} options={['home', 'lock_screen', 'android_home']} onChange={(placement) => onChange({ ...value, placement: placement as WidgetFeed['placement'] })} />
        <SelectField label="Status" value={value.status} options={['draft', 'active', 'paused', 'archived']} onChange={(status) => onChange({ ...value, status: status as WidgetFeed['status'] })} />
        <NumberField label="Priority" value={value.priority} onChange={(priority) => onChange({ ...value, priority })} />
        <JsonField label="Items JSON" value={value.items} onChange={(items) => onChange({ ...value, items: Array.isArray(items) ? items as Array<Record<string, unknown>> : [] })} />
        <JsonField label="Audience JSON" value={value.audience} onChange={(audience) => onChange({ ...value, audience: audience as Record<string, unknown> })} />
      </div>
      <button className="mc-button" onClick={onSave} disabled={saving || !value.key || !value.title}><Save size={16} /> Save feed</button>
    </section>
  );
}

function TextField({ label, value, onChange, wide }: { label: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
  return <label className={`mc-field ${wide ? 'mc-field-wide' : ''}`}><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="mc-field"><span>{label}</span><input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="mc-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function CampaignList({ items, onEdit, onRemove }: { items: MobileCampaign[]; onEdit: (item: MobileCampaign) => void; onRemove: (id?: string) => void }) {
  return <ItemList title="Campaigns" items={items} onEdit={onEdit} onRemove={onRemove} renderMeta={(item) => `${item.campaign_type} / ${item.placement}`} />;
}

function FlagList({ items, onEdit, onRemove }: { items: MobileFeatureFlag[]; onEdit: (item: MobileFeatureFlag) => void; onRemove: (id?: string) => void }) {
  return <ItemList title="Feature flags" items={items} onEdit={onEdit} onRemove={onRemove} renderMeta={(item) => item.enabled ? 'enabled' : 'disabled'} />;
}

function WidgetList({ items, onEdit, onRemove }: { items: WidgetFeed[]; onEdit: (item: WidgetFeed) => void; onRemove: (id?: string) => void }) {
  return <ItemList title="Widget feeds" items={items} onEdit={onEdit} onRemove={onRemove} renderMeta={(item) => `${item.feed_type} / ${item.placement}`} />;
}

function ItemList<T extends { id?: string; title?: string; label?: string; key: string; status?: string }>({
  title,
  items,
  onEdit,
  onRemove,
  renderMeta,
}: {
  title: string;
  items: T[];
  onEdit: (item: T) => void;
  onRemove: (id?: string) => void;
  renderMeta: (item: T) => string;
}) {
  return (
    <section className="mc-panel">
      <h2>{title}</h2>
      <div className="mc-list">
        {items.length === 0 && <div className="mc-empty"><Plus size={18} /> No records yet.</div>}
        {items.map((item) => (
          <article key={item.id || item.key} className="mc-row">
            <button className="mc-row-main" onClick={() => onEdit(item)}>
              <strong>{item.title || item.label || item.key}</strong>
              <span>{item.key} - {renderMeta(item)}</span>
            </button>
            <span className={`mc-status status-${item.status || 'active'}`}>{item.status || 'active'}</span>
            <button className="mc-icon" onClick={() => onRemove(item.id)} title="Delete"><Trash2 size={16} /></button>
          </article>
        ))}
      </div>
    </section>
  );
}

const styles = `
.mc-page{padding:28px;color:var(--text-primary,#f5f5f7)}
.mc-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px}
.mc-header h1{margin:0;font-size:30px}.mc-header p{margin:6px 0 0;color:#8e8e93}.mc-kicker{color:#5ac8fa!important;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:12px}
.mc-button{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:8px;background:#0a84ff;color:white;padding:11px 14px;font-weight:700;cursor:pointer}.mc-button:disabled{opacity:.5;cursor:not-allowed}.mc-button-secondary{background:#2c2c2e}
.mc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}.mc-metric{display:flex;align-items:center;gap:12px;background:#1c1c1e;border:1px solid #2c2c2e;border-radius:8px;padding:16px}.mc-metric span{color:#a1a1a6}.mc-metric strong{margin-left:auto;font-size:24px}
.mc-tabs{display:flex;gap:8px;margin-bottom:18px}.mc-tabs button{display:flex;align-items:center;gap:8px;border:1px solid #2c2c2e;background:#1c1c1e;color:#f5f5f7;border-radius:8px;padding:10px 12px;cursor:pointer}.mc-tabs button.active{background:#0a84ff;border-color:#0a84ff}
.mc-grid{display:grid;grid-template-columns:minmax(320px,480px) 1fr;gap:16px}.mc-panel{background:#1c1c1e;border:1px solid #2c2c2e;border-radius:8px;padding:18px}.mc-panel h2{margin:0 0 14px;font-size:18px}
.mc-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:14px}.mc-field{display:flex;flex-direction:column;gap:6px}.mc-field span{color:#a1a1a6;font-size:12px;font-weight:700}.mc-field-wide{grid-column:1/-1}.mc-field input,.mc-field select,.mc-field textarea{background:#111113;border:1px solid #3a3a3c;border-radius:8px;color:#f5f5f7;padding:10px;min-width:0}.mc-field textarea{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical}.mc-check{display:flex;align-items:center;gap:8px;color:#f5f5f7}
.mc-list{display:flex;flex-direction:column;gap:10px}.mc-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px;border:1px solid #2c2c2e;border-radius:8px;padding:10px}.mc-row-main{text-align:left;background:transparent;border:0;color:#f5f5f7;cursor:pointer}.mc-row-main strong{display:block}.mc-row-main span{display:block;color:#8e8e93;font-size:13px;margin-top:3px}.mc-icon{background:#2c2c2e;border:0;color:#ff453a;border-radius:8px;padding:8px;cursor:pointer}
.mc-status{border-radius:999px;padding:5px 9px;background:#2c2c2e;color:#d1d1d6;font-size:12px}.status-active{background:rgba(48,209,88,.16);color:#30d158}.status-paused,.status-draft{background:rgba(255,159,10,.16);color:#ff9f0a}.mc-empty,.mc-loading,.mc-alert{display:flex;align-items:center;gap:8px;color:#a1a1a6;padding:18px}.mc-alert{background:rgba(255,69,58,.12);border:1px solid rgba(255,69,58,.35);border-radius:8px;color:#ff6961;margin-bottom:14px}.spin{animation:mc-spin 1s linear infinite}@keyframes mc-spin{to{transform:rotate(360deg)}}@media(max-width:960px){.mc-grid,.mc-stats{grid-template-columns:1fr}.mc-header{flex-direction:column}.mc-form{grid-template-columns:1fr}}
`;
