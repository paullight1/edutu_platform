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
    expect(
      detectMentorProofType(Buffer.from([0xff, 0xd8, 0xff, 0xdb])),
    ).toEqual({
      extension: "jpg",
      contentType: "image/jpeg",
    });
  });

  it("rejects executable/text content even when a client could label it as an image", () => {
    expect(
      detectMentorProofType(Buffer.from("<script>alert(1)</script>")),
    ).toBeNull();
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

describe("CreatorProofService.createDownloadUrl", () => {
  function makeService(result: {
    data: { signedUrl: string } | null;
    error: { message: string } | null;
  }) {
    const createSignedUrl = jest.fn().mockResolvedValue(result);
    const service = new CreatorProofService();
    Object.defineProperty(service, "supabase", {
      value: {
        storage: {
          from: (bucket: string) => {
            if (bucket !== "creator-proofs") {
              throw new Error(`Unexpected bucket: ${bucket}`);
            }
            return { createSignedUrl };
          },
        },
      },
    });
    return { service, createSignedUrl };
  }

  it("returns a five-minute signed download for a stored private proof", async () => {
    const { service, createSignedUrl } = makeService({
      data: { signedUrl: "https://signed.example/proof" },
      error: null,
    });

    await expect(
      service.createDownloadUrl({
        path: "owner/2026-08-29/proof.pdf",
        fileName: "eligibility letter.pdf",
        mimeType: "application/pdf",
        size: 2048,
      }),
    ).resolves.toEqual({
      url: "https://signed.example/proof",
      fileName: "eligibility letter.pdf",
      mimeType: "application/pdf",
      size: 2048,
      expiresIn: 300,
    });
    expect(createSignedUrl).toHaveBeenCalledWith(
      "owner/2026-08-29/proof.pdf",
      300,
      { download: "eligibility letter.pdf" },
    );
  });

  it("fails closed when storage cannot sign the proof", async () => {
    const { service } = makeService({
      data: null,
      error: { message: "not found" },
    });

    await expect(
      service.createDownloadUrl({
        path: "owner/2026-08-29/missing.pdf",
        fileName: "missing.pdf",
        mimeType: "application/pdf",
        size: 100,
      }),
    ).rejects.toThrow("Could not create proof download");
  });

  it("rejects unsafe stored paths before asking storage to sign them", async () => {
    const { service, createSignedUrl } = makeService({
      data: { signedUrl: "https://signed.example/unsafe" },
      error: null,
    });

    await expect(
      service.createDownloadUrl({
        path: "../another-bucket/private.pdf",
        fileName: "private.pdf",
        mimeType: "application/pdf",
        size: 100,
      }),
    ).rejects.toThrow("Invalid proof path");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
