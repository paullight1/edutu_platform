import type { WidgetUrgencyTone } from './OpportunityWidget';

/**
 * Shared item for the image-led trending widgets (Spotlight + Grid). `imageUri`
 * is a LOCAL file:// URI (downloaded into the widget shared container on iOS);
 * Android widgets ignore it and load bitmaps natively.
 */
export type TrendingPosterItem = {
  title: string;
  category: string;
  organization?: string;
  /** Formatted countdown, e.g. "5 days left". */
  deadline: string;
  tone?: WidgetUrgencyTone;
  deepLink?: string;
  imageUri?: string;
};

export type TrendingPosterProps = {
  items: TrendingPosterItem[];
  logoUri?: string;
};

export type TrendingPosterTimelineEntry = {
  date: Date;
  props: TrendingPosterProps;
};

// Android/default: the native ViewFlipper providers own these widgets, so the JS
// update calls are no-ops. The .ios.tsx override drives WidgetKit on iOS.
export function updateTrendingSpotlightWidget(_props: TrendingPosterProps) {
  return;
}

export function updateTrendingSpotlightWidgetTimeline(_entries: TrendingPosterTimelineEntry[]) {
  return;
}

const TrendingSpotlightWidget = {
  updateSnapshot: updateTrendingSpotlightWidget,
  updateTimeline: updateTrendingSpotlightWidgetTimeline,
};

export default TrendingSpotlightWidget;
