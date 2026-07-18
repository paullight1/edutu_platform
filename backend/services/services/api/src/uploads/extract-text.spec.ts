import { extractText } from "./extract-text";

describe("extractText", () => {
  it("reads plain text", async () => {
    const out = await extractText(Buffer.from("hello world"), "text/plain");
    expect(out).toBe("hello world");
  });

  it("trims surrounding whitespace", async () => {
    const out = await extractText(Buffer.from("  spaced  "), "text/plain");
    expect(out).toBe("spaced");
  });

  it("rejects unsupported types", async () => {
    await expect(extractText(Buffer.from(""), "image/png")).rejects.toThrow(
      /Unsupported document type/,
    );
  });
});
