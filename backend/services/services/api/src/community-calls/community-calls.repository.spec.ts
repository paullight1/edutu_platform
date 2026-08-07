import { buildParticipantSnapshot } from "./community-calls.repository";

describe("community call participant snapshot", () => {
  it("snapshots every active member even when the media cap is smaller", () => {
    const members = Array.from({ length: 7 }, (_, index) => ({
      userId: `user_${index}`,
      role: index === 0 ? "owner" : "member",
    }));
    const rows = buildParticipantSnapshot(
      members,
      "11111111-1111-4111-8111-111111111111",
      "user_0",
      new Date("2026-08-06T12:00:00.000Z"),
    );

    // A hypothetical cap of 3 is intentionally absent from snapshot creation.
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((row) => row.userId)).size).toBe(7);
    expect(rows.every((row) => row.inviteStatus === "ringing")).toBe(true);
    expect(rows.every((row) => row.firstJoinedAt === null)).toBe(true);
    expect(rows.every((row) => row.joinedCount === 0)).toBe(true);
  });
});
