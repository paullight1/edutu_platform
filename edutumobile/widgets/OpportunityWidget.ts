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

export type OpportunityWidgetTimelineEntry = {
  /** When WidgetKit should switch to this entry's props. */
  date: Date;
  props: OpportunityWidgetProps;
};

export function updateOpportunityWidget(_props: OpportunityWidgetProps) {
  return;
}

export function updateOpportunityWidgetTimeline(_entries: OpportunityWidgetTimelineEntry[]) {
  return;
}

const OpportunityWidget = {
  updateSnapshot: updateOpportunityWidget,
  updateTimeline: updateOpportunityWidgetTimeline,
};

export default OpportunityWidget;
