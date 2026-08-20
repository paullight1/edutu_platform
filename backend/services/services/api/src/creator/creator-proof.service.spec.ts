import { BadRequestException } from "@nestjs/common";
import {
  CreatorProofService,
  detectMentorProofType,
} from "./creator-proof.service";

describe("mentor proof validation", () => {
  it("detects supported formats from magic bytes rather than browser MIME", () => {
    expect(detectMentorProofType(Buffer.from("%PDF-1.7\n"))).toEqual({
      extension: "pdf",
      contentType: "application/pdf",
    });
    expect(
      detectMentorProofType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toEqual({ extension: "png", contentType: "image/png" });
    expect(detectMentorProofType(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toEqual({
      extension: "jpg",
      contentType: "image/jpeg",
    });
  });

  it("rejects executable/text content even when a client could label it as an image", () => {
    expect(detectMentorProofType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
  });

  it("rejects missing files before storage access", async () => {
    const service = new CreatorProofService();
    await expect(service.upload("user_123", undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects files larger than eight megabytes before storage access", async () => {
    const service = new CreatorProofService();
    await expect(
      service.upload("user_123", {
        buffer: Buffer.from("%PDF-1.7"),
        originalname: "proof.pdf",
        size: 8 * 1024 * 1024 + 1,
        mimetype: "application/pdf",
      }),
    ).rejects.toThrow("8 MB or smaller");
  });
});
