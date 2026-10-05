import "../../i18n";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, it, expect } from "vitest";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../workspace/shared", async () => ({
  ...(await vi.importActual<typeof import("../workspace/shared")>(
    "../workspace/shared",
  )),
  useProductSession: () => ({ request, userId: "coach_owner", token: vi.fn() }),
}));
vi.mock("../../hooks/usePaywall", () => ({
  usePaywall: () => ({ refreshBilling: vi.fn() }),
}));
vi.mock("../feature-access/AccessSummary", () => ({ default: () => null }));
import CoachPage from "./CoachPage";
it("renders opportunity links from the backend history metadata contract", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  request.mockImplementation(async (path: string) =>
    path === "/chat/threads"
      ? { threads: [{ id: "t1", title: "Scholarships" }] }
      : {
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: "Here is a match",
              metadata: {
                opportunities: [{ id: "opp1", title: "Research Fellowship" }],
              },
            },
          ],
        },
  );
  render(
    <MemoryRouter>
      <CoachPage />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /history/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Scholarships" }));
  expect(
    await screen.findByRole("link", { name: /Research Fellowship/ }),
  ).toHaveAttribute("href", "/app/opportunity/opp1");
});
