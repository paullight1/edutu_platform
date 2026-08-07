import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  ArrowLeft,
  CalendarClock,
  AlertCircle,
  Clock3,
  Loader2,
  PhoneMissed,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { canEndCommunityCall } from "./types";
import { isCommunityCallPath } from "./deepLinks";
import { useCommunityCall } from "./useCommunityCall";
import { CallPreflight } from "./components/CallPreflight";
import { VoiceCallRoom } from "./components/VoiceCallRoom";
import { EndCallDialog } from "./components/EndCallDialog";

function StateCard({
  icon,
  eyebrow,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-2xl rounded-[2rem] border border-subtle bg-surface-layer p-6 text-center shadow-elevated sm:p-9" aria-labelledby="call-state-title">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-brand/10 text-brand">
        {icon}
      </span>
      <p className="mt-6 text-2xs font-semibold uppercase tracking-[0.2em] text-brand">{eyebrow}</p>
      <h1 id="call-state-title" className="mt-2 font-display text-3xl font-semibold tracking-tight text-text-primary">
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-text-secondary">{body}</p>
      {children ? <div className="mt-7">{children}</div> : null}
    </section>
  );
}

function CommunityCallSession({ callId, identityKey }: { callId: string; identityKey: string }) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const call = useCommunityCall(callId, getToken, identityKey);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { state } = call;

  useEffect(() => {
    const previous = document.title;
    document.title = state.call ? `${state.call.title} | Edutu voice call` : "Community voice call | Edutu";
    return () => { document.title = previous; };
  }, [state.call]);

  const scheduledLabel = useMemo(() => {
    if (!state.call) return null;
    const instant = new Date(state.call.scheduledFor);
    return {
      date: format(instant, "EEEE, d MMMM yyyy"),
      time: format(instant, "p"),
      relative: formatDistanceToNowStrict(instant, { addSuffix: true }),
    };
  }, [state.call]);

  const backTarget = "/community";

  return (
    <main className="min-h-[100dvh] bg-surface-body text-text-primary">
      <header className="sticky top-0 z-20 border-b border-subtle bg-surface-layer/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate(backTarget)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:shadow-focus"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Community
          </button>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-text-muted">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
            Audio only · not recorded
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        {state.phase === "loading" ? (
          <div className="flex min-h-[60dvh] items-center justify-center" role="status" aria-live="polite">
            <div className="text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-brand" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-text-secondary">Loading call details</p>
            </div>
          </div>
        ) : null}

        {state.phase === "scheduled" && state.call && scheduledLabel ? (
          <StateCard
            icon={<CalendarClock className="h-7 w-7" aria-hidden="true" />}
            eyebrow={state.call.status === "starting" ? "Host is preparing" : "Scheduled voice call"}
            title={state.call.title}
            body={state.call.status === "starting"
              ? "The host is opening the room now. This page will update automatically when it is ready."
              : `This call starts ${scheduledLabel.relative}. Only a community owner or moderator can start it.`}
          >
            <dl className="mx-auto grid max-w-md gap-3 rounded-2xl border border-subtle bg-surface-elevated p-4 text-left sm:grid-cols-2">
              <div className="flex gap-3">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <div><dt className="text-xs text-text-muted">Time</dt><dd className="text-sm font-semibold text-text-primary">{scheduledLabel.time}</dd></div>
              </div>
              <div className="flex gap-3">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <div><dt className="text-xs text-text-muted">Community</dt><dd className="text-sm font-semibold text-text-primary">{state.call.groupName}</dd></div>
              </div>
            </dl>
            <p className="mt-3 text-xs text-text-muted">{scheduledLabel.date} · {state.call.durationMinutes} minutes planned</p>
            <button
              type="button"
              onClick={() => void call.refresh()}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-default px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:shadow-focus"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh status
            </button>
          </StateCard>
        ) : null}

        {(state.phase === "preflight" || state.phase === "joining") && state.call ? (
          <>
            <div className="mx-auto mb-5 max-w-2xl text-center">
              <p className="text-sm font-semibold text-brand">{state.call.groupName}</p>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-text-primary">{state.call.title}</h1>
            </div>
            <CallPreflight
              microphoneReady={state.microphoneReady}
              microphoneLabel={state.microphoneLabel}
              error={state.error}
              busyAction={call.busyAction}
              onCheckMicrophone={() => void call.checkMicrophone()}
              onJoin={() => void call.join()}
            />
          </>
        ) : null}

        {(state.phase === "live" || state.phase === "reconnecting") && state.call ? (
          <VoiceCallRoom
            title={state.call.title}
            groupName={state.call.groupName}
            participants={call.participants}
            remoteTracks={call.remoteTracks}
            muted={state.muted}
            reconnecting={state.phase === "reconnecting"}
            reconnectAttempt={state.reconnectAttempt}
            busyAction={call.busyAction}
            error={state.error}
            canEnd={canEndCommunityCall(state.call.viewer.role)}
            onToggleMute={() => void call.toggleMute()}
            onLeave={() => void call.leave()}
            onEnd={() => setConfirmEnd(true)}
          />
        ) : null}

        {state.phase === "left" && state.call ? (
          <StateCard
            icon={<ArrowLeft className="h-7 w-7" aria-hidden="true" />}
            eyebrow="You left the room"
            title="Your microphone is disconnected"
            body="The call is still live. You can check your microphone and join again while the host keeps the room open."
          >
            <button type="button" onClick={() => void (state.microphoneReady ? call.join() : call.checkMicrophone())} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-brand px-6 text-sm font-semibold text-white focus-visible:outline-none focus-visible:shadow-focus">
              {state.microphoneReady ? "Rejoin call" : "Check microphone to rejoin"}
            </button>
          </StateCard>
        ) : null}

        {state.phase === "ended" ? (
          <StateCard icon={<X className="h-7 w-7" aria-hidden="true" />} eyebrow="Call ended" title={state.call?.title ?? "This call has ended"} body="The room is closed and your microphone is disconnected.">
            <Link to={backTarget} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-brand px-6 text-sm font-semibold text-white focus-visible:outline-none focus-visible:shadow-focus">Back to community</Link>
          </StateCard>
        ) : null}

        {state.phase === "missed" ? (
          <StateCard icon={<PhoneMissed className="h-7 w-7" aria-hidden="true" />} eyebrow="Missed community call" title={state.call?.title ?? "You missed this call"} body="The call has ended. You can return to the community to catch up with the conversation.">
            <Link to={backTarget} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-brand px-6 text-sm font-semibold text-white focus-visible:outline-none focus-visible:shadow-focus">Open community</Link>
          </StateCard>
        ) : null}

        {(state.phase === "unsupported" || state.phase === "error") ? (
          <StateCard
            icon={<AlertCircle className="h-7 w-7" aria-hidden="true" />}
            eyebrow={state.phase === "unsupported" ? "Browser not supported" : "Call unavailable"}
            title={state.phase === "unsupported" ? "Voice calling is not available here" : "We could not open this call"}
            body={state.error ?? "Try again in a moment."}
          >
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <button type="button" onClick={() => void call.refresh()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-6 text-sm font-semibold text-white focus-visible:outline-none focus-visible:shadow-focus">
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
              </button>
              <Link to="/community" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-default px-6 text-sm font-semibold text-text-secondary focus-visible:outline-none focus-visible:shadow-focus">Back to community</Link>
            </div>
          </StateCard>
        ) : null}
      </div>

      {confirmEnd ? (
        <EndCallDialog
          busy={call.busyAction === "end"}
          error={state.error}
          onCancel={() => setConfirmEnd(false)}
          onConfirm={() => {
            void call.endForEveryone().then((ended) => {
              if (ended) setConfirmEnd(false);
            });
          }}
        />
      ) : null}
    </main>
  );
}

export default function CommunityCallPage() {
  const { callId } = useParams<{ callId: string }>();
  const { sessionId, userId } = useAuth();
  const path = callId ? `/communities/calls/${callId}` : "";

  if (!callId || !isCommunityCallPath(path)) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-surface-body px-4">
        <StateCard icon={<AlertCircle className="h-7 w-7" aria-hidden="true" />} eyebrow="Invalid call link" title="This call link is not valid" body="Open the call again from your Edutu notification or community chat.">
          <Link to="/community" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-brand px-6 text-sm font-semibold text-white">Back to community</Link>
        </StateCard>
      </main>
    );
  }

  const identityKey = `${userId ?? "signed-out"}:${sessionId ?? "no-session"}`;
  return (
    <CommunityCallSession
      key={`${callId}:${identityKey}`}
      callId={callId}
      identityKey={identityKey}
    />
  );
}
