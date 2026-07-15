import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Loader2,
  LogOut,
  PencilLine,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { useAuth as useAppAuth } from "../hooks/useAuth";
import {
  getProductApiToken,
  isInvalidOrExpiredTokenError,
} from "../lib/clerkToken";
import { isProductApiUnavailableError } from "../services/productApi";
import PullToRefresh from "./ui/PullToRefresh";
import ProfileQuickStats from "./ProfileQuickStats";
import Button from "./ui/Button";
import Input from "./ui/Input";
import Label from "./ui/Label";
import Textarea from "./ui/Textarea";
import {
  fetchBackendProfile,
  updateBackendProfile,
  type BackendProfile,
  type ProfileUpdateInput,
} from "../services/profile";

function displayName(profile: BackendProfile | null, fallback?: string | null) {
  return (
    profile?.fullName ||
    profile?.full_name ||
    profile?.name ||
    fallback ||
    "Edutu learner"
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseSkills(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) => candidate.toLowerCase() === item.toLowerCase(),
        ) === index,
    );
}

function formatDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateAge(dateOfBirth: string) {
  if (!dateOfBirth) return null;
  const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birthDate.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && today.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

/**
 * Map raw transport errors to copy a member can act on. The raw messages
 * ("Invalid or expired token", "Product API route unavailable: /profile")
 * read like internals and users reported them as bugs in themselves.
 */
function friendlyProfileError(error: unknown, fallback: string): string {
  if (isInvalidOrExpiredTokenError(error)) {
    return "We couldn't verify your session with the server. Signing out and back in usually fixes this.";
  }
  if (isProductApiUnavailableError(error)) {
    return "Edutu's servers are unreachable right now. Your edits stay on this page — try saving again in a moment.";
  }
  return error instanceof Error ? error.message : fallback;
}

const FIELD_LABEL_CLASS_NAME = "font-semibold text-text-primary";
const FIELD_INPUT_CLASS_NAME =
  "h-11 rounded-xl border border-subtle bg-surface-layer px-3 pr-10 font-semibold text-text-secondary";
const DATE_INPUT_CLASS_NAME =
  "h-11 rounded-xl border border-subtle bg-surface-layer px-3 font-semibold text-text-secondary";
const SKILLS_TEXTAREA_CLASS_NAME =
  "resize-none rounded-xl border border-subtle px-3 py-3 pr-10 font-semibold leading-6 text-text-secondary";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { user, signOut } = useAppAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profile, setProfile] = useState<BackendProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [school, setSchool] = useState("");
  const [courseOfStudy, setCourseOfStudy] = useState("");
  const [degree, setDegree] = useState("");
  const [cgpa, setCgpa] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [interestedCountriesText, setInterestedCountriesText] = useState("");
  const [interestsText, setInterestsText] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionBroken, setSessionBroken] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const baselinePendingRef = useRef(false);

  const formSnapshot = useMemo(
    () =>
      JSON.stringify([
        fullName,
        email,
        country,
        school,
        courseOfStudy,
        degree,
        cgpa,
        gradYear,
        dateOfBirth,
        interestedCountriesText,
        interestsText,
        skillsText,
      ]),
    [
      fullName,
      email,
      country,
      school,
      courseOfStudy,
      degree,
      cgpa,
      gradYear,
      dateOfBirth,
      interestedCountriesText,
      interestsText,
      skillsText,
    ],
  );
  const isDirty = baseline !== null && formSnapshot !== baseline;

  // hydrateForm/prefill mark the next rendered snapshot as the clean baseline;
  // reading it from an effect keeps the comparison in sync with what the
  // member actually sees in the inputs.
  useEffect(() => {
    if (!baselinePendingRef.current) return;
    baselinePendingRef.current = false;
    setBaseline(formSnapshot);
  }, [formSnapshot]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    [],
  );

  const showSaved = useCallback((message: string) => {
    setSavedMessage(message);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedMessage(null), 4000);
  }, []);

  const scrollToStatus = useCallback(() => {
    requestAnimationFrame(() => {
      statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const resolveToken = useCallback(async () => {
    const token = await getProductApiToken(getToken, { forceRefresh: true });
    // Message is a sentinel: isInvalidOrExpiredTokenError routes it to the
    // session banner instead of the generic error banner.
    if (!token) throw new Error("Invalid or expired token");
    return token;
  }, [getToken]);

  const withFreshTokenRetry = useCallback(
    async <T,>(request: (token: string) => Promise<T>) => {
      try {
        return await request(await resolveToken());
      } catch (requestError) {
        if (!isInvalidOrExpiredTokenError(requestError)) {
          throw requestError;
        }

        return request(await resolveToken());
      }
    },
    [resolveToken],
  );

  const hydrateForm = useCallback(
    (nextProfile: BackendProfile) => {
      setProfile(nextProfile);
      setFullName(
        nextProfile.fullName ||
          nextProfile.full_name ||
          nextProfile.name ||
          user?.name ||
          "",
      );
      setEmail(nextProfile.email || user?.email || "");
      setCountry(
        typeof nextProfile.country === "string" ? nextProfile.country : "",
      );
      setSchool(
        typeof nextProfile.school === "string" ? nextProfile.school : "",
      );
      setCourseOfStudy(
        typeof nextProfile.courseOfStudy === "string"
          ? nextProfile.courseOfStudy
          : typeof nextProfile.major === "string"
            ? nextProfile.major
            : "",
      );
      setDegree(
        typeof nextProfile.degree === "string" ? nextProfile.degree : "",
      );
      setCgpa(nextProfile.cgpa == null ? "" : String(nextProfile.cgpa));
      setGradYear(
        nextProfile.gradYear == null ? "" : String(nextProfile.gradYear),
      );
      setDateOfBirth(formatDateInput(nextProfile.dateOfBirth));
      setInterestedCountriesText(
        Array.isArray(nextProfile.interestedCountries)
          ? nextProfile.interestedCountries.join(", ")
          : "",
      );
      setInterestsText(
        Array.isArray(nextProfile.interests)
          ? nextProfile.interests.join(", ")
          : "",
      );
      setSkillsText(
        Array.isArray(nextProfile.skills) ? nextProfile.skills.join(", ") : "",
      );
      baselinePendingRef.current = true;
    },
    [user?.email, user?.name],
  );

  /**
   * When the backend can't be reached the form still opens editable with
   * whatever Clerk knows client-side, instead of a wall of empty fields.
   */
  const prefillFromClerk = useCallback(() => {
    setFullName((current) => current || clerkUser?.fullName || user?.name || "");
    setEmail(
      (current) =>
        current ||
        clerkUser?.primaryEmailAddress?.emailAddress ||
        user?.email ||
        "",
    );
    baselinePendingRef.current = true;
  }, [clerkUser, user?.email, user?.name]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSessionBroken(false);
    try {
      hydrateForm(await withFreshTokenRetry(fetchBackendProfile));
    } catch (loadError) {
      if (isInvalidOrExpiredTokenError(loadError)) {
        setSessionBroken(true);
      } else {
        setError(friendlyProfileError(loadError, "Unable to load profile."));
      }
      prefillFromClerk();
    } finally {
      setLoading(false);
    }
  }, [hydrateForm, prefillFromClerk, withFreshTokenRetry]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const skills = useMemo(() => parseSkills(skillsText), [skillsText]);
  const interestedCountries = useMemo(
    () => parseSkills(interestedCountriesText),
    [interestedCountriesText],
  );
  const interests = useMemo(() => parseSkills(interestsText), [interestsText]);
  const calculatedAge = useMemo(() => calculateAge(dateOfBirth), [dateOfBirth]);
  const completeness = profile?.completeness;
  const completenessPercent = completeness?.percent ?? 0;

  const handleSignOut = async (destination: string = "/") => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      navigate(destination);
    } finally {
      setIsSigningOut(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMessage(null);

    const payload: ProfileUpdateInput = {
      fullName: fullName.trim() || null,
      email: email.trim() || null,
      country: country.trim() || null,
      school: school.trim() || null,
      courseOfStudy: courseOfStudy.trim() || null,
      degree: degree.trim() || null,
      cgpa: parseOptionalNumber(cgpa),
      gradYear: parseOptionalNumber(gradYear),
      dateOfBirth: dateOfBirth || null,
      interestedCountries:
        interestedCountries.length > 0 ? interestedCountries : null,
      interests: interests.length > 0 ? interests : null,
      skills: skills.length > 0 ? skills : null,
    };

    try {
      hydrateForm(
        await withFreshTokenRetry((token) =>
          updateBackendProfile(token, payload),
        ),
      );
      setSessionBroken(false);
      showSaved("Profile saved — your matches will use the new details.");
    } catch (saveError) {
      if (isInvalidOrExpiredTokenError(saveError)) {
        setSessionBroken(true);
      } else {
        setError(friendlyProfileError(saveError, "Unable to save profile."));
      }
    } finally {
      setSaving(false);
      scrollToStatus();
    }
  };

  return (
    <div className="min-h-[100dvh] bg-surface-body text-text-primary">
      <PullToRefresh
        onRefresh={loadProfile}
        disabled={loading || saving}
        className="min-h-[calc(100dvh-4rem)]"
      >
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <section
            className="rounded-[20px] border border-subtle bg-surface-layer p-5 shadow-soft sm:p-6"
          >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <UserCheck size={22} />
                </div>
                <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Your profile
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                  Keep your details current so Edutu can tune recommendations,
                  deadlines, and application support around you.
                </p>
              </div>
              <div className="rounded-2xl border border-subtle bg-surface-elevated p-4">
                <div className="flex items-center gap-3">
                  {clerkUser?.imageUrl ? (
                    <img
                      src={clerkUser.imageUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-base font-semibold text-white">
                      {displayName(profile, user?.name).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {displayName(profile, user?.name)}
                    </p>
                    <p className="truncate text-xs font-semibold text-text-muted">
                      {profile?.email || user?.email || "Signed in member"}
                    </p>
                  </div>
                </div>
                <div className="mt-5">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Profile completeness</span>
                    <span className="text-brand">
                      {completenessPercent}%
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full border border-subtle bg-surface-body">
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{ width: `${completenessPercent}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs font-semibold text-text-muted">
                    Last updated{" "}
                    {formatDate(profile?.updatedAt || profile?.updated_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={isSigningOut}
                  className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSigningOut ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <LogOut size={16} />
                  )}
                  {isSigningOut ? "Signing out…" : "Log out"}
                </button>
              </div>
            </div>
          </section>

          <ProfileQuickStats />

          <div ref={statusRef} aria-live="polite">
            {sessionBroken ? (
              <div className="mt-5 rounded-2xl border border-warning/30 bg-warning/10 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warning" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary">
                      We couldn't verify your session with the server
                    </p>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                      Your details are safe on this page, but saving needs a
                      fresh sign-in. This usually takes under a minute.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSignOut("/auth")}
                        disabled={isSigningOut}
                        className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60"
                      >
                        {isSigningOut ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <LogOut size={14} />
                        )}
                        Sign out & back in
                      </button>
                      <button
                        type="button"
                        onClick={() => void loadProfile()}
                        disabled={loading}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-subtle bg-surface-layer px-3 text-xs font-semibold text-text-secondary transition hover:bg-surface-elevated disabled:cursor-wait disabled:opacity-60"
                      >
                        <RefreshCw
                          size={14}
                          className={loading ? "animate-spin" : undefined}
                        />
                        Try again
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="mt-5 rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm font-semibold text-danger">
                {error}
              </div>
            ) : null}

            {savedMessage ? (
              <div className="mt-5 flex items-center gap-2 rounded-2xl border border-success/20 bg-success/10 p-4 text-sm font-semibold text-success">
                <CheckCircle2 size={17} className="shrink-0" />
                {savedMessage}
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <form
              onSubmit={saveProfile}
              className="rounded-[20px] border border-subtle bg-surface-layer p-5 shadow-soft sm:p-6"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Profile details
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    Tap any field to edit what Edutu should know about you.
                  </p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <PencilLine size={18} />
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="block">
                  <Label
                    htmlFor="profile-full-name"
                    className={FIELD_LABEL_CLASS_NAME}
                  >
                    Full name
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="profile-full-name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className={FIELD_INPUT_CLASS_NAME}
                      placeholder="Your name"
                    />
                    <PencilLine
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                  </div>
                </div>

                <div className="block">
                  <Label htmlFor="profile-email" className={FIELD_LABEL_CLASS_NAME}>
                    Email
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="profile-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className={FIELD_INPUT_CLASS_NAME}
                      placeholder="you@example.com"
                    />
                    <PencilLine
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                  </div>
                </div>

                <div className="block">
                  <Label htmlFor="profile-country" className={FIELD_LABEL_CLASS_NAME}>
                    Country
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="profile-country"
                      value={country}
                      onChange={(event) => setCountry(event.target.value)}
                      className={FIELD_INPUT_CLASS_NAME}
                      placeholder="Country or primary market"
                    />
                    <PencilLine
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                  </div>
                </div>

                <div className="block">
                  <Label htmlFor="profile-school" className={FIELD_LABEL_CLASS_NAME}>
                    School
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="profile-school"
                      value={school}
                      onChange={(event) => setSchool(event.target.value)}
                      className={FIELD_INPUT_CLASS_NAME}
                      placeholder="University or school"
                    />
                    <PencilLine
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                  </div>
                </div>

                <div className="block">
                  <Label
                    htmlFor="profile-course-of-study"
                    className={FIELD_LABEL_CLASS_NAME}
                  >
                    Course of study
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="profile-course-of-study"
                      value={courseOfStudy}
                      onChange={(event) => setCourseOfStudy(event.target.value)}
                      className={FIELD_INPUT_CLASS_NAME}
                      placeholder="Computer science, medicine, law"
                    />
                    <PencilLine
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                  </div>
                </div>

                <div className="block">
                  <Label htmlFor="profile-degree" className={FIELD_LABEL_CLASS_NAME}>
                    Degree level
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="profile-degree"
                      value={degree}
                      onChange={(event) => setDegree(event.target.value)}
                      className={FIELD_INPUT_CLASS_NAME}
                      placeholder="Undergraduate, masters, PhD"
                    />
                    <PencilLine
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                  </div>
                </div>

                <div className="block">
                  <Label htmlFor="profile-cgpa" className={FIELD_LABEL_CLASS_NAME}>
                    CGPA
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="profile-cgpa"
                      inputMode="decimal"
                      value={cgpa}
                      onChange={(event) => setCgpa(event.target.value)}
                      className={FIELD_INPUT_CLASS_NAME}
                      placeholder="4.5"
                    />
                    <PencilLine
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                  </div>
                </div>

                <div className="block">
                  <Label
                    htmlFor="profile-grad-year"
                    className={FIELD_LABEL_CLASS_NAME}
                  >
                    Graduation year
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="profile-grad-year"
                      inputMode="numeric"
                      value={gradYear}
                      onChange={(event) => setGradYear(event.target.value)}
                      className={FIELD_INPUT_CLASS_NAME}
                      placeholder="2027"
                    />
                    <PencilLine
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                  </div>
                </div>

                <div className="block">
                  <Label
                    htmlFor="profile-date-of-birth"
                    className={FIELD_LABEL_CLASS_NAME}
                  >
                    Date of birth
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="profile-date-of-birth"
                      type="date"
                      value={dateOfBirth}
                      onChange={(event) => setDateOfBirth(event.target.value)}
                      className={DATE_INPUT_CLASS_NAME}
                    />
                  </div>
                  {calculatedAge !== null ? (
                    <span className="mt-1 block text-xs font-medium text-text-muted">
                      Age {calculatedAge}
                    </span>
                  ) : null}
                </div>

                <div className="block sm:col-span-2">
                  <Label
                    htmlFor="profile-interested-countries"
                    className={FIELD_LABEL_CLASS_NAME}
                  >
                    Interested countries
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="profile-interested-countries"
                      value={interestedCountriesText}
                      onChange={(event) =>
                        setInterestedCountriesText(event.target.value)
                      }
                      className={FIELD_INPUT_CLASS_NAME}
                      placeholder="Canada, Germany, United Kingdom"
                    />
                    <PencilLine
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                  </div>
                </div>

                <div className="block sm:col-span-2">
                  <Label
                    htmlFor="profile-interests"
                    className={FIELD_LABEL_CLASS_NAME}
                  >
                    Opportunity interest tags
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="profile-interests"
                      value={interestsText}
                      onChange={(event) => setInterestsText(event.target.value)}
                      className={FIELD_INPUT_CLASS_NAME}
                      placeholder="Scholarships, fellowships, internships, research"
                    />
                    <PencilLine
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                  </div>
                </div>

                <div className="block sm:col-span-2">
                  <Label htmlFor="profile-skills" className={FIELD_LABEL_CLASS_NAME}>
                    Skills
                  </Label>
                  <div className="relative mt-2">
                    <Textarea
                      id="profile-skills"
                      value={skillsText}
                      onChange={(event) => setSkillsText(event.target.value)}
                      rows={5}
                      className={SKILLS_TEXTAREA_CLASS_NAME}
                      placeholder="Scholarship essays, data analysis, community leadership"
                    />
                    <PencilLine
                      size={16}
                      className="pointer-events-none absolute right-3 top-4 text-text-muted"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={saving || loading || !isDirty}
                >
                  {saving ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <Save size={17} />
                  )}
                  {saving
                    ? "Saving…"
                    : isDirty
                      ? "Save changes"
                      : "Saved"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate("/app/opportunities")}
                >
                  <Briefcase size={17} />
                  View matches
                </Button>
                {isDirty ? (
                  <span className="text-xs font-semibold text-text-muted">
                    Unsaved changes
                  </span>
                ) : null}
              </div>
            </form>

            <aside className="space-y-5">
              <div className="rounded-[20px] border border-subtle bg-surface-layer p-3 shadow-soft">
                <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Account
                </p>
                <nav className="mt-1 space-y-1">
                  {(
                    [
                      { label: "Settings", icon: Settings, to: "/app/settings" },
                      {
                        label: "Saved opportunities",
                        icon: Bookmark,
                        to: "/app/saved",
                      },
                      {
                        label: "My applications",
                        icon: Send,
                        to: "/app/applications",
                      },
                    ] as const
                  ).map(({ label, icon: Icon, to }) => (
                    <button
                      key={to}
                      type="button"
                      onClick={() => navigate(to)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-elevated text-text-secondary">
                        <Icon size={17} />
                      </span>
                      <span className="flex-1 truncate">{label}</span>
                      <ChevronRight size={16} className="text-text-muted" />
                    </button>
                  ))}
                </nav>
                <div className="mt-1 border-t border-subtle pt-1">
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={isSigningOut}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/10 text-danger">
                      {isSigningOut ? (
                        <Loader2 size={17} className="animate-spin" />
                      ) : (
                        <LogOut size={17} />
                      )}
                    </span>
                    <span className="flex-1 truncate">
                      {isSigningOut ? "Signing out…" : "Log out"}
                    </span>
                  </button>
                </div>
              </div>

              <div
                className="rounded-[20px] border border-subtle bg-surface-layer p-5 shadow-soft"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles size={17} />
                  Match readiness
                </div>
                {completeness?.missing.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {completeness.missing.map((field) => (
                      <span
                        key={field.key}
                        className="rounded-xl bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning"
                      >
                        {field.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm font-semibold leading-6 text-text-muted">
                    Your profile has the core details needed for better
                    matching.
                  </p>
                )}
              </div>

              {interestedCountries.length > 0 ? (
                <div
                  className="rounded-[20px] border border-subtle bg-surface-layer p-5 shadow-soft"
                >
                  <p className="text-sm font-semibold">Interested countries</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {interestedCountries.map((countryName) => (
                      <span
                        key={countryName}
                        className="rounded-xl bg-success/10 px-2.5 py-1 text-xs font-semibold text-success"
                      >
                        {countryName}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {interests.length > 0 ? (
                <div
                  className="rounded-[20px] border border-subtle bg-surface-layer p-5 shadow-soft"
                >
                  <p className="text-sm font-semibold">Interest tags</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {interests.map((interest) => (
                      <span
                        key={interest}
                        className="rounded-xl bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {skills.length > 0 ? (
                <div
                  className="rounded-[20px] border border-subtle bg-surface-layer p-5 shadow-soft"
                >
                  <p className="text-sm font-semibold">Skill tags</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-xl bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </main>
      </PullToRefresh>
    </div>
  );
}
