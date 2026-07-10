import type { TrendingPosterProps, TrendingPosterTimelineEntry } from './TrendingSpotlightWidget';

export type { TrendingPosterItem, TrendingPosterProps, TrendingPosterTimelineEntry } from './TrendingSpotlightWidget';

// Android/default no-ops (native TrendingThumbListWidgetProvider owns this on Android).
export function updateTrendingThumbListWidget(_props: TrendingPosterProps) {
  return;
}

export function updateTrendingThumbListWidgetTimeline(_entries: TrendingPosterTimelineEntry[]) {
  return;
}

const TrendingThumbListWidget = {
  updateSnapshot: updateTrendingThumbListWidget,
  updateTimeline: updateTrendingThumbListWidgetTimeline,
};

export default TrendingThumbListWidget;
