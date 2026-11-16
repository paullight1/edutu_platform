export function clerkStatusMetadata(
  kind: string | null | undefined,
  status: "approved" | "rejected",
): Record<string, string> {
  return kind === "mentor"
    ? { mentorStatus: status }
    : { creatorStatus: status };
}
