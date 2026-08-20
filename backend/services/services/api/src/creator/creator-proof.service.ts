import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { toDatabaseUserId } from "../common/user-id";

const MAX_PROOF_BYTES = 8 * 1024 * 1024;

export type MentorProofFile = {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
  size: number;
};

type DetectedProof = {
  extension: "pdf" | "png" | "jpg" | "webp";
  contentType: string;
};

export function detectMentorProofType(buffer: Buffer): DetectedProof | null {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  ) {
    return { extension: "pdf", contentType: "application/pdf" };
  }
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { extension: "png", contentType: "image/png" };
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
}

@Injectable()
export class CreatorProofService {
  private readonly supabase: SupabaseClient | null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase =
      url && key
        ? createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;
  }

  async upload(userId: string, file?: MentorProofFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Proof file is required");
    }
    if (file.size <= 0 || file.size > MAX_PROOF_BYTES) {
      throw new BadRequestException("Proof file must be 8 MB or smaller");
    }

    const detected = detectMentorProofType(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        "Proof must be a PDF, PNG, JPEG, or WebP file",
      );
    }

    const client = this.supabase;
    if (!client) {
      throw new ServiceUnavailableException("Proof storage is unavailable");
    }

    const owner = toDatabaseUserId(userId);
    const path = `${owner}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${detected.extension}`;
    const { error } = await client.storage
      .from("creator-proofs")
      .upload(path, file.buffer, {
        cacheControl: "3600",
        contentType: detected.contentType,
        upsert: false,
      });

    if (error) {
      throw new ServiceUnavailableException("Could not store mentor proof");
    }

    return {
      path,
      fileName: file.originalname.slice(0, 200),
      contentType: detected.contentType,
      size: file.size,
    };
  }
}
