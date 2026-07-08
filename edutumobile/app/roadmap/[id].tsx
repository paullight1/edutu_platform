import { Redirect } from "expo-router";

/**
 * Singular `edutu://roadmap/<id>` deep links have no matching route (the screen
 * is the `/roadmaps` list). Bridge them so a tapped link never dead-ends on
 * "Unmatched Route".
 */
export default function RoadmapDeepLinkRedirect() {
  return <Redirect href="/roadmaps" />;
}
