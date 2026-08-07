import { communityCallResponseSchema } from "../types";

export const CALL_ID = "11111111-1111-4111-8111-111111111111";
export const GROUP_ID = "22222222-2222-4222-8222-222222222222";

export function callFixture(status: "scheduled" | "live" | "ended" = "live") {
  return communityCallResponseSchema.parse({
    id: CALL_ID,
    groupId: GROUP_ID,
    groupName: "Future Builders",
    title: "Scholarship check-in",
    scheduledFor: "2026-08-06T18:30:00.000Z",
    durationMinutes: 45,
    status,
    viewer: {
      userId: "user_viewer",
      role: "member",
      inviteStatus: status === "ended" ? "missed" : "notified",
    },
    participants: [],
  });
}
