import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WhatsNewNotification from "../../components/WhatsNewNotification";

const rootRender = vi.hoisted(() => vi.fn());

vi.mock("../../lib/reactRoot", () => ({
  getOrCreateReactRoot: () => ({ render: rootRender }),
}));

function treeContainsType(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => treeContainsType(child, type));
  }

  if (!isValidElement<{ children?: ReactNode }>(node)) return false;

  return (
    node.type === type || treeContainsType(node.props.children ?? null, type)
  );
}

describe("global notices", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState({}, "", "/");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_edutu");
  });

  it("does not interrupt the landing page with a product-update popup", async () => {
    await import("../../main");

    const renderedTree = rootRender.mock.calls[0]?.[0] as ReactNode;

    expect(treeContainsType(renderedTree, WhatsNewNotification)).toBe(false);
  });
});
