import { extractText } from "./extract-text";
import { Document, Packer, Paragraph } from "docx";

describe("extractText", () => {
  it("reads plain text", async () => {
    const out = await extractText(Buffer.from("hello world"), "text/plain");
    expect(out).toBe("hello world");
  });

  it("trims surrounding whitespace", async () => {
    const out = await extractText(Buffer.from("  spaced  "), "text/plain");
    expect(out).toBe("spaced");
  });

  it("extracts text from a DOCX upload", async () => {
    const document = new Document({
      sections: [{ children: [new Paragraph("DOCX extraction still works")] }],
    });
    const buffer = await Packer.toBuffer(document);

    await expect(
      extractText(
        Buffer.from(buffer),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).resolves.toContain("DOCX extraction still works");
  });

  it("rejects unsupported types", async () => {
    await expect(extractText(Buffer.from(""), "image/png")).rejects.toThrow(
      /Unsupported document type/,
    );
  });
});
