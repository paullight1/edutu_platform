import type { WidgetUrgencyTone } from './OpportunityWidget';

export type DeadlineWidgetItem = {
  title: string;
  organization: string;
  /** Formatted countdown, e.g. "3 days left", "Closes today". */
  deadline: string;
  /** Calendar-rail pieces, e.g. day "22", month "May". Empty when undated. */
  dateDay: string;
  dateMonth: string;
  tone?: WidgetUrgencyTone;
  daysLeft?: number | null;
  /** Whether the user applied to it or just saved it. */
  kind: 'applied' | 'saved';
  deepLink?: string;
};

export type DeadlineWidgetProps = {
  items: DeadlineWidgetItem[];
  logoUri?: string;
  emptyText?: string;
};

export type DeadlineWidgetTimelineEntry = {
  date: Date;
  props: DeadlineWidgetProps;
};

export function updateDeadlineWidget(_props: DeadlineWidgetProps) {
  return;
}

export function updateDeadlineWidgetTimeline(_entries: DeadlineWidgetTimelineEntry[]) {
  return;
}

const DeadlineWidget = {
  updateSnapshot: updateDeadlineWidget,
  updateTimeline: updateDeadlineWidgetTimeline,
};

export default DeadlineWidget;
