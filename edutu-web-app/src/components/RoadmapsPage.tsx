import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import {
  ChevronLeft,
  Loader2,
  RefreshCcw,
  Search,
  Star,
  Users,
  Clock,
  Map as MapIcon,
  X,
  Check,
  CalendarPlus,
  Lock,
} from "lucide-react";
import {
  fetchRoadmaps,
  fetchMyRoadmapEnrollments,
  adoptRoadmap,
  type BackendRoadmap,
} from "../services/roadmapApi";
import { downloadRoadmapCalendar } from "../lib/calendarDownload";
import { useGoals } from "../hooks/useGoals";
import { usePaywall } from "../hooks/usePaywall";
import { useProFeature } from "./ProGate";
import PullToRefresh from "./ui/PullToRefresh";
import { EmptyState, ErrorState } from "./ui/EmptyState";
import Button from "./ui/Button";

interface AdoptionInfo {
  enrollmentId: string;
  goalsCreated: number;
  /** Steps already ticked off, when the enrollment came from the server. */
  completedSteps?: number;
  totalSteps?: number;
}

const surfaceClass = "border-subtle bg-surface-layer shadow-soft";

// BackendRoadmap ships both camelCase and snake_case; read either.
const num = (a?: number | null, b?: number | null) => Number(a ?? b ?? 0);
const str = (a?: string | null, b?: string | null) => a ?? b ?? undefined;

function difficultyLabel(value?: string): string {
  if (!value) return "All levels";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseOutcomes(outcomes?: string | null): string[] {
  if (!outcomes) return [];
  return outcomes
    .split(/\r?\n|•|;/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

export default function RoadmapsPage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { refreshGoals } = useGoals();
  const { handleUpgradeError } = usePaywall();
  const calendarExport = useProFeature("roadmap calendar export");

  const [roadmaps, setRoadmaps] = useState<BackendRoadmap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<BackendRoadmap | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [adoptions, setAdoptions] = useState<Record<string, AdoptionInfo>>({});
  const [addingCalendar, setAddingCalendar] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRoadmaps(await fetchRoadmaps({ limit: 40 }));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load roadmaps.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Server-backed adoption state. `adoptions` used to be local-only, so the
  // "Added — 3 milestones tracked" confirmation vanished on reload and the
  // Start button came back, letting the user adopt the same roadmap twice.
  const loadEnrollments = useCallback(async () => {
    try {
      const token = await getToken().catch(() => null);
      if (!token) return;
      const rows = await fetchMyRoadmapEnrollments(token);
      const next: Record<string, AdoptionInfo> = {};
      for (const row of rows) {
        const enrollment = row?.enrollment;
        const roadmapId = enrollment?.roadmapId ?? enrollment?.roadmap_id;
        if (!enrollment?.id || !roadmapId) continue;
        const completed = enrollment.completedSteps ?? enrollment.completed_steps ?? [];
        next[String(roadmapId)] = {
          enrollmentId: String(enrollment.id),
          goalsCreated: 0,
          completedSteps: Array.isArray(completed) ? completed.length : 0,
          totalSteps: row.roadmap?.steps?.length ?? 0,
        };
      }
      setAdoptions((prev) => ({ ...next, ...prev }));
    } catch (enrollmentError) {
      // Non-critical: the catalog still renders, just without progress marks.
      console.warn("Could not load roadmap enrollments", enrollmentError);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
    void loadEnrollments();
  }, [load, loadEnrollments]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    roadmaps.forEach((r) => r.category && set.add(String(r.category)));
    return ["all", ...Array.from(set).sort()];
  }, [roadmaps]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roadmaps.filter((r) => {
      if (category !== "all" && String(r.category) !== category) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q)
      );
    });
  }, [roadmaps, query, category]);

  const enroll = useCallback(
    async (roadmap: BackendRoadmap) => {
      setEnrollingId(roadmap.id);
      try {
        const token = await getToken().catch(() => null);
        const result = await adoptRoadmap(roadmap.id, {}, token);
        setAdoptions((prev) => ({
          ...prev,
          [roadmap.id]: {
            enrollmentId: result.id,
            goalsCreated: result.goalsCreated ?? 0,
          },
        }));
        // Adopting creates milestone-goals server-side; refresh the goals
        // cache so they're visible immediately when the user opens /goals
        // instead of only after a full reload.
        await refreshGoals().catch((refreshError) => {
          console.warn("Could not refresh goals after adopt", refreshError);
        });
      } catch (enrollError) {
        // A metered-limit / 402 (UpgradeRequiredError) opens the paywall
        // instead of surfacing a generic alert. Non-upgrade errors fall
        // through to the existing alert unchanged.
        if (handleUpgradeError(enrollError)) return;
        console.error("Failed to enroll in roadmap", enrollError);
        window.alert(
          enrollError instanceof Error
            ? enrollError.message
            : "Could not start this roadmap. Please try again.",
        );
      } finally {
        setEnrollingId(null);
      }
    },
    [getToken, refreshGoals, handleUpgradeError],
  );

  const addToCalendar = useCallback(
    async (enrollmentId: string) => {
      // Calendar export is a Pro feature — non-Pro users get the paywall.
      if (!calendarExport.requirePro()) return;
      setAddingCalendar(true);
      try {
        const token = await getToken().catch(() => null);
        const ok = await downloadRoadmapCalendar(enrollmentId, token);
        if (!ok) {
          window.alert("Could not build the calendar. Please try again.");
        }
      } finally {
        setAddingCalendar(false);
      }
    },
    [getToken, calendarExport],
  );

  return (
    <div className="min-h-[100dvh] bg-surface-body text-text-primary">
      <header className="sticky top-0 z-30 hidden border-b border-subtle bg-surface-layer/90 backdrop-blur-xl lg:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-bold text-text-secondary transition hover:bg-surface-elevated"
          >
            <ChevronLeft size={17} />
            Back
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <RefreshCcw size={17} />
            )}
            Refresh
          </button>
        </div>
      </header>

      <PullToRefresh
        onRefresh={load}
        disabled={loading}
        className="min-h-[calc(100dvh-4rem)]"
      >
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <section className={`rounded-[20px] border p-4 sm:p-5 ${surfaceClass}`}>
            <h1 className="text-xl font-display font-semibold tracking-tight">
              Expert roadmaps
            </h1>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Start a proven, step-by-step plan. Every milestone lands in your
              goals with a date and a reminder.
            </p>

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-subtle bg-surface-body px-3">
              <Search size={16} className="text-text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search roadmaps"
                className="h-11 flex-1 bg-transparent text-sm text-text-primary outline-none"
              />
            </div>
          </section>

          {categories.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
                    category === cat
                      ? "bg-brand text-white"
                      : "border border-subtle text-text-secondary hover:bg-surface-elevated"
                  }`}
                >
                  {cat === "all" ? "All" : cat}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-56 animate-pulse rounded-[20px] border border-subtle bg-surface-elevated"
                />
              ))}
            </div>
          ) : error ? (
            <div className={`mt-5 rounded-[20px] border ${surfaceClass}`}>
              <ErrorState message={error} onRetry={() => void load()} />
            </div>
          ) : visible.length === 0 ? (
            <div className={`mt-5 rounded-[20px] border ${surfaceClass}`}>
              <EmptyState
                icon={<MapIcon size={32} />}
                title="No roadmaps found"
                description="Try a different search or category — new expert roadmaps are added regularly."
                action={
                  query || category !== "all"
                    ? {
                        label: "Clear filters",
                        onClick: () => {
                          setQuery("");
                          setCategory("all");
                        },
                      }
                    : undefined
                }
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((roadmap) => (
                <RoadmapCard
                  key={roadmap.id}
                  roadmap={roadmap}
                  adoption={adoptions[roadmap.id]}
                  onOpen={() => setSelected(roadmap)}
                />
              ))}
            </div>
          )}
        </main>
      </PullToRefresh>

      {selected && (
        <RoadmapDetailModal
          roadmap={selected}
          enrolling={enrollingId === selected.id}
          adoption={adoptions[selected.id]}
          addingCalendar={addingCalendar}
          calendarLocked={calendarExport.locked}
          onEnroll={() => void enroll(selected)}
          onAddCalendar={(enrollmentId) => void addToCalendar(enrollmentId)}
          onViewGoals={() => navigate("/goals")}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function RatingRow({ roadmap }: { roadmap: BackendRoadmap }) {
  const rating = num(roadmap.ratingAvg, roadmap.rating_avg);
  const ratingCount = num(roadmap.ratingCount, roadmap.rating_count);
  const enrolled = num(roadmap.enrollmentCount, roadmap.enrollment_count);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-text-muted">
      {rating > 0 && (
        <span className="inline-flex items-center gap-1">
          <Star size={13} className="fill-amber-400 text-amber-400" />
          <span className="font-semibold text-text-primary tabular-nums">
            {rating.toFixed(1)}
          </span>
          {ratingCount > 0 && <span>({ratingCount})</span>}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <Users size={13} />
        <span className="tabular-nums">{enrolled.toLocaleString()}</span> enrolled
      </span>
    </div>
  );
}

function RoadmapCard({
  roadmap,
  adoption,
  onOpen,
}: {
  roadmap: BackendRoadmap;
  adoption?: AdoptionInfo;
  onOpen: () => void;
}) {
  const cover = str(roadmap.coverImage, roadmap.cover_image);
  const creator = str(roadmap.creatorName, roadmap.creator_name);
  const duration = str(roadmap.estimatedDuration, roadmap.estimated_duration);
  const stepCount = roadmap.steps?.length ?? 0;
  const total = adoption?.totalSteps || stepCount;
  const done = adoption?.completedSteps ?? 0;
  const percent = adoption && total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        adoption
          ? `${roadmap.title} — started, ${done} of ${total} steps done`
          : roadmap.title
      }
      className={`flex w-full flex-col overflow-hidden rounded-[20px] border text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${surfaceClass}`}
    >
      <div className="relative h-28 w-full bg-gradient-to-br from-brand to-brand-700">
        {cover && (
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-2xs font-semibold text-white backdrop-blur">
          {difficultyLabel(String(roadmap.difficulty))}
        </span>
        {adoption && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-700/90 px-2.5 py-1 text-2xs font-semibold text-white backdrop-blur">
            <Check size={12} />
            Started
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-sm font-semibold text-text-primary">
          {roadmap.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
          {roadmap.description}
        </p>
        {adoption && total > 0 && (
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand/15">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.max(percent, 3)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs font-semibold text-text-secondary tabular-nums">
              {done} of {total} steps done
            </p>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
          <span className="capitalize">{String(roadmap.category || "General")}</span>
          {duration && (
            <span className="inline-flex items-center gap-1">
              <Clock size={13} />
              {duration}
            </span>
          )}
          {stepCount > 0 && <span>{stepCount} steps</span>}
        </div>
        <div className="mt-3 border-t border-subtle pt-3">
          <RatingRow roadmap={roadmap} />
          {creator && (
            <p className="mt-1.5 text-xs text-text-muted">by {creator}</p>
          )}
        </div>
      </div>
    </button>
  );
}

function RoadmapDetailModal({
  roadmap,
  enrolling,
  adoption,
  addingCalendar,
  calendarLocked,
  onEnroll,
  onAddCalendar,
  onViewGoals,
  onClose,
}: {
  roadmap: BackendRoadmap;
  enrolling: boolean;
  adoption?: AdoptionInfo;
  addingCalendar: boolean;
  calendarLocked: boolean;
  onEnroll: () => void;
  onAddCalendar: (enrollmentId: string) => void;
  onViewGoals: () => void;
  onClose: () => void;
}) {
  const outcomes = parseOutcomes(roadmap.outcomes);
  const duration = str(roadmap.estimatedDuration, roadmap.estimated_duration);
  const creator = str(roadmap.creatorName, roadmap.creator_name);
  const steps = roadmap.steps ?? [];
  const titleId = `roadmap-modal-${roadmap.id}`;

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Element that had focus before the dialog opened, so focus returns there
  // on close instead of jumping to the top of the document.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    // Lock the page behind the dialog — without this the body kept scrolling
    // under the sheet on both desktop wheel and mobile touch.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      // Keep Tab inside the dialog; a modal that leaks focus to the page
      // behind it is unusable with a keyboard or a screen reader.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      returnFocusRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      // Close on a genuine backdrop click only. `onClick` alone fired when a
      // drag that began inside the sheet happened to end on the scrim, which
      // discarded the dialog mid-selection.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-t-[24px] border border-subtle bg-surface-layer shadow-soft sm:rounded-[24px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-subtle p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-display font-semibold tracking-tight">
              {roadmap.title}
            </h2>
            <p className="mt-1 text-xs capitalize text-text-muted">
              {String(roadmap.category || "General")} ·{" "}
              {difficultyLabel(String(roadmap.difficulty))}
            </p>
            <div className="mt-2">
              <RatingRow roadmap={roadmap} />
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-text-muted transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm leading-6 text-text-secondary">
            {roadmap.description}
          </p>

          {(duration || creator) && (
            <p className="mt-3 text-xs text-text-muted">
              {duration ? `${duration}` : ""}
              {duration && creator ? " · " : ""}
              {creator ? `by ${creator}` : ""}
            </p>
          )}

          {outcomes.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-text-primary">
                What you'll achieve
              </h3>
              <ul className="mt-2 space-y-1.5">
                {outcomes.map((outcome, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-sm text-text-secondary"
                  >
                    <Check
                      size={15}
                      className="mt-0.5 shrink-0 text-emerald-500"
                    />
                    {outcome}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {steps.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-text-primary">
                Learning path
              </h3>
              <ol className="mt-3 space-y-3">
                {steps.map((step, index) => (
                  <li key={step.id || index} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary">
                        {step.title}
                      </p>
                      {step.description && (
                        <p className="mt-0.5 text-xs leading-5 text-text-muted">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="border-t border-subtle p-4">
          {adoption ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <Check size={16} />
                {adoption.goalsCreated > 0
                  ? `Added — ${adoption.goalsCreated} milestone${adoption.goalsCreated === 1 ? "" : "s"} tracked as goals, reminders scheduled`
                  : adoption.totalSteps
                    ? `In your plan — ${adoption.completedSteps ?? 0} of ${adoption.totalSteps} steps done`
                    : "Added to your plan · reminders scheduled"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onAddCalendar(adoption.enrollmentId)}
                  disabled={addingCalendar}
                >
                  {addingCalendar ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : calendarLocked ? (
                    <Lock size={15} />
                  ) : (
                    <CalendarPlus size={15} />
                  )}
                  Add to calendar
                  {calendarLocked ? (
                    <span className="ml-1 rounded-full bg-brand-500/15 px-1.5 py-0.5 text-2xs font-semibold uppercase leading-none tracking-wide text-brand-700">
                      Pro
                    </span>
                  ) : null}
                </Button>
                <Button size="sm" onClick={onViewGoals}>
                  Continue in goals
                </Button>
              </div>
              <p className="text-xs text-text-muted">
                The calendar file (.ics) adds every milestone with reminders to
                Google Calendar, Apple Calendar, or Outlook.
              </p>
            </div>
          ) : (
            <>
              {/* Say what the button does before it does it — starting a roadmap
                  writes goals and schedules reminders, which was undisclosed. */}
              <p className="mb-3 text-center text-xs text-text-muted">
                {steps.length > 0
                  ? `Adds ${steps.length} milestone${steps.length === 1 ? "" : "s"} to your goals and schedules reminders.`
                  : "Adds this plan to your goals and schedules reminders."}
              </p>
              <Button
                size="lg"
                onClick={onEnroll}
                disabled={enrolling}
                className="w-full"
              >
                {enrolling ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Starting…
                  </>
                ) : (
                  "Start this roadmap"
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
