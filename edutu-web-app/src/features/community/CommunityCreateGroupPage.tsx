import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Link2, Lock, Search } from "lucide-react";
import Seo from "../../components/Seo";
import { fetchOpportunities, getCachedOpportunitiesSync } from "../../services/opportunities";
import type { Opportunity } from "../../types/opportunity";
import { CommunityApi, isCommunityApiError } from "./api";
import type { GroupJoinPolicy, GroupVisibility } from "./types";
import CommunityProductShell from "./components/CommunityProductShell";

const EMOJIS = ["💬", "🎓", "🚀", "💼", "🌍", "📚", "🤝", "💡"];
const NAME_MIN = 3;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 280;

export default function CommunityCreateGroupPage() {
  const { getToken } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const lockedOpportunityId = params.get("opportunityId");
  const lockedOpportunityTitle = params.get("opportunityTitle");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [visibility, setVisibility] = useState<GroupVisibility>("public");
  const [joinPolicy, setJoinPolicy] = useState<GroupJoinPolicy>("open");
  const [opportunities, setOpportunities] = useState<Opportunity[]>(() => getCachedOpportunitiesSync() ?? []);
  const [opportunityQuery, setOpportunityQuery] = useState("");
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [loadingOpportunities, setLoadingOpportunities] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (lockedOpportunityId) return;
    let active = true;
    setLoadingOpportunities(true);
    void fetchOpportunities({ limit: 60 })
      .then((rows) => {
        if (active) setOpportunities(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingOpportunities(false);
      });
    return () => {
      active = false;
    };
  }, [lockedOpportunityId]);

  const trimmedName = name.trim();
  const validName = trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;
  const nameError = touched && !validName ? "Use 3–60 characters for the community name." : null;
  const matchedOpportunities = useMemo(() => {
    const query = opportunityQuery.trim().toLowerCase();
    return opportunities
      .filter((opportunity) => {
        if (!query) return true;
        return `${opportunity.title} ${opportunity.organization}`.toLowerCase().includes(query);
      })
      .slice(0, 7);
  }, [opportunities, opportunityQuery]);

  const submit = async () => {
    setTouched(true);
    if (!validName || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const group = await api.createGroup({
        name: trimmedName,
        description: description.trim() || undefined,
        opportunityId: lockedOpportunityId ?? selectedOpportunity?.id ?? undefined,
        visibility,
        joinPolicy,
        coverEmoji: emoji,
      });
      navigate(`/app/community/groups/${group.id}`, { replace: true });
    } catch (caught) {
      setError(isCommunityApiError(caught) ? caught.message : "We couldn't create this community. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <>
      <Seo
        title="Create a community | Edutu"
        description="Create an Edutu community for people working toward the same opportunity or goal."
        path="/app/community/groups/new"
        noindex
      />
      <CommunityProductShell
        title="Create a community"
        description="Give people a clear reason to join. You can run up to two active groups at a time."
      >
        <div className="mx-auto max-w-2xl rounded-[26px] border border-[#f4dcc9] bg-white p-5 shadow-sm dark:border-subtle dark:bg-surface-layer sm:p-7">
          {error ? (
            <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <div className="space-y-6">
            <Field label="Community name" helper={`${name.length}/${NAME_MAX}`} error={nameError}>
              <input
                value={name}
                maxLength={NAME_MAX}
                onChange={(event) => {
                  setName(event.target.value);
                  setTouched(true);
                }}
                onBlur={() => setTouched(true)}
                placeholder="e.g. Chevening 2027 applicants"
                className={inputClass(Boolean(nameError))}
              />
            </Field>

            <Field label="What is this group for?" helper={`${description.length}/${DESCRIPTION_MAX}`}>
              <textarea
                value={description}
                maxLength={DESCRIPTION_MAX}
                rows={4}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="A short, specific purpose helps the right people join."
                className={`${inputClass(false)} min-h-28 resize-y py-3`}
              />
            </Field>

            <Field label="Community icon" helper="Pick one simple signal for the room.">
              <div className="grid grid-cols-8 gap-2">
                {EMOJIS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setEmoji(item)}
                    aria-pressed={emoji === item}
                    className={`flex aspect-square min-h-11 items-center justify-center rounded-xl border text-xl transition ${
                      emoji === item
                        ? "border-[#f45b16] bg-[#fcead5] ring-2 ring-[#f45b16]/15 dark:bg-brand/10"
                        : "border-[#f4dcc9] hover:border-[#f45b16]/35 dark:border-subtle"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Linked opportunity" helper="Optional. Link this room to one real Edutu opportunity.">
              {lockedOpportunityId ? (
                <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#f4dcc9] bg-[#fff9f1] px-4 dark:border-subtle dark:bg-surface-elevated">
                  <Lock size={16} className="text-[#a68d83]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#4a170d] dark:text-text-primary">{lockedOpportunityTitle || lockedOpportunityId}</p>
                    <p className="text-xs text-[#796f6b] dark:text-text-secondary">Fixed because this group was started from an opportunity.</p>
                  </div>
                </div>
              ) : selectedOpportunity ? (
                <div className="flex items-center gap-3 rounded-2xl border border-[#f45b16]/40 bg-[#fff9f1] p-3 dark:bg-brand/5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"><Link2 size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-bold text-[#4a170d] dark:text-text-primary">{selectedOpportunity.title}</p>
                    <p className="truncate text-xs text-[#796f6b] dark:text-text-secondary">{selectedOpportunity.organization}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedOpportunity(null)} className="min-h-10 rounded-xl px-3 text-xs font-bold text-[#f45b16]">Change</button>
                </div>
              ) : (
                <div>
                  <label className="relative block">
                    <Search size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[#a68d83]" />
                    <input
                      value={opportunityQuery}
                      onChange={(event) => setOpportunityQuery(event.target.value)}
                      placeholder="Search Edutu opportunities"
                      className={`${inputClass(false)} ps-10`}
                    />
                  </label>
                  {loadingOpportunities ? <p className="mt-2 text-xs text-[#796f6b]">Loading opportunities…</p> : null}
                  {matchedOpportunities.length > 0 ? (
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-[#f4dcc9] dark:border-subtle">
                      {matchedOpportunities.map((opportunity) => (
                        <button
                          key={opportunity.id}
                          type="button"
                          onClick={() => setSelectedOpportunity(opportunity)}
                          className="flex min-h-14 w-full items-center gap-3 border-b border-[#f4dcc9] px-3 py-2 text-start last:border-b-0 hover:bg-[#fff9f1] dark:border-subtle dark:hover:bg-surface-elevated"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"><Link2 size={16} /></span>
                          <span className="min-w-0">
                            <span className="line-clamp-1 text-sm font-bold text-[#4a170d] dark:text-text-primary">{opportunity.title}</span>
                            <span className="block truncate text-xs text-[#796f6b] dark:text-text-secondary">{opportunity.organization}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </Field>

            <ChoiceSection
              label="Who can see this community?"
              choices={[
                { value: "public", title: "Public", body: "Discoverable to signed-in members and eligible for a public summary page." },
                { value: "private", title: "Private", body: "Only people explicitly invited by an owner can enter." },
              ]}
              value={visibility}
              onChange={(value) => setVisibility(value as GroupVisibility)}
            />

            <ChoiceSection
              label="How do people join?"
              choices={[
                { value: "open", title: "Open", body: "People who can see the group can join immediately." },
                { value: "request", title: "Request to join", body: "People apply and an owner or moderator reviews them first." },
              ]}
              value={joinPolicy}
              onChange={(value) => setJoinPolicy(value as GroupJoinPolicy)}
            />

            <div className="flex flex-col-reverse gap-2 border-t border-[#f4dcc9] pt-5 dark:border-subtle sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="min-h-12 rounded-xl border border-[#f4dcc9] px-5 text-sm font-bold text-[#796f6b] dark:border-subtle dark:text-text-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!validName || submitting}
                onClick={() => void submit()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#f45b16] px-5 text-sm font-bold text-white transition hover:bg-[#d94b0f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Creating…" : <><Check size={17} /> Create community</>}
              </button>
            </div>
          </div>
        </div>
      </CommunityProductShell>
    </>
  );
}

function Field({
  label,
  helper,
  error,
  children,
}: {
  label: string;
  helper?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label className="text-sm font-bold text-[#4a170d] dark:text-text-primary">{label}</label>
        {helper ? <span className="text-xs text-[#9a8278] dark:text-text-muted">{helper}</span> : null}
      </div>
      {children}
      {error ? <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}

function ChoiceSection({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: Array<{ value: string; title: string; body: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold text-[#4a170d] dark:text-text-primary">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {choices.map((choice) => {
          const selected = value === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              onClick={() => onChange(choice.value)}
              aria-pressed={selected}
              className={`min-h-[88px] rounded-2xl border p-3 text-start transition ${
                selected
                  ? "border-[#f45b16] bg-[#fff9f1] ring-2 ring-[#f45b16]/10 dark:bg-brand/5"
                  : "border-[#f4dcc9] hover:border-[#f45b16]/35 dark:border-subtle"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-bold text-[#4a170d] dark:text-text-primary">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-[#f45b16] bg-[#f45b16] text-white" : "border-[#cdb5aa]"}`}>
                  {selected ? <Check size={12} /> : null}
                </span>
                {choice.title}
              </span>
              <span className="mt-1.5 block ps-7 text-xs leading-5 text-[#796f6b] dark:text-text-secondary">{choice.body}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function inputClass(hasError: boolean): string {
  return `min-h-12 w-full rounded-2xl border bg-white px-4 text-base text-[#4a170d] outline-none transition placeholder:text-[#aa958c] dark:bg-surface-layer dark:text-text-primary ${
    hasError
      ? "border-red-400 focus:ring-2 focus:ring-red-200/40"
      : "border-[#f4dcc9] focus:border-[#f45b16]/60 focus:ring-2 focus:ring-[#f45b16]/15 dark:border-subtle"
  }`;
}
