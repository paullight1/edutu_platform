import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  ChevronLeft,
  Globe2,
  Loader2,
  Mail,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { useAuth as useAppAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import {
  fetchBackendProfile,
  updateBackendProfile,
  type BackendProfile,
  type ProfileUpdateInput,
} from '../services/profile';

function displayName(profile: BackendProfile | null, fallback?: string | null) {
  return profile?.fullName || profile?.full_name || profile?.name || fallback || 'Edutu learner';
}

function formatDate(value?: string | null) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function parseSkills(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index);
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const { isDarkMode } = useDarkMode();
  const [profile, setProfile] = useState<BackendProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const resolveToken = useCallback(async () => {
    const token = await getToken().catch(() => null);
    if (!token) throw new Error('Your session has expired. Sign in again to manage your profile.');
    return token;
  }, [getToken]);

  const hydrateForm = useCallback((nextProfile: BackendProfile) => {
    setProfile(nextProfile);
    setFullName(nextProfile.fullName || nextProfile.full_name || nextProfile.name || user?.name || '');
    setEmail(nextProfile.email || user?.email || '');
    setCountry(typeof nextProfile.country === 'string' ? nextProfile.country : '');
    setSkillsText(Array.isArray(nextProfile.skills) ? nextProfile.skills.join(', ') : '');
  }, [user?.email, user?.name]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await resolveToken();
      hydrateForm(await fetchBackendProfile(token));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load profile.');
    } finally {
      setLoading(false);
    }
  }, [hydrateForm, resolveToken]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const skills = useMemo(() => parseSkills(skillsText), [skillsText]);
  const completeness = profile?.completeness;
  const completenessPercent = completeness?.percent ?? 0;

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMessage(null);

    const payload: ProfileUpdateInput = {
      fullName: fullName.trim() || null,
      email: email.trim() || null,
      country: country.trim() || null,
      skills: skills.length > 0 ? skills : null,
    };

    try {
      const token = await resolveToken();
      hydrateForm(await updateBackendProfile(token, payload));
      setSavedMessage('Profile saved');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`min-h-[100dvh] ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-950'}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${isDarkMode ? 'border-white/10 bg-gray-950/90' : 'border-slate-200 bg-white/90'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ChevronLeft size={17} />
            Dashboard
          </button>
          <button
            type="button"
            onClick={loadProfile}
            disabled={loading || saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCcw size={17} />}
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className={`rounded-[20px] border p-5 sm:p-6 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <UserCheck size={22} />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Profile management</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Keep the backend profile Edutu uses for recommendations, creator checks, and account identity up to date.
              </p>
            </div>
            <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-base font-black text-white">
                  {displayName(profile, user?.name).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{displayName(profile, user?.name)}</p>
                  <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {profile?.email || user?.email || 'Signed in member'}
                  </p>
                </div>
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between text-sm font-black">
                  <span>Profile completeness</span>
                  <span className="text-brand-600 dark:text-brand-300">{completenessPercent}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${completenessPercent}%` }}
                  />
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Updated {formatDate(profile?.updatedAt || profile?.updated_at)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {savedMessage ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            {savedMessage}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form
            onSubmit={saveProfile}
            className={`rounded-[20px] border p-5 sm:p-6 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-black">Full name</span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  placeholder="Your name"
                />
              </label>

              <label className="block">
                <span className="text-sm font-black">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm font-black">Country</span>
                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  placeholder="Country or primary market"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm font-black">Skills</span>
                <textarea
                  value={skillsText}
                  onChange={(event) => setSkillsText(event.target.value)}
                  rows={5}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold leading-6 text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  placeholder="Scholarship essays, data analysis, community leadership"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving || loading}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-black text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                Save profile
              </button>
              <button
                type="button"
                onClick={() => navigate('/opportunities')}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <Briefcase size={17} />
                View matches
              </button>
            </div>
          </form>

          <aside className="space-y-5">
            <div className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
              <div className="flex items-center gap-2 text-sm font-black">
                <Sparkles size={17} />
                Match readiness
              </div>
              {completeness?.missing.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {completeness.missing.map((field) => (
                    <span
                      key={field.key}
                      className="rounded-xl bg-amber-500/10 px-2.5 py-1 text-xs font-black text-amber-700 dark:text-amber-300"
                    >
                      {field.label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                  Your backend profile has the core fields needed for account matching.
                </p>
              )}
            </div>

            <div className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
              <div className="flex items-center gap-2 text-sm font-black">
                <ShieldCheck size={17} />
                Backend account
              </div>
              <div className="mt-4 space-y-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <Mail size={16} className="text-slate-400" />
                  <span className="truncate">{profile?.email || user?.email || 'No email saved'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe2 size={16} className="text-slate-400" />
                  <span className="truncate">{country.trim() || 'No country saved'}</span>
                </div>
              </div>
            </div>

            {skills.length > 0 ? (
              <div className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
                <p className="text-sm font-black">Skill tags</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-xl bg-brand-500/10 px-2.5 py-1 text-xs font-black text-brand-700 dark:text-brand-300"
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
    </div>
  );
}
