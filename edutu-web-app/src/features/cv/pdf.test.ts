import { expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createCVPdf } from "./pdf";

it("exports a real multipage PDF with embedded text fonts and clickable contact links", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const weight = url.includes("Bold") ? "Bold" : "Regular";
    const data = await readFile(`public/fonts/cv/NotoSans-${weight}.ttf`);
    return { ok: true, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
  }));
  try {
    const doc = await createCVPdf({ name: "Ada CV", template_id: "minimal-ats", data_json: {
      header: { full_name: "Adé Ọlá", email: "ada@example.test", portfolio: "https://example.test" },
      experience: Array.from({ length: 22 }, (_, i) => ({ id: String(i), company: "Research lab", role: `Researcher ${i}`, start_date: "2025", description: "Led research projects and published results. ".repeat(12) })),
    }});
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const output = doc.output();
    expect(output.startsWith("%PDF-")).toBe(true);
    expect(output.includes("/FontFile2")).toBe(true);
    expect(output.includes("https://example.test")).toBe(true);
    expect(output.includes("mailto:ada@example.test")).toBe(true);
    expect(output).not.toContain("/Subtype /Image");
  } finally { vi.unstubAllGlobals(); }
});
