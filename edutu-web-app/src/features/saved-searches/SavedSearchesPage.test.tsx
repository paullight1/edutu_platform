import "../../i18n";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, it, expect } from "vitest";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../workspace/shared", async () => ({
  ...(await vi.importActual<typeof import("../workspace/shared")>(
    "../workspace/shared",
  )),
  useProductSession: () => ({ request, userId: "test_owner" }),
}));
vi.mock("../../components/WebPushSettings", () => ({ default: () => null }));
import SavedSearchesPage from "./SavedSearchesPage";
it("pauses an alert and reflects the persisted server state", async () => {
  let row = {
    id: "s1",
    name: "Scholarship alert",
    query: "scholarships",
    notifyEnabled: true,
  };
  request.mockImplementation(async (_path: string, options?: RequestInit) => {
    if (options?.method === "PATCH") {
      row = { ...row, ...JSON.parse(options.body as string) };
      return row;
    }
    return [row];
  });
  render(
    <MemoryRouter>
      <SavedSearchesPage />
    </MemoryRouter>,
  );
  await screen.findByText("Scholarship alert");
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  await screen.findByRole("button", { name: "Resume" });
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/saved-searches/s1",
      expect.objectContaining({
        method: "PATCH",
        body: '{"notifyEnabled":false}',
      }),
    ),
  );
  expect(screen.getByText("Paused")).toBeInTheDocument();
});
