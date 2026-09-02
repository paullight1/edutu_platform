import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchWebFeatureFlagsMock } = vi.hoisted(() => ({
  fetchWebFeatureFlagsMock: vi.fn(),
}));

vi.mock("../services/webConfig", () => ({
  DEFAULT_WEB_FEATURE_FLAGS: {
    opportunity_pipeline_home: false,
    opportunity_my_path: false,
    opportunity_state_actions: false,
    opportunity_pipeline_navigation: false,
  },
  fetchWebFeatureFlags: fetchWebFeatureFlagsMock,
}));

import { useWebFeatureFlag } from "./useWebFeatureFlag";

beforeEach(() => {
  fetchWebFeatureFlagsMock.mockReset();
});

describe("useWebFeatureFlag", () => {
  it("starts disabled and enables only after the public config explicitly enables the flag", async () => {
    fetchWebFeatureFlagsMock.mockResolvedValue({
      opportunity_pipeline_home: true,
      opportunity_my_path: false,
      opportunity_state_actions: false,
      opportunity_pipeline_navigation: false,
    });

    const { result } = renderHook(() =>
      useWebFeatureFlag("opportunity_pipeline_home"),
    );

    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(fetchWebFeatureFlagsMock).toHaveBeenCalledOnce();
  });

  it("remains disabled when config loading fails", async () => {
    fetchWebFeatureFlagsMock.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() =>
      useWebFeatureFlag("opportunity_my_path"),
    );

    await waitFor(() => expect(fetchWebFeatureFlagsMock).toHaveBeenCalledOnce());
    expect(result.current).toBe(false);
  });
});
