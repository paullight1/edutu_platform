import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Singular `edutu://goal/<id>` deep links map to the real `/goals/[id]` screen.
 * Bridge them so a tapped link never dead-ends on "Unmatched Route".
 */
export default function GoalDeepLinkRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <Redirect href={id ? `/goals/${id}` : "/goals"} />;
}
