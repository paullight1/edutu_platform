type RuntimeState = {
  originalRunScraper: (...args: any[]) => Promise<unknown>;
  references: number;
};

const states = new WeakMap<object, RuntimeState>();

function mockModeAllowed(): boolean {
  const engineMode = String(process.env.ENGINE_MODE ?? "")
    .trim()
    .toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  return (
    engineMode === "test" ||
    engineMode === "development" ||
    nodeEnv === "test" ||
    nodeEnv === "development"
  );
}

/**
 * Production must never turn a missing database into a synthetic successful
 * scrape. Tests/development may retain the existing mock path explicitly.
 */
export function installScraperRuntimePolicy(service: object): () => void {
  const target = service as {
    supabase?: unknown;
    runScraper?: (...args: any[]) => Promise<unknown>;
  };
  if (typeof target.runScraper !== "function") {
    throw new Error("Scraper runtime policy requires runScraper");
  }

  const existing = states.get(service);
  if (existing) {
    existing.references += 1;
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      existing.references -= 1;
    };
  }

  const originalRunScraper = target.runScraper.bind(service);
  const state: RuntimeState = { originalRunScraper, references: 1 };
  states.set(service, state);

  target.runScraper = async (...args: any[]) => {
    if (!target.supabase && !mockModeAllowed()) {
      return { success: false, error: "Scraper is not configured" };
    }
    return originalRunScraper(...args);
  };

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    state.references -= 1;
    if (state.references <= 0) {
      target.runScraper = originalRunScraper;
      states.delete(service);
    }
  };
}
