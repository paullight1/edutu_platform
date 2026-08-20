import { detectBlogImageType } from "./blog-upload.util";

describe("detectBlogImageType", () => {
  it("accepts PNG, JPEG and WebP by file signature", () => {
    expect(
      detectBlogImageType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toEqual({ extension: "png", contentType: "image/png" });

    expect(detectBlogImageType(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toEqual({
      extension: "jpg",
      contentType: "image/jpeg",
    });

    expect(
      detectBlogImageType(Buffer.from("RIFF0000WEBP", "ascii")),
    ).toEqual({ extension: "webp", contentType: "image/webp" });
  });

  it("rejects SVG/HTML and arbitrary text even when a client could label it image/svg+xml", () => {
    expect(detectBlogImageType(Buffer.from("<svg><script/></svg>"))).toBeNull();
    expect(detectBlogImageType(Buffer.from("hello world"))).toBeNull();
  });
});
