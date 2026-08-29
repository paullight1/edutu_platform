import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { AdminGuard } from "../auth";
import { CreatorProofService } from "./creator-proof.service";
import { CreatorController } from "./creator.controller";
import type { CreatorService } from "./creator.service";

describe("CreatorController proof downloads", () => {
  it("registers an admin-guarded proof download endpoint", () => {
    const handler = (
      CreatorController.prototype as unknown as Record<string, object>
    )["downloadApplicationProof"];

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      "admin/creator-applications/:id/proof-download",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(AdminGuard);
  });

  it("looks up the application's stored path before signing it", async () => {
    const proof = {
      path: "owner/2026-08-29/proof.pdf",
      fileName: "proof.pdf",
      mimeType: "application/pdf",
      size: 2048,
    };
    const creatorService = {
      getApplicationProof: jest.fn().mockResolvedValue(proof),
    };
    const proofService = {
      createDownloadUrl: jest.fn().mockResolvedValue({
        url: "https://signed.example/proof",
        ...proof,
        expiresIn: 300,
      }),
    };
    const controller = new CreatorController(
      creatorService as unknown as CreatorService,
      proofService as unknown as CreatorProofService,
    );

    await expect(
      controller.downloadApplicationProof("app-1"),
    ).resolves.toMatchObject({
      url: "https://signed.example/proof",
      expiresIn: 300,
    });
    expect(creatorService.getApplicationProof).toHaveBeenCalledWith("app-1");
    expect(proofService.createDownloadUrl).toHaveBeenCalledWith(proof);
  });
});
