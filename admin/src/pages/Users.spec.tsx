// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { backendFetchJson } from "../lib/backend";
import Users from "./Users";

vi.mock("../lib/backend", () => ({
  backendFetchJson: vi.fn(),
}));

const mockedBackendFetchJson = vi.mocked(backendFetchJson);

describe("Users data availability", () => {
  beforeEach(() => {
    mockedBackendFetchJson.mockRejectedValue(
      new Error("The admin API could not be reached."),
    );
  });

  it("does not present zero counts or an empty-result state when loading fails", async () => {
    render(<Users />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The admin API could not be reached.",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(
      screen.getByText(
        "User records are unavailable until the connection is restored.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("No users matched the current filters.")).toBeNull();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });
});
