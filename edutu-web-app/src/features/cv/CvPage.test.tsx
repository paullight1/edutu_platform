import "../../i18n";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, it, expect, beforeEach } from "vitest";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../workspace/shared", async () => {
  const actual = await vi.importActual<typeof import("../workspace/shared")>(
    "../workspace/shared",
  );
  return {
    ...actual,
    useProductSession: () => ({ request, userId: "user_test" }),
  };
});
vi.mock("../../hooks/usePaywall", () => ({
  usePaywall: () => ({
    isPro: false,
    billingLoading: false,
    openPaywall: vi.fn(),
    handleUpgradeError: vi.fn(() => false),
    refreshBilling: vi.fn(),
  }),
}));
import CvPage from "./CvPage";
const cv = {
  id: "cv1",
  name: "Research CV",
  data: {
    header: { full_name: "Ada Test", email: "ada@example.test" },
    research: [{ id: "r1", title: "Study" }],
    publications: [{ id: "p1", title: "Paper" }],
    custom: { retain: true },
  },
  templateId: "academic-research",
  updatedAt: "2026-10-01T00:00:00Z",
  source: "mobile",
};
beforeEach(() => {
  sessionStorage.clear();
  request.mockReset();
  request.mockImplementation((path: string) =>
    path === "/cv/editor"
      ? Promise.resolve([cv])
      : path === "/monetization/access"
        ? Promise.reject(new Error("Unavailable"))
        : Promise.resolve(cv),
  );
});
it("preserves advanced sections and uses the saved revision when editing", async () => {
  render(
    <MemoryRouter>
      <CvPage />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Version name")).toHaveValue("Research CV"),
  );
  fireEvent.change(screen.getByLabelText("Version name"), {
    target: { value: "Updated research" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save CV" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      "/cv/editor/cv1",
      expect.objectContaining({ method: "PATCH" }),
    ),
  );
  const call = request.mock.calls.find((c) => c[0] === "/cv/editor/cv1");
  const body = JSON.parse(call![1].body);
  expect(body.data.research).toEqual(cv.data.research);
  expect(body.data.publications).toEqual(cv.data.publications);
  expect(body.data.custom).toEqual({ retain: true });
  expect(body.expectedUpdatedAt).toBe(cv.updatedAt);
});
it("keeps edits visible when another device wins the save", async () => {
  request.mockImplementation((path: string) =>
    path === "/cv/editor"
      ? Promise.resolve([cv])
      : path === "/cv/editor/cv1"
        ? Promise.reject(new Error("This CV changed on another device"))
        : Promise.reject(new Error("Unavailable")),
  );
  render(
    <MemoryRouter>
      <CvPage />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Version name")).toHaveValue("Research CV"),
  );
  fireEvent.change(screen.getByLabelText("Version name"), {
    target: { value: "Keep my edit" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save CV" }));
  await screen.findByText("This CV changed on another device");
  expect(screen.getByLabelText("Version name")).toHaveValue("Keep my edit");
});

it("keeps the library separate from editing and moves through wizard sections", async () => {
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  await screen.findByRole("button", { name: "Preview Research CV" });
  expect(screen.queryByLabelText("Version name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByRole("dialog", { name: "Edit CV" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  expect(screen.getByLabelText("Professional summary")).toBeInTheDocument();
  expect(screen.queryByLabelText("Version name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("does not persist an empty new CV", async () => {
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  await screen.findByRole("button", { name: "Preview Research CV" });
  fireEvent.click(screen.getByRole("button", { name: /Minimal ATS.*Use this design/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save CV" }));
  await screen.findByText("Add a CV name and your full name before saving.");
  expect(request.mock.calls.some(call => call[1]?.method === "POST")).toBe(false);
});

it("opens the selected template directly in the focused editor", async () => {
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  await screen.findByText("Start with a template");

  fireEvent.click(screen.getByRole("button", { name: /Minimal ATS.*Use this design/ }));

  expect(await screen.findByRole("dialog", { name: "Create CV" })).toBeInTheDocument();
  expect(screen.getByText("Selected design")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Change design" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Preview every design. Your CV content stays editable and can be changed later.")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Change design" }));
  expect(screen.getByText("Preview every design. Your CV content stays editable and can be changed later.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Modern Professional/ }));
  expect(screen.getByRole("dialog", { name: "Create CV" })).toBeInTheDocument();
  expect(screen.getByText("Modern Professional")).toBeInTheDocument();
  expect(screen.queryByText("Preview every design. Your CV content stays editable and can be changed later.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Change design" })).toHaveFocus();
});

it("does not render a redundant empty-state panel when there are no saved CVs", async () => {
  request.mockImplementation((path: string) =>
    path === "/cv/editor" ? Promise.resolve([]) : Promise.reject(new Error("Unavailable")),
  );
  render(<MemoryRouter><CvPage /></MemoryRouter>);

  await screen.findByText("Start with a template");
  expect(screen.queryByText("Your next opportunity starts here")).not.toBeInTheDocument();
  expect(screen.queryByText("Create your first CV. Keep versions for different applications.")).not.toBeInTheDocument();
});

it("submits LinkedIn PDF or ZIP files to the import endpoint and opens the review draft", async () => {
  const importedCv = { header: { full_name: "LinkedIn Test" }, experience: [] };
  request.mockImplementation((path: string) =>
    path === "/cv/editor"
      ? Promise.resolve([cv])
      : path === "/cv/ai/import-linkedin-file"
        ? Promise.resolve({ imported: true, cv: importedCv })
        : Promise.reject(new Error("Unavailable")),
  );
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: /Import LinkedIn/ }));

  const upload = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(upload).toHaveAttribute("accept", ".pdf,.zip");
  fireEvent.change(upload!, {
    target: { files: [new File(["fixture only"], "linkedin-export.pdf", { type: "application/pdf" })] },
  });

  await screen.findByRole("dialog", { name: "AI tools" });
  expect(await screen.findByText("Proposed version")).toBeInTheDocument();
  const call = request.mock.calls.find(([path]) => path === "/cv/ai/import-linkedin-file");
  expect(call?.[1]).toEqual(expect.objectContaining({ method: "POST", body: expect.any(FormData) }));
});

it("sends a draft request from the AI tools flow and shows the generated proposal", async () => {
  const proposal = { ...cv.data, summary: "Clearer, outcome-focused summary." };
  request.mockImplementation((path: string) =>
    path === "/cv/editor"
      ? Promise.resolve([cv])
      : path === "/cv/ai/draft"
        ? Promise.resolve({ cv: proposal, suggestions: ["Added clearer outcomes."] })
        : Promise.reject(new Error("Unavailable")),
  );
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: /AI tools/ }));
  expect(await screen.findByRole("dialog", { name: "AI tools" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));

  expect(await screen.findByText("Proposed version")).toBeInTheDocument();
  expect(screen.getByText("Added clearer outcomes.")).toBeInTheDocument();
  const call = request.mock.calls.find(([path]) => path === "/cv/ai/draft");
  expect(call?.[1]).toEqual(expect.objectContaining({ method: "POST" }));
  expect(JSON.parse(call![1].body)).toEqual({ currentCV: cv.data, prompt: "" });
});
