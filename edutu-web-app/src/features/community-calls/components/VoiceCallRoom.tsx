import { Loader2, Mic, MicOff, PhoneOff, ShieldAlert, Signal, WifiOff } from "lucide-react";
import type { RemoteAudioTrack } from "../media";
import type { LiveParticipant } from "../useCommunityCall";
import { ParticipantList } from "./ParticipantList";
import { RemoteAudio } from "./RemoteAudio";

interface VoiceCallRoomProps {
  title: string;
  groupName: string;
  participants: LiveParticipant[];
  remoteTracks: RemoteAudioTrack[];
  muted: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
  busyAction: string | null;
  error: string | null;
  canEnd: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
  onEnd: () => void;
}

export function VoiceCallRoom({
  title,
  groupName,
  participants,
  remoteTracks,
  muted,
  reconnecting,
  reconnectAttempt,
  busyAction,
  error,
  canEnd,
  onToggleMute,
  onLeave,
  onEnd,
}: VoiceCallRoomProps) {
  const activeSpeaker = participants.find((participant) => participant.isSpeaking);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="relative min-h-[30rem] overflow-hidden rounded-[2rem] bg-neutral-950 p-6 text-white shadow-elevated sm:p-9" aria-labelledby="live-call-title">
        <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
          <div className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-accent-500/15 blur-3xl" />
        </div>

        <div className="relative flex min-h-[26rem] flex-col">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 rounded-pill border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80">
                <Signal className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                Live voice room
              </span>
              <h1 id="live-call-title" className="mt-5 max-w-xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                {title}
              </h1>
              <p className="mt-2 text-sm text-white/60">{groupName}</p>
            </div>
            <span className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
              Not recorded
            </span>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center" aria-live="polite">
            {reconnecting ? (
              <>
                <span className="flex h-24 w-24 items-center justify-center rounded-[2rem] border border-amber-300/20 bg-amber-300/10 text-amber-200">
                  <WifiOff className="h-9 w-9" aria-hidden="true" />
                </span>
                <h2 className="mt-6 font-display text-2xl font-semibold">Restoring your call</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-white/60">
                  Your microphone is muted while we reconnect. Attempt {Math.max(1, reconnectAttempt)} of 5.
                </p>
                <Loader2 className="mt-5 h-5 w-5 animate-spin text-white/60" aria-hidden="true" />
              </>
            ) : (
              <>
                <span className={`flex h-28 w-28 items-center justify-center rounded-[2.25rem] border text-3xl font-semibold transition ${
                  activeSpeaker
                    ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-200 shadow-[0_0_60px_-12px_rgba(110,231,183,0.5)]"
                    : "border-white/10 bg-white/5 text-white/75"
                }`}>
                  {activeSpeaker ? activeSpeaker.displayName.slice(0, 1).toUpperCase() : <Mic className="h-10 w-10" aria-hidden="true" />}
                </span>
                <h2 className="mt-6 font-display text-2xl font-semibold">
                  {activeSpeaker ? `${activeSpeaker.displayName} is speaking` : "Listening for voices"}
                </h2>
                <p className="mt-2 text-sm text-white/60">
                  {muted ? "You are muted" : "Your microphone is live"}
                </p>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onToggleMute}
              disabled={reconnecting || busyAction !== null}
              aria-pressed={muted}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20 disabled:opacity-50 ${
                muted ? "bg-white text-neutral-950" : "border border-white/15 bg-white/10 text-white hover:bg-white/15"
              }`}
            >
              {busyAction === "mute" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : muted ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              onClick={onLeave}
              disabled={busyAction !== null}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-danger px-5 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300/25 disabled:opacity-50"
            >
              {busyAction === "leave" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PhoneOff className="h-4 w-4" aria-hidden="true" />}
              Leave
            </button>
            {canEnd ? (
              <button
                type="button"
                onClick={onEnd}
                disabled={busyAction !== null}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-red-300/25 bg-red-300/10 px-5 text-sm font-semibold text-red-100 transition hover:bg-red-300/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300/20 disabled:opacity-50"
              >
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                End for everyone
              </button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="mx-auto mt-4 max-w-lg rounded-xl border border-red-300/20 bg-red-300/10 px-4 py-2 text-center text-xs text-red-100">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      <ParticipantList participants={participants} />
      {remoteTracks.map((track) => (
        <RemoteAudio
          key={track.producerId}
          stream={track.stream}
          label={`Audio from participant ${track.peerId}`}
        />
      ))}
    </div>
  );
}
