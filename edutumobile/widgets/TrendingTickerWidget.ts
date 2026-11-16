import type { TrendingPosterProps, TrendingPosterTimelineEntry } from './TrendingSpotlightWidget';

export type { TrendingPosterItem, TrendingPosterProps, TrendingPosterTimelineEntry } from './TrendingSpotlightWidget';

// Android/default no-ops (native TrendingTickerWidgetProvider owns this on Android).
export function updateTrendingTickerWidget(_props: TrendingPosterProps) {
  return;
}

export function updateTrendingTickerWidgetTimeline(_entries: TrendingPosterTimelineEntry[]) {
  return;
}

const TrendingTickerWidget = {
  updateSnapshot: updateTrendingTickerWidget,
  updateTimeline: updateTrendingTickerWidgetTimeline,
};

export default TrendingTickerWidget;
