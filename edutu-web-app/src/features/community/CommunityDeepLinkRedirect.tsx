import { Navigate, useLocation } from "react-router-dom";
import { resolveCommunityWebDeepLink } from "./deepLinks";

export default function CommunityDeepLinkRedirect() {
  const location = useLocation();
  const destination = resolveCommunityWebDeepLink(location.pathname);

  return <Navigate to={destination || "/app/community/explore"} replace />;
}
