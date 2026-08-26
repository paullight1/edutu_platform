import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  GraduationCap,
  Loader2,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { usePersonalization } from "../hooks/usePersonalization";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "./ui/ToastProvider";
import { getProductApiToken } from "../lib/clerkToken";
import {
  updateBackendProfile,
  saveOnboardingProfile,
  type ProfileUpdateInput,
} from "../services/profile";
import { COUNTRIES } from "../data/countries";
import { syncOpportunityPreferences } from "../services/opportunityPreferences";
import MultiSelectDropdown from "./ui/MultiSelectDropdown";

const INTEREST_OPTIONS = [
  "Technology",
  "AI & Machine Learning",
  "Data Science",
  "Engineering",
  "Science",
  "Business",
  "Entrepreneurship",
  "Finance",
  "Marketing",
  "Design",
  "Arts",
  "Education",
  "Health",
  "Leadership",
  "Scholarships",
];

const GOAL_OPTIONS = [
  "Win a scholarship",
  "Study abroad",
  "Get an internship",
  "Land my first job",
  "Start a business",
  "Attend a fellowship",
  "Build my network",
  "Learn new skills",
  "Do research",
];

const EDUCATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "high-school", label: "High school" },
  { value: "undergraduate", label: "Undergraduate" },
  { value: "graduate", label: "Graduate" },
  { value: "postgraduate", label: "Postgraduate" },
  { value: "professional", label: "Professional" },
];

const EXPERIENCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "beginner", label: "Just starting out" },
  { value: "intermediate", label: "Some experience" },
  { value: "advanced", label: "Experienced" },
];

const POPULAR_DESTINATIONS = [
  "United States",
  "United Kingdom",
  "Canada",
  "Germany",
  "Australia",
  "France",
  "Netherlands",
  "Japan",
  "South Korea",
  "Singapore",
  "South Africa",
];

const DESTINATION_COUNTRY_NAMES = [
  ...POPULAR_DESTINATIONS,
  ...COUNTRIES.map((entry) => entry.name).filter(
    (name) => !POPULAR_DESTINATIONS.includes(name),
  ),
];

const COUNTRY_FLAGS = new Map(
  COUNTRIES.map((entry) => [entry.name.toLowerCase(), entry.flag]),
);

const countryFlag = (name: string) => COUNTRY_FLAGS.get(name.toLowerCase());

const STEPS = [
  {
    id: "profile",
    label: "About you",
    icon: UserRound,
    title: "Tell us about you",
    subtitle: "We'll greet you by name and prioritize nearby opportunities.",
  },
  {
    id: "education",
    label: "Education",
    icon: GraduationCap,
    title: "Your education",
    subtitle: "Helps us match programs to your level and field.",
  },
  {
    id: "interests",
    label: "Interests",
    icon: Sparkles,
    title: "What are you interested in?",
    subtitle: "Pick as many as you like — you can change these later.",
  },
  {
    id: "ambitions",
    label: "Ambitions",
    icon: Target,
    title: "What are you aiming for?",
    subtitle: "We'll surface opportunities that get you there.",
  },
] as const;

interface SegmentedGroupProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  label: string;
}

function SegmentedGroup({
  options,
  value,
  onChange,
  label,
}: SegmentedGroupProps) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${
              isActive
                ? "border-brand bg-brand text-white shadow-soft"
                : "border-subtle bg-surface-layer text-text-secondary hover:border-brand/40 hover:bg-brand/5"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const fieldClass =
  "w-full rounded-xl border border-subtle bg-surface-layer px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40";

const labelClass = "mb-1.5 block text-sm font-medium text-text-secondary";

export interface OnboardingFlowProps {
  presentation?: "modal" | "page";
  showWelcome?: boolean;
  onComplete?: () => void;
  onDismiss?: () => void;
}

// ---------------------------------------------------------------------------
// Fullscreen onboarding wizard — rendered OUTSIDE the app shell so it owns the
// whole viewport (no header, no bottom nav) until the member finishes or skips.
// ---------------------------------------------------------------------------

export function OnboardingFlow({
  presentation = "page",
  showWelcome = false,
  onComplete,
  onDismiss,
}: OnboardingFlowProps) {
  const { success, error } = useToast();
  const { preferences, savePreferences } = usePersonalization();
  const { user } = useAuth();
  const { getToken } = useClerkAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [showingWelcome, setShowingWelcome] = useState(showWelcome);

  // Step 1 — profile
  const [fullName, setFullName] = useState(() => user?.name ?? "");
  const [age, setAge] = useState<string>(() =>
    user?.age ? String(user.age) : "",
  );
  const [location, setLocation] = useState(() => preferences?.location ?? "");

  // Step 2 — education
  const [educationLevel, setEducationLevel] = useState(
    () => preferences?.educationLevel ?? "",
  );
  const [school, setSchool] = useState("");
  const [courseOfStudy, setCourseOfStudy] = useState(
    () => user?.courseOfStudy ?? "",
  );

  // Step 3 — interests
  const [interests, setInterests] = useState<string[]>(
    () => preferences?.interests ?? [],
  );
  const [interestedCountries, setInterestedCountries] = useState<string[]>([]);

  // Step 4 — ambitions
  const [careerGoals, setCareerGoals] = useState<string[]>(
    () => preferences?.careerGoals ?? [],
  );
  const [experienceLevel, setExperienceLevel] = useState(
    () => preferences?.experienceLevel ?? "intermediate",
  );

  const isLastStep = stepIndex === STEPS.length - 1;
  const step = STEPS[stepIndex];

  const canFinish = useMemo(
    () => interests.length > 0 || careerGoals.length > 0,
    [interests, careerGoals],
  );

  const toggleValue = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setter((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value],
    );
  };

  const goNext = () => {
    if (isLastStep) {
      void handleFinish();
      return;
    }
    setDirection(1);
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  };

  const goBack = () => {
    if (stepIndex === 0) return;
    setDirection(-1);
    setStepIndex((index) => Math.max(index - 1, 0));
  };

  const handleSkip = () => {
    onDismiss?.();
  };

  const handleFinish = async () => {
    setSaving(true);
    const trimmedName = fullName.trim();
    const trimmedLocation = location.trim();
    const trimmedSchool = school.trim();
    const trimmedCourse = courseOfStudy.trim();
    const parsedAge = Number.parseInt(age, 10);
    const educationLabel =
      EDUCATION_OPTIONS.find((option) => option.value === educationLevel)
        ?.label ?? "";

    try {
      // 1. Explicit preferences — powers on-device scoring immediately and
      //    best-effort syncs interests + country to the backend recommender.
      await savePreferences({
        interests,
        careerGoals,
        educationLevel,
        experienceLevel,
        location: trimmedLocation,
      });

      // 2. Profile columns the personalization sync doesn't cover — saved
      //    through the backend /profile endpoint (direct Supabase writes
      //    silently dropped under RLS). interestedCountries + degree feed the
      //    recommendation engine's rule scorer and profile embedding.
      const token = await getProductApiToken(getToken);
      if (token) {
        const patch: ProfileUpdateInput = {};
        if (trimmedSchool) patch.school = trimmedSchool;
        if (educationLabel) patch.degree = educationLabel;
        if (interestedCountries.length > 0) {
          patch.interestedCountries = interestedCountries;
        }
        if (Object.keys(patch).length > 0) {
          await updateBackendProfile(token, patch);
        }
        // Ride-along sync of the engine's preferred categories/regions —
        // best-effort so a failed sync never fails onboarding.
        void syncOpportunityPreferences(token, {
          interests,
          careerGoals,
          interestedCountries,
        }).catch(() => {});
      }

      // 3. Onboarding record (name, course, age) — backend + Clerk metadata.
      if (user?.id) {
        await saveOnboardingProfile(token, {
          fullName: trimmedName,
          age: Number.isFinite(parsedAge) ? parsedAge : null,
          courseOfStudy: trimmedCourse,
          interests,
          goals: careerGoals,
          educationLevel,
          location: trimmedLocation,
          experience: experienceLevel,
          preferredLearning: [],
        });
      }

      success("Your feed is now personalized");
      onComplete?.();
    } catch {
      error("Could not save preferences", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const StepIcon = step.icon;

  if (showingWelcome) {
    const firstName = (user?.name ?? "").trim().split(/\s+/)[0];

    return (
      <div className="grid min-h-0 overflow-hidden md:grid-cols-[0.9fr_1.1fr]">
        <div className="relative flex min-h-[210px] items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,rgba(45,212,191,0.24),transparent_40%),linear-gradient(145deg,#eaf3ff_0%,#f7fbff_56%,#e8fbf7_100%)] px-6 pt-8 md:min-h-[500px] md:items-center dark:bg-[radial-gradient(circle_at_50%_35%,rgba(45,212,191,0.18),transparent_40%),linear-gradient(145deg,#10213f_0%,#0c1830_56%,#0b292a_100%)]">
          <span className="absolute left-[14%] top-[16%] h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_0_7px_rgba(251,191,36,0.12)]" />
          <span className="absolute bottom-[18%] right-[12%] h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_0_8px_rgba(34,211,238,0.1)]" />
          <div className="absolute inset-x-[18%] bottom-3 h-12 rounded-[50%] bg-blue-900/10 blur-xl" />
          <img
            src="/mascot/edutu-profile-guide.png"
            alt="Edutu mascot welcoming you"
            className="relative z-10 w-[180px] select-none object-contain drop-shadow-[0_22px_24px_rgba(16,63,126,0.18)] md:w-[310px]"
            draggable={false}
          />
        </div>

        <div className="flex flex-col justify-center px-6 pb-7 pt-6 sm:px-9 md:px-11 md:py-12">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-xl bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-700 dark:text-brand-300">
            <Clock3 size={14} aria-hidden="true" />
            About 2 minutes
          </div>
          <h1 className="max-w-md text-balance text-2xl font-bold leading-[1.08] tracking-[-0.035em] text-text-primary sm:text-[2rem]">
            Welcome to Edutu{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-3 max-w-md text-pretty text-sm font-medium leading-6 text-text-muted">
            Let&apos;s tune your feed around what you study, where you are, and
            the opportunities you want next.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => setShowingWelcome(false)}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(20,110,245,0.24)] transition hover:-translate-y-0.5 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.98]"
            >
              <Sparkles size={17} aria-hidden="true" />
              Personalize my feed
              <ArrowRight
                size={17}
                className="transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="h-11 rounded-2xl text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98]"
            >
              Maybe later
            </button>
          </div>
          <p className="mt-4 text-center text-xs font-medium text-text-muted">
            Change these details anytime from your profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        presentation === "modal"
          ? "flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col overflow-hidden bg-surface-layer text-text-primary"
          : "flex min-h-[100dvh] flex-col bg-surface-body text-text-primary"
      }
    >
      {/* ── Top bar: brand + skip ─────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-subtle bg-surface-body/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-surface-body/80">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/edutu-logo.png"
              alt="Edutu"
              className="h-8 w-8 rounded-lg"
            />
            <div className="min-w-0">
              <p className="text-2xs font-medium uppercase tracking-[0.14em] text-brand">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
              <p className="truncate text-sm font-display font-semibold">
                Personalize your feed
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-text-muted transition hover:bg-surface-elevated hover:text-text-primary disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>

        {/* Compact progress dots keep the quiz legible without another heavy rail. */}
        <div
          className="mx-auto flex w-full max-w-xl items-center justify-center gap-2 px-4 pb-3 sm:px-6"
          aria-label="Onboarding progress"
        >
          {STEPS.map((entry, index) => {
            const done = index < stepIndex;
            const current = index === stepIndex;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  if (index < stepIndex) {
                    setDirection(-1);
                    setStepIndex(index);
                  }
                }}
                disabled={index > stepIndex}
                className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                  current
                    ? "w-7 bg-brand"
                    : done
                      ? "w-2 bg-brand/70"
                      : "w-2 bg-surface-elevated"
                }`}
                aria-current={current ? "step" : undefined}
                aria-label={entry.label}
              />
            );
          })}
        </div>
      </header>

      {/* ── Step body ─────────────────────────────────────────────── */}
      <main className={`mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 ${presentation === "modal" ? "min-h-0" : ""}`}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -32 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className="mb-6 flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <StepIcon className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-display font-semibold tracking-tight text-text-primary">
                  {step.title}
                </h1>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  {step.subtitle}
                </p>
              </div>
            </div>

            {/* Step 1 — Profile */}
            {stepIndex === 0 && (
              <div className="space-y-5">
                <div>
                  <label className={labelClass} htmlFor="onb-name">
                    Full name
                  </label>
                  <input
                    id="onb-name"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="e.g. Ada Lovelace"
                    className={fieldClass}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="onb-age">
                      Age <span className="text-text-muted">(optional)</span>
                    </label>
                    <input
                      id="onb-age"
                      type="number"
                      inputMode="numeric"
                      min={10}
                      max={100}
                      value={age}
                      onChange={(event) => setAge(event.target.value)}
                      placeholder="e.g. 22"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="onb-location">
                      Where are you based?
                    </label>
                    <select
                      id="onb-location"
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Select your country…</option>
                      {/* Keep a previously saved free-text value selectable. */}
                      {location &&
                      !COUNTRIES.some((entry) => entry.name === location) ? (
                        <option value={location}>{location}</option>
                      ) : null}
                      {COUNTRIES.map((entry) => (
                        <option key={entry.name} value={entry.name}>
                          {entry.flag} {entry.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 — Education */}
            {stepIndex === 1 && (
              <div className="space-y-5">
                <div>
                  <span className={labelClass}>Education level</span>
                  <SegmentedGroup
                    label="Education level"
                    options={EDUCATION_OPTIONS}
                    value={educationLevel}
                    onChange={setEducationLevel}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="onb-school">
                      School / institution{" "}
                      <span className="text-text-muted">(optional)</span>
                    </label>
                    <input
                      id="onb-school"
                      type="text"
                      value={school}
                      onChange={(event) => setSchool(event.target.value)}
                      placeholder="e.g. University of Lagos"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="onb-course">
                      Field of study
                    </label>
                    <input
                      id="onb-course"
                      type="text"
                      value={courseOfStudy}
                      onChange={(event) => setCourseOfStudy(event.target.value)}
                      placeholder="e.g. Computer Science"
                      className={fieldClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3 — Interests */}
            {stepIndex === 2 && (
              <div className="space-y-5">
                <div>
                  <span className={labelClass}>
                    What should Edutu hunt for?
                  </span>
                  <MultiSelectDropdown
                    label="Interests"
                    options={INTEREST_OPTIONS}
                    selected={interests}
                    onToggle={(value) => toggleValue(value, setInterests)}
                    placeholder="Select your interests…"
                    searchPlaceholder="Search or add your own…"
                    allowCustom
                  />
                </div>
                <div>
                  <span className={labelClass}>
                    Where would you like to study or work?{" "}
                    <span className="text-text-muted">(optional)</span>
                  </span>
                  <MultiSelectDropdown
                    label="Interested countries"
                    options={DESTINATION_COUNTRY_NAMES}
                    selected={interestedCountries}
                    onToggle={(value) =>
                      toggleValue(value, setInterestedCountries)
                    }
                    placeholder="Select countries…"
                    searchPlaceholder="Search countries…"
                    optionPrefix={countryFlag}
                  />
                </div>
              </div>
            )}

            {/* Step 4 — Ambitions */}
            {stepIndex === 3 && (
              <div className="space-y-5">
                <div>
                  <span className={labelClass}>Your goals</span>
                  <MultiSelectDropdown
                    label="Goals"
                    options={GOAL_OPTIONS}
                    selected={careerGoals}
                    onToggle={(value) => toggleValue(value, setCareerGoals)}
                    placeholder="Select your goals…"
                    searchPlaceholder="Search or add your own…"
                    allowCustom
                  />
                </div>
                <div>
                  <span className={labelClass}>Experience level</span>
                  <SegmentedGroup
                    label="Experience level"
                    options={EXPERIENCE_OPTIONS}
                    value={experienceLevel}
                    onChange={setExperienceLevel}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Footer nav ────────────────────────────────────────────── */}
      <footer className="sticky bottom-0 z-20 border-t border-subtle bg-surface-layer/95 backdrop-blur supports-[backdrop-filter]:bg-surface-layer/80">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6">
          <button
            type="button"
            onClick={goBack}
            disabled={saving}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-3 text-sm font-semibold text-text-muted transition hover:text-text-primary disabled:opacity-50 ${
              stepIndex === 0 ? "invisible" : ""
            }`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            {isLastStep && !canFinish ? (
              <p className="hidden text-xs text-text-muted sm:block">
                Pick at least one interest or goal
              </p>
            ) : null}
            <button
              type="button"
              onClick={goNext}
              disabled={saving || (isLastStep && !canFinish)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isLastStep ? (
                <Check className="h-4 w-4" />
              ) : null}
              {saving
                ? "Saving…"
                : isLastStep
                  ? "Finish & personalize"
                  : "Continue"}
              {!isLastStep && !saving ? (
                <ArrowRight className="h-4 w-4" />
              ) : null}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function PersonalizationScreen() {
  const navigate = useNavigate();

  return (
    <OnboardingFlow
      presentation="page"
      onComplete={() => navigate("/dashboard", { replace: true })}
      onDismiss={() => navigate("/dashboard", { replace: true })}
    />
  );
}
