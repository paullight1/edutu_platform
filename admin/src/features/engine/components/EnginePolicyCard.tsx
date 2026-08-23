import { Gauge, Route, ShieldCheck } from "lucide-react";
import type { EngineStatus } from "../model/types";

export default function EnginePolicyCard({
  scraper,
}: {
  scraper?: EngineStatus["scraper"];
}) {
  if (!scraper) {
    return (
      <article
        className="engine-card engine-card--warning"
        role="region"
        aria-label="Engine policy"
      >
        <header className="engine-card-header">
          <span className="engine-card-icon" aria-hidden="true">
            <Gauge size={20} />
          </span>
          <div>
            <p className="engine-card-eyebrow">Runtime policy</p>
            <h2>Policy status unavailable</h2>
          </div>
        </header>
        <p>The deployed API did not return Engine execution limits.</p>
      </article>
    );
  }

  const retention =
    scraper.dataRetentionDays === null
      ? "Retention disabled"
      : `${scraper.dataRetentionDays} days retention`;

  return (
    <article
      className="engine-card"
      role="region"
      aria-label="Engine policy"
    >
      <header className="engine-card-header">
        <span className="engine-card-icon" aria-hidden="true">
          <Gauge size={20} />
        </span>
        <div>
          <p className="engine-card-eyebrow">Runtime policy</p>
          <h2>Collection limits</h2>
        </div>
      </header>

      <ul className="engine-policy-facts">
        <li>
          <Gauge size={17} aria-hidden="true" />
          <span>{scraper.enrichConcurrency} concurrent enrichers</span>
        </li>
        <li>
          <Route size={17} aria-hidden="true" />
          <span>{scraper.maxPagesCap} pages maximum</span>
        </li>
        <li>
          <ShieldCheck size={17} aria-hidden="true" />
          <span>{scraper.minPublishQualityScore}+ publish score</span>
        </li>
        <li>
          <ShieldCheck size={17} aria-hidden="true" />
          <span>{retention}</span>
        </li>
        {scraper.recheckAfterDays !== undefined ? (
          <li>
            <ShieldCheck size={17} aria-hidden="true" />
            <span>{scraper.recheckAfterDays} days recheck window</span>
          </li>
        ) : null}
        {scraper.egressRoute ? (
          <li>
            <Route size={17} aria-hidden="true" />
            <span>{scraper.egressRoute} egress route</span>
          </li>
        ) : null}
      </ul>
    </article>
  );
}
