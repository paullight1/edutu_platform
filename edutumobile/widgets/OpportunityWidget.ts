/** Urgency tone for deadline chips/text — mirrors packages/core deadline levels. */
export type WidgetUrgencyTone = 'red' | 'amber' | 'green' | 'slate';

export type OpportunityWidgetItem = {
  title: string;
  provider: string;
  deadline: string;
  category: string;
  location: string;
  match?: number;
  /** True when the deadline is closing soon — the widget highlights it red. */
  urgent?: boolean;
  /** Chip colour for the deadline, derived from urgency level at sync time. */
  tone?: WidgetUrgencyTone;
  /** Whole days until the deadline (for lock-screen countdowns); null when undated. */
  daysLeft?: number | null;
  deepLink?: string;
};

export type OpportunityWidgetProps = {
  title: string;
  provider: string;
  deadline: string;
  category: string;
  location: string;
  match?: number;
  urgent?: boolean;
  tone?: WidgetUrgencyTone;
  daysLeft?: number | null;
  deepLink?: string;
  /** file:// URI of the shared logo mark (see lib/widgetLogo.ts); SF-symbol fallback when absent. */
  logoUri?: string;
  items?: OpportunityWidgetItem[];
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
