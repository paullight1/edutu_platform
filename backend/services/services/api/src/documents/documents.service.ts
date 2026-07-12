import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { aiDocuments } from "../db/schema";
import { AiService } from "../ai";
import type { CVDataDto } from "../cv/dto/cv-ai.dto";
import {
  DocumentContent,
  TextDocSection,
  renderDocument,
} from "./documents-render";

const STORAGE_BUCKET = process.env.AI_DOCUMENTS_BUCKET || "ai-documents";
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600;
const MAX_HISTORY_VERSIONS = 10;

export type AiDocumentType = "cv" | "sop" | "cover_letter" | "essay";

const TYPE_LABELS: Record<AiDocumentType, string> = {
  cv: "CV",
  sop: "Statement of Purpose",
  cover_letter: "Cover Letter",
  essay: "Essay",
};

export interface AiDocumentSummary {
  id: string;
  type: AiDocumentType;
  title: string;
  opportunityId: string | null;
  version: number;
  updatedAt: string | null;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly supabase: SupabaseClient | null;

  constructor(private readonly aiService: AiService) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase =
      url && key
        ? createClient(url, key, { auth: { persistSession: false } })
        : null;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(
    userId: string,
    input: {
      type: AiDocumentType;
      title: string;
      content: DocumentContent;
      opportunityId?: string | null;
    },
  ) {
    const [row] = await db
      .insert(aiDocuments)
      .values({
        userId,
        type: input.type,
        title: input.title.slice(0, 200),
        content: input.content as unknown as Record<string, unknown>,
        opportunityId: input.opportunityId ?? null,
      })
      .returning()
      .execute();
    return this.serialize(row);
  }

  async list(userId: string): Promise<AiDocumentSummary[]> {
    const rows = await db
      .select()
      .from(aiDocuments)
      .where(eq(aiDocuments.userId, userId))
      .orderBy(desc(aiDocuments.updatedAt))
      .limit(50)
      .execute();
    return rows.map((row) => this.summarize(row));
  }

  async get(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(aiDocuments)
      .where(and(eq(aiDocuments.id, id), eq(aiDocuments.userId, userId)))
      .limit(1)
      .execute();
    if (!row) throw new NotFoundException("Document not found");
    return this.serialize(row);
  }

  async remove(userId: string, id: string) {
    const [deleted] = await db
      .delete(aiDocuments)
      .where(and(eq(aiDocuments.id, id), eq(aiDocuments.userId, userId)))
      .returning({ id: aiDocuments.id })
      .execute();
    if (!deleted) throw new NotFoundException("Document not found");
    return { success: true };
  }

  // ─── Generation ───────────────────────────────────────────────────────────

  /** Stores an AI-drafted CV (content produced by CvService) as a document. */
  async createCvDocument(
    userId: string,
    cv: CVDataDto,
    options: { title?: string; opportunityId?: string | null } = {},
  ) {
    return this.create(userId, {
      type: "cv",
      title:
        options.title ||
        `${cv.header?.full_name || "My"} CV`.slice(0, 120),
      content: { kind: "cv", cv },
      opportunityId: options.opportunityId,
    });
  }

  /**
   * Drafts a Statement of Purpose with the standard winning structure (hook →
   * background → motivation & fit → goals → why-this-program → closing),
   * grounded in the user's profile and the target opportunity.
   */
  async generateSop(
    userId: string,
    input: { opportunityId?: string | null; notes?: string },
  ) {
    const supabase = this.requireSupabase();
    const [{ data: profile }, opportunity] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "full_name, country, school, major, degree, age, interests, skills, interested_countries",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      input.opportunityId
        ? supabase
            .from("opportunities")
            .select("id, title, organization, category, description, requirements, summary")
            .eq("id", input.opportunityId)
            .maybeSingle()
            .then((result) => result.data)
        : Promise.resolve(null),
    ]);

    const target = opportunity
      ? `${opportunity.title}${opportunity.organization ? ` at ${opportunity.organization}` : ""}`
      : "the target program";

    let sections: TextDocSection[] | null = null;
    try {
      const generated = await this.aiService.generateJson<{
        sections?: Array<{ heading?: string; body?: string }>;
      }>({
        feature: "docs.sop",
        userId,
        prompt: [
          "Write a compelling Statement of Purpose following best practice: a vivid personal hook; academic/professional background with concrete evidence; motivation and fit for THIS specific program; short- and long-term goals; why this program uniquely enables them; a confident closing.",
          "Rules: first person, specific over generic, no clichés ('ever since I was a child'), no fabricated facts — only use what's provided; 500-750 words total.",
          `APPLICANT PROFILE: ${JSON.stringify(profile ?? {})}`,
          `TARGET OPPORTUNITY: ${JSON.stringify(opportunity ?? { note: "generic program" })}`,
          input.notes ? `APPLICANT'S OWN NOTES (their voice — weave these in): ${input.notes}` : "",
          'Return JSON: {"sections": [{"heading": "...", "body": "..."}]} with 5-6 sections.',
        ]
          .filter(Boolean)
          .join("\n\n"),
        metadata: { source: "docs-sop", userId },
      });
      const candidate = (generated?.sections ?? [])
        .filter(
          (section): section is TextDocSection =>
            typeof section?.body === "string" && section.body.length > 40,
        )
        .map((section) => ({
          heading: String(section.heading || "").slice(0, 120),
          body: section.body.trim(),
        }));
      if (candidate.length >= 3) sections = candidate;
    } catch (error) {
      this.logger.warn(
        `SOP generation fell back to template: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!sections) {
      // Honest scaffold, never fabricated prose: the user fills the specifics.
      sections = [
        {
          heading: "Introduction",
          body: `I am applying to ${target}. [Open with a specific moment or achievement that sparked your interest in this field.]`,
        },
        {
          heading: "Background",
          body: `[Summarize your education${profile?.major ? ` in ${profile.major}` : ""} and the experiences that prepared you — projects, work, leadership. Use concrete results.]`,
        },
        {
          heading: "Motivation & Fit",
          body: `[Explain why ${target} matches your direction, naming specific aspects of the program.]`,
        },
        {
          heading: "Goals",
          body: "[State your short-term goal after the program and the longer-term impact you want to make.]",
        },
        {
          heading: "Closing",
          body: "[Reaffirm your readiness and what you will contribute to the cohort and community.]",
        },
      ];
    }

    return this.create(userId, {
      type: "sop",
      title: opportunity
        ? `SOP — ${String(opportunity.title).slice(0, 90)}`
        : "Statement of Purpose",
      content: { kind: "text_doc", sections },
      opportunityId: input.opportunityId ?? null,
    });
  }

  /**
   * Applies a chat instruction to a document: the model returns the full
   * updated content (same shape); the previous version lands in history.
   */
  async editDocument(userId: string, id: string, instruction: string) {
    const existing = await this.get(userId, id);
    const content = existing.content as DocumentContent;

    const updated = await this.aiService.generateJson<Record<string, unknown>>({
      feature: "docs.edit",
      userId,
      prompt: [
        `Edit this ${TYPE_LABELS[existing.type as AiDocumentType] || "document"} according to the instruction. Apply ONLY the requested change; keep everything else verbatim.`,
        `INSTRUCTION: ${instruction}`,
        `CURRENT CONTENT (JSON): ${JSON.stringify(content)}`,
        "Return the FULL updated content as JSON with exactly the same schema as CURRENT CONTENT (same top-level keys).",
      ].join("\n\n"),
      metadata: { source: "docs-edit", userId, documentId: id },
    });

    const nextContent = this.validateEditedContent(content, updated);
    if (!nextContent) {
      throw new BadRequestException(
        "The edit couldn't be applied — try rephrasing the instruction",
      );
    }

    const history = [
      ...(existing.history as Array<Record<string, unknown>>),
      {
        version: existing.version,
        content: existing.content,
        replacedAt: new Date().toISOString(),
      },
    ].slice(-MAX_HISTORY_VERSIONS);

    const [row] = await db
      .update(aiDocuments)
      .set({
        content: nextContent as unknown as Record<string, unknown>,
        version: existing.version + 1,
        history,
        updatedAt: new Date(),
      })
      .where(and(eq(aiDocuments.id, id), eq(aiDocuments.userId, userId)))
      .returning()
      .execute();
    return this.serialize(row);
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  async exportDocument(
    userId: string,
    id: string,
    format: "pdf" | "docx",
  ): Promise<{ fileName: string; url: string; format: "pdf" | "docx" }> {
    const supabase = this.requireSupabase();
    const document = await this.get(userId, id);
    const content = document.content as DocumentContent;

    const buffer = await renderDocument(document.title, content, format);
    const fileName = await this.buildFileName(userId, document, format);
    const path = `${userId}/${id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, {
        contentType:
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (uploadError) {
      throw new BadRequestException(`Export failed: ${uploadError.message}`);
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      throw new BadRequestException(
        `Export link failed: ${signError?.message || "unknown error"}`,
      );
    }

    return { fileName, url: signed.signedUrl, format };
  }

  /** "{FullName} - {DocType} - {OpportunityShort} - {YYYY-MM}.{ext}" */
  private async buildFileName(
    userId: string,
    document: { type: string; title: string; opportunityId: string | null },
    format: "pdf" | "docx",
  ): Promise<string> {
    const supabase = this.requireSupabase();
    const [{ data: profile }, opportunityTitle] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle(),
      document.opportunityId
        ? supabase
            .from("opportunities")
            .select("title")
            .eq("id", document.opportunityId)
            .maybeSingle()
            .then((result) => result.data?.title as string | undefined)
        : Promise.resolve(undefined),
    ]);

    const label = TYPE_LABELS[document.type as AiDocumentType] || "Document";
    const parts = [
      profile?.full_name || "Edutu",
      label,
      opportunityTitle ? opportunityTitle.slice(0, 36) : "",
      new Date().toISOString().slice(0, 7),
    ].filter(Boolean);
    const stem = parts
      .join(" - ")
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    return `${stem}.${format}`;
  }

  private validateEditedContent(
    original: DocumentContent,
    updated: Record<string, unknown> | null,
  ): DocumentContent | null {
    if (!updated || typeof updated !== "object") return null;
    if (original.kind === "text_doc") {
      const sections = (updated as { sections?: unknown }).sections;
      if (!Array.isArray(sections)) return null;
      const clean = sections
        .filter(
          (section): section is { heading?: unknown; body?: unknown } =>
            Boolean(section) && typeof section === "object",
        )
        .map((section) => ({
          heading: String(section.heading ?? "").slice(0, 120),
          body: String(section.body ?? ""),
        }))
        .filter((section) => section.body.trim().length > 0);
      return clean.length ? { kind: "text_doc", sections: clean } : null;
    }
    const cv = (updated as { cv?: unknown }).cv;
    if (!cv || typeof cv !== "object") return null;
    return { kind: "cv", cv: cv as CVDataDto };
  }

  private summarize(row: typeof aiDocuments.$inferSelect): AiDocumentSummary {
    return {
      id: row.id,
      type: row.type as AiDocumentType,
      title: row.title,
      opportunityId: row.opportunityId,
      version: row.version,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  private serialize(row: typeof aiDocuments.$inferSelect) {
    return {
      ...this.summarize(row),
      content: row.content,
      history: row.history,
      type: row.type as AiDocumentType,
    };
  }

  private requireSupabase(): SupabaseClient {
    if (!this.supabase) {
      throw new BadRequestException("Document storage is not configured");
    }
    return this.supabase;
  }
}
