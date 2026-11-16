import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Singular `edutu://roadmap/<id>` deep links have no matching route (the screen
 * is the `/roadmaps` list). Bridge them so a tapped link never dead-ends on
 * "Unmatched Route" — and carry the id through as `?open=`, so the list opens
 * the roadmap the link actually named instead of an unfiltered catalog.
 */
export default function RoadmapDeepLinkRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const roadmapId = typeof id === "string" ? id : "";

  return (
    <Redirect
      href={roadmapId ? `/roadmaps?open=${encodeURIComponent(roadmapId)}` : "/roadmaps"}
    />
  );
}
