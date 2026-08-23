import { describe, expect, it } from "vitest";
import type { ApplicationHistoryRecord } from "./applications";
import { latestApplicationReflection } from "./applicationReflectionState";

function reflection(
  id: string,
  note: string,
  createdAt: string,
): ApplicationHistoryRecord {
  return {
    id,
    application_id: "application-1",
    event_type: "reflection",
    previous_status: null,
    next_status: null,
    note,
    metadata: {},
    actor_user_id: "user-1",
    created_at: createdAt,
  };
}

describe("latestApplicationReflection", () => {
  it("returns the newest non-empty durable reflection", () => {
    expect(
      latestApplicationReflection([
        reflection("older", "First lesson", "2026-08-20T10:00:00.000Z"),
        reflection("blank", "   ", "2026-08-20T11:00:00.000Z"),
        reflection("newer", "Better lesson", "2026-08-20T12:00:00.000Z"),
      ]),
    ).toBe("Better lesson");
  });

  it("ignores non-reflection history events", () => {
    const history: ApplicationHistoryRecord[] = [
      {
        ...reflection("note", "not a reflection", "2026-08-20T12:00:00.000Z"),
        event_type: "note",
      },
    ];

    expect(latestApplicationReflection(history)).toBe("");
  });
});
