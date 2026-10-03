import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  FileText,
  Flag,
  GraduationCap,
  History,
  Pause,
  Plus,
  Route,
  Send,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import CoachComposer from "./CoachComposer";
import { usePaywall } from "../../hooks/usePaywall";
import { errorMessage, useProductSession } from "../workspace/shared";
import { sendCoachTurn, type CoachMessage } from "./stream";
import {
  COACH_NEW_CONVERSATION_EVENT,
  COACH_OPEN_HISTORY_EVENT,
} from "./coachEvents";

interface CoachThread {
  id: string;
  title: string | null;
  updated_at: string;
}
interface OpportunityCard {
  id: string;
  title: string;
  organization?: string | null;
  category?: string | null;
  location?: string | null;
  deadline?: string | null;
  imageUrl?: string | null;
  matchScore?: number | null;
}
interface CoachAction {
  id: string;
  kind: string;
  label: string;
  payload: Record<string, unknown>;
}
type CoachMessageView = Omit<CoachMessage, "metadata"> & {
  created_at?: string;
  metadata?: {
    opportunities?: OpportunityCard[];
    actionButtons?: CoachAction[];
    documents?: Array<{
      docId: string;
      type: string;
      title: string;
      version: number;
      url?: string;
      format?: string;
    }>;
    images?: Array<{ url: string; title?: string }>;
    deviceActions?: Array<{
      type: string;
      payload: Record<string, unknown>;
    }>;
    roadmapIntent?: boolean;
    stopped?: boolean;
    stoppedBeforeReply?: boolean;
    interrupted?: boolean;
    truncated?: boolean;
  };
};
const CONTEXT_SENTINEL = "\u2063\u2063EDUTU_CTX\u2063\u2063";
const QUICK_PROMPTS = [
  {
    key: "coachPage.findScholarships",
    prompt: "Find scholarships I can apply for this month",
    icon: GraduationCap,
  },
  {
    key: "coachPage.buildRoadmap",
    prompt: "Build a roadmap for my next application",
    icon: Route,
  },
];

function visibleMessage(message: string) {
  return message.split(CONTEXT_SENTINEL)[0].trim();
}
function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function historyGroup(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "older";
  const days = Math.floor(
    (new Date(now.toDateString()).getTime() -
      new Date(date.toDateString()).getTime()) /
      86400000,
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "thisWeek";
  return "older";
}
function downloadCalendarAction(payload: Record<string, unknown>) {
  const milestones = Array.isArray(payload.milestones)
    ? payload.milestones.filter(
        (item): item is { title: string; dueDate: string } =>
          !!item &&
          typeof item === "object" &&
          typeof (item as { title?: unknown }).title === "string" &&
          typeof (item as { dueDate?: unknown }).dueDate === "string" &&
          !Number.isNaN(
            new Date((item as { dueDate: string }).dueDate).getTime(),
          ),
      )
    : [];
  if (!milestones.length) return false;
  const escape = (value: string) =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const dateStamp = (value: Date) =>
    value
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const events = milestones.map((item) => {
    const start = new Date(item.dueDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return [
      "BEGIN:VEVENT",
      `UID:${crypto.randomUUID()}@edutu.org`,
      `DTSTAMP:${dateStamp(new Date())}`,
      `DTSTART;VALUE=DATE:${dateStamp(start).slice(0, 8)}`,
      `DTEND;VALUE=DATE:${dateStamp(end).slice(0, 8)}`,
      `SUMMARY:${escape(item.title)}`,
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escape(item.title)}`,
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  });
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Edutu//AI Coach//EN",
    `X-WR-CALNAME:${escape(typeof payload.title === "string" ? payload.title : "Edutu plan")}`,
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "edutu-plan.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
async function shareCoachImage(url: string, title: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
function RichText({ text }: { text: string }) {
  const lines = text
    .replace(/\r/g, "")
    .replace(/^\s*#+\s*/gm, "")
    .split("\n")
    .map((line) => line.trim());
  const inline = (value: string, key: string) =>
    value.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
      const bold = part.match(/^\*\*(.+)\*\*$/);
      return bold ? <strong key={`${key}-${i}`}>{bold[1]}</strong> : part;
    });
  const blocks: Array<
    { type: "text"; line: string } | { type: "table"; rows: string[][] }
  > = [];
  for (let index = 0; index < lines.length;) {
    if (!lines[index]) {
      index++;
      continue;
    }
    if (/^\|.*\|$/.test(lines[index])) {
      const rows: string[][] = [];
      while (index < lines.length && /^\|.*\|$/.test(lines[index])) {
        const row = lines[index++];
        if (/^[-\s|:]+$/.test(row)) continue;
        rows.push(
          row
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((cell) => cell.trim()),
        );
      }
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }
    blocks.push({ type: "text", line: lines[index++] });
  }
  return (
    <div className="coach-rich-text">
      {blocks.map((block, blockIndex) => {
        if (block.type === "table")
          return (
            <div
              className="coach-table-scroll"
              role="region"
              aria-label="Response table"
              tabIndex={0}
              key={`table-${blockIndex}`}
            >
              <table>
                <thead>
                  <tr>
                    {block.rows[0].map((cell, i) => (
                      <th key={i}>{inline(cell, `h-${i}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.slice(1).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, i) => (
                        <td key={i}>{inline(cell, `r-${rowIndex}-${i}`)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        const bullet = block.line.match(/^\s*[-•*]\s+(.+)/);
        const number = block.line.match(/^\s*(\d+)[.)]\s+(.+)/);
        return (
          <p key={`line-${blockIndex}`}>
            {bullet || number ? (
              <>
                <span aria-hidden="true">
                  {bullet ? "•" : `${number?.[1]}.`}
                </span>{" "}
              </>
            ) : null}
            {inline(
              bullet?.[1] ?? number?.[2] ?? block.line,
              `line-${blockIndex}`,
            )}
          </p>
        );
      })}
    </div>
  );
}

export default function CoachPage() {
  const { request, token, userId } = useProductSession();
  const { i18n, t } = useTranslation();
  const { refreshBilling, handleUpgradeError } = usePaywall();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [threads, setThreads] = useState<CoachThread[]>([]);
  const [thread, setThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<CoachMessageView[]>([]);
  const [draft, setDraft] = useState(params.get("prompt") || "");
  const [error, setError] = useState<string | null>(null);
  const [pendingResend, setPendingResend] = useState<string | null>(null);
  const [reportingMessage, setReportingMessage] =
    useState<CoachMessageView | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const streamText = useRef("");
  const bottom = useRef<HTMLDivElement>(null);
  const historyDialog = useRef<HTMLDivElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const reportDialog = useRef<HTMLDivElement>(null);
  const reportTrigger = useRef<HTMLElement | null>(null);
  const loadVersion = useRef(0);
  const utteranceId = useRef(0);

  const refreshThreads = useCallback(async () => {
    const result = await request<{ threads: CoachThread[] }>("/chat/threads");
    setThreads(result.threads);
  }, [request]);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++loadVersion.current;
    setMessages([]);
    setThread(null);
    setDraft(params.get("prompt") || "");
    setLoading(true);
    setError(null);
    request<{ threads: CoachThread[] }>("/chat/threads", {
      signal: controller.signal,
    })
      .then(async (result) => {
        if (controller.signal.aborted || version !== loadVersion.current)
          return;
        setThreads(result.threads);
        const requestedThread = params.get("threadId");
        const latest = requestedThread ? result.threads.find((item) => item.id === requestedThread) : params.get("opportunityId") ? undefined : result.threads[0];
        if (latest && !params.get("prompt")) {
          const history = await request<{ messages: CoachMessageView[] }>(
            `/chat/threads/${latest.id}/messages`,
            { signal: controller.signal },
          );
          if (controller.signal.aborted || version !== loadVersion.current)
            return;
          setThread(latest.id);
          setMessages(history.messages);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      abort.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, [request, userId, params]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, stream]);

  useEffect(() => {
    if (!historyOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const historyTrigger = historyButton.current;
    const focusHistoryTrigger = historyTrigger?.getClientRects().length
      ? historyTrigger
      : previousFocus;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = historyDialog.current;
    dialog?.querySelector<HTMLElement>("button, a[href]")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setHistoryOpen(false);
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = [
        ...dialog.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href]",
        ),
      ];
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      focusHistoryTrigger?.focus();
    };
  }, [historyOpen]);

  useEffect(() => {
    if (!reportingMessage) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const trigger = reportTrigger.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    reportDialog.current
      ?.querySelector<HTMLElement>("button:not([disabled])")
      ?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setReportingMessage(null);
      }
      if (event.key !== "Tab" || !reportDialog.current) return;
      const controls = [
        ...reportDialog.current.querySelectorAll<HTMLElement>(
          "button:not([disabled])",
        ),
      ];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (trigger || previousFocus)?.focus();
    };
  }, [reportingMessage]);

  async function open(id: string) {
    if (busy) return;
    const version = ++loadVersion.current;
    setError(null);
    setLoading(true);
    setHistoryOpen(false);
    try {
      const result = await request<{ messages: CoachMessageView[] }>(
        `/chat/threads/${id}/messages`,
      );
      if (version !== loadVersion.current) return;
      setThread(id);
      setMessages(result.messages);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }

  function startNewConversation() {
    loadVersion.current++;
    abort.current?.abort();
    setThread(null);
    setMessages([]);
    setStream("");
    setError(null);
    setDraft("");
    setHistoryOpen(false);
  }

  async function send(value = draft) {
    const input = value.trim();
    if (!input || busy) return;
    const controller = new AbortController();
    abort.current = controller;
    const pendingId = `pending-${crypto.randomUUID()}`;
    const pendingMessage: CoachMessageView = {
      id: pendingId,
      role: "user",
      content: input,
    };
    setBusy(true);
    setError(null);
    setPendingResend(null);
    setDraft("");
    streamText.current = "";
    setStream("");
    setMessages((current) => [...current, pendingMessage]);
    try {
      const result = await sendCoachTurn(
        await token(),
        {
          threadId: thread,
          message: input,
          locale: i18n.language,
          context: params.get("opportunityId")
            ? { opportunityId: params.get("opportunityId") }
            : undefined,
        },
        controller.signal,
        (text) => {
          streamText.current = text;
          setStream(text);
        },
      );
      setThread(result.threadId);
      setMessages((current) => [
        ...current.filter((message) => message.id !== pendingId),
        result.userMessage,
        result.assistantMessage,
      ]);
      void refreshThreads().catch(() => {});
      window.dispatchEvent(new Event("edutu:ai-complete"));
      void refreshBilling();
    } catch (e) {
      if (controller.signal.aborted) {
        setMessages((current) => [
          ...current,
          {
            id: `stopped-${pendingId}`,
            role: "assistant",
            content: streamText.current,
            metadata: {
              stopped: true,
              stoppedBeforeReply: !streamText.current.trim(),
            },
          },
        ]);
      } else {
        setMessages((current) =>
          current.filter((message) => message.id !== pendingId),
        );
        setDraft((current) => current || input);
        if (handleUpgradeError(e)) setPendingResend(input);
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
      streamText.current = "";
      setStream("");
    }
  }

  async function remove(id: string) {
    if (
      !window.confirm(
        t("coachPage.deleteConfirm", {
          defaultValue: "Delete this conversation?",
        }),
      )
    )
      return;
    try {
      await request(`/chat/threads/${id}`, { method: "DELETE" });
      setThreads((rows) => rows.filter((row) => row.id !== id));
      if (thread === id) {
        setThread(null);
        setMessages([]);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function submitReport(reason: "inaccurate" | "offensive" | "other") {
    if (!reportingMessage || reportBusy) return;
    setReportBusy(true);
    setReportError("");
    try {
      await request("/chat/reports", {
        method: "POST",
        body: JSON.stringify({
          source: "chat",
          reason,
          content: visibleMessage(reportingMessage.content).slice(0, 8000),
          context: { messageId: reportingMessage.id, threadId: thread },
        }),
      });
      setReportingMessage(null);
      setReportStatus(
        t("coachPage.reportSubmitted", {
          defaultValue: "Thanks. Your report was submitted.",
        }),
      );
    } catch (e) {
      setReportError(errorMessage(e));
    } finally {
      setReportBusy(false);
    }
  }

  function readAloud(message: CoachMessageView) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (speakingId === message.id) {
      setSpeakingId(null);
      return;
    }
    const id = ++utteranceId.current;
    const utterance = new SpeechSynthesisUtterance(
      visibleMessage(message.content),
    );
    utterance.lang = i18n.language || "en";
    utterance.onend = utterance.onerror = () => {
      if (utteranceId.current === id) setSpeakingId(null);
    };
    setSpeakingId(message.id);
    window.speechSynthesis.speak(utterance);
  }

  async function handleAction(action: CoachAction) {
    const opportunityId = String(
      action.payload.opportunityId || action.payload.id || "",
    );
    if (action.kind === "view_opportunity" && opportunityId) {
      navigate(`/app/opportunity/${encodeURIComponent(opportunityId)}`);
    } else if (action.kind === "open_route") {
      const route = action.payload.route;
      if (
        typeof route === "string" &&
        /^\/app\/(my-plan|goals|opportunities|applications|deadlines)(\/|$)/.test(
          route,
        )
      )
        navigate(route);
    } else if (
      action.kind === "create_roadmap" ||
      action.kind === "create_goals"
    ) {
      await send(
        action.kind === "create_roadmap"
          ? "Yes, build me that roadmap."
          : "Please create those goals for me.",
      );
    } else if (action.kind === "spin_again") {
      await send("Show me another opportunity that fits my profile.");
    }
  }

  const groupedThreads = useMemo(() => {
    const keys = ["today", "yesterday", "thisWeek", "older"] as const;
    return keys
      .map((key) => ({
        key,
        items: threads.filter((item) => historyGroup(item.updated_at) === key),
      }))
      .filter((group) => group.items.length);
  }, [threads]);

  useEffect(() => {
    const startConversation = () => startNewConversation();
    const openHistory = () => {
      setHistoryOpen(true);
      void refreshThreads().catch(() => {});
    };
    window.addEventListener(COACH_NEW_CONVERSATION_EVENT, startConversation);
    window.addEventListener(COACH_OPEN_HISTORY_EVENT, openHistory);
    return () => {
      window.removeEventListener(COACH_NEW_CONVERSATION_EVENT, startConversation);
      window.removeEventListener(COACH_OPEN_HISTORY_EVENT, openHistory);
    };
  }, [refreshThreads]);

  return (
    <main className="feature-workspace coach-page">
      <header className="coach-page-toolbar">
        <div className="coach-toolbar-brand">
          <span className="coach-mark">
            <img src="/edutu-logo-mark.png" alt="" />
          </span>
          <div>
            <p className="coach-kicker">
              {t("coachPage.kicker", { defaultValue: "EDUTU AI" })}
            </p>
            <h1>{t("navigation.coach", { defaultValue: "AI Coach" })}</h1>
          </div>
        </div>
        <div className="coach-toolbar-actions">
          <button
            type="button"
            className="feature-button secondary coach-new-button"
            onClick={startNewConversation}
            disabled={busy}
          >
            <Plus size={17} />
            {t("coach.new", { defaultValue: "New conversation" })}
          </button>
          <button
            ref={historyButton}
            type="button"
            className="feature-button secondary coach-history-button"
            onClick={() => {
              setHistoryOpen(true);
              void refreshThreads().catch(() => {});
            }}
            aria-haspopup="dialog"
            aria-expanded={historyOpen}
            aria-label={t("coachPage.history", {
              defaultValue: "Conversation history",
            })}
          >
            <History size={18} />
            <span>{t("coachPage.history", { defaultValue: "History" })}</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="coach-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      {reportStatus && (
        <div className="coach-inline-note" role="status" aria-live="polite">
          <p>{reportStatus}</p>
          <button
            type="button"
            onClick={() => setReportStatus("")}
            aria-label={t("common.close", { defaultValue: "Dismiss" })}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {pendingResend && (
        <div className="coach-retry-banner">
          <div>
            <strong>
              {t("coachPage.savedQuestion", {
                defaultValue: "Your question is saved",
              })}
            </strong>
            <p>
              {t("coachPage.savedQuestionDetail", {
                defaultValue:
                  "After reviewing your access, you can send it again with one tap.",
              })}
            </p>
          </div>
          <button
            type="button"
            className="feature-button"
            disabled={busy}
            onClick={() => void send(draft.trim() || pendingResend)}
          >
            <Send size={15} />
            {t("coachPage.resend", { defaultValue: "Resend" })}
          </button>
          <button
            type="button"
            className="coach-icon-action"
            onClick={() => setPendingResend(null)}
            aria-label={t("common.close", { defaultValue: "Dismiss" })}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <section
        className="coach-conversation feature-panel"
        aria-label={t("navigation.coach", { defaultValue: "AI Coach" })}
      >
        <div
          className="coach-messages"
          aria-label={t("coachPage.conversation", {
            defaultValue: "Conversation",
          })}
        >
          {loading ? (
            <div
              className="coach-loading"
              role="status"
              aria-label={t("common.loading", {
                defaultValue: "Loading conversation",
              })}
            >
              <span className="coach-mark">
                <img src="/edutu-logo-mark.png" alt="" />
              </span>
              <span className="coach-typing">
                <i />
                <i />
                <i />
              </span>
            </div>
          ) : messages.filter((message) => message.role !== "system").length ===
              0 && !busy ? (
            <div className="coach-welcome">
              <span className="coach-welcome-mark">
                <img src="/edutu-logo-mark.png" alt="" />
              </span>
              <h2>
                {t("coachPage.welcomeTitle", {
                  defaultValue: "I’m Edutu, your AI Coach",
                })}
              </h2>
              <p>
                {t("coachPage.welcomeBody", {
                  defaultValue:
                    "Ask for real scholarships, deadlines, roadmaps, or application next steps.",
                })}
              </p>
              <div className="coach-prompt-list">
                {QUICK_PROMPTS.map(({ key, prompt, icon: Icon }) => (
                  <button
                    type="button"
                    className="coach-prompt"
                    key={key}
                    onClick={() => void send(prompt)}
                    disabled={busy}
                  >
                    <span className="coach-prompt-icon">
                      <Icon size={20} />
                    </span>
                    <span className="coach-prompt-copy">
                      <strong>
                        {t(key, {
                          defaultValue: key.endsWith("findScholarships")
                            ? "Find scholarships"
                            : "Build roadmap",
                        })}
                      </strong>
                      <small>
                        {t(key + "Detail", {
                          defaultValue: key.endsWith("findScholarships")
                            ? "Available this month"
                            : "Plan my next application",
                        })}
                      </small>
                    </span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="coach-transcript">
              {messages
                .filter((message) => message.role !== "system")
                .map((message) => {
                  const isAssistant = message.role === "assistant";
                  const meta = message.metadata;
                  const opportunities = meta?.opportunities || [];
                  const actions = meta?.actionButtons || [];
                  const calendarAction = meta?.deviceActions?.find(
                    (action) => action.type === "calendar.sync",
                  );
                  const content = visibleMessage(message.content);
                  return (
                    <article
                      key={message.id}
                      className={`coach-message-row ${isAssistant ? "is-assistant" : "is-user"}`}
                    >
                      {isAssistant && (
                        <span className="coach-avatar">
                          <img src="/edutu-logo-mark.png" alt="" />
                        </span>
                      )}
                      <div
                        className={`coach-message ${isAssistant ? "assistant" : "user"}`}
                      >
                        <RichText text={content} />
                        {isAssistant &&
                          (meta?.stopped ||
                            meta?.interrupted ||
                            meta?.truncated) && (
                            <p className="coach-reply-notice">
                              {meta.stoppedBeforeReply
                                ? t("coachPage.stoppedBeforeReply", {
                                    defaultValue:
                                      "You stopped before Edutu replied.",
                                  })
                                : meta.stopped
                                  ? t("coachPage.stopped", {
                                      defaultValue:
                                        "You stopped this reply — it may be incomplete.",
                                    })
                                  : meta.interrupted
                                    ? t("coachPage.interrupted", {
                                        defaultValue:
                                          "The connection dropped, so this reply may be incomplete.",
                                      })
                                    : t("coachPage.partial", {
                                        defaultValue: "This answer is partial.",
                                      })}
                            </p>
                          )}
                        {isAssistant && (
                          <div className="coach-message-actions">
                            <button
                              type="button"
                              className="coach-icon-action"
                              onClick={() => readAloud(message)}
                              aria-label={
                                speakingId === message.id
                                  ? t("coachPage.stopReading", {
                                      defaultValue: "Stop reading",
                                    })
                                  : t("coachPage.readAloud", {
                                      defaultValue: "Read aloud",
                                    })
                              }
                            >
                              {speakingId === message.id ? (
                                <Pause size={15} />
                              ) : (
                                <Volume2 size={15} />
                              )}
                            </button>
                            <button
                              type="button"
                              className="coach-icon-action"
                              onClick={(event) => {
                                reportTrigger.current = event.currentTarget;
                                setReportError("");
                                setReportingMessage(message);
                              }}
                              aria-label={t("coachPage.report", {
                                defaultValue: "Report this response",
                              })}
                            >
                              <Flag size={15} />
                            </button>
                          </div>
                        )}
                        {opportunities.length > 0 && (
                          <section
                            className="coach-opportunity-shelf"
                            aria-label={t("coachPage.recommended", {
                              defaultValue: "Recommended opportunities",
                            })}
                          >
                            <div className="coach-shelf-heading">
                              <strong>
                                {t("coachPage.recommended", {
                                  defaultValue:
                                    "Recommended from Opportunities",
                                })}
                              </strong>
                              <Link to="/app/opportunities">
                                {t("coachPage.viewMore", {
                                  defaultValue: "View more",
                                })}
                              </Link>
                            </div>
                            <div className="coach-opportunity-rail">
                              {opportunities.map((item) => (
                                <Link
                                  key={item.id}
                                  className="coach-opportunity-card"
                                  to={`/app/opportunity/${encodeURIComponent(item.id)}`}
                                >
                                  {item.imageUrl ? (
                                    <img
                                      className="coach-opportunity-image"
                                      src={item.imageUrl}
                                      alt=""
                                      loading="lazy"
                                    />
                                  ) : (
                                    <span className="coach-opportunity-image coach-opportunity-placeholder">
                                      <GraduationCap size={23} />
                                    </span>
                                  )}
                                  <span className="coach-opportunity-body">
                                    <strong>{item.title}</strong>
                                    {item.organization && (
                                      <small>{item.organization}</small>
                                    )}
                                    <span className="coach-opportunity-meta">
                                      {item.matchScore ? (
                                        `${item.matchScore}% match`
                                      ) : item.deadline ? (
                                        <>
                                          <CalendarDays size={13} />
                                          {formatDate(item.deadline)}
                                        </>
                                      ) : (
                                        item.location || item.category
                                      )}
                                    </span>
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </section>
                        )}
                        {meta?.roadmapIntent && (
                          <div className="coach-roadmap-card">
                            <span>
                              <strong>
                                {t("coachPage.roadmapTitle", {
                                  defaultValue: "Build your roadmap",
                                })}
                              </strong>
                              <small>
                                {t("coachPage.roadmapDetail", {
                                  defaultValue:
                                    "Goals, deadlines, and reminders",
                                })}
                              </small>
                            </span>
                            <button
                              type="button"
                              className="feature-button"
                              disabled={busy}
                              onClick={() =>
                                void send("Yes, build me that roadmap.")
                              }
                            >
                              {t("coachPage.build", { defaultValue: "Build" })}
                            </button>
                          </div>
                        )}
                        {calendarAction && (
                          <div className="coach-roadmap-card">
                            <span>
                              <strong>
                                {t("coachPage.calendarTitle", {
                                  defaultValue:
                                    "Add these dates to your calendar?",
                                })}
                              </strong>
                              <small>
                                {t("coachPage.calendarDetail", {
                                  defaultValue:
                                    "Download a calendar file with reminders for your plan.",
                                })}
                              </small>
                            </span>
                            <button
                              type="button"
                              className="feature-button"
                              onClick={() => {
                                if (
                                  !downloadCalendarAction(
                                    calendarAction.payload,
                                  )
                                ) {
                                  setError(
                                    t("coachPage.calendarUnavailable", {
                                      defaultValue:
                                        "No dated milestones are available to add.",
                                    }),
                                  );
                                }
                              }}
                            >
                              <CalendarDays size={15} />
                              {t("coachPage.addDates", {
                                defaultValue: "Add dates",
                              })}
                            </button>
                          </div>
                        )}
                        {meta?.documents?.map((document) => (
                          <a
                            key={`${document.docId}-${document.version}`}
                            className="coach-document-card"
                            href={document.url || "/app/documents"}
                            target={document.url ? "_blank" : undefined}
                            rel={document.url ? "noreferrer" : undefined}
                          >
                            <span className="coach-prompt-icon">
                              <FileText size={19} />
                            </span>
                            <span>
                              <strong>{document.title}</strong>
                              <small>
                                {document.type.replace(/_/g, " ")} · v
                                {document.version}
                                {document.format
                                  ? ` · ${document.format.toUpperCase()}`
                                  : ""}
                              </small>
                            </span>
                            <ChevronRight size={16} />
                          </a>
                        ))}
                        {meta?.images?.map((image) => (
                          <button
                            type="button"
                            key={image.url}
                            className="coach-result-image"
                            onClick={() =>
                              void shareCoachImage(
                                image.url,
                                image.title ||
                                  t("coachPage.sharedImage", {
                                    defaultValue: "Shared image",
                                  }),
                              )
                            }
                            aria-label={t("coachPage.shareImage", {
                              defaultValue: "Share image",
                            })}
                          >
                            <img
                              src={image.url}
                              alt={
                                image.title ||
                                t("coachPage.sharedImage", {
                                  defaultValue: "Shared image",
                                })
                              }
                              loading="lazy"
                            />
                          </button>
                        ))}
                        {actions.length > 0 && (
                          <div className="coach-agent-actions">
                            {actions.map((action) => (
                              <button
                                type="button"
                                className="feature-button secondary"
                                key={action.id}
                                disabled={busy}
                                onClick={() => void handleAction(action)}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              {(busy || stream) && (
                <article className="coach-message-row is-assistant">
                  <span className="coach-avatar">
                    <img src="/edutu-logo-mark.png" alt="" />
                  </span>
                  <div className="coach-message assistant" aria-busy="true">
                    {stream ? (
                      <RichText text={stream} />
                    ) : (
                      <span
                        className="coach-typing"
                        aria-label={t("coachPage.thinking", {
                          defaultValue: "Edutu is thinking",
                        })}
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </div>
                </article>
              )}
              <div ref={bottom} />
            </div>
          )}
        </div>

        <CoachComposer
          value={draft}
          onChange={setDraft}
          busy={busy}
          onSend={() => { void send(); }}
          onStop={() => abort.current?.abort()}
        />
        <span className="sr-only" role="status">
          {busy
            ? t("coachPage.thinking", { defaultValue: "Edutu is responding" })
            : ""}
        </span>
      </section>

      {historyOpen && (
        <div
          className="coach-history-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryOpen(false);
          }}
        >
          <section
            ref={historyDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-history-title"
            className="coach-history-sheet"
          >
            <header>
              <div>
                <p className="coach-kicker">
                  {t("coachPage.kicker", { defaultValue: "EDUTU AI" })}
                </p>
                <h2 id="coach-history-title">
                  {t("coachPage.conversations", {
                    defaultValue: "Conversations",
                  })}
                </h2>
              </div>
              <button
                type="button"
                className="coach-icon-action"
                onClick={() => setHistoryOpen(false)}
                aria-label={t("common.close", { defaultValue: "Close" })}
              >
                <X size={20} />
              </button>
            </header>
            <button
              type="button"
              className="coach-new-thread"
              onClick={startNewConversation}
            >
              <span>
                <Plus size={18} />
              </span>
              {t("coach.new", { defaultValue: "New conversation" })}
            </button>
            <div className="coach-thread-list">
              {loading ? (
                <div className="coach-history-loading" role="status">
                  {t("coachPage.loadingHistory", {
                    defaultValue: "Loading conversations…",
                  })}
                </div>
              ) : groupedThreads.length === 0 ? (
                <div className="coach-history-empty">
                  <History size={24} />
                  <p>
                    {t("coachPage.emptyHistory", {
                      defaultValue: "Your conversations will appear here.",
                    })}
                  </p>
                </div>
              ) : (
                groupedThreads.map((group) => (
                  <section key={group.key}>
                    <h3>
                      {t(`coachPage.groups.${group.key}`, {
                        defaultValue: (
                          {
                            today: "Today",
                            yesterday: "Yesterday",
                            thisWeek: "This week",
                            older: "Older",
                          } as Record<string, string>
                        )[group.key],
                      })}
                    </h3>
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className={`coach-thread-row ${thread === item.id ? "is-active" : ""}`}
                      >
                        <button
                          type="button"
                          className="coach-thread-open"
                          onClick={() => void open(item.id)}
                          disabled={busy}
                        >
                          <span>
                            <strong>
                              {item.title ||
                                t("coachPage.untitled", {
                                  defaultValue: "New conversation",
                                })}
                            </strong>
                            <small>{formatDate(item.updated_at)}</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="coach-icon-action coach-delete-thread"
                          onClick={() => void remove(item.id)}
                          aria-label={t("coachPage.delete", {
                            defaultValue: "Delete conversation",
                          })}
                          disabled={busy}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </section>
                ))
              )}
            </div>
          </section>
        </div>
      )}
      {reportingMessage && (
        <div
          className="coach-history-backdrop coach-report-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setReportingMessage(null);
          }}
        >
          <section
            ref={reportDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-report-title"
            aria-describedby="coach-report-description"
            className="coach-report-dialog"
          >
            <header>
              <div>
                <p className="coach-kicker">
                  {t("coachPage.kicker", { defaultValue: "EDUTU AI" })}
                </p>
                <h2 id="coach-report-title">
                  {t("coachPage.reportTitle", {
                    defaultValue: "Report this response",
                  })}
                </h2>
              </div>
              <button
                type="button"
                className="coach-icon-action"
                onClick={() => setReportingMessage(null)}
                aria-label={t("common.close", { defaultValue: "Close" })}
              >
                <X size={20} />
              </button>
            </header>
            <p id="coach-report-description">
              {t("coachPage.reportDescription", {
                defaultValue: "What was wrong with this answer?",
              })}
            </p>
            <div className="coach-report-options">
              {(
                ["inaccurate", "offensive", "other"] as const
              ).map((reason) => (
                <button
                  key={reason}
                  type="button"
                  className="coach-report-option"
                  disabled={reportBusy}
                  onClick={() => void submitReport(reason)}
                >
                  {t(`coachPage.reportReasons.${reason}`, {
                    defaultValue:
                      reason === "inaccurate"
                        ? "Inaccurate or misleading"
                        : reason === "offensive"
                          ? "Inappropriate or offensive"
                          : "Something else",
                  })}
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              ))}
            </div>
            {reportError && (
              <p className="coach-report-error" role="alert">
                {reportError}
              </p>
            )}
            <button
              type="button"
              className="feature-button secondary coach-report-cancel"
              disabled={reportBusy}
              onClick={() => setReportingMessage(null)}
            >
              {t("coachPage.reportCancel", { defaultValue: "Cancel" })}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
