import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Mail, MessageCircle, ShieldOff } from "lucide-react";
import Seo from "../../components/Seo";
import { CommunityDmApi, DM_MESSAGE_MAX_LENGTH, type DmRelationship } from "./dmApi";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";

export default function CommunityNewDmPage() {
  const { getToken } = useAuth();
  const api = useMemo(() => new CommunityDmApi(getToken), [getToken]);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const recipientId = params.get("userId") ?? "";
  const name = params.get("name") || "this member";
  const [relationship, setRelationship] = useState<DmRelationship | null | undefined>(undefined);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRelationship(undefined);
    setRelationshipError(null);
    if (!recipientId) {
      setRelationship(null);
      setRelationshipError("Open a member from a community before starting a private conversation.");
      return;
    }
    try {
      const result = await api.relationship(recipientId);
      if (result?.status === "accepted" && result.conversationId) {
        navigate(`/app/community/dm/${result.conversationId}`, { replace: true });
        return;
      }
      setRelationship(result);
    } catch (caught) {
      setRelationship(null);
      setRelationshipError(caught instanceof Error ? caught.message : "Messages are unavailable right now.");
    }
  }, [api, navigate, recipientId]);

  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    const message = body.trim();
    if (!recipientId || !message || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.createRequest(recipientId, message);
      navigate("/app/community/chats", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your request could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const pending = relationship?.status === "pending";
  const unavailable = relationship?.blocked || relationship?.status === "declined";

  return (
    <>
      <Seo title={`Message ${name} | Edutu Community`} description="Start a private Edutu community conversation." path="/app/community/dm/new" noindex />
      <CommunityProductShell
        title={`Message ${name}`}
        description="Private messages start with one request. The other person chooses whether to continue."
        action={<Link to="/app/community/chats" className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f4dcc9] bg-white text-[#796f6b] dark:border-subtle dark:bg-surface-layer" aria-label="Back to chats"><ArrowLeft size={18} /></Link>}
      >
        <div className="mx-auto max-w-2xl">
          {relationship === undefined ? (
            <CommunityState kind="loading" />
          ) : relationshipError ? (
            <CommunityState kind="error" title="Messages unavailable" body={relationshipError} actionLabel={recipientId ? "Try again" : "Back to Chats"} onAction={recipientId ? () => void load() : () => navigate("/app/community/chats")} />
          ) : pending || unavailable ? (
            <div className="rounded-[24px] border border-[#f4dcc9] bg-white p-7 text-center shadow-sm dark:border-subtle dark:bg-surface-layer">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand">
                {unavailable ? <ShieldOff size={24} /> : <Mail size={24} />}
              </span>
              <h2 className="mt-4 font-display text-xl font-semibold text-[#4a170d] dark:text-text-primary">{unavailable ? "Private messages unavailable" : relationship?.direction === "outgoing" ? "Request sent" : "Review their request first"}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#796f6b] dark:text-text-secondary">
                {unavailable
                  ? `You cannot start a private conversation with ${name}.`
                  : relationship?.direction === "outgoing"
                    ? `${name} needs to accept your first message before you can send another.`
                    : `${name} already sent you a request. Accept or decline it from Chats.`}
              </p>
              {!unavailable && relationship?.direction === "incoming" ? <Link to="/app/community/chats" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#f45b16] px-4 text-sm font-bold text-white">Open Chats</Link> : null}
            </div>
          ) : (
            <div className="rounded-[24px] border border-[#f4dcc9] bg-white p-5 shadow-sm dark:border-subtle dark:bg-surface-layer sm:p-7">
              <div className="flex gap-3 rounded-2xl bg-[#fff9f1] p-4 dark:bg-surface-elevated">
                <MessageCircle size={21} className="mt-0.5 shrink-0 text-[#f45b16] dark:text-brand" />
                <p className="text-sm leading-6 text-[#796f6b] dark:text-text-secondary">Your first message is a request. You can send more only after {name} accepts it.</p>
              </div>
              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-bold text-[#4a170d] dark:text-text-primary">First message</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={DM_MESSAGE_MAX_LENGTH}
                  rows={7}
                  placeholder="Introduce yourself and say why you’re reaching out"
                  className="w-full resize-y rounded-2xl border border-[#f4dcc9] bg-[#fffdf9] px-4 py-3 text-base leading-6 outline-none focus:border-[#f45b16]/60 focus:ring-2 focus:ring-[#f45b16]/10 dark:border-subtle dark:bg-surface-body"
                />
              </label>
              <div className="mt-1 flex justify-between gap-3 text-xs"><span className="font-semibold text-red-600 dark:text-red-300">{error}</span><span className="shrink-0 text-[#9a8278] dark:text-text-muted">{body.length}/{DM_MESSAGE_MAX_LENGTH}</span></div>
              <button type="button" disabled={!body.trim() || sending} onClick={() => void send()} className="mt-5 min-h-12 w-full rounded-xl bg-[#f45b16] px-4 text-sm font-bold text-white disabled:opacity-50">{sending ? "Sending…" : "Send request"}</button>
            </div>
          )}
        </div>
      </CommunityProductShell>
    </>
  );
}
