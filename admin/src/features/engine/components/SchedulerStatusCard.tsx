import { CalendarClock, CheckCircle2, Clock3, Power } from "lucide-react";
import type { EngineStatus } from "../model/types";

export default function SchedulerStatusCard({
  scraper,
}: {
  scraper?: EngineStatus["scraper"];
}) {
  if (!scraper) {
    return (
      <article
        className="engine-card engine-card--warning"
        role="region"
        aria-label="Engine scheduler"
      >
        <header className="engine-card-header">
          <span className="engine-card-icon" aria-hidden="true">
            <CalendarClock size={20} />
          </span>
          <div>
            <p className="engine-card-eyebrow">Automation</p>
            <h2>Scheduler status unavailable</h2>
          </div>
        </header>
        <p>The deployed API did not return scheduler configuration.</p>
      </article>
    );
  }

  const drift = scraper.autoRunEnabled && !scraper.cronArmed;

  return (
    <article
      className={`engine-card${drift ? " engine-card--error" : ""}`}
      role="region"
      aria-label="Engine scheduler"
    >
      <header className="engine-card-header">
        <span
          className={`engine-card-icon${
            scraper.cronArmed ? " engine-card-icon--success" : ""
          }`}
          aria-hidden="true"
        >
          <CalendarClock size={20} />
        </span>
        <div>
          <p className="engine-card-eyebrow">Automation</p>
          <h2>
            {drift
              ? "Scheduler intent drift"
              : scraper.cronArmed
                ? "Scheduler active"
                : "Scheduler idle"}
          </h2>
        </div>
      </header>

      <div className="engine-status-chip-row">
        <span
          className={`engine-status-chip engine-status-chip--${
            scraper.schedulerEnabled ? "success" : "warning"
          }`}
        >
          <Power size={14} aria-hidden="true" />
          {scraper.schedulerEnabled
            ? "Scheduler enabled"
            : "Scheduler disabled"}
        </span>
        <span
          className={`engine-status-chip engine-status-chip--${
            scraper.autoRunEnabled ? "success" : "neutral"
          }`}
        >
          <Clock3 size={14} aria-hidden="true" />
          {scraper.autoRunEnabled
            ? "Automatic runs enabled"
            : "Automatic runs disabled"}
        </span>
        <span
          className={`engine-status-chip engine-status-chip--${
            scraper.cronArmed ? "success" : drift ? "error" : "neutral"
          }`}
        >
          {scraper.cronArmed ? (
            <CheckCircle2 size={14} aria-hidden="true" />
          ) : (
            <Clock3 size={14} aria-hidden="true" />
          )}
          {scraper.cronArmed ? "Cron armed" : "Cron not armed"}
        </span>
      </div>

      <dl className="engine-definition-list">
        <div>
          <dt>Schedule</dt>
          <dd>{scraper.cronSchedule}</dd>
        </div>
        <div>
          <dt>Timezone</dt>
          <dd>{scraper.cronTimezone || "Not reported"}</dd>
        </div>
        <div>
          <dt>Next run</dt>
          <dd>
            {scraper.nextRunAt
              ? new Date(scraper.nextRunAt).toLocaleString()
              : "Not scheduled"}
          </dd>
        </div>
      </dl>

      {drift ? (
        <p className="engine-card-remediation">
          Automatic runs are enabled in stored settings, but no cron job is
          armed. Redeploy or reinitialize the canonical API scheduler before
          relying on automation.
        </p>
      ) : null}
    </article>
  );
}
