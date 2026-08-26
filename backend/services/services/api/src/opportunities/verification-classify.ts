export type FetchClass =
  | "ok"
  | "dead"
  | "blocked"
  | "server_error"
  | "network_error";

export function classifyHttpStatus(status: number | null): FetchClass {
  if (status === null) return "network_error";
  if (status >= 200 && status < 400) return "ok";
  if (status === 404 || status === 410) return "dead";
  if (status >= 500) return "server_error";
  return "blocked";
}

export function isInconclusive(fetchClass: FetchClass): boolean {
  return (
    fetchClass === "blocked" ||
    fetchClass === "server_error" ||
    fetchClass === "network_error"
  );
}

export interface HealthDecision {
  verificationStatus: "verified" | "stale" | "broken_link";
  opportunityStatus: string;
  brokenLinkCount: number;
  recheckHours: number;
}

export function decideHealthOutcome(input: {
  fetchClass: FetchClass;
  currentStatus: string | null;
  currentBrokenCount: number | null;
}): HealthDecision {
  const current = Math.max(0, Number(input.currentBrokenCount ?? 0));
  const liveStatus = input.currentStatus || "active";

  if (input.fetchClass === "ok") {
    return {
      verificationStatus: "verified",
      opportunityStatus: "active",
      brokenLinkCount: 0,
      recheckHours: 24 * 7,
    };
  }

  if (input.fetchClass === "dead") {
    const strikes = current + 1;
    const confirmed = strikes >= 2;
    return {
      verificationStatus: confirmed ? "broken_link" : "stale",
      opportunityStatus: confirmed ? "pending_review" : liveStatus,
      brokenLinkCount: strikes,
      recheckHours: confirmed ? 24 * 7 : 24,
    };
  }

  return {
    verificationStatus: "stale",
    opportunityStatus: liveStatus,
    brokenLinkCount: current,
    recheckHours: 12,
  };
}
