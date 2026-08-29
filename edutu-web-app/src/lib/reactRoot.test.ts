import { describe, expect, it, vi } from "vitest";
import { getOrCreateReactRoot, type ReactRootRegistry } from "./reactRoot";

describe("getOrCreateReactRoot", () => {
  it("reuses the mounted root when Vite reevaluates main.tsx", () => {
    const registry: ReactRootRegistry = {};
    const container = document.createElement("div");
    const root = { render: vi.fn(), unmount: vi.fn() };
    const createRoot = vi.fn(() => root);

    expect(getOrCreateReactRoot(registry, container, createRoot)).toBe(root);
    expect(getOrCreateReactRoot(registry, container, createRoot)).toBe(root);
    expect(createRoot).toHaveBeenCalledOnce();
    expect(createRoot).toHaveBeenCalledWith(container);
  });
});
