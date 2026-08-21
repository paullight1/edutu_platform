import { getAiFeatureOutputTokenLimit } from "./ai-cost-policy";

type AiRuntimeRoute = {
  maxOutputTokens?: number | null;
  [key: string]: unknown;
};

type AiRuntimeOptions = {
  feature?: string;
  [key: string]: unknown;
};

type RuntimePolicyState = {
  originalResolveRoute: (...args: any[]) => Promise<AiRuntimeRoute>;
  references: number;
};

const states = new WeakMap<object, RuntimePolicyState>();

/**
 * Enforce server-side output ceilings on compact structured AI tasks without
 * requiring every caller, DB route override, or provider adapter to remember
 * the same budget. This wraps AiService's internal route resolver at module
 * startup; non-budgeted features retain the resolved route unchanged.
 */
export function installAiRuntimePolicy(service: object): () => void {
  const target = service as {
    resolveRoute?: (...args: any[]) => Promise<AiRuntimeRoute>;
  };
  if (typeof target.resolveRoute !== "function") {
    throw new Error("AI runtime policy requires a route resolver");
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

  const originalResolveRoute = target.resolveRoute.bind(service);
  const state: RuntimePolicyState = { originalResolveRoute, references: 1 };
  states.set(service, state);

  target.resolveRoute = async (...args: any[]) => {
    const route = await originalResolveRoute(...args);
    const options = (args[0] ?? {}) as AiRuntimeOptions;
    const feature =
      typeof options.feature === "string"
        ? options.feature
        : typeof route.feature === "string"
          ? route.feature
          : "";
    const ceiling = getAiFeatureOutputTokenLimit(feature);
    if (ceiling === null) return route;

    const resolved = Number(route.maxOutputTokens);
    return {
      ...route,
      maxOutputTokens:
        Number.isFinite(resolved) && resolved > 0
          ? Math.min(resolved, ceiling)
          : ceiling,
    };
  };

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    state.references -= 1;
    if (state.references <= 0) {
      target.resolveRoute = originalResolveRoute;
      states.delete(service);
    }
  };
}
