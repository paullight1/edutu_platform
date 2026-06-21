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

interface MemberSettingsPanelProps {
  onOpenNotifications: () => void;
}

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
      className="flex w-full items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 text-left transition last:border-b-0 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/10"
      aria-pressed={checked}
    >
      <span className="min-w-0">
        <span className="block text-sm font-black text-slate-950 dark:text-white">
          {label}
        </span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-brand-500" : "bg-slate-200 dark:bg-white/15"
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

export default function MemberSettingsPanel({
  onOpenNotifications,
}: MemberSettingsPanelProps) {
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
            className="h-16 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5"
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
              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
          }`}
        >
          {error || status}
        </div>
      )}

      <section>
        <button
          type="button"
          onClick={onOpenNotifications}
          className="flex w-full items-center justify-between rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
              <Bell size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-slate-950 dark:text-white">
                Notifications
              </span>
              <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                Inbox and reminders
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {unreadCount > 0 ? (
              <span className="rounded-full bg-brand-500/10 px-2 py-1 text-[11px] font-black text-brand-600 dark:text-brand-300">
                {unreadCount}
              </span>
            ) : null}
            <ChevronRight size={18} className="text-slate-400" />
          </span>
        </button>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
          <ShieldCheck size={14} />
          Privacy
        </div>
        <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
          <div className="border-b border-slate-100 dark:border-white/10">
            <button
              type="button"
              onClick={() => setVisibilityPickerOpen(true)}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:bg-white/10"
              aria-haspopup="dialog"
              aria-expanded={visibilityPickerOpen}
            >
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-950 dark:text-white">
                  Profile visibility
                </span>
                <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                  {selectedVisibility.label} · {selectedVisibility.description}
                </span>
              </span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
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
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-black text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Save privacy changes
          </button>
        ) : null}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
          <Database size={14} />
          Account
        </div>
        <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            onClick={openAccountSecurity}
            className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-4 text-left transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/10"
          >
            <span className="min-w-0">
              <span className="block text-sm font-black text-slate-950 dark:text-white">
                Sign-in security
              </span>
              <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                Password, sessions, and authentication methods
              </span>
            </span>
            <ShieldCheck size={18} className="shrink-0 text-slate-400" />
          </button>
          <button
            type="button"
            onClick={exportData}
            disabled={exporting}
            className="flex w-full items-center justify-between px-4 py-4 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/10"
          >
            <span className="min-w-0">
              <span className="block text-sm font-black text-slate-950 dark:text-white">
                Export account data
              </span>
              <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                {settings?.security.lastDataDownload
                  ? `Last exported ${new Date(settings.security.lastDataDownload).toLocaleDateString()}`
                  : "No export recorded"}
              </span>
            </span>
            {exporting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Download size={18} className="shrink-0 text-slate-400" />
            )}
          </button>
        </div>
        {confirmDeletion ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
            <p className="text-sm font-black text-rose-700 dark:text-rose-300">
              Confirm deletion request
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeletion(false)}
                disabled={deleting}
                className="h-10 rounded-xl border border-rose-200 bg-white text-sm font-black text-rose-700 disabled:opacity-60 dark:border-rose-500/20 dark:bg-white/10 dark:text-rose-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={requestDeletion}
                disabled={deleting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-black text-white disabled:opacity-60"
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
            className="flex w-full items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/15"
          >
            <span className="text-sm font-black">Request account deletion</span>
            <Trash2 size={18} />
          </button>
        )}
      </section>

      {visibilityPickerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-visibility-title"
          className="fixed inset-0 z-[80] flex items-end bg-slate-950/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center"
          onClick={() => setVisibilityPickerOpen(false)}
        >
          <div
            className="w-full rounded-[28px] border border-slate-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-gray-950 sm:max-w-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id="profile-visibility-title"
                  className="text-base font-black text-slate-950 dark:text-white"
                >
                  Profile visibility
                </h2>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                  Choose who can see your Edutu member profile.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVisibilityPickerOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
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
                    className={`flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      selected
                        ? "border-brand-500 bg-brand-500/10 text-slate-950 dark:text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-brand-200 hover:bg-brand-500/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-black">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                        {option.description}
                      </span>
                    </span>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                        selected
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "border-slate-300 bg-white dark:border-white/20 dark:bg-transparent"
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
