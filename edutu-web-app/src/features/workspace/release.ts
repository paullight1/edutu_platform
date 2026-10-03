export type WorkspaceFeature =
  | "coach"
  | "voice"
  | "cv"
  | "copilot"
  | "documents"
  | "saved-searches"
  | "goals"
  | "wallet";
/** Independent UI release switches. Backend ownership, metering and provider
 * switches remain authoritative. Comma-separated feature names, default none. */
export function isWorkspaceFeatureEnabled(feature: WorkspaceFeature) {
  return !(import.meta.env.VITE_DISABLED_WORKSPACE_FEATURES || "")
    .split(",")
    .map((v: string) => v.trim())
    .includes(feature);
}
