import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { extractText, SUPPORTED_UPLOAD_MIME_TYPES } from "./extract-text";

// DI token for the test-only client override below. Never provided in any
// module — @Optional() resolves it to undefined at boot. Without the explicit
// token Nest reads the SupabaseClient paramtype as an unresolvable class
// dependency and the whole app fails to start (2026-07-23 deploy outage).
export const UPLOADS_SUPABASE_OVERRIDE = Symbol("UPLOADS_SUPABASE_OVERRIDE");

const BUCKET = "cv-files";
const MAX_EXTRACTED_CHARS = 40_000;

export type UploadRow = {
  id: string;
  kind: string;
  fileName: string;
  parseStatus: string;
  createdAt: string;
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly supabase: SupabaseClient;

  constructor(
    @Optional() @Inject(UPLOADS_SUPABASE_OVERRIDE) clientOverride?: SupabaseClient,
  ) {
    this.supabase =
      clientOverride ??
      createClient(
        process.env.SUPABASE_URL as string,
        process.env.SUPABASE_SERVICE_ROLE_KEY as string,
        { auth: { persistSession: false } },
      );
  }

  /**
   * Reserve an upload: validate the mime type, create the pending row, and hand
   * back a signed URL the client PUTs the file to (direct-to-storage, so large
   * files never transit the API).
   */
  async createSignedUpload(
    userId: string,
    input: {
      fileName: string;
      mimeType: string;
      kind?: string;
      opportunityId?: string;
    },
  ): Promise<{ uploadId: string; uploadUrl: string; storagePath: string }> {
    if (!SUPPORTED_UPLOAD_MIME_TYPES.includes(input.mimeType as never)) {
      throw new UnsupportedMediaTypeException(
        `Unsupported document type: ${input.mimeType}`,
      );
    }
    const safeName = input.fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);
    const storagePath = `${userId}/${randomUUID()}-${safeName}`;

    const { data: signed, error: signedError } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);
    if (signedError || !signed) {
      throw new BadRequestException(
        `Could not create upload URL: ${signedError?.message ?? "unknown"}`,
      );
    }

    const { data: row, error: rowError } = await this.supabase
      .from("user_uploads")
      .insert({
        user_id: userId,
        kind: input.kind ?? "other",
        file_name: safeName,
        storage_path: storagePath,
        mime_type: input.mimeType,
        parse_status: "pending",
        opportunity_id: input.opportunityId ?? null,
      })
      .select("id")
      .single();
    if (rowError || !row) {
      throw new BadRequestException(
        `Could not record upload: ${rowError?.message ?? "unknown"}`,
      );
    }

    return {
      uploadId: String((row as { id: string }).id),
      uploadUrl: signed.signedUrl,
      storagePath,
    };
  }

  /** Download the stored object, extract text, and persist it. */
  async ingest(
    userId: string,
    uploadId: string,
  ): Promise<{ uploadId: string; parseStatus: string; chars: number }> {
    const { data: upload, error } = await this.supabase
      .from("user_uploads")
      .select("id, storage_path, mime_type")
      .eq("id", uploadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !upload) throw new NotFoundException("Upload not found");

    const record = upload as {
      storage_path: string;
      mime_type: string;
    };

    try {
      const { data: blob, error: downloadError } = await this.supabase.storage
        .from(BUCKET)
        .download(record.storage_path);
      if (downloadError || !blob) {
        throw new Error(downloadError?.message ?? "File not found in storage");
      }
      const buffer = Buffer.from(await blob.arrayBuffer());
      const text = (await extractText(buffer, record.mime_type)).slice(
        0,
        MAX_EXTRACTED_CHARS,
      );

      await this.supabase
        .from("user_uploads")
        .update({
          extracted_text: text,
          parse_status: "done",
          parse_error: null,
          size: buffer.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", uploadId);

      return { uploadId, parseStatus: "done", chars: text.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Parse failed";
      this.logger.warn(`upload ${uploadId} parse failed: ${message}`);
      await this.supabase
        .from("user_uploads")
        .update({
          parse_status: "failed",
          parse_error: message.slice(0, 400),
          updated_at: new Date().toISOString(),
        })
        .eq("id", uploadId);
      return { uploadId, parseStatus: "failed", chars: 0 };
    }
  }

  async list(userId: string): Promise<UploadRow[]> {
    const { data } = await this.supabase
      .from("user_uploads")
      .select("id, kind, file_name, parse_status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      kind: String(row.kind),
      fileName: String(row.file_name),
      parseStatus: String(row.parse_status),
      createdAt: String(row.created_at),
    }));
  }

  /** Used by the read_document coach tool to feed the agent the parsed text. */
  async getExtractedText(
    userId: string,
    uploadId: string,
  ): Promise<{ fileName: string; text: string; parseStatus: string } | null> {
    const { data } = await this.supabase
      .from("user_uploads")
      .select("file_name, extracted_text, parse_status")
      .eq("id", uploadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      fileName: String(row.file_name),
      text: String(row.extracted_text ?? ""),
      parseStatus: String(row.parse_status),
    };
  }
}
