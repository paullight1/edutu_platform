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
import GoalsPage from "./GoalsPage";
it("completes a personal goal and makes it available in the completed filter", async () => {
  let row = {
    id: "g1",
    title: "Prepare portfolio",
    priority: "medium",
    status: "active",
    progress: 70,
    targetDate: null,
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
      <GoalsPage />
    </MemoryRouter>,
  );
  await screen.findByText("Prepare portfolio");
  fireEvent.click(screen.getByRole("button", { name: /^Complete$/ }));
  await waitFor(() => expect(row.status).toBe("completed"));
  fireEvent.click(screen.getByRole("button", { name: /^Completed$/ }));
  await screen.findByText("Prepare portfolio");
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "100");
  expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
});
