import { getAdminRuntimeConfig } from "./runtimeConfig";

export interface OpportunityPipelineSummary {
  from: string;
  to: string;
  activeUsers: number;
  northStar: {
    eligibleUsers: number;
    successfulUsers: number;
    percentage: number;
  };
  funnel: Array<{
    step: string;
    users: number;
    events: number;
    conversionFromPrevious: number;
  }>;
  guardrails: {
    applicationOpenedUsers: number;
    applicationConfirmedUsers: number;
    openedWithoutConfirmationGap: number;
    reminderEvents: number;
    sourceCounts: Record<string, number>;
  };
}

export async function fetchOpportunityPipelineSummary(input: {
  token: string;
  from: Date;
  to: Date;
  signal?: AbortSignal;
}): Promise<OpportunityPipelineSummary> {
  const { apiBaseUrl } = getAdminRuntimeConfig();
  const query = new URLSearchParams({
    from: input.from.toISOString(),
    to: input.to.toISOString(),
  });
  const response = await fetch(
    `${apiBaseUrl}/admin/analytics/opportunity-pipeline?${query}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.token}`,
      },
      signal: input.signal,
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(
      body.message ?? `Opportunity pipeline report failed with ${response.status}`,
    );
  }
  return response.json() as Promise<OpportunityPipelineSummary>;
}
