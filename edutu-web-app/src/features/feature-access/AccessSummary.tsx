import { WorkspaceText } from "../workspace/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useProductSession, errorMessage } from "../workspace/shared";
interface Policy {
  planTier: string;
  costs: Record<string, number>;
  chatGraceActive: boolean;
  chatRemaining: number;
  actionCreditsRemaining: number | null;
  voiceEligible: boolean;
  voiceMinutesRemaining: number;
  resetsAt: string | null;
}
export default function AccessSummary({
  action,
}: {
  action:
    | "chatMessage"
    | "cvAi"
    | "roadmapGeneration"
    | "copilotKit"
    | "copilotAssist"
    | "voicePerMinute";
}) {
  const { request, userId } = useProductSession();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setPolicy(null);
    setError(null);
    const refresh = () => {
      request<Policy>("/monetization/access", { signal: c.signal })
        .then(setPolicy)
        .catch((e) => {
          if (!c.signal.aborted) setError(errorMessage(e));
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("edutu:ai-complete", refresh);
    return () => {
      c.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("edutu:ai-complete", refresh);
    };
  }, [request, userId]);
  return (
    <p className="feature-muted mb-4" role="status">
      {error
        ? "AI access is unavailable. The server will recheck before you continue."
        : !policy
          ? "Checking AI allowance…"
          : action === "voicePerMinute"
            ? policy.voiceEligible
              ? `${policy.voiceMinutesRemaining} voice minutes remain today.`
              : "Voice requires an active paid plan."
            : policy.planTier !== "none"
              ? action === "chatMessage"
                ? `${policy.chatRemaining} chat messages remain today.`
                : `${policy.actionCreditsRemaining} action credits remain today.`
              : action === "chatMessage" && policy.chatGraceActive
                ? "Your new-account chat grace is active."
                : action === "chatMessage"
                  ? `${policy.chatRemaining} free messages remain, then ${policy.costs[action]} credits per turn.`
                  : `${policy.costs[action]} credits per AI action.`}
      {policy?.resetsAt && (
        <>
          {" "}
          <WorkspaceText value="resets" />{" "}
          {new Date(policy.resetsAt).toLocaleString()}.
        </>
      )}{" "}
      <Link to="/app/wallet">
        <WorkspaceText value="viewAccess" />
      </Link>
    </p>
  );
}
