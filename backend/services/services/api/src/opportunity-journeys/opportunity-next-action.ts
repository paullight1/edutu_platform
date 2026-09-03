import type { OpportunityJourneyState } from "./opportunity-journey.types";

export type OpportunityNextActionKey =
  | "activate"
  | "continue_task"
  | "open_application"
  | "confirm_application"
  | "update_outcome"
  | "review_learning";

export interface OpportunityNextActionTask {
  id: string;
  title: string;
  position: number;
  status: "pending" | "in_progress" | "completed" | "skipped";
  required: boolean;
  dueAt: Date | string | null;
}

export interface OpportunityNextAction {
  key: OpportunityNextActionKey;
  label: string;
  taskId: string | null;
  dueAt: Date | null;
}

export interface OpportunityJourneyProgress {
  completedRequired: number;
  totalRequired: number;
  percent: number;
}

function dateValue(value: Date | string | null): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function progressFor(
  tasks: OpportunityNextActionTask[],
): OpportunityJourneyProgress {
  const required = tasks.filter((task) => task.required);
  const completed = required.filter(
    (task) => task.status === "completed" || task.status === "skipped",
  ).length;

  return {
    completedRequired: completed,
    totalRequired: required.length,
    percent:
      required.length === 0 ? 0 : Math.round((completed / required.length) * 100),
  };
}

function nextRequiredTask(
  tasks: OpportunityNextActionTask[],
): OpportunityNextActionTask | null {
  return (
    tasks
      .filter(
        (task) =>
          task.required &&
          task.status !== "completed" &&
          task.status !== "skipped",
      )
      .sort((left, right) => {
        const leftDue = dateValue(left.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDue =
          dateValue(right.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue || left.position - right.position;
      })[0] ?? null
  );
}

function action(
  key: OpportunityNextActionKey,
  label: string,
  taskId: string | null = null,
  dueAt: Date | null = null,
): OpportunityNextAction {
  return { key, label, taskId, dueAt };
}

export function deriveOpportunityNextAction(input: {
  state: OpportunityJourneyState;
  tasks: OpportunityNextActionTask[];
  opportunityDeadline: Date | string | null;
}): {
  action: OpportunityNextAction;
  progress: OpportunityJourneyProgress;
} {
  const progress = progressFor(input.tasks);
  const deadline = dateValue(input.opportunityDeadline);

  if (input.state === "shortlisted") {
    return {
      action: action("activate", "Make this an active pursuit"),
      progress,
    };
  }

  if (input.state === "pursuing" || input.state === "preparing") {
    const task = nextRequiredTask(input.tasks);
    if (task) {
      return {
        action: action(
          "continue_task",
          task.title,
          task.id,
          dateValue(task.dueAt),
        ),
        progress,
      };
    }
    return {
      action: action("open_application", "Open application", null, deadline),
      progress,
    };
  }

  if (input.state === "ready_to_apply") {
    return {
      action: action("open_application", "Open application", null, deadline),
      progress,
    };
  }

  if (input.state === "application_opened") {
    return {
      action: action("confirm_application", "Confirm application status"),
      progress,
    };
  }

  if (input.state === "applied" || input.state === "interview") {
    return {
      action: action("update_outcome", "Update application"),
      progress,
    };
  }

  return {
    action: action("review_learning", "Review what you learned"),
    progress,
  };
}
