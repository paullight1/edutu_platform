import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Loader2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useNotifications } from "../hooks/useNotifications";
import {
  exportUserData,
  getUserSettings,
  requestAccountDeletion,
  savePrivacySettings,
  type PrivacySettings,
  type UserSettings,
} from "../services/userSettings";


const visibilityOptions: Array<{
  value: PrivacySettings["profileVisibility"];
  label: string;
  description: string;
}> = [
  {
    value: "public",
    label: "Public",
    description: "Anyone can view your member profile.",
  },
  {
    value: "friends",
    label: "Connections only",
    description: "Only approved connections can view it.",
  },
  {
    value: "private",
    label: "Private",
    description: "Hide your profile from other members.",
  },
];

const privacyToggles: Array<{
  key: keyof Pick<
    PrivacySettings,
    "dataSharing" | "analyticsTracking" | "activityStatus" | "searchVisibility"
  >;
  label: string;
  description: string;
}> = [
  {
    key: "dataSharing",
    label: "Data sharing",
    description: "Allow profile details to support matched recommendations.",
  },
  {
    key: "analyticsTracking",
    label: "Usage analytics",
    description: "Allow product analytics tied to your member account.",
  },
  {
    key: "activityStatus",
    label: "Activity status",
    description: "Show recent activity signals inside member areas.",
  },
  {
    key: "searchVisibility",
    label: "Search visibility",
    description: "Allow your profile to appear in member search surfaces.",
  },
];

const defaultPrivacy: PrivacySettings = {
  profileVisibility: "public",
  dataSharing: false,
  analyticsTracking: true,
  personalizedAds: false,
  activityStatus: true,
  searchVisibility: true,
};

function downloadJson(filename: string, data: Record<string, unknown>) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Toggle({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-4 border-b border-subtle px-4 py-4 text-left transition last:border-b-0 hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
      aria-pressed={checked}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text-primary">
          {label}
        </span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-text-muted">
          {description}
        </span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-brand" : "bg-surface-elevated border border-subtle"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}

export default function MemberSettingsPanel() {
  const { getToken } = useClerkAuth();
  const { unreadCount } = useNotifications();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [draftPrivacy, setDraftPrivacy] =
    useState<PrivacySettings>(defaultPrivacy);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const [visibilityPickerOpen, setVisibilityPickerOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken().catch(() => null);
        const loaded = await getUserSettings(token);
        if (!mounted) return;
        setSettings(loaded);
        setDraftPrivacy(loaded?.privacy ?? defaultPrivacy);
      } catch (loadError) {
        if (!mounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load settings.",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, [getToken]);

  const isDirty = useMemo(() => {
    const current = settings?.privacy ?? defaultPrivacy;
    return JSON.stringify(current) !== JSON.stringify(draftPrivacy);
  }, [draftPrivacy, settings?.privacy]);

  const selectedVisibility =
    visibilityOptions.find(
      (option) => option.value === draftPrivacy.profileVisibility,
    ) ?? visibilityOptions[0];

  const updatePrivacy = (updates: Partial<PrivacySettings>) => {
    setStatus(null);
    setError(null);
    setDraftPrivacy((current) => ({ ...current, ...updates }));
  };

  const savePrivacy = async () => {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const token = await getToken().catch(() => null);
      const result = await savePrivacySettings(draftPrivacy, token);
      if (!result.success) {
        throw new Error(result.error || "Unable to save privacy settings.");
      }
      const nextSettings = await getUserSettings(token);
      setSettings(nextSettings);
      setDraftPrivacy(nextSettings?.privacy ?? draftPrivacy);
      setStatus("Privacy settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save privacy settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openAccountSecurity = () => {
    setStatus(null);
    setError(null);
    const clerk = window.Clerk as
      | ({ openUserProfile?: () => void } & Record<string, unknown>)
      | undefined;

    if (typeof clerk?.openUserProfile === "function") {
      clerk.openUserProfile();
      return;
    }

    setError("Account security is unavailable in this browser session.");
  };

  const exportData = async () => {
    setExporting(true);
    setStatus(null);
    setError(null);
    try {
      const token = await getToken().catch(() => null);
      const result = await exportUserData(token);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Unable to export account data.");
      }
      downloadJson("edutu-account-export.json", result.data);
      const nextSettings = await getUserSettings(token);
      setSettings(nextSettings);
      setStatus("Account export prepared.");
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Unable to export account data.",
      );
    } finally {
      setExporting(false);
    }
  };

  const requestDeletion = async () => {
    setDeleting(true);
    setStatus(null);
    setError(null);
    try {
      const token = await getToken().catch(() => null);
      const result = await requestAccountDeletion(token);
      if (!result.success) {
        throw new Error(result.error || "Unable to request account deletion.");
      }
      setConfirmDeletion(false);
      setStatus("Account deletion request saved.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to request account deletion.",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-16 animate-pulse rounded-2xl border border-subtle bg-surface-elevated"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {(status || error) && (
        <div
          className={`rounded-2xl border p-4 text-sm font-semibold ${
            error
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {error || status}
        </div>
      )}

      <section>
        <Link
          to="/app/notifications"
          className="flex w-full items-center justify-between rounded-[22px] border border-subtle bg-surface-layer p-4 text-left shadow-soft transition hover:bg-surface-elevated"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Bell size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-primary">
                Notifications
              </span>
              <span className="mt-1 block text-xs font-semibold text-text-muted">
                Inbox and reminders
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {unreadCount > 0 ? (
              <span className="rounded-full bg-brand/10 px-2 py-1 text-[11px] font-semibold text-brand">
                {unreadCount}
              </span>
            ) : null}
            <ChevronRight size={18} className="text-text-muted" />
          </span>
        </Link>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          <ShieldCheck size={14} />
          Privacy
        </div>
        <div className="overflow-hidden rounded-[22px] border border-subtle bg-surface-layer shadow-soft">
          <div className="border-b border-subtle">
            <button
              type="button"
              onClick={() => setVisibilityPickerOpen(true)}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
              aria-haspopup="dialog"
              aria-expanded={visibilityPickerOpen}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-primary">
                  Profile visibility
                </span>
                <span className="mt-1 block text-xs font-semibold leading-5 text-text-muted">
                  {selectedVisibility.label} · {selectedVisibility.description}
                </span>
              </span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-muted">
                <ChevronDown size={18} />
              </span>
            </button>
          </div>
          {privacyToggles.map((item) => (
            <Toggle
              key={item.key}
              checked={Boolean(draftPrivacy[item.key])}
              label={item.label}
              description={item.description}
              onChange={() =>
                updatePrivacy({ [item.key]: !draftPrivacy[item.key] })
              }
            />
          ))}
        </div>
        {isDirty ? (
          <button
            type="button"
            onClick={savePrivacy}
            disabled={saving}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Save privacy changes
          </button>
        ) : null}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          <Database size={14} />
          Account
        </div>
        <div className="overflow-hidden rounded-[22px] border border-subtle bg-surface-layer shadow-soft">
          <button
            type="button"
            onClick={openAccountSecurity}
            className="flex w-full items-center justify-between border-b border-subtle px-4 py-4 text-left transition hover:bg-surface-elevated"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-primary">
                Sign-in security
              </span>
              <span className="mt-1 block text-xs font-semibold text-text-muted">
                Password, sessions, and authentication methods
              </span>
            </span>
            <ShieldCheck size={18} className="shrink-0 text-text-muted" />
          </button>
          <button
            type="button"
            onClick={exportData}
            disabled={exporting}
            className="flex w-full items-center justify-between px-4 py-4 text-left transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-primary">
                Export account data
              </span>
              <span className="mt-1 block text-xs font-semibold text-text-muted">
                {settings?.security.lastDataDownload
                  ? `Last exported ${new Date(settings.security.lastDataDownload).toLocaleDateString()}`
                  : "No export recorded"}
              </span>
            </span>
            {exporting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Download size={18} className="shrink-0 text-text-muted" />
            )}
          </button>
        </div>
        {confirmDeletion ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4">
            <p className="text-sm font-semibold text-danger">
              Confirm deletion request
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeletion(false)}
                disabled={deleting}
                className="h-10 rounded-xl border border-danger/30 bg-surface-layer text-sm font-semibold text-danger disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={requestDeletion}
                disabled={deleting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-danger text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : null}
                Request
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDeletion(true)}
            className="flex w-full items-center justify-between rounded-2xl border border-danger/30 bg-danger/10 p-4 text-left text-danger transition hover:bg-danger/15"
          >
            <span className="text-sm font-semibold">Request account deletion</span>
            <Trash2 size={18} />
          </button>
        )}
      </section>

      {visibilityPickerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-visibility-title"
          className="fixed inset-0 z-[80] flex items-end bg-surface-overlay px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center"
          onClick={() => setVisibilityPickerOpen(false)}
        >
          <div
            className="w-full rounded-[28px] border border-subtle bg-surface-layer p-4 shadow-elevated sm:max-w-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id="profile-visibility-title"
                  className="text-base font-display font-semibold tracking-tight text-text-primary"
                >
                  Profile visibility
                </h2>
                <p className="mt-1 text-xs font-semibold leading-5 text-text-muted">
                  Choose who can see your Edutu member profile.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVisibilityPickerOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-secondary transition hover:text-text-primary"
                aria-label="Close profile visibility picker"
              >
                <X size={18} />
              </button>
            </div>

            <div
              className="mt-4 grid gap-2"
              role="radiogroup"
              aria-label="Profile visibility"
            >
              {visibilityOptions.map((option) => {
                const selected = draftPrivacy.profileVisibility === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      updatePrivacy({ profileVisibility: option.value });
                      setVisibilityPickerOpen(false);
                    }}
                    className={`flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      selected
                        ? "border-brand bg-brand/10 text-text-primary"
                        : "border-subtle bg-surface-elevated text-text-secondary hover:border-brand/40 hover:bg-brand/5"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs font-semibold leading-5 text-text-muted">
                        {option.description}
                      </span>
                    </span>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                        selected
                          ? "border-brand bg-brand text-white"
                          : "border-strong bg-surface-layer"
                      }`}
                    >
                      {selected ? <Check size={15} strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
