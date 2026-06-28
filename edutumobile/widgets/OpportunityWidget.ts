export type OpportunityWidgetProps = {
  title: string;
  provider: string;
  deadline: string;
  category: string;
  location: string;
  match?: number;
  deepLink?: string;
  items?: Array<{
    title: string;
    provider: string;
    deadline: string;
    category: string;
    location: string;
    match?: number;
    deepLink?: string;
  }>;
};

export function updateOpportunityWidget(_props: OpportunityWidgetProps) {
  return;
}

const OpportunityWidget = {
  updateSnapshot: updateOpportunityWidget,
};

export default OpportunityWidget;
