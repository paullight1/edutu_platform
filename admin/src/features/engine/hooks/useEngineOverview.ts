import { useCallback, useEffect, useRef, useState } from "react";
import { engineApi } from "../api/engineApi";
import {
  errorResource,
  idleResource,
  loadingResource,
  successResource,
  type EngineResourceState,
} from "../model/errors";
import type {
  EngineStats,
  EngineStatus,
  OpportunitySite,
  ScrapeJob,
  ScrapeSource,
} from "../model/types";

export interface EngineOverviewState {
  status: EngineResourceState<EngineStatus>;
  sources: EngineResourceState<ScrapeSource[]>;
  jobs: EngineResourceState<ScrapeJob[]>;
  stats: EngineResourceState<EngineStats>;
  sites: EngineResourceState<OpportunitySite[]>;
  refresh(): Promise<void>;
}

interface EngineOverviewResources {
  status: EngineResourceState<EngineStatus>;
  sources: EngineResourceState<ScrapeSource[]>;
  jobs: EngineResourceState<ScrapeJob[]>;
  stats: EngineResourceState<EngineStats>;
  sites: EngineResourceState<OpportunitySite[]>;
}

function createInitialResources(): EngineOverviewResources {
  return {
    status: idleResource(),
    sources: idleResource(),
    jobs: idleResource(),
    stats: idleResource(),
    sites: idleResource(),
  };
}

function settleResource<T>(
  result: PromiseSettledResult<T>,
  previous: EngineResourceState<T>,
  message: string,
): EngineResourceState<T> {
  if (result.status === "fulfilled") {
    return successResource(result.value);
  }

  return errorResource(result.reason, message, previous.data);
}

export function useEngineOverview(): EngineOverviewState {
  const [resources, setResources] = useState(createInitialResources);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;

    setResources((previous) => ({
      status: loadingResource(previous.status),
      sources: loadingResource(previous.sources),
      jobs: loadingResource(previous.jobs),
      stats: loadingResource(previous.stats),
      sites: loadingResource(previous.sites),
    }));

    const [statusResult, sourcesResult, jobsResult, statsResult, sitesResult] =
      await Promise.allSettled([
        engineApi.getStatus(),
        engineApi.listSources(),
        engineApi.listJobs(100),
        engineApi.getStats(),
        engineApi.listSites(),
      ] as const);

    if (version !== requestVersion.current) return;

    setResources((previous) => ({
      status: settleResource(
        statusResult,
        previous.status,
        "Engine status is unavailable.",
      ),
      sources: settleResource(
        sourcesResult,
        previous.sources,
        "Engine sources are unavailable.",
      ),
      jobs: settleResource(
        jobsResult,
        previous.jobs,
        "Engine run history is unavailable.",
      ),
      stats: settleResource(
        statsResult,
        previous.stats,
        "Engine statistics are unavailable.",
      ),
      sites: settleResource(
        sitesResult,
        previous.sites,
        "Engine site attribution is unavailable.",
      ),
    }));
  }, []);

  useEffect(() => {
    let active = true;
    globalThis.queueMicrotask(() => {
      if (active) void refresh();
    });

    return () => {
      active = false;
      requestVersion.current += 1;
    };
  }, [refresh]);

  return {
    ...resources,
    refresh,
  };
}
