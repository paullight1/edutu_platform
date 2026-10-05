import "../../i18n";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../workspace/shared", async () => ({
  ...(await vi.importActual<typeof import("../workspace/shared")>("../workspace/shared")),
  useProductSession: () => ({ request, userId: "user-test" }),
}));

import DocumentsPage from "./DocumentsPage";

beforeEach(() => {
  request.mockReset();
  request.mockImplementation((path: string) => {
    if (path === "/uploads" || path === "/cv/editor" || path === "/cv") return Promise.resolve([]);
    if (path === "/uploads/file") return Promise.resolve({ uploadId: "upload-1" });
    if (path === "/uploads/upload-1/ingest") return Promise.resolve({ status: "queued" });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
});

it("uploads a supported file and starts document ingestion", async () => {
  const { container } = render(<MemoryRouter><DocumentsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Upload file" }));
  const dialog = await screen.findByRole("dialog", { name: "Upload document" });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).toHaveAttribute("accept", ".pdf,.doc,.docx,.txt");
  fireEvent.change(input!, { target: { files: [new File(["transcript"], "transcript.pdf", { type: "application/pdf" })] } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Upload document" }));

  await waitFor(() => expect(request).toHaveBeenCalledWith("/uploads/upload-1/ingest", expect.objectContaining({ method: "POST" })));
  expect(request.mock.calls.find(([path]) => path === "/uploads/file")?.[1]).toEqual(expect.objectContaining({ method: "POST", body: expect.any(FormData) }));
});
