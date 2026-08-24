import { useCallback, useEffect, useRef, useState } from "react";
import { engineApi } from "../api/engineApi";
import {
  errorResource,
  idleResource,
  loadingResource,
  normalizeEngineError,
  successResource,
  type EngineResourceState,
} from "../model/errors";
import type {
  CreateScrapeSourceInput,
  EngineStats,
  OpportunitySite,
  ScrapeResult,
  ScrapeSource,
  SourceMutationResult,
  UpdateScrapeSourceInput,
} from "../model/types";

export interface ParsedBulkSource {
  name: string;
  url: string;
  line: number;
}

export interface ParsedBulkSources {
  entries: ParsedBulkSource[];
  duplicateLines: number[];
  invalidLines: number[];
}

export interface BulkSourceDefaults {
  category: string;
  tier: number;
  parentId?: number | null;
}

export interface BulkSourceOutcome {
  added: number;
  skipped: number;
  failed: number;
  invalid: number;
}

export interface SourceRunOptions {
  maxPages: number;
  incremental: boolean;
  signal?: AbortSignal;
}

export interface EngineSourcesState {
  sources: EngineResourceState<ScrapeSource[]>;
  sites: EngineResourceState<OpportunitySite[]>;
  stats: EngineResourceState<EngineStats>;
  pendingOperations: ReadonlySet<string>;
  refresh(): Promise<void>;
  createSource(input: CreateScrapeSourceInput): Promise<SourceMutationResult>;
  addBulkSources(
    text: string,
    defaults: BulkSourceDefaults,
  ): Promise<BulkSourceOutcome>;
  updateSource(
    source: ScrapeSource,
    input: UpdateScrapeSourceInput,
  ): Promise<SourceMutationResult>;
  setSourceEnabled(
    source: ScrapeSource,
    enabled: boolean,
  ): Promise<SourceMutationResult>;
  deleteSource(source: ScrapeSource): Promise<SourceMutationResult>;
  deleteSite(host: string): Promise<{ success: boolean; deleted: number }>;
  startRun(
    source: ScrapeSource,
    options: SourceRunOptions,
  ): Promise<ScrapeResult>;
}

interface EngineSourceResources {
  sources: EngineResourceState<ScrapeSource[]>;
  sites: EngineResourceState<OpportunitySite[]>;
  stats: EngineResourceState<EngineStats>;
}

function initialResources(): EngineSourceResources {
  return {
    sources: idleResource(),
    sites: idleResource(),
    stats: idleResource(),
  };
}

export function normalizeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString().replace(/\/$/u, "").toLowerCase();
  } catch {
    return null;
  }
}

function displayNameForUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./u, "");
  } catch {
    return value;
  }
}

export function parseBulkSourceLines(text: string): ParsedBulkSources {
  const entries: ParsedBulkSource[] = [];
  const duplicateLines: number[] = [];
  const invalidLines: number[] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/u).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line) return;

    const separator = line.indexOf("|");
    const providedName = separator >= 0 ? line.slice(0, separator).trim() : "";
    const rawUrl = separator >= 0 ? line.slice(separator + 1).trim() : line;
    const normalized = normalizeSourceUrl(rawUrl);

    if (!normalized) {
      invalidLines.push(lineNumber);
      return;
    }

    if (seen.has(normalized)) {
      duplicateLines.push(lineNumber);
      return;
    }

    seen.add(normalized);
    entries.push({
      name: providedName || displayNameForUrl(normalized),
      url: normalized,
      line: lineNumber,
    });
  });

  return { entries, duplicateLines, invalidLines };
}

export function canRunSource(
  source: ScrapeSource,
  allSources: readonly ScrapeSource[],
): boolean {
  if (!source.enabled) return false;
  if (!source.is_group) return true;

  return allSources.some(
    (candidate) =>
      candidate.parent_id === source.id &&
      !candidate.is_group &&
      candidate.enabled,
  );
}

function settle<T>(
  result: PromiseSettledResult<T>,
  previous: EngineResourceState<T>,
  message: string,
): EngineResourceState<T> {
  if (result.status === "fulfilled") return successResource(result.value);
  return errorResource(result.reason, message, previous.data);
}

export function useEngineSources(): EngineSourcesState {
  const [resources, setResources] = useState(initialResources);
  const [pendingOperations, setPendingOperations] = useState<Set<string>>(
    () => new Set(),
  );
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setResources((previous) => ({
      sources: loadingResource(previous.sources),
      sites: loadingResource(previous.sites),
      stats: loadingResource(previous.stats),
    }));

    const [sourcesResult, sitesResult, statsResult] = await Promise.allSettled([
      engineApi.listSources(),
      engineApi.listSites(),
      engineApi.getStats(),
    ] as const);

    if (version !== requestVersion.current) return;

    setResources((previous) => ({
      sources: settle(
        sourcesResult,
        previous.sources,
        "Engine sources are unavailable.",
      ),
      sites: settle(
        sitesResult,
        previous.sites,
        "Engine site attribution is unavailable.",
      ),
      stats: settle(
        statsResult,
        previous.stats,
        "Engine statistics are unavailable.",
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

  const createSource = useCallback(
    (input: CreateScrapeSourceInput) =>
      withPending("create-source", async () => {
        const result = await engineApi.createSource(input);
        if (!result.success) {
          throw normalizeEngineError(
            new Error(result.error || "Source creation failed"),
            "The source could not be created.",
          );
        }
        await refresh();
        return result;
      }),
    [refresh, withPending],
  );

  const addBulkSources = useCallback(
    async (
      text: string,
      defaults: BulkSourceDefaults,
    ): Promise<BulkSourceOutcome> => {
      const parsed = parseBulkSourceLines(text);
      const known = new Set(
        (resources.sources.data ?? [])
          .filter((source) => !source.is_group && source.url)
          .map((source) => normalizeSourceUrl(source.url))
          .filter((url): url is string => Boolean(url)),
      );
      const pending: ParsedBulkSource[] = [];
      let skipped = parsed.duplicateLines.length;

      for (const entry of parsed.entries) {
        if (known.has(entry.url)) {
          skipped += 1;
          continue;
        }
        known.add(entry.url);
        pending.push(entry);
      }

      return withPending("bulk-create-sources", async () => {
        let added = 0;
        let failed = 0;

        for (const entry of pending) {
          try {
            const result = await engineApi.createSource({
              name: entry.name,
              url: entry.url,
              category: defaults.category,
              tier: defaults.tier,
              enabled: true,
              parent_id: defaults.parentId ?? null,
            });

            if (result.success) added += 1;
            else if (result.duplicate) skipped += 1;
            else failed += 1;
          } catch {
            failed += 1;
          }
        }

        if (added > 0) await refresh();

        return {
          added,
          skipped,
          failed,
          invalid: parsed.invalidLines.length,
        };
      });
    },
    [refresh, resources.sources.data, withPending],
  );

  const updateSource = useCallback(
    (source: ScrapeSource, input: UpdateScrapeSourceInput) =>
      withPending(`source:${source.id}`, async () => {
        const result = await engineApi.updateSource(source.id, input);
        if (!result.success) {
          throw normalizeEngineError(
            new Error(result.error || "Source update failed"),
            "The source could not be updated.",
          );
        }
        await refresh();
        return result;
      }),
    [refresh, withPending],
  );

  const setSourceEnabled = useCallback(
    (source: ScrapeSource, enabled: boolean) =>
      updateSource(source, { enabled }),
    [updateSource],
  );

  const deleteSource = useCallback(
    (source: ScrapeSource) =>
      withPending(`source:${source.id}`, async () => {
        const result = await engineApi.deleteSource(source.id);
        if (!result.success) {
          throw normalizeEngineError(
            new Error(result.error || "Source deletion failed"),
            "The source could not be deleted.",
          );
        }
        await refresh();
        return result;
      }),
    [refresh, withPending],
  );

  const deleteSite = useCallback(
    (host: string) =>
      withPending(`site:${host}`, async () => {
        const result = await engineApi.deleteSiteOpportunities(host);
        if (!result.success) {
          throw normalizeEngineError(
            new Error(result.error || "Site deletion failed"),
            "The site opportunities could not be deleted.",
          );
        }
        await refresh();
        return result;
      }),
    [refresh, withPending],
  );

  const startRun = useCallback(
    async (
      source: ScrapeSource,
      options: SourceRunOptions,
    ): Promise<ScrapeResult> => {
      const allSources = resources.sources.data ?? [];
      if (!canRunSource(source, allSources)) {
        throw new Error(
          source.is_group
            ? "This group has no enabled child sources to run."
            : "This source is disabled. Enable it before starting a run.",
        );
      }

      return withPending(`run:${source.id}`, () =>
        engineApi.openRunStream(
          {
            sourceId: source.id,
            maxPages: options.maxPages,
            incremental: options.incremental,
          },
          {},
          options.signal,
        ),
      );
    },
    [resources.sources.data, withPending],
  );

  return {
    ...resources,
    pendingOperations,
    refresh,
    createSource,
    addBulkSources,
    updateSource,
    setSourceEnabled,
    deleteSource,
    deleteSite,
    startRun,
  };
}
