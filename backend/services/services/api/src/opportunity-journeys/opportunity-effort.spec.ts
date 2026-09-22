import {
  estimateOpportunityEffortHours,
  scheduleOpportunityJourneyTasks,
} from "./opportunity-effort";
import { resolveOpportunityJourneyTemplate } from "./opportunity-journey-templates";

describe("opportunity effort", () => {
  it("uses a deterministic base estimate and requirement adjustments", () => {
    expect(
      estimateOpportunityEffortHours({
        category: "scholarship",
        requirementsText: "CV, transcript, two references, essay and interview",
      }),
    ).toBeGreaterThan(
      estimateOpportunityEffortHours({
        category: "scholarship",
        requirementsText: null,
      }),
    );
  });

  it("caps displayed preparation effort at forty hours", () => {
    expect(
      estimateOpportunityEffortHours({
        category: "grant",
        requirementsText:
          "budget proposal business plan references transcript portfolio interview essay pitch video recommendation letters financial statements",
      }),
    ).toBe(40);
  });
});

describe("scheduleOpportunityJourneyTasks", () => {
  const tasks = resolveOpportunityJourneyTemplate("scholarship");

  it("schedules required work before a comfortable opportunity deadline", () => {
    const scheduled = scheduleOpportunityJourneyTasks({
      tasks,
      startAt: new Date("2026-09-03T09:00:00Z"),
      deadline: new Date("2026-10-03T23:59:00Z"),
      weeklyHours: 4,
    });

    expect(scheduled).toHaveLength(tasks.length);
    expect(scheduled.every((task) => task.dueAt instanceof Date)).toBe(true);
    expect(scheduled.at(-1)?.dueAt?.getTime()).toBeLessThanOrEqual(
      new Date("2026-10-02T23:59:00Z").getTime(),
    );
  });

  it("compresses short deadlines without creating due dates in the past", () => {
    const startAt = new Date("2026-09-03T09:00:00Z");
    const scheduled = scheduleOpportunityJourneyTasks({
      tasks,
      startAt,
      deadline: new Date("2026-09-05T09:00:00Z"),
      weeklyHours: 3,
    });

    for (const task of scheduled) {
      expect(task.dueAt?.getTime()).toBeGreaterThanOrEqual(startAt.getTime());
    }
  });

  it("uses weekly-hour cadence when the opportunity has no deadline", () => {
    const startAt = new Date("2026-09-03T09:00:00Z");
    const scheduled = scheduleOpportunityJourneyTasks({
      tasks,
      startAt,
      deadline: null,
      weeklyHours: 2,
    });

    expect(scheduled.at(-1)?.dueAt?.getTime()).toBeGreaterThan(
      startAt.getTime(),
    );
    expect(
      scheduled.every(
        (task, index) =>
          index === 0 ||
          (task.dueAt?.getTime() ?? 0) >=
            (scheduled[index - 1].dueAt?.getTime() ?? 0),
      ),
    ).toBe(true);
  });
});
