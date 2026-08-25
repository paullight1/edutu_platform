import { Globe2, ShieldAlert, ShieldCheck } from "lucide-react";
import type { AdminRuntimeConfig } from "../../../lib/runtimeConfig";

interface RuntimeConfigurationCardProps {
  config: AdminRuntimeConfig | null;
  error?: Error | null;
}

export default function RuntimeConfigurationCard({
  config,
  error,
}: RuntimeConfigurationCardProps) {
  if (!config || error) {
    return (
      <article className="engine-card engine-runtime-card engine-runtime-card--error">
        <header>
          <span aria-hidden="true">
            <ShieldAlert size={20} />
          </span>
          <div>
            <p className="engine-card-eyebrow">Admin runtime</p>
            <h2>API target unavailable</h2>
          </div>
        </header>
        <p>
          The admin cannot identify an explicit API target for this build. Set
          <code> VITE_BACKEND_URL </code> and redeploy the canonical admin
          project.
        </p>
      </article>
    );
  }

  return (
    <article className="engine-card engine-runtime-card">
      <header>
        <span aria-hidden="true">
          {config.explicit ? (
            <ShieldCheck size={20} />
          ) : (
            <Globe2 size={20} />
          )}
        </span>
        <div>
          <p className="engine-card-eyebrow">Admin runtime</p>
          <h2>{config.explicit ? "Explicit API target" : "Development proxy"}</h2>
        </div>
      </header>

      <dl className="engine-definition-list">
        <div>
          <dt>Target</dt>
          <dd>{config.apiOrigin || "Same-origin Vite proxy"}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{config.source}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{config.mode}</dd>
        </div>
        <div>
          <dt>Configuration</dt>
          <dd>
            {config.legacyAlias
              ? "Legacy compatibility alias"
              : config.explicit
                ? "Explicit"
                : "Development-only"}
          </dd>
        </div>
      </dl>
    </article>
  );
}
