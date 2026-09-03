import { getApiBaseUrl } from "../lib/apiBaseUrl";
import { getLocalDevAuthHeaders } from "../lib/localDevAuthHeaders";

export async function passFocusedOpportunity(input: {
  token: string;
  opportunityId: string;
  reason?: string;
  batchId?: string | null;
}): Promise<void> {
  const response = await fetch(`${getApiBaseUrl("Opportunity Signals API")}/me/opportunities/signals`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.token}`,
      ...getLocalDevAuthHeaders(),
    },
    body: JSON.stringify({
      opportunityId: input.opportunityId,
      signalType: "dismiss",
      source: "intentional_home",
      details: {
        reason: input.reason ?? "not_for_me",
        recommendationBatchId: input.batchId ?? null,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Unable to record this recommendation decision (${response.status}).`);
  }
}
