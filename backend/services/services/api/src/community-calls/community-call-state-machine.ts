import type { CommunityCallStatus } from "./community-calls.types";

const TRANSITIONS: Readonly<
  Record<CommunityCallStatus, readonly CommunityCallStatus[]>
> = {
  scheduled: ["starting", "cancelled", "expired"],
  starting: ["live", "failed"],
  live: ["ended", "failed"],
  ended: [],
  cancelled: [],
  expired: [],
  failed: [],
};

export function canTransitionCall(
  from: CommunityCallStatus,
  to: CommunityCallStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminalCallStatus(status: CommunityCallStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function isInsideCallStartWindow(
  scheduledFor: Date,
  now: Date,
  earlyMinutes: number,
  lateMinutes: number,
): boolean {
  const opensAt = scheduledFor.getTime() - earlyMinutes * 60_000;
  const closesAt = scheduledFor.getTime() + lateMinutes * 60_000;
  return now.getTime() >= opensAt && now.getTime() <= closesAt;
}
