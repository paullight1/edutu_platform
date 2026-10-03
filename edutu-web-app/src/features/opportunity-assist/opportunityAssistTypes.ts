export type OpportunityAssistAction =
  | "fit_check"
  | "next_move"
  | "review_doc"
  | "whats_missing"
  | "plan";

export type OpportunityAssistBusy = OpportunityAssistAction | "save" | null;

export interface OpportunityPlan {
  summary: string;
  winningStrategy: string;
  milestones: Array<{ id: string; title: string; description: string }>;
  checklist: string[];
  supportActions: string[];
  requirementActions: Array<{ requirement: string; action: string }>;
  profileGaps: Array<{ gap: string; action: string }>;
  bestPractices: string[];
  generatedBy: "ai" | "fallback";
}
