export interface MentorAccessProfile {
  creatorStatus?: string | null;
  mentorStatus?: string | null;
}

export type MentorStatus = "approved" | "pending" | "rejected" | "none";

/**
 * Unified capability gate. An approved creator OR an approved mentor is an
 * approved mentor — mentor_status is load-bearing alongside creator_status.
 */
export function isApprovedMentor(
  profile?: MentorAccessProfile | null,
): boolean {
  return (
    profile?.creatorStatus === "approved" ||
    profile?.mentorStatus === "approved"
  );
}

/** Coarse status for banners/UI, preferring the most-unlocked state. */
export function deriveMentorStatus(
  profile?: MentorAccessProfile | null,
): MentorStatus {
  if (isApprovedMentor(profile)) return "approved";
  const statuses = [profile?.mentorStatus, profile?.creatorStatus];
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("rejected")) return "rejected";
  return "none";
}
