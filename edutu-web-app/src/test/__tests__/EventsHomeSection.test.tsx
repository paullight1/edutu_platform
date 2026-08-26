import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventsHomeSection from "../../components/EventsHomeSection";
import { fetchEvents } from "../../services/events";

vi.mock("../../services/events", () => ({
  fetchEvents: vi.fn(),
}));

describe("EventsHomeSection", () => {
  beforeEach(() => {
    vi.mocked(fetchEvents).mockResolvedValue([]);
  });

  it("keeps calendar and upcoming dates one tap away when no events exist", async () => {
    render(
      <MemoryRouter>
        <EventsHomeSection variant="app" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("link", { name: /calendar and upcoming/i }),
    ).toHaveAttribute("href", "/app/deadlines");
  });
});
