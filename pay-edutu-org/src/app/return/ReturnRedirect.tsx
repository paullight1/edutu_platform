'use client';

import { useEffect, useState } from 'react';

interface Props {
  deepLink: string;
  /** Auto-bounce back into the app after a beat. Turn OFF on screens the user
   *  has to READ (errors) — yanking them away mid-sentence hides the very
   *  explanation and retry option we just gave them. */
  auto?: boolean;
  /** Overrides the default "Return to Edutu" wording. */
  label?: string;
  /** Lets a caller render this as the secondary action next to a retry button. */
  className?: string;
}

// Bounces the user back into the Edutu app via its deep link. Auto-fires once,
// with a manual button fallback (some in-app browsers block auto navigation).
export function ReturnRedirect({ deepLink, auto = true, label, className = 'btn' }: Props) {
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(() => {
      setTried(true);
      window.location.href = deepLink;
    }, 1200);
    return () => clearTimeout(timer);
  }, [deepLink, auto]);

  return (
    <a className={className} href={deepLink}>
      {tried ? 'Reopen the Edutu app' : label || 'Return to Edutu'}
      <span className="chip" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 12h15M13 5.5 19.5 12 13 18.5" />
        </svg>
      </span>
    </a>
  );
}
