import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useClerk } from "../hooks/useAuth";
import {
  COMMUNITY_IMAGE_MAX_BYTES,
  createGroupCoverImageUpload,
  fetchGroupForm,
  isCommunityApiError,
  saveGroupForm,
  updateGroup,
  uploadCommunityAttachment,
  type GroupDetail,
  type GroupQuestion,
} from "../services/community";

type QuestionType = GroupQuestion["type"];
type DraftQuestion = {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  options: string[];
};

type ToolNotice = { tone: "success" | "error"; text: string } | null;

const MAX_QUESTIONS = 5;
const MAX_LABEL_CHARS = 60;
const MAX_OPTION_CHARS = 40;
const MAX_OPTIONS = 6;

function toDrafts(questions: GroupQuestion[]): DraftQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    type: question.type,
    label: question.label,
    required: question.required,
    options: question.type === "single_select" ? [...question.options] : [],
  }));
}

function toQuestions(drafts: DraftQuestion[]): GroupQuestion[] {
  return drafts.map((draft) => {
    if (draft.type === "single_select") {
      return {
        id: draft.id,
        type: "single_select",
        label: draft.label.trim(),
        required: draft.required,
        options: draft.options.map((option) => option.trim()).filter(Boolean),
      };
    }
    return {
      id: draft.id,
      type: draft.type,
      label: draft.label.trim(),
      required: draft.required,
    };
  });
}

function nextQuestion(existing: DraftQuestion[]): DraftQuestion {
  const ids = new Set(existing.map((question) => question.id));
  let index = existing.length + 1;
  while (ids.has(`q${index}`)) index += 1;
  return {
    id: `q${index}`,
    type: "short_text",
    label: "",
    required: false,
    options: [],
  };
}

function validateQuestions(questions: DraftQuestion[]): string | null {
  if (questions.length > MAX_QUESTIONS) return `Use at most ${MAX_QUESTIONS} screening questions.`;
  for (const question of questions) {
    if (!question.label.trim()) return "Every screening question needs a label.";
    if (question.type === "single_select") {
      const options = question.options.map((option) => option.trim()).filter(Boolean);
      if (options.length < 2) return "Single-choice questions need at least two options.";
      if (options.length > MAX_OPTIONS) return `Single-choice questions support at most ${MAX_OPTIONS} options.`;
    }
  }
  return null;
}

function Notice({ notice }: { notice: ToolNotice }) {
  if (!notice) return null;
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
        notice.tone === "error"
          ? "border-danger/20 bg-danger/10 text-danger"
          : "border-success/20 bg-success/10 text-success"
      }`}
    >
      {notice.text}
    </div>
  );
}

export default function CommunityGroupSettingsTools({
  detail,
  onDetailChange,
}: {
  detail: GroupDetail;
  onDetailChange: (detail: GroupDetail) => void;
}) {
  const { getToken } = useClerk();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsSaving, setQuestionsSaving] = useState(false);
  const [questionsNotice, setQuestionsNotice] = useState<ToolNotice>(null);
  const [coverSaving, setCoverSaving] = useState(false);
  const [coverNotice, setCoverNotice] = useState<ToolNotice>(null);
  const screeningApplies =
    detail.group.visibility === "public" && detail.group.joinPolicy === "request";

  useEffect(() => {
    let cancelled = false;
    setQuestionsLoading(true);
    fetchGroupForm(detail.group.id, getToken)
      .then((form) => {
        if (!cancelled) setQuestions(toDrafts(form.questions));
      })
      .catch((cause) => {
        if (!cancelled) {
          setQuestionsNotice({
            tone: "error",
            text: isCommunityApiError(cause)
              ? cause.message
              : "Screening questions could not be loaded.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setQuestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail.group.id, getToken]);

  const validationError = useMemo(() => validateQuestions(questions), [questions]);

  const updateQuestion = (id: string, patch: Partial<DraftQuestion>) => {
    setQuestions((current) =>
      current.map((question) => {
        if (question.id !== id) return question;
        const next = { ...question, ...patch };
        if (patch.type === "single_select" && next.options.length < 2) {
          next.options = [...next.options, ...Array(2 - next.options.length).fill("")];
        }
        return next;
      }),
    );
    setQuestionsNotice(null);
  };

  const saveQuestions = async () => {
    if (!screeningApplies) {
      setQuestionsNotice({
        tone: "error",
        text: "Switch this public group to Request approval and save group settings before adding screening questions.",
      });
      return;
    }
    if (validationError) {
      setQuestionsNotice({ tone: "error", text: validationError });
      return;
    }
    setQuestionsSaving(true);
    setQuestionsNotice(null);
    try {
      const saved = await saveGroupForm(
        detail.group.id,
        toQuestions(questions),
        getToken,
      );
      setQuestions(toDrafts(saved.questions));
      setQuestionsNotice({ tone: "success", text: "Screening questions saved." });
    } catch (cause) {
      setQuestionsNotice({
        tone: "error",
        text: isCommunityApiError(cause)
          ? cause.message
          : "Screening questions could not be saved.",
      });
    } finally {
      setQuestionsSaving(false);
    }
  };

  const saveCover = async (file: File) => {
    const allowedMime = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (!allowedMime || file.size <= 0 || file.size > COMMUNITY_IMAGE_MAX_BYTES) {
      setCoverNotice({
        tone: "error",
        text: "Choose a JPEG, PNG, or WebP image up to 5 MB.",
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setCoverSaving(true);
    setCoverNotice(null);
    try {
      const reservation = await createGroupCoverImageUpload(
        detail.group.id,
        {
          kind: "image",
          name: file.name,
          mime: file.type as "image/jpeg" | "image/png" | "image/webp",
          size: file.size,
        },
        getToken,
      );
      await uploadCommunityAttachment(reservation, file);
      const group = await updateGroup(
        detail.group.id,
        { coverImageResourceUrl: reservation.resourceUrl },
        getToken,
      );
      onDetailChange({ ...detail, group });
      setCoverNotice({ tone: "success", text: "Group photo updated." });
    } catch (cause) {
      setCoverNotice({
        tone: "error",
        text: isCommunityApiError(cause)
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Group photo could not be updated.",
      });
    } finally {
      setCoverSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeCover = async () => {
    if (!detail.group.coverImageResourceUrl || coverSaving) return;
    setCoverSaving(true);
    setCoverNotice(null);
    try {
      const group = await updateGroup(
        detail.group.id,
        { coverImageResourceUrl: null },
        getToken,
      );
      onDetailChange({ ...detail, group });
      setCoverNotice({ tone: "success", text: "Group photo removed." });
    } catch (cause) {
      setCoverNotice({
        tone: "error",
        text: isCommunityApiError(cause)
          ? cause.message
          : "Group photo could not be removed.",
      });
    } finally {
      setCoverSaving(false);
    }
  };

  return (
    <>
      <section className="rounded-[28px] border border-subtle bg-surface-layer p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ImageIcon size={19} className="text-brand-500" /> Group photo
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Add a JPEG, PNG, or WebP cover up to 5 MB. Files stay private behind Edutu’s authorized resource endpoint.
        </p>
        {detail.group.coverImageResourceUrl ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-subtle bg-surface-elevated">
            <img
              src={detail.group.coverImageResourceUrl}
              alt={`${detail.group.name} cover`}
              className="h-40 w-full object-cover"
            />
          </div>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void saveCover(file);
          }}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={coverSaving}
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {coverSaving ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
            {detail.group.coverImageResourceUrl ? "Replace photo" : "Add photo"}
          </button>
          {detail.group.coverImageResourceUrl ? (
            <button
              type="button"
              disabled={coverSaving}
              onClick={() => void removeCover()}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-danger/20 px-4 text-sm font-semibold text-danger disabled:opacity-60"
            >
              <Trash2 size={16} /> Remove photo
            </button>
          ) : null}
        </div>
        <Notice notice={coverNotice} />
      </section>

      <section className="rounded-[28px] border border-subtle bg-surface-layer p-5 sm:p-6 xl:col-span-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Screening questions</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              Ask up to five short, long-answer, or single-choice questions before approving a request to join.
            </p>
          </div>
          <button
            type="button"
            disabled={questionsSaving || questionsLoading || questions.length >= MAX_QUESTIONS}
            onClick={() => setQuestions((current) => [...current, nextQuestion(current)])}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border border-subtle px-4 text-sm font-semibold disabled:opacity-50"
          >
            <Plus size={16} /> Add question
          </button>
        </div>

        {!screeningApplies ? (
          <div className="mt-4 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm leading-6 text-text-secondary">
            Screening applies only to public groups using <strong>Request approval</strong>. Save that joining policy above before editing this form.
          </div>
        ) : null}

        {questionsLoading ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-text-muted">
            <Loader2 size={17} className="animate-spin" /> Loading screening questions…
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {questions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-subtle p-5 text-sm text-text-muted">
                No screening questions yet. Applicants can still request access without answering a form.
              </div>
            ) : null}
            {questions.map((question, questionIndex) => (
              <fieldset key={question.id} className="rounded-[22px] border border-subtle bg-surface-body p-4">
                <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Question {questionIndex + 1}
                </legend>
                <div className="mt-1 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <label className="block">
                    <span className="text-xs font-semibold text-text-secondary">Question</span>
                    <input
                      value={question.label}
                      maxLength={MAX_LABEL_CHARS}
                      onChange={(event) => updateQuestion(question.id, { label: event.target.value })}
                      className="mt-1 h-11 w-full rounded-xl border border-subtle bg-surface-layer px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      placeholder="What should we ask applicants?"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-text-secondary">Answer type</span>
                    <select
                      value={question.type}
                      onChange={(event) => updateQuestion(question.id, { type: event.target.value as QuestionType })}
                      className="mt-1 h-11 w-full rounded-xl border border-subtle bg-surface-layer px-3 text-sm"
                    >
                      <option value="short_text">Short text</option>
                      <option value="long_text">Long answer</option>
                      <option value="single_select">Single choice</option>
                    </select>
                  </label>
                  <div className="flex items-end gap-2">
                    <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-subtle px-3 text-xs font-semibold">
                      <input
                        type="checkbox"
                        checked={question.required}
                        onChange={(event) => updateQuestion(question.id, { required: event.target.checked })}
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => setQuestions((current) => current.filter((row) => row.id !== question.id))}
                      aria-label={`Remove question ${questionIndex + 1}`}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-danger/20 text-danger"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {question.type === "single_select" ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {question.options.map((option, optionIndex) => (
                      <div key={`${question.id}-option-${optionIndex}`} className="flex gap-2">
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">Option {optionIndex + 1}</span>
                          <input
                            value={option}
                            maxLength={MAX_OPTION_CHARS}
                            onChange={(event) => {
                              const next = [...question.options];
                              next[optionIndex] = event.target.value;
                              updateQuestion(question.id, { options: next });
                            }}
                            className="h-10 w-full rounded-xl border border-subtle bg-surface-layer px-3 text-sm"
                            placeholder={`Option ${optionIndex + 1}`}
                          />
                        </label>
                        {question.options.length > 2 ? (
                          <button
                            type="button"
                            aria-label={`Remove option ${optionIndex + 1}`}
                            onClick={() => updateQuestion(question.id, { options: question.options.filter((_, index) => index !== optionIndex) })}
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-subtle text-text-muted"
                          >
                            <X size={15} />
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {question.options.length < MAX_OPTIONS ? (
                      <button
                        type="button"
                        onClick={() => updateQuestion(question.id, { options: [...question.options, ""] })}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-subtle px-3 text-xs font-semibold text-text-secondary"
                      >
                        <Plus size={14} /> Add option
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>
            ))}
          </div>
        )}

        {validationError && questions.length ? (
          <p className="mt-3 text-sm font-semibold text-danger">{validationError}</p>
        ) : null}
        <button
          type="button"
          disabled={questionsSaving || questionsLoading || Boolean(validationError) || !screeningApplies}
          onClick={() => void saveQuestions()}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {questionsSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {questionsSaving ? "Saving…" : "Save screening questions"}
        </button>
        <Notice notice={questionsNotice} />
      </section>
    </>
  );
}
