import { MicOff, Radio } from "lucide-react";
import type { LiveParticipant } from "../useCommunityCall";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "E"
  );
}

export function ParticipantList({
  participants,
}: {
  participants: LiveParticipant[];
}) {
  const visible = [...participants]
    .filter(
      (participant) =>
        participant.peerId || participant.inviteStatus === "joined",
    )
    .sort(
      (a, b) =>
        Number(b.isSelf) - Number(a.isSelf) ||
        Number(b.isSpeaking) - Number(a.isSpeaking),
    );

  return (
    <section
      aria-labelledby="call-participants-title"
      className="rounded-3xl border border-subtle bg-surface-layer p-4 shadow-soft sm:p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            In the room
          </p>
          <h2
            id="call-participants-title"
            className="mt-1 font-display text-xl font-semibold text-text-primary"
          >
            {visible.length} participant{visible.length === 1 ? "" : "s"}
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
          <Radio className="h-3.5 w-3.5" aria-hidden="true" /> Live
        </span>
      </div>

      <ul
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1"
        aria-live="polite"
      >
        {visible.map((participant) => (
          <li
            key={participant.peerId ?? participant.userId}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition-colors ${
              participant.isSpeaking
                ? "border-success/40 bg-success/5"
                : "border-subtle bg-surface-elevated/60"
            }`}
          >
            <span
              className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${
                participant.isSpeaking
                  ? "bg-success text-white shadow-ring"
                  : "bg-brand/10 text-brand"
              }`}
              aria-hidden="true"
            >
              {initials(participant.displayName)}
              {participant.isSpeaking ? (
                <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-surface-layer bg-success" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-text-primary">
                {participant.displayName}
                {participant.isSelf ? " (You)" : ""}
              </span>
              <span className="block text-xs capitalize text-text-muted">
                {participant.isSpeaking
                  ? "Speaking"
                  : participant.role === "mod"
                    ? "Moderator"
                    : participant.role}
              </span>
            </span>
            {participant.isMuted ? (
              <span
                className="rounded-xl bg-surface-layer p-2 text-text-muted"
                title="Muted"
              >
                <MicOff className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Muted</span>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-default px-4 py-7 text-center text-sm text-text-muted">
          Waiting for participants to join.
        </p>
      ) : null}
    </section>
  );
}
