import { Link } from "react-router-dom";

/**
 * Slim footer for every in-app screen, rendered once by AppWorkspaceShell
 * under the routed content. Screens must not add their own copy — the
 * dashboard's local footer was removed in favor of this one.
 */
export default function AppFooter() {
  return (
    <footer className="mx-auto max-w-[1500px] border-t border-subtle px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-text-muted">
          © {new Date().getFullYear()} Edutu. All rights reserved.
        </p>
        <nav
          aria-label="Footer"
          className="flex items-center gap-4 text-xs font-semibold text-text-muted"
        >
          <Link to="/help" className="transition hover:text-brand">
            Help
          </Link>
          <Link to="/privacy" className="transition hover:text-brand">
            Privacy
          </Link>
          <Link to="/terms" className="transition hover:text-brand">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
