export type OpportunityWidgetProps = {
  title: string;
  provider: string;
  deadline: string;
  category: string;
  location: string;
  match?: number;
  /** True when the deadline is closing soon — the widget highlights it red. */
  urgent?: boolean;
  deepLink?: string;
  items?: Array<{
    title: string;
    provider: string;
    deadline: string;
    category: string;
    location: string;
    match?: number;
    urgent?: boolean;
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
