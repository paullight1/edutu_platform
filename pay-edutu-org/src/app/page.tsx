export default function HomePage() {
  return (
    <div className="card center">
      <div className="brand" style={{ justifyContent: 'center' }}>
        <span className="brand-dot" />
        <span className="brand-name">Edutu Pay</span>
      </div>
      <h1>Secure payments for Edutu</h1>
      <p>
        This is the secure checkout for Edutu Pro. Open the Edutu app and tap
        <strong> Upgrade </strong> to start a purchase — you&apos;ll land back here to pay.
      </p>
      <p className="muted">Powered by Paystack. Card details never touch Edutu&apos;s servers.</p>
    </div>
  );
}
