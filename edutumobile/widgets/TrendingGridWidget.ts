import type { TrendingPosterProps, TrendingPosterTimelineEntry } from './TrendingSpotlightWidget';

export type { TrendingPosterItem, TrendingPosterProps, TrendingPosterTimelineEntry } from './TrendingSpotlightWidget';

// Android/default no-ops (native TrendingGridWidgetProvider owns this on Android).
export function updateTrendingGridWidget(_props: TrendingPosterProps) {
  return;
}

export function updateTrendingGridWidgetTimeline(_entries: TrendingPosterTimelineEntry[]) {
  return;
}

const TrendingGridWidget = {
  updateSnapshot: updateTrendingGridWidget,
  updateTimeline: updateTrendingGridWidgetTimeline,
};

export default TrendingGridWidget;
