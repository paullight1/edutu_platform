import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Deep links from widgets and shares use the singular `edutu://opportunity/<id>`,
 * but the real screen lives at `/opportunities/[id]`. Expo Router's automatic
 * linking matches the incoming path verbatim, so without this bridge the singular
 * path has no route and the app shows "Unmatched Route". Redirecting here makes a
 * tapped widget/share always land on the opportunity exactly.
 */
export default function OpportunityDeepLinkRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <Redirect href={id ? `/opportunities/${id}` : "/opportunities"} />;
}
