import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  GraduationCap,
  Loader2,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { usePersonalization } from "../hooks/usePersonalization";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "./ui/ToastProvider";
import { getProductApiToken } from "../lib/clerkToken";
import { updateBackendProfile, saveOnboardingProfile } from "../services/profile";

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

const STEPS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "interests", label: "Interests", icon: Sparkles },
  { id: "ambitions", label: "Ambitions", icon: Target },
] as const;

// ---------------------------------------------------------------------------
// Reusable inputs
// ---------------------------------------------------------------------------

interface ChipGroupProps {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  label: string;
}

function ChipGroup({ options, selected, onToggle, label }: ChipGroupProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isActive = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(option)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${
              isActive
                ? "border-brand bg-brand text-white shadow-soft"
                : "border-subtle bg-surface-layer text-text-secondary hover:border-brand/40 hover:bg-brand/5"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedGroupProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  label: string;
}

function SegmentedGroup({ options, value, onChange, label }: SegmentedGroupProps) {
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

const labelClass =
  "mb-1.5 block text-sm font-medium text-text-secondary";

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export default function PersonalizationScreen() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { preferences, savePreferences } = usePersonalization();
  const { user } = useAuth();
  const { getToken } = useClerkAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

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

  // Step 4 — ambitions
  const [careerGoals, setCareerGoals] = useState<string[]>(
    () => preferences?.careerGoals ?? [],
  );
  const [experienceLevel, setExperienceLevel] = useState(
    () => preferences?.experienceLevel ?? "intermediate",
  );

  const isLastStep = stepIndex === STEPS.length - 1;

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
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  };

  const goBack = () => {
    if (stepIndex === 0) {
      navigate(-1);
      return;
    }
    setStepIndex((index) => Math.max(index - 1, 0));
  };

  const handleFinish = async () => {
    setSaving(true);
    const trimmedName = fullName.trim();
    const trimmedLocation = location.trim();
    const trimmedSchool = school.trim();
    const trimmedCourse = courseOfStudy.trim();
    const parsedAge = Number.parseInt(age, 10);

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

      // 2. Profile fields the personalization sync doesn't cover — saved
      //    through the backend /profile endpoint (direct Supabase writes
      //    silently dropped under RLS). School goes in the same PATCH;
      //    name/course/age are handled by saveOnboardingProfile below.
      const token = await getProductApiToken(getToken);
      if (token && trimmedSchool) {
        await updateBackendProfile(token, { school: trimmedSchool });
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
      navigate("/dashboard");
    } catch {
      error("Could not save preferences", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const StepIcon = STEPS[stepIndex].icon;

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl bg-surface-body px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
      {/* Header + progress */}
      <header className="mb-6">
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label={stepIndex === 0 ? "Go back" : "Previous step"}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-subtle bg-surface-layer text-text-secondary transition hover:bg-surface-elevated"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand">
              Step {stepIndex + 1} of {STEPS.length}
            </p>
            <h1 className="truncate text-lg font-display font-semibold tracking-tight text-text-primary">
              Personalize your feed
            </h1>
          </div>
        </div>

        {/* Step rail */}
        <div className="flex items-center gap-2">
          {STEPS.map((step, index) => {
            const done = index < stepIndex;
            const current = index === stepIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => index <= stepIndex && setStepIndex(index)}
                disabled={index > stepIndex}
                className="flex flex-1 flex-col items-center gap-1.5"
                aria-current={current ? "step" : undefined}
                aria-label={step.label}
              >
                <span
                  className={`h-1.5 w-full rounded-full transition-colors ${
                    done || current ? "bg-brand" : "bg-surface-elevated"
                  }`}
                />
                <span
                  className={`hidden text-[11px] font-medium sm:block ${
                    current ? "text-brand" : "text-text-muted"
                  }`}
                >
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Step body */}
      <div className="rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <StepIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-display font-semibold tracking-tight text-text-primary">
              {stepIndex === 0 && "Tell us about you"}
              {stepIndex === 1 && "Your education"}
              {stepIndex === 2 && "What are you interested in?"}
              {stepIndex === 3 && "What are you aiming for?"}
            </h2>
            <p className="mt-0.5 text-sm text-text-muted">
              {stepIndex === 0 &&
                "We'll greet you by name and prioritize nearby opportunities."}
              {stepIndex === 1 &&
                "Helps us match programs to your level and field."}
              {stepIndex === 2 && "Pick as many as you like — you can change these later."}
              {stepIndex === 3 &&
                "We'll surface opportunities that get you there."}
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
                <input
                  id="onb-location"
                  type="text"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Country or city"
                  className={fieldClass}
                />
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
          <ChipGroup
            label="Interests"
            options={INTEREST_OPTIONS}
            selected={interests}
            onToggle={(value) => toggleValue(value, setInterests)}
          />
        )}

        {/* Step 4 — Ambitions */}
        {stepIndex === 3 && (
          <div className="space-y-6">
            <div>
              <span className={labelClass}>Your goals</span>
              <ChipGroup
                label="Goals"
                options={GOAL_OPTIONS}
                selected={careerGoals}
                onToggle={(value) => toggleValue(value, setCareerGoals)}
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
      </div>

      {/* Sticky footer nav */}
      <div className="fixed inset-x-0 bottom-0 border-t border-subtle bg-surface-layer/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface-layer/80 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-3 text-sm font-semibold text-text-muted transition hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            {stepIndex === 0 ? "Cancel" : "Back"}
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
              {isLastStep ? "Finish & personalize" : "Continue"}
              {!isLastStep && !saving ? (
                <ArrowRight className="h-4 w-4" />
              ) : null}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
