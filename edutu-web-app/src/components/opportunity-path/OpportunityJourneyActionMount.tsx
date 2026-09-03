import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useParams } from "react-router-dom";
import { getApiBaseUrl } from "../../lib/apiBaseUrl";
import { useWebFeatureFlag } from "../../hooks/useWebFeatureFlag";
import OpportunityJourneyActions from "./OpportunityJourneyActions";

interface DetailSummary {
  id: string;
  title: string;
  applicationUrl: string | null;
}

export default function OpportunityJourneyActionMount() {
  const enabled = useWebFeatureFlag("opportunity_state_actions");
  const { id } = useParams<{ id: string }>();
  const { getToken, isSignedIn } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailSummary | null>(null);

  useEffect(() => {
    let active = true;
    if (!enabled || !isSignedIn || !id) return;
    void (async () => {
      const authToken = await getToken();
      if (!authToken) return;
      const response = await fetch(
        `${getApiBaseUrl("Opportunity Detail API")}/opportunities/${encodeURIComponent(id)}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${authToken}`,
          },
        },
      );
      if (!response.ok) return;
      const payload = (await response.json()) as Record<string, unknown>;
      const opportunity =
        payload.opportunity && typeof payload.opportunity === "object"
          ? (payload.opportunity as Record<string, unknown>)
          : payload;
      if (!active) return;
      setToken(authToken);
      setDetail({
        id,
        title:
          typeof opportunity.title === "string"
            ? opportunity.title
            : "this opportunity",
        applicationUrl:
          typeof opportunity.applicationUrl === "string"
            ? opportunity.applicationUrl
            : typeof opportunity.applyUrl === "string"
              ? opportunity.applyUrl
              : null,
      });
    })();
    return () => {
      active = false;
    };
  }, [enabled, getToken, id, isSignedIn]);

  if (!enabled || !token || !detail) return null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
      <OpportunityJourneyActions
        token={token}
        opportunityId={detail.id}
        opportunityTitle={detail.title}
        applicationUrl={detail.applicationUrl}
      />
    </div>
  );
}
