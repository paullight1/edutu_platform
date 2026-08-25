import { Boxes, GitCommitHorizontal, ServerCog } from "lucide-react";
import type { EngineRuntimeIdentity } from "../model/types";

export default function ApiRuntimeCard({
  runtime,
}: {
  runtime?: EngineRuntimeIdentity;
}) {
  return (
    <article
      className="engine-card engine-runtime-identity-card"
      role="region"
      aria-label="API deployment identity"
    >
      <header className="engine-card-header">
        <span className="engine-card-icon" aria-hidden="true">
          <ServerCog size={20} />
        </span>
        <div>
          <p className="engine-card-eyebrow">Deployment identity</p>
          <h2>{runtime ? "Canonical API runtime" : "Runtime not identified"}</h2>
        </div>
      </header>

      {runtime ? (
        <dl className="engine-definition-list">
          <div>
            <dt>Service</dt>
            <dd>
              <Boxes size={15} aria-hidden="true" />
              {runtime.service}
            </dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{runtime.version}</dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd>
              <GitCommitHorizontal size={15} aria-hidden="true" />
              {runtime.commit || "Not reported"}
            </dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>{runtime.environment} runtime</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{new Date(runtime.startedAt).toLocaleString()}</dd>
          </div>
        </dl>
      ) : (
        <p>
          The authenticated Engine endpoint is reachable, but it did not report
          a version or deployment commit.
        </p>
      )}
    </article>
  );
}
