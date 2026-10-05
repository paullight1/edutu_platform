import "../../i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

const { request, refreshBilling } = vi.hoisted(() => ({
  request: vi.fn(),
  refreshBilling: vi.fn(),
}));

vi.mock("../workspace/shared", async () => ({
  ...(await vi.importActual<typeof import("../workspace/shared")>("../workspace/shared")),
  useProductSession: () => ({ request, userId: "user-test" }),
}));
vi.mock("../../hooks/usePaywall", () => ({
  usePaywall: () => ({ refreshBilling }),
}));

import CopilotPage from "./CopilotPage";

const kit = {
  id: "kit-1",
  opportunityId: "opp-1",
  updatedAt: "2026-10-03T10:00:00.000Z",
  generatedBy: "fallback",
  checklistState: {},
  essays: [],
  opportunity: { title: "Global Scholars Fellowship" },
  kit: {
    fitNote: "Review the eligibility criteria first.",
    strategy: ["Confirm your eligibility"],
    checklist: [{ id: "eligibility", label: "Confirm eligibility", category: "research" }],
    essayPrompts: [{ id: "motivation", prompt: "Why are you applying?" }],
  },
};

beforeEach(() => request.mockReset());

it("generates a starter kit when an opportunity has no existing application plan", async () => {
  request.mockImplementation((path: string, options?: { method?: string }) => {
    if (path === "/copilot/kits/opp-1" && !options?.method) {
      return Promise.reject(Object.assign(new Error("Not found"), { status: 404 }));
    }
    if (path === "/copilot/kits/opp-1/generate") return Promise.resolve(kit);
    if (path === "/monetization/access") return Promise.resolve({ planTier: "none", costs: {}, chatGraceActive: false, chatRemaining: 0, actionCreditsRemaining: 0, voiceEligible: false, voiceMinutesRemaining: 0, resetsAt: null });
    return Promise.resolve(undefined);
  });

  render(
    <MemoryRouter initialEntries={["/app/copilot/opp-1"]}>
      <Routes><Route path="/app/copilot/:id" element={<CopilotPage />} /></Routes>
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "Generate application kit" }));
  expect(await screen.findByText("Review the eligibility criteria first.")).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith("/copilot/kits/opp-1/generate", expect.objectContaining({ method: "POST" }));
  await waitFor(() => expect(refreshBilling).toHaveBeenCalled());
});
