import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  KeyRound,
  Loader2,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";
import { useNotifications } from "../hooks/useNotifications";
import { useToast } from "./ui/ToastProvider";
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

/**
 * Minimal structural view of an auth session returned by
 * `user.getSessions()`. Kept local so we don't depend on transitive
 * type packages.
 */
interface ActiveSession {
  id: string;
  status: string;
  lastActiveAt: Date;
  latestActivity: {
    browserName?: string;
    deviceType?: string;
    city?: string;
    country?: string;
    isMobile?: boolean;
  };
  revoke: () => Promise<unknown>;
}

function lastExportStorageKey(userId: string | null | undefined): string {
  return `edutu.lastDataExport.${userId || "anonymous"}`;
}

function readLocalExportTime(userId: string | null | undefined): string | null {
  try {
    return window.localStorage.getItem(lastExportStorageKey(userId));
  } catch {
    return null;
  }
}

function writeLocalExportTime(userId: string | null | undefined, iso: string) {
  try {
    window.localStorage.setItem(lastExportStorageKey(userId), iso);
  } catch {
    /* storage unavailable (private mode) — subtitle falls back to server value */
  }
}

/** Extract a readable message from an auth-provider API error. */
function authErrorMessage(err: unknown, fallback: string): string {
  const maybe = err as {
    errors?: Array<{ longMessage?: string; message?: string }>;
    message?: string;
  };
  return (
    maybe?.errors?.[0]?.longMessage ||
    maybe?.errors?.[0]?.message ||
    (err instanceof Error && err.message) ||
    fallback
  );
}

function describeSession(session: ActiveSession): string {
  const activity = session.latestActivity || {};
  const device =
    activity.deviceType ||
    (activity.isMobile === true ? "Mobile device" : null) ||
    "Unknown device";
  const browser = activity.browserName ? ` · ${activity.browserName}` : "";
  const place = [activity.city, activity.country].filter(Boolean).join(", ");
  return `${device}${browser}${place ? ` · ${place}` : ""}`;
}

function formatSessionTime(value: Date): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

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

function SheetShell({
  titleId,
  title,
  subtitle,
  onClose,
  children,
}: {
  titleId: string;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[80] flex items-end bg-surface-overlay px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full overflow-y-auto rounded-[28px] border border-subtle bg-surface-layer p-4 shadow-elevated sm:max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-base font-display font-semibold tracking-tight text-text-primary"
            >
              {title}
            </h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-text-muted">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-secondary transition hover:text-text-primary"
            aria-label={`Close ${title.toLowerCase()}`}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-subtle bg-surface-elevated px-3 text-sm font-medium text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

export default function MemberSettingsPanel() {
  const { getToken, sessionId } = useClerkAuth();
  const { user } = useUser();
  const { unreadCount } = useNotifications();
  const toast = useToast();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettings>(defaultPrivacy);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibilityPickerOpen, setVisibilityPickerOpen] = useState(false);

  // Sign-in security sheet
  const [securityOpen, setSecurityOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(
    null,
  );
  const [revokingAll, setRevokingAll] = useState(false);

  // Export + deletion
  const [exporting, setExporting] = useState(false);
  const [localExportTime, setLocalExportTime] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const passwordEnabled = Boolean(user?.passwordEnabled);

  useEffect(() => {
    setLocalExportTime(readLocalExportTime(user?.id));
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      setLoading(true);
      setLoadError(null);
      try {
        const token = await getToken().catch(() => null);
        const loaded = await getUserSettings(token);
        if (!mounted) return;
        setSettings(loaded);
        setPrivacy(loaded?.privacy ?? defaultPrivacy);
      } catch (loadFailure) {
        if (!mounted) return;
        setLoadError(
          loadFailure instanceof Error
            ? loadFailure.message
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

  const selectedVisibility =
    visibilityOptions.find(
      (option) => option.value === privacy.profileVisibility,
    ) ?? visibilityOptions[0];

  /**
   * Optimistic save: flip the control immediately, persist the full
   * privacy object, and revert just the changed keys if the save fails.
   */
  const persistPrivacy = useCallback(
    async (updates: Partial<PrivacySettings>, previous: PrivacySettings) => {
      const next = { ...previous, ...updates };
      setPrivacy((current) => ({ ...current, ...updates }));
      const token = await getToken().catch(() => null);
      const result = await savePrivacySettings(next, token);
      if (result.success) {
        setSettings((prev) => (prev ? { ...prev, privacy: next } : prev));
        toast.success("Setting saved");
      } else {
        const rollback: Partial<PrivacySettings> = {};
        for (const key of Object.keys(updates) as Array<
          keyof PrivacySettings
        >) {
          (rollback as Record<string, unknown>)[key] = previous[key];
        }
        setPrivacy((current) => ({ ...current, ...rollback }));
        toast.error(
          "Couldn't save setting",
          result.error || "Please try again.",
        );
      }
    },
    [getToken, toast],
  );

  const loadSessions = useCallback(async () => {
    if (!user) return;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const all = (await user.getSessions()) as unknown as ActiveSession[];
      setSessions(all.filter((session) => session.status === "active"));
    } catch (sessionsFailure) {
      setSessionsError(
        authErrorMessage(sessionsFailure, "Unable to load active sessions."),
      );
    } finally {
      setSessionsLoading(false);
    }
  }, [user]);

  const openSecurity = () => {
    setPasswordError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSignOutOthers(false);
    setSecurityOpen(true);
    void loadSessions();
  };

  const submitPasswordChange = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      setPasswordError("Sign in again to update your password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    if (passwordEnabled && !currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await user.updatePassword({
        newPassword,
        ...(passwordEnabled ? { currentPassword } : {}),
        signOutOfOtherSessions: signOutOthers,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(
        passwordEnabled ? "Password updated" : "Password set",
        signOutOthers ? "Other devices were signed out." : undefined,
      );
      if (signOutOthers) void loadSessions();
    } catch (passwordFailure) {
      setPasswordError(
        authErrorMessage(passwordFailure, "Unable to update password."),
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const revokeSession = async (session: ActiveSession) => {
    setRevokingSessionId(session.id);
    try {
      await session.revoke();
      setSessions((current) =>
        current.filter((item) => item.id !== session.id),
      );
      toast.success("Device signed out");
    } catch (revokeFailure) {
      toast.error(
        "Couldn't sign out device",
        authErrorMessage(revokeFailure, "Please try again."),
      );
    } finally {
      setRevokingSessionId(null);
    }
  };

  const revokeAllOtherSessions = async () => {
    const others = sessions.filter((session) => session.id !== sessionId);
    if (others.length === 0) return;
    setRevokingAll(true);
    let failures = 0;
    for (const session of others) {
      try {
        await session.revoke();
        setSessions((current) =>
          current.filter((item) => item.id !== session.id),
        );
      } catch {
        failures += 1;
      }
    }
    setRevokingAll(false);
    if (failures === 0) {
      toast.success("Signed out of other devices");
    } else {
      toast.error(
        "Some devices couldn't be signed out",
        "Try again in a moment.",
      );
      void loadSessions();
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const token = await getToken().catch(() => null);
      const result = await exportUserData(token);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Unable to export account data.");
      }
      downloadJson("edutu-account-export.json", result.data);
      const now = new Date().toISOString();
      writeLocalExportTime(user?.id, now);
      setLocalExportTime(now);
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              security: { ...prev.security, lastDataDownload: now },
            }
          : prev,
      );
      toast.success("Account export downloaded");
    } catch (exportFailure) {
      toast.error(
        "Export failed",
        exportFailure instanceof Error
          ? exportFailure.message
          : "Unable to export account data.",
      );
    } finally {
      setExporting(false);
    }
  };

  const requestDeletion = async () => {
    setDeleting(true);
    try {
      const token = await getToken().catch(() => null);
      const result = await requestAccountDeletion(token);
      if (!result.success) {
        throw new Error(result.error || "Unable to request account deletion.");
      }
      const now = new Date().toISOString();
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              security: {
                ...prev.security,
                deletionRequested: true,
                deletionRequestedAt: now,
              },
            }
          : prev,
      );
      setDeleteOpen(false);
      setDeleteText("");
      toast.success(
        "Deletion request received",
        "Our team will process it and follow up by email.",
      );
    } catch (deleteFailure) {
      toast.error(
        "Deletion request failed",
        deleteFailure instanceof Error
          ? deleteFailure.message
          : "Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const lastExportIso =
    settings?.security.lastDataDownload || localExportTime || null;
  const deletionRequested = Boolean(settings?.security.deletionRequested);
  const otherSessionCount = sessions.filter(
    (session) => session.id !== sessionId,
  ).length;

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
      {loadError && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm font-semibold text-danger">
          {loadError}
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
              <span className="rounded-full bg-brand/10 px-2 py-1 text-2xs font-semibold text-brand">
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
              checked={Boolean(privacy[item.key])}
              label={item.label}
              description={item.description}
              onChange={() =>
                void persistPrivacy({ [item.key]: !privacy[item.key] }, privacy)
              }
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          <Database size={14} />
          Account
        </div>
        <div className="overflow-hidden rounded-[22px] border border-subtle bg-surface-layer shadow-soft">
          <button
            type="button"
            onClick={openSecurity}
            className="flex w-full items-center justify-between border-b border-subtle px-4 py-4 text-left transition hover:bg-surface-elevated"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-primary">
                Sign-in security
              </span>
              <span className="mt-1 block text-xs font-semibold text-text-muted">
                Change your password and manage signed-in devices
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
                {lastExportIso
                  ? `Last exported ${new Date(lastExportIso).toLocaleDateString()}`
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
        <button
          type="button"
          onClick={() => {
            setDeleteText("");
            setDeleteOpen(true);
          }}
          disabled={deletionRequested}
          className="flex w-full items-center justify-between rounded-2xl border border-danger/30 bg-danger/10 p-4 text-left text-danger transition hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold">
              Request account deletion
            </span>
            {deletionRequested ? (
              <span className="mt-1 block text-xs font-semibold">
                Requested{" "}
                {settings?.security.deletionRequestedAt
                  ? new Date(
                      settings.security.deletionRequestedAt,
                    ).toLocaleDateString()
                  : "recently"}{" "}
                — our team will follow up by email.
              </span>
            ) : null}
          </span>
          <Trash2 size={18} className="shrink-0" />
        </button>
      </section>

      {visibilityPickerOpen ? (
        <SheetShell
          titleId="profile-visibility-title"
          title="Profile visibility"
          subtitle="Choose who can see your Edutu member profile."
          onClose={() => setVisibilityPickerOpen(false)}
        >
          <div
            className="mt-4 grid gap-2"
            role="radiogroup"
            aria-label="Profile visibility"
          >
            {visibilityOptions.map((option) => {
              const selected = privacy.profileVisibility === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setVisibilityPickerOpen(false);
                    if (!selected) {
                      void persistPrivacy(
                        { profileVisibility: option.value },
                        privacy,
                      );
                    }
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
        </SheetShell>
      ) : null}

      {securityOpen ? (
        <SheetShell
          titleId="sign-in-security-title"
          title="Sign-in security"
          subtitle="Update your password and review devices signed in to your account."
          onClose={() => setSecurityOpen(false)}
        >
          <form onSubmit={submitPasswordChange} className="mt-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              <KeyRound size={14} />
              {passwordEnabled ? "Change password" : "Set a password"}
            </div>
            <div className="mt-3 space-y-2.5">
              {passwordEnabled ? (
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className={inputClass}
                />
              ) : (
                <p className="text-xs font-semibold leading-5 text-text-muted">
                  Your account currently signs in without a password. Set one
                  to add another way in.
                </p>
              )}
              <input
                type="password"
                autoComplete="new-password"
                placeholder="New password (min. 8 characters)"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className={inputClass}
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={inputClass}
              />
              <label className="flex items-center gap-2 py-1 text-xs font-semibold text-text-secondary">
                <input
                  type="checkbox"
                  checked={signOutOthers}
                  onChange={(event) => setSignOutOthers(event.target.checked)}
                  className="h-4 w-4 rounded border-subtle accent-brand"
                />
                Sign out of all other devices
              </label>
              {passwordError ? (
                <p className="text-xs font-semibold leading-5 text-danger">
                  {passwordError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={passwordSaving}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {passwordSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : null}
                {passwordEnabled ? "Update password" : "Set password"}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              <MonitorSmartphone size={14} />
              Active sessions
            </div>
            {sessionsLoading ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-14 animate-pulse rounded-2xl border border-subtle bg-surface-elevated"
                  />
                ))}
              </div>
            ) : sessionsError ? (
              <div className="mt-3 rounded-2xl border border-danger/30 bg-danger/10 p-3">
                <p className="text-xs font-semibold text-danger">
                  {sessionsError}
                </p>
                <button
                  type="button"
                  onClick={() => void loadSessions()}
                  className="mt-2 text-xs font-semibold text-brand"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {sessions.map((session) => {
                  const isCurrent = session.id === sessionId;
                  return (
                    <div
                      key={session.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-subtle bg-surface-elevated px-3.5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {describeSession(session)}
                          {isCurrent ? (
                            <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-brand">
                              This device
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-text-muted">
                          Active {formatSessionTime(session.lastActiveAt)}
                        </p>
                      </div>
                      {!isCurrent ? (
                        <button
                          type="button"
                          onClick={() => void revokeSession(session)}
                          disabled={
                            revokingSessionId === session.id || revokingAll
                          }
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-subtle bg-surface-layer px-3 text-xs font-semibold text-text-secondary transition hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {revokingSessionId === session.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <LogOut size={13} />
                          )}
                          Sign out
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {sessions.length === 0 ? (
                  <p className="text-xs font-semibold leading-5 text-text-muted">
                    No active sessions found.
                  </p>
                ) : null}
                {otherSessionCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => void revokeAllOtherSessions()}
                    disabled={revokingAll}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 text-sm font-semibold text-danger transition hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {revokingAll ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <LogOut size={16} />
                    )}
                    Sign out of all other devices
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </SheetShell>
      ) : null}

      {deleteOpen ? (
        <SheetShell
          titleId="account-deletion-title"
          title="Request account deletion"
          subtitle="This asks our team to permanently delete your account and data. Type DELETE to confirm."
          onClose={() => {
            if (!deleting) setDeleteOpen(false);
          }}
        >
          <div className="mt-4 space-y-3">
            <input
              type="text"
              autoComplete="off"
              placeholder='Type "DELETE" to confirm'
              value={deleteText}
              onChange={(event) => setDeleteText(event.target.value)}
              className={inputClass}
              aria-label="Type DELETE to confirm account deletion"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="h-11 rounded-xl border border-subtle bg-surface-elevated text-sm font-semibold text-text-secondary transition hover:text-text-primary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void requestDeletion()}
                disabled={deleting || deleteText.trim() !== "DELETE"}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-danger text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
                Request deletion
              </button>
            </div>
          </div>
        </SheetShell>
      ) : null}
    </div>
  );
}
