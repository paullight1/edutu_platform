import "../../i18n";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { vi, it, expect, beforeEach } from "vitest";
const { request, billing } = vi.hoisted(() => ({ request: vi.fn(), billing: { isPro: false } }));
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
    isPro: billing.isPro,
    billingLoading: false,
    openPaywall: vi.fn(),
    handleUpgradeError: vi.fn(() => false),
    refreshBilling: vi.fn(),
  }),
}));
// PDF generation has dedicated export/pdf suites; keep these tests focused on
// editing, navigation and request contracts rather than jsdom canvas support.
vi.mock("./CvPreview", () => ({ CvPreview: () => <div aria-label="CV preview pages" /> }));
vi.mock("./CvExportActions", () => ({ CvPdfDownload: () => <button>Download PDF</button> }));
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
  billing.isPro = false;
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
    expect(screen.getByLabelText("CV name")).toHaveValue("Research CV"),
  );
  fireEvent.change(screen.getByLabelText("CV name"), {
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
    expect(screen.getByLabelText("CV name")).toHaveValue("Research CV"),
  );
  fireEvent.change(screen.getByLabelText("CV name"), {
    target: { value: "Keep my edit" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save CV" }));
  await screen.findByText("This CV changed on another device");
  expect(screen.getByLabelText("CV name")).toHaveValue("Keep my edit");
});

it("keeps the library separate from editing and moves through wizard sections", async () => {
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  await screen.findByRole("button", { name: "Preview Research CV" });
  expect(screen.queryByLabelText("CV name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByRole("dialog", { name: "Edit CV" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  expect(screen.getByLabelText("Professional summary")).toBeInTheDocument();
  expect(screen.queryByLabelText("CV name")).not.toBeInTheDocument();
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
  billing.isPro = true;
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
  expect(await screen.findByText("Review imported CV")).toBeInTheDocument();
  const call = request.mock.calls.find(([path]) => path === "/cv/ai/import-linkedin-file");
  expect(call?.[1]).toEqual(expect.objectContaining({ method: "POST", body: expect.any(FormData) }));
});

it("sends a draft request from the AI tools flow and shows the generated proposal", async () => {
  billing.isPro = true;
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
  fireEvent.click(screen.getByRole("button", { name: "Improve CV" }));

  expect(await screen.findByText("Proposed version")).toBeInTheDocument();
  expect(screen.getByText("Added clearer outcomes.")).toBeInTheDocument();
  const call = request.mock.calls.find(([path]) => path === "/cv/ai/draft");
  expect(call?.[1]).toEqual(expect.objectContaining({ method: "POST" }));
  expect(JSON.parse(call![1].body)).toEqual({ currentCV: cv.data, prompt: "" });
});

it("puts saved CVs before the template gallery and filters by name", async () => {
  request.mockResolvedValue([cv, { ...cv, id: "cv2", name: "Internship CV" }]);
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  const library = await screen.findByRole("region", { name: "Your CVs" });
  const gallery = screen.getByText("Start with a template");
  expect(library.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search your CVs" }), { target: { value: "Internship" } });
  expect(screen.queryByRole("button", { name: "Preview Research CV" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Preview Internship CV" })).toBeInTheDocument();
});

it("renames a CV directly while preserving its data, design and revision", async () => {
  request.mockImplementation((path: string, options?: RequestInit) => path === "/cv/editor"
    ? Promise.resolve([cv])
    : options?.method === "PATCH" ? Promise.resolve({ ...cv, name: "Fellowship CV" }) : Promise.reject(new Error("Unavailable")));
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  fireEvent.click(await screen.findByText("Rename"));
  const dialog = await screen.findByRole("dialog", { name: "Rename CV" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "CV name" }), { target: { value: "Fellowship CV" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save name" }));
  expect(await screen.findByRole("button", { name: "Preview Fellowship CV" })).toBeInTheDocument();
  const call = request.mock.calls.find(([path, options]) => path === "/cv/editor/cv1" && options?.method === "PATCH");
  expect(JSON.parse(call![1].body)).toEqual({ name: "Fellowship CV", data: cv.data, templateId: cv.templateId, expectedUpdatedAt: cv.updatedAt });
});

it("does not overwrite an unsaved draft when its saved preview is opened", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(true).mockReturnValueOnce(false);
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("CV name"), { target: { value: "Unsaved fellowship CV" } });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview Research CV" }));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("dialog", { name: "CV preview" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Resume draft/ }));
  expect(screen.getByLabelText("CV name")).toHaveValue("Unsaved fellowship CV");
  confirm.mockRestore();
});

it("keeps the selected CV when a LinkedIn file picker is cancelled", async () => {
  billing.isPro = true;
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: /Import LinkedIn/ }));
  fireEvent.click(screen.getByRole("button", { name: /AI tools/ }));
  expect(screen.getByRole("combobox", { name: "CV to use" })).toHaveValue("cv1");
});

it("offers an actionable preparation checklist without losing the selected CV", async () => {
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Preview Research CV" }));
  fireEvent.click(await screen.findByRole("button", { name: /Fix.*skill/i }));
  expect(screen.getByRole("dialog", { name: "Edit CV" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Skills" })).toHaveAttribute("aria-current", "step");
});

it("labels the cover-letter action and provides a way back to AI tools", async () => {
  billing.isPro = true;
  request.mockImplementation((path: string) => path === "/cv/editor" ? Promise.resolve([cv])
    : path.startsWith("/opportunities/search") ? Promise.resolve([{ id: "opp1", title: "Research fellowship" }])
    : path === "/cv/ai/cover-letter" ? Promise.resolve({ coverLetter: "Dear selection committee," })
    : Promise.reject(new Error("Unavailable")));
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: /AI tools/ }));
  fireEvent.click(screen.getByRole("button", { name: /Cover letter.*Draft from your CV/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Find an opportunity" }), { target: { value: "Research" } });
  fireEvent.click(await screen.findByRole("button", { name: "Research fellowship" }));
  fireEvent.click(screen.getByRole("button", { name: "Draft cover letter" }));
  expect(await screen.findByRole("textbox", { name: "Cover letter draft" })).toHaveValue("Dear selection committee,");
  fireEvent.click(screen.getByRole("button", { name: "Back to AI tools" }));
  expect(screen.getByRole("button", { name: "Draft cover letter" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "CV to use" })).toHaveValue("cv1");
});

it("lets learners type comma-separated skills without deleting the delimiter", async () => {
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Skills" }));
  const skills = screen.getByRole("textbox", { name: /Skills.*comma/i });
  fireEvent.change(skills, { target: { value: "SQL," } });
  expect(skills).toHaveValue("SQL,");
  fireEvent.change(skills, { target: { value: "SQL, Python" } });
  fireEvent.click(screen.getByRole("button", { name: "Save CV" }));
  await waitFor(() => expect(request.mock.calls.some(([path, options]) => path === "/cv/editor/cv1" && options?.method === "PATCH")).toBe(true));
  const call = request.mock.calls.find(([path, options]) => path === "/cv/editor/cv1" && options?.method === "PATCH");
  expect(JSON.parse(call![1].body).data.skills).toEqual(["SQL", "Python"]);
});

it("uses multiline writing fields and disables end dates for a current role", async () => {
  render(<MemoryRouter><CvPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Experience" }));
  fireEvent.click(screen.getByRole("button", { name: /Add entry/ }));
  expect(screen.getByRole("textbox", { name: "What you did" }).tagName).toBe("TEXTAREA");
  fireEvent.click(screen.getByRole("checkbox", { name: "Current role" }));
  expect(screen.getByRole("textbox", { name: "End date" })).toBeDisabled();
});

it("releases a cancelled AI operation when opening another CV route", async () => {
  billing.isPro = true;
  let resolveTurn!: (value: unknown) => void;
  const turn = new Promise(resolve => { resolveTurn = resolve; });
  request.mockImplementation((path: string) => path === "/cv/editor" ? Promise.resolve([cv])
    : path === "/opportunities/opp1" ? Promise.resolve({ id: "opp1", title: "Fellowship" })
    : path === "/cv/ai/tailor" ? turn : Promise.reject(new Error("Unavailable")));
  render(<MemoryRouter initialEntries={["/app/cv?opportunityId=opp1"]}><Link to="/app/cv?cvId=cv1">Open saved CV</Link><CvPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Tailor CV" }));
  await waitFor(() => expect(request.mock.calls.some(([path]) => path === "/cv/ai/tailor")).toBe(true));
  fireEvent.click(screen.getByRole("link", { name: "Open saved CV" }));
  const dialog = await screen.findByRole("dialog", { name: "CV preview" });
  expect(within(dialog).getByRole("button", { name: "Close" })).toBeEnabled();
  await act(async () => { resolveTurn({ tailored_cv: { header: { full_name: "Stale response" } } }); });
  expect(screen.queryByText("Proposed version")).not.toBeInTheDocument();
});
