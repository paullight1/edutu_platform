function ShieldLockIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5 4.5 5.4v5.2c0 4.6 3.2 8.9 7.5 10 4.3-1.1 7.5-5.4 7.5-10V5.4L12 2.5Z" />
      <rect x="9.2" y="10.2" width="5.6" height="4.6" rx="1.1" />
      <path d="M10.4 10.2V9a1.6 1.6 0 0 1 3.2 0v1.2" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.7A10.6 10.6 0 0 1 12 4.5c5 0 8.6 4 9.8 6.6a1.9 1.9 0 0 1 0 1.8 13.2 13.2 0 0 1-2.6 3.4M6.4 6.4A13 13 0 0 0 2.2 11a1.9 1.9 0 0 0 0 1.8C3.4 15.5 7 19.5 12 19.5c1.8 0 3.4-.5 4.8-1.3" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="card center">
      <div className="mark neutral" aria-hidden="true">
        <ShieldLockIcon />
      </div>
      <div className="eyebrow">Official Edutu checkout</div>
      <h1>Secure payments for Edutu</h1>
      <p>
        This is the secure checkout for Edutu Pro. Open the Edutu app and tap
        <strong> Upgrade </strong> to start a purchase — you&apos;ll land back here to pay.
      </p>
      <div className="list">
        <div className="row">
          <span className="icn green"><CardIcon /></span>
          <span>Payments processed end-to-end by <strong>Paystack</strong></span>
        </div>
        <div className="row">
          <span className="icn"><EyeOffIcon /></span>
          <span>Card details never touch Edutu&apos;s servers</span>
        </div>
        <div className="row">
          <span className="icn"><BoltIcon /></span>
          <span>Pro unlocks in the app the moment you pay</span>
        </div>
      </div>
    </div>
  );
}
