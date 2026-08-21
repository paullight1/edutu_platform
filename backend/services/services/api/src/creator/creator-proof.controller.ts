import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth";
import {
  CreatorProofService,
  type MentorProofFile,
} from "./creator-proof.service";

@Controller("creator")
export class CreatorProofController {
  constructor(private readonly proofService: CreatorProofService) {}

  @Post("proof-upload")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { files: 1, fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadProof(
    @CurrentUser("id") userId: string,
    @UploadedFile() file?: MentorProofFile,
  ) {
    if (!file) throw new BadRequestException("Proof file is required");
    return this.proofService.upload(userId, file);
  }
}
