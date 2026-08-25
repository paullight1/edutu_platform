import { useLocation } from "react-router-dom";
import App from "../App";
import BlogPage from "./BlogPage";
import PublicOpportunitiesArchivePage from "./PublicOpportunitiesArchivePage";

function normalisePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

/**
 * Public editorial archives have a different contract from the personalised
 * application: their visible page, canonical URL and pagination links must be
 * deterministic before and after hydration. Keep those routes outside App's
 * recommendation-oriented browse flow while leaving every authenticated route
 * untouched.
 */
export default function PublicRouteGate() {
  const location = useLocation();
  const pathname = normalisePathname(location.pathname);

  if (pathname === "/blog") {
    return <BlogPage />;
  }

  if (
    pathname === "/opportunities" ||
    /^\/opportunities\/[^/]+$/.test(pathname)
  ) {
    return <PublicOpportunitiesArchivePage />;
  }

  return <App />;
}
