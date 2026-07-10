'use client';

import { useEffect, useState } from 'react';

// Bounces the user back into the Edutu app via its deep link. Auto-fires once,
// with a manual button fallback (some in-app browsers block auto navigation).
export function ReturnRedirect({ deepLink }: { deepLink: string }) {
  const [tried, setTried] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTried(true);
      window.location.href = deepLink;
    }, 1200);
    return () => clearTimeout(timer);
  }, [deepLink]);

  return (
    <a className="btn" href={deepLink}>
      {tried ? 'Reopen the Edutu app' : 'Return to Edutu'}
      <span className="chip" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 12h15M13 5.5 19.5 12 13 18.5" />
        </svg>
      </span>
    </a>
  );
}
