import { deriveOpportunityNextAction } from "./opportunity-next-action";

const baseTasks = [
  {
    id: "task-1",
    title: "Confirm eligibility",
    position: 0,
    status: "completed" as const,
    required: true,
    dueAt: new Date("2026-09-05T00:00:00Z"),
  },
  {
    id: "task-2",
    title: "Collect transcript",
    position: 1,
    status: "pending" as const,
    required: true,
    dueAt: new Date("2026-09-10T00:00:00Z"),
  },
  {
    id: "task-3",
    title: "Optional portfolio",
    position: 2,
    status: "skipped" as const,
    required: false,
    dueAt: null,
  },
];

describe("deriveOpportunityNextAction", () => {
  it("returns the next incomplete required task while preparing", () => {
    expect(
      deriveOpportunityNextAction({
        state: "preparing",
        tasks: baseTasks,
        opportunityDeadline: new Date("2026-10-01T00:00:00Z"),
      }),
    ).toMatchObject({
      action: {
        key: "continue_task",
        taskId: "task-2",
        label: "Collect transcript",
      },
      progress: {
        completedRequired: 1,
        totalRequired: 2,
        percent: 50,
      },
    });
  });

  it("returns open application when the journey is ready", () => {
    expect(
      deriveOpportunityNextAction({
        state: "ready_to_apply",
        tasks: baseTasks.map((task) =>
          task.required ? { ...task, status: "completed" as const } : task,
        ),
        opportunityDeadline: new Date("2026-10-01T00:00:00Z"),
      }).action,
    ).toMatchObject({ key: "open_application", label: "Open application" });
  });

  it("returns confirmation after the external application was opened", () => {
    expect(
      deriveOpportunityNextAction({
        state: "application_opened",
        tasks: [],
        opportunityDeadline: null,
      }).action,
    ).toEqual({
      key: "confirm_application",
      label: "Confirm application status",
      taskId: null,
      dueAt: null,
    });
  });

  it.each(["applied", "interview"] as const)(
    "returns update outcome for %s",
    (state) => {
      expect(
        deriveOpportunityNextAction({
          state,
          tasks: [],
          opportunityDeadline: null,
        }).action.key,
      ).toBe("update_outcome");
    },
  );

  it.each([
    "offer",
    "rejected",
    "withdrawn",
    "no_response",
    "expired",
    "archived",
  ] as const)("returns reflection for the closed state %s", (state) => {
    expect(
      deriveOpportunityNextAction({
        state,
        tasks: [],
        opportunityDeadline: null,
      }).action.key,
    ).toBe("review_learning");
  });

  it("does not let an optional skipped task block readiness progress", () => {
    const result = deriveOpportunityNextAction({
      state: "preparing",
      tasks: [
        { ...baseTasks[0], status: "completed" },
        { ...baseTasks[2], status: "skipped" },
      ],
      opportunityDeadline: null,
    });

    expect(result.progress).toEqual({
      completedRequired: 1,
      totalRequired: 1,
      percent: 100,
    });
    expect(result.action.key).toBe("open_application");
  });

  it("uses activate for a shortlist", () => {
    expect(
      deriveOpportunityNextAction({
        state: "shortlisted",
        tasks: [],
        opportunityDeadline: null,
      }).action.key,
    ).toBe("activate");
  });
});
