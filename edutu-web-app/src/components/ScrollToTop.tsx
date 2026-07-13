import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Global scroll reset for the SPA. React Router keeps the previous scroll
 * position across navigations, so without this every route opens wherever the
 * last one was scrolled to. On a forward navigation we jump to the top; we
 * leave back/forward (POP) alone so the browser can restore the prior
 * position, and we skip in-page anchor links (#hash) so they still scroll to
 * their target. The whole app scrolls the window (shells are min-h-[100dvh]),
 * so resetting window scroll covers every page.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === 'POP') return;
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash, navigationType]);

  return null;
}
