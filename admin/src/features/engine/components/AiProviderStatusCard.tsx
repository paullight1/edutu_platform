import { Bot, CheckCircle2, KeyRound, Power } from "lucide-react";
import type { EngineStatus } from "../model/types";

function selectedProviderKeyAvailable(ai: NonNullable<EngineStatus["ai"]>): boolean {
  if (ai.provider === "gemini") return Boolean(ai.geminiConfigured);
  if (ai.provider === "deepseek") return ai.deepseekConfigured;
  return ai.deepseekConfigured || Boolean(ai.geminiConfigured);
}

export default function AiProviderStatusCard({
  ai,
}: {
  ai?: EngineStatus["ai"];
}) {
  if (!ai) {
    return (
      <article
        className="engine-card engine-card--warning"
        role="region"
        aria-label="AI extraction provider"
      >
        <header className="engine-card-header">
          <span className="engine-card-icon" aria-hidden="true">
            <Bot size={20} />
          </span>
          <div>
            <p className="engine-card-eyebrow">Extraction intelligence</p>
            <h2>Provider status unavailable</h2>
          </div>
        </header>
        <p>The deployed API did not return an AI extraction configuration.</p>
      </article>
    );
  }

  const keyAvailable = selectedProviderKeyAvailable(ai);

  return (
    <article
      className={`engine-card${
        ai.enabled && !keyAvailable ? " engine-card--error" : ""
      }`}
      role="region"
      aria-label="AI extraction provider"
    >
      <header className="engine-card-header">
        <span
          className={`engine-card-icon${
            ai.enabled && keyAvailable ? " engine-card-icon--success" : ""
          }`}
          aria-hidden="true"
        >
          <Bot size={20} />
        </span>
        <div>
          <p className="engine-card-eyebrow">Extraction intelligence</p>
          <h2>{ai.enabled ? "AI route enabled" : "AI route disabled"}</h2>
        </div>
      </header>

      <div className="engine-status-chip-row">
        <span
          className={`engine-status-chip engine-status-chip--${
            ai.enabled ? "success" : "warning"
          }`}
        >
          <Power size={14} aria-hidden="true" />
          {ai.enabled ? "Route enabled" : "Route disabled"}
        </span>
        <span
          className={`engine-status-chip engine-status-chip--${
            keyAvailable ? "success" : "error"
          }`}
        >
          {keyAvailable ? (
            <CheckCircle2 size={14} aria-hidden="true" />
          ) : (
            <KeyRound size={14} aria-hidden="true" />
          )}
          {keyAvailable ? "Key available" : "Key missing"}
        </span>
      </div>

      <dl className="engine-definition-list">
        <div>
          <dt>Provider</dt>
          <dd>{ai.provider}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{ai.model}</dd>
        </div>
        <div>
          <dt>Feature</dt>
          <dd>{ai.feature}</dd>
        </div>
        <div>
          <dt>Configuration source</dt>
          <dd>{ai.source}</dd>
        </div>
      </dl>
    </article>
  );
}
