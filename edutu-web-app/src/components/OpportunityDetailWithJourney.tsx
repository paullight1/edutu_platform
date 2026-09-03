import OpportunityDetail from "./OpportunityDetail";
import OpportunityJourneyActionMount from "./opportunity-path/OpportunityJourneyActionMount";

export default function OpportunityDetailWithJourney() {
  return (
    <>
      <OpportunityJourneyActionMount />
      <OpportunityDetail />
    </>
  );
}
