import type {
  EngineStats,
  EngineStatus,
  OpportunitySite,
  ScrapeJob,
  ScrapeSource,
} from "../model/types";
import {
  idleResource,
  type EngineResourceState,
} from "../model/errors";

export interface EngineOverviewState {
  status: EngineResourceState<EngineStatus>;
  sources: EngineResourceState<ScrapeSource[]>;
  jobs: EngineResourceState<ScrapeJob[]>;
  stats: EngineResourceState<EngineStats>;
  sites: EngineResourceState<OpportunitySite[]>;
  refresh(): Promise<void>;
}

// RED-phase scaffold: tests define independent resource semantics.
export function useEngineOverview(): EngineOverviewState {
  return {
    status: idleResource(),
    sources: idleResource(),
    jobs: idleResource(),
    stats: idleResource(),
    sites: idleResource(),
    refresh: async () => undefined,
  };
}
