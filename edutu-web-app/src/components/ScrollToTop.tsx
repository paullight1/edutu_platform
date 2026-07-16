import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Global scroll reset for the SPA. React Router keeps the previous scroll
 * position across navigations, so without this every route opens wherever the
 * last one was scrolled to. Product decision (2026-07-15): EVERY navigation —
 * including browser back/forward — opens at the top; scrollRestoration is set
 * to manual so the browser doesn't fight the reset. In-page anchor links
 * (#hash) are left alone so they still scroll to their target. The whole app
 * scrolls the window (shells are min-h-[100dvh]), so resetting window scroll
 * covers every page.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);

  return null;
}
