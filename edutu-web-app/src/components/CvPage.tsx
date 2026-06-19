import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import {
  buildCvStats,
  cvDataToText,
  deleteCvRecord,
  generateCvDraft,
  listCvRecords,
  saveCvRecord,
  type CvRecord,
  type CvStats,
} from '../services/cvApi';

function formatDate(value?: string | null) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function asStats(value: CvRecord['stats'], text: string): CvStats {
  const stats = value as Partial<CvStats> | null | undefined;
  if (
    stats &&
    typeof stats.wordCount === 'number' &&
    Array.isArray(stats.sectionCoverage) &&
    Array.isArray(stats.keywordMatches)
  ) {
    return stats as CvStats;
  }
  return buildCvStats(text);
}

export default function CvPage() {
  const navigate = useNavigate();
  const { getToken } = useClerkAuth();
  const { isDarkMode } = useDarkMode();
  const [records, setRecords] = useState<CvRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [jobTarget, setJobTarget] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [textContent, setTextContent] = useState('');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) ?? records[0] ?? null,
    [records, selectedId],
  );

  const selectedStats = useMemo(
    () => selectedRecord ? asStats(selectedRecord.stats, selectedRecord.textContent) : null,
    [selectedRecord],
  );

  const resolveToken = useCallback(async () => {
    const token = await getToken().catch(() => null);
    if (!token) throw new Error('Your session has expired. Sign in again to manage CVs.');
    return token;
  }, [getToken]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await resolveToken();
      const nextRecords = await listCvRecords(token);
      setRecords(nextRecords);
      setSelectedId((current) => current ?? nextRecords[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load CV records.');
    } finally {
      setLoading(false);
    }
  }, [resolveToken]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const saveManualRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('CV title is required.');
      return;
    }
    if (!textContent.trim()) {
      setError('CV content is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = await resolveToken();
      const record = await saveCvRecord(
        {
          title: title.trim(),
          fileName: `${title.trim().replace(/\s+/g, '_').toLowerCase()}.txt`,
          fileSize: new Blob([textContent]).size,
          mimeType: 'text/plain',
          textContent,
          stats: buildCvStats(textContent),
          jobTarget: jobTarget.trim() || null,
          jobDescription: jobDescription.trim() || null,
          generated: false,
        },
        token,
      );
      const nextRecords = await listCvRecords(token);
      setRecords(nextRecords);
      setSelectedId(record.id);
      setTitle('');
      setTextContent('');
      setJobTarget('');
      setJobDescription('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save CV.');
    } finally {
      setSaving(false);
    }
  };

  const generateDraft = async () => {
    if (!draftPrompt.trim()) {
      setError('Describe the role or opportunity before generating a draft.');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const token = await resolveToken();
      const draft = await generateCvDraft({ prompt: draftPrompt.trim() }, token);
      const draftText = cvDataToText(draft.cv);
      const titleText = draft.cv.header?.full_name
        ? `${draft.cv.header.full_name} CV`
        : `${draftPrompt.trim().slice(0, 48)} CV`;
      const record = await saveCvRecord(
        {
          title: titleText,
          fileName: `${titleText.replace(/\s+/g, '_').toLowerCase()}.txt`,
          fileSize: new Blob([draftText]).size,
          mimeType: 'text/plain',
          textContent: draftText,
          stats: buildCvStats(draftText),
          jobTarget: draftPrompt.trim(),
          generated: true,
          analysis: { suggestions: draft.suggestions },
        },
        token,
      );
      setRecords(await listCvRecords(token));
      setSelectedId(record.id);
      setDraftPrompt('');
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : 'Unable to generate CV draft.');
    } finally {
      setGenerating(false);
    }
  };

  const removeRecord = async (recordId: string) => {
    if (confirmingDeleteId !== recordId) {
      setConfirmingDeleteId(recordId);
      return;
    }

    setConfirmingDeleteId(null);
    setError(null);

    try {
      const token = await resolveToken();
      await deleteCvRecord(recordId, token);
      const nextRecords = records.filter((record) => record.id !== recordId);
      setRecords(nextRecords);
      setSelectedId(nextRecords[0]?.id ?? null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete CV.');
    }
  };

  const downloadRecord = () => {
    if (!selectedRecord) return;
    const blob = new Blob([selectedRecord.textContent], {
      type: selectedRecord.mimeType || 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedRecord.fileName || `${selectedRecord.title}.txt`;
    link.click();
    URL.revokeObjectURL(url);
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
            <ArrowLeft size={17} />
            Dashboard
          </button>
          <button
            type="button"
            onClick={loadRecords}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCcw size={17} />}
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className={`rounded-[20px] border p-5 sm:p-6 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <FileText size={22} />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">CV Builder</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Build, save, review, and download CV records through the Edutu backend.
              </p>
            </div>
            <div className={`grid grid-cols-3 gap-3 rounded-2xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
              {[
                ['Records', records.length],
                ['Words', selectedStats?.wordCount ?? 0],
                ['Sections', selectedStats?.sectionCoverage.filter((item) => item.present).length ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="mt-2 text-2xl font-black">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
          <aside className={`rounded-[20px] border ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
            <div className={`border-b p-4 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              <h2 className="flex items-center gap-2 text-base font-black">
                <FileText size={18} />
                Saved CVs
              </h2>
            </div>
            <div className="max-h-[520px] overflow-y-auto p-3">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-white/10" />
                  ))}
                </div>
              ) : records.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                  No CV records yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {records.map((record) => {
                    const active = record.id === selectedRecord?.id;
                    return (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => setSelectedId(record.id)}
                        className={`w-full rounded-2xl border p-3 text-left transition ${
                          active
                            ? 'border-brand-500/30 bg-brand-500/10'
                            : isDarkMode
                              ? 'border-white/10 bg-white/5 hover:bg-white/10'
                              : 'border-slate-200 bg-slate-50 hover:bg-white'
                        }`}
                      >
                        <p className="line-clamp-2 text-sm font-black">{record.title}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          <span>{formatDate(record.uploadedAt)}</span>
                          {record.generated ? <span>Generated</span> : <span>Manual</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
            {selectedRecord ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black tracking-tight">{selectedRecord.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                      {selectedRecord.fileName} | {formatDate(selectedRecord.updatedAt || selectedRecord.uploadedAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={downloadRecord}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                      <Download size={16} />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeRecord(selectedRecord.id)}
                      className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold transition ${
                        confirmingDeleteId === selectedRecord.id
                          ? 'bg-rose-500 text-white'
                          : 'border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10'
                      }`}
                    >
                      <Trash2 size={16} />
                      {confirmingDeleteId === selectedRecord.id ? 'Confirm' : 'Delete'}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    ['Words', selectedStats?.wordCount ?? 0],
                    ['Readability', `${selectedStats?.readability ?? 0}%`],
                    ['Matched keywords', selectedStats?.keywordMatches.filter((item) => item.found).length ?? 0],
                  ].map(([label, value]) => (
                    <div key={label} className={`rounded-2xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
                      <p className="mt-2 text-xl font-black">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-gray-950">
                  <pre className="max-h-[520px] whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
                    {selectedRecord.textContent}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center text-center">
                <div>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    <FileText size={22} />
                  </div>
                  <h2 className="mt-4 text-base font-black">No CV selected</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Save or generate a CV record to review it here.
                  </p>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
              <h2 className="flex items-center gap-2 text-base font-black">
                <Plus size={18} />
                Save CV text
              </h2>
              <form className="mt-4 space-y-3" onSubmit={saveManualRecord}>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Title</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Target role</span>
                  <input
                    value={jobTarget}
                    onChange={(event) => setJobTarget(event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">CV text</span>
                  <textarea
                    value={textContent}
                    onChange={(event) => setTextContent(event.target.value)}
                    rows={8}
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Opportunity notes</span>
                  <textarea
                    value={jobDescription}
                    onChange={(event) => setJobDescription(event.target.value)}
                    rows={3}
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-black text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save CV
                </button>
              </form>
            </section>

            <section className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
              <h2 className="flex items-center gap-2 text-base font-black">
                <Sparkles size={18} />
                Generate draft
              </h2>
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Target</span>
                  <textarea
                    value={draftPrompt}
                    onChange={(event) => setDraftPrompt(event.target.value)}
                    rows={4}
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void generateDraft()}
                  disabled={generating}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  Generate and save
                </button>
              </div>
            </section>

            {selectedStats ? (
              <section className={`rounded-[20px] border p-5 ${isDarkMode ? 'border-white/10 bg-gray-900/70' : 'border-slate-200 bg-white shadow-sm'}`}>
                <h2 className="flex items-center gap-2 text-base font-black">
                  <Target size={18} />
                  Section coverage
                </h2>
                <div className="mt-4 space-y-2">
                  {selectedStats.sectionCoverage.map((section) => (
                    <div key={section.section} className="flex items-center justify-between gap-3 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold dark:bg-white/10">
                      <span>{section.section}</span>
                      <span className={section.present ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400'}>
                        {section.present ? <CheckCircle2 size={16} /> : 'Missing'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}
