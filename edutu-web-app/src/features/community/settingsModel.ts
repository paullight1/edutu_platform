import type {
  GroupDetail,
  GroupForm,
  GroupJoinPolicy,
  GroupQuestion,
  GroupVisibility,
  UpdateGroupInput,
} from "./types";

export interface GroupSettingsQuestionDraft {
  id: string;
  type: "short_text" | "long_text" | "single_select";
  label: string;
  required: boolean;
  options?: string[];
}

export interface GroupSettingsDraft {
  name: string;
  description: string;
  visibility: GroupVisibility;
  joinPolicy: GroupJoinPolicy;
  coverEmoji?: string;
  questions: GroupSettingsQuestionDraft[];
}

function validateQuestion(
  question: GroupSettingsQuestionDraft,
): GroupQuestion {
  const id = question.id.trim();
  const label = question.label.trim();
  if (id.length < 1 || id.length > 40) {
    throw new Error("Question IDs must be between 1 and 40 characters.");
  }
  if (label.length < 1 || label.length > 60) {
    throw new Error("Question labels must be between 1 and 60 characters.");
  }

  if (question.type === "single_select") {
    const options = (question.options ?? []).map((option) => option.trim());
    if (options.length < 2 || options.length > 6) {
      throw new Error("Single-select questions need 2 options and may have at most 6.");
    }
    if (options.some((option) => option.length < 1 || option.length > 40)) {
      throw new Error("Each single-select option must be 1 to 40 characters.");
    }
    if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
      throw new Error("Single-select options must be unique.");
    }
    return {
      id,
      type: "single_select",
      label,
      required: question.required,
      options,
    };
  }

  return {
    id,
    type: question.type,
    label,
    required: question.required,
  };
}

export function buildGroupSettingsSubmission(draft: GroupSettingsDraft): {
  patch: UpdateGroupInput;
  form: GroupForm | null;
} {
  const name = draft.name.trim();
  const description = draft.description.trim();
  if (name.length < 3 || name.length > 60) {
    throw new Error("Community names must be between 3 and 60 characters.");
  }
  if (description.length > 280) {
    throw new Error("Community descriptions must be 280 characters or fewer.");
  }
  if (draft.questions.length > 5) {
    throw new Error("A community can have at most 5 screening questions.");
  }

  const questions = draft.questions.map(validateQuestion);
  const ids = questions.map((question) => question.id.toLowerCase());
  if (new Set(ids).size !== ids.length) {
    throw new Error("Each screening question needs a unique ID.");
  }

  const patch: UpdateGroupInput = {
    name,
    description,
    visibility: draft.visibility,
    joinPolicy: draft.joinPolicy,
  };
  const coverEmoji = draft.coverEmoji?.trim();
  if (coverEmoji !== undefined) {
    if (coverEmoji.length < 1 || coverEmoji.length > 8) {
      throw new Error("Choose a short emoji or symbol for the community cover.");
    }
    patch.coverEmoji = coverEmoji;
  }

  return {
    patch,
    form: draft.joinPolicy === "request" ? { questions } : null,
  };
}

export function canManageCommunityGroup(
  detail: GroupDetail,
  userId: string | null | undefined,
): boolean {
  if (!userId || detail.membership?.userId !== userId) return false;
  if (detail.membership.status !== "active") return false;
  return (
    detail.membership.role === "owner" || detail.membership.role === "mod"
  );
}
