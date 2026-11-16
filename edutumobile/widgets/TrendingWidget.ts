import type { WidgetUrgencyTone } from './OpportunityWidget';

export type TrendingWidgetItem = {
  title: string;
  organization: string;
  category: string;
  /** Formatted countdown, e.g. "5 days left". */
  deadline: string;
  tone?: WidgetUrgencyTone;
  deepLink?: string;
};

export type TrendingWidgetProps = {
  items: TrendingWidgetItem[];
  logoUri?: string;
};

export type TrendingWidgetTimelineEntry = {
  date: Date;
  props: TrendingWidgetProps;
};

export function updateTrendingWidget(_props: TrendingWidgetProps) {
  return;
}

export function updateTrendingWidgetTimeline(_entries: TrendingWidgetTimelineEntry[]) {
  return;
}

const TrendingWidget = {
  updateSnapshot: updateTrendingWidget,
  updateTimeline: updateTrendingWidgetTimeline,
};

export default TrendingWidget;
