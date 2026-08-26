import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { engineApi } from "../api/engineApi";
import {
  errorResource,
  idleResource,
  loadingResource,
  normalizeEngineError,
  successResource,
  type EngineResourceState,
} from "../model/errors";
import type { ScrapeJob } from "../model/types";
import { useEngineOpportunityReview } from "./useEngineOpportunityReview";
import type {
  ReviewedOpportunity,
  SaveSelectedOutcome,
} from "./useEngineOpportunityReview";

export { toBulkImportItem } from "./useEngineOpportunityReview";
export type {
  ReviewedOpportunity,
  SaveSelectedOutcome,
} from "./useEngineOpportunityReview";

export interface EngineRunsState {
  jobs: EngineResourceState<ScrapeJob[]>;
  selectedJob: ScrapeJob | null;
  opportunities: EngineResourceState<ReviewedOpportunity[]>;
  pendingOperations: ReadonlySet<string>;
  refreshJobs(): Promise<void>;
  inspectJob(job: ScrapeJob): Promise<void>;
  closeInspection(): void;
  deleteJob(job: ScrapeJob): Promise<void>;
  toggleSelected(index: number): void;
  selectAll(): void;
  improveSelected(): Promise<void>;
  saveSelected(): Promise<SaveSelectedOutcome>;
}

export function useEngineRuns(
  completionToken: number | null = null,
): EngineRunsState {
  const [jobs, setJobs] = useState<EngineResourceState<ScrapeJob[]>>(
    idleResource,
  );
  const [selectedJob, setSelectedJob] = useState<ScrapeJob | null>(null);
  const [pendingOperations, setPendingOperations] = useState<Set<string>>(
    () => new Set(),
  );
  const jobsRequestVersion = useRef(0);
  const lastCompletionToken = useRef<number | null>(completionToken);
  const {
    opportunities,
    pendingOperations: reviewPendingOperations,
    load: loadReview,
    reset: resetReview,
    toggleSelected,
    selectAll,
    improveSelected,
    saveSelected,
  } = useEngineOpportunityReview();

  const refreshJobs = useCallback(async () => {
    const version = ++jobsRequestVersion.current;
    setJobs((previous) => loadingResource(previous));

    try {
      const nextJobs = await engineApi.listJobs(100);
      if (version === jobsRequestVersion.current) {
        setJobs(successResource(nextJobs));
      }
    } catch (error) {
      if (version === jobsRequestVersion.current) {
        setJobs((previous) =>
          errorResource(error, "Run history is unavailable.", previous.data),
        );
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    globalThis.queueMicrotask(() => {
      if (active) void refreshJobs();
    });

    return () => {
      active = false;
      jobsRequestVersion.current += 1;
    };
  }, [refreshJobs]);

  useEffect(() => {
    if (
      completionToken === null ||
      completionToken === lastCompletionToken.current
    ) {
      return;
    }
    lastCompletionToken.current = completionToken;
    globalThis.queueMicrotask(() => void refreshJobs());
  }, [completionToken, refreshJobs]);

  const withPending = useCallback(
    async <T,>(operationId: string, operation: () => Promise<T>): Promise<T> => {
      setPendingOperations((current) => new Set(current).add(operationId));
      try {
        return await operation();
      } finally {
        setPendingOperations((current) => {
          const next = new Set(current);
          next.delete(operationId);
          return next;
        });
      }
    },
    [],
  );

  const inspectJob = useCallback(
    async (job: ScrapeJob) => {
      setSelectedJob(job);
      await loadReview(job.id);
    },
    [loadReview],
  );

  const closeInspection = useCallback(() => {
    setSelectedJob(null);
    resetReview();
  }, [resetReview]);

  const deleteJob = useCallback(
    (job: ScrapeJob) =>
      withPending(`delete-job:${job.id}`, async () => {
        const result = await engineApi.deleteJob(job.id);
        if (!result.success) {
          throw normalizeEngineError(
            new Error(result.error || "Job deletion failed"),
            "The run and its attributable opportunities could not be deleted.",
          );
        }
        if (selectedJob?.id === job.id) closeInspection();
        await refreshJobs();
      }),
    [closeInspection, refreshJobs, selectedJob?.id, withPending],
  );

  const combinedPendingOperations = useMemo(
    () => new Set([...pendingOperations, ...reviewPendingOperations]),
    [pendingOperations, reviewPendingOperations],
  );

  return {
    jobs,
    selectedJob,
    opportunities,
    pendingOperations: combinedPendingOperations,
    refreshJobs,
    inspectJob,
    closeInspection,
    deleteJob,
    toggleSelected,
    selectAll,
    improveSelected,
    saveSelected,
  };
}
