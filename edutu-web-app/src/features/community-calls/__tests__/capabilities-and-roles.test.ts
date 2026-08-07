import { describe, expect, it, vi } from "vitest";
import { detectBrowserMediaSupport } from "../media";
import { canEndCommunityCall } from "../types";

describe("voice browser support and role gates", () => {
  it("allows only owners and moderators to see end-for-everyone control", () => {
    expect(canEndCommunityCall("owner")).toBe(true);
    expect(canEndCommunityCall("mod")).toBe(true);
    expect(canEndCommunityCall("member")).toBe(false);
  });

  it("reports browsers without media capture as unsupported", () => {
    vi.stubGlobal("RTCPeerConnection", class {});
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    const result = detectBrowserMediaSupport();
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toMatch(/does not support/i);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: original });
  });
});
