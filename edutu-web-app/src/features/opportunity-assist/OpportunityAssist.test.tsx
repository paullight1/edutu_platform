import "../../i18n";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../workspace/shared", async () => ({
  ...(await vi.importActual<typeof import("../workspace/shared")>("../workspace/shared")),
  useProductSession: () => ({ request, token: vi.fn().mockResolvedValue("test-token"), userId: "user-test" }),
}));
vi.mock("../feature-access/PaidToolGate", () => ({ PaidToolGate: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../feature-access/AccessSummary", () => ({ default: () => null }));
vi.mock("../../hooks/usePaywall", () => ({ usePaywall: () => ({ handleUpgradeError: vi.fn() }) }));

import OpportunityAssist from "./OpportunityAssist";

beforeEach(() => {
  request.mockReset();
  request.mockImplementation((path: string) => {
    if (path === "/roadmaps/ai/opportunity-plan") return Promise.resolve({
      generatedBy: "fallback", summary: "Start by checking eligibility.", winningStrategy: "Prepare clear evidence.",
      milestones: [{ id: "m1", title: "Check eligibility", description: "Confirm each requirement." }],
      checklist: ["Review the official terms"], supportActions: [], requirementActions: [], profileGaps: [], bestPractices: [],
    });
    if (path === "/roadmaps/mine") return Promise.resolve({ id: "plan-1" });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
});

it("creates a preparation plan and confirms it only after the save request succeeds", async () => {
  render(<MemoryRouter><OpportunityAssist opportunity={{ id: "opp-1", title: "Global Scholars Fellowship" }} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: /Build a preparation plan/ }));
  expect(await screen.findByText("Start by checking eligibility.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save preparation plan" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Plan saved" })).toBeDisabled());
  expect(request).toHaveBeenCalledWith("/roadmaps/mine", expect.objectContaining({ method: "POST" }));
});
