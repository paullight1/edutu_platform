import OpportunitiesPageLegacy from "./OpportunitiesPageLegacy";

export { CARD_SURFACE } from "./OpportunitiesPageLegacy";

interface OpportunitiesPageProps {
  embedded?: boolean;
}

export default function OpportunitiesPage(props: OpportunitiesPageProps) {
  return <OpportunitiesPageLegacy {...props} />;
}
