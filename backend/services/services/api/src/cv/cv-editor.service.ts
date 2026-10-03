import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { MonetizationService } from "../monetization/monetization.service";
import { isUuid, toDatabaseUserId } from "../common/user-id";

const PREMIUM_CV_TEMPLATE_SLUGS = new Set([
  "creative-portfolio",
  "executive",
]);
const sectionSchema = z
  .array(
    z
      .object({
        id: z.string().optional(),
        highlights: z.array(z.string()).nullish(),
      })
      .passthrough(),
  )
  .nullish();
const cvDataSchema = z
  .object({
    header: z
      .object({
        full_name: z.string().nullish(),
        email: z.string().nullish(),
        phone: z.string().nullish(),
        location: z.string().nullish(),
        linkedin: z.string().nullish(),
        portfolio: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    summary: z.string().nullish(),
    skills: z.array(z.string()).nullish(),
    experience: sectionSchema,
    education: sectionSchema,
    projects: sectionSchema,
    achievements: sectionSchema,
    research: sectionSchema,
    publications: sectionSchema,
    references: sectionSchema,
  })
  .passthrough();
const inputSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    data: cvDataSchema,
    templateId: z.string().max(160).nullable().optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type EditorInput = z.infer<typeof inputSchema>;
export interface EditorCv {
  id: string;
  name: string;
  data: Record<string, unknown>;
  templateId: string | null;
  updatedAt: string;
  source: "mobile";
}
@Injectable()
export class CvEditorService {
  private cached?: SupabaseClient;
  constructor(
    @Optional()
    @Inject("SUPABASE_CLIENT")
    private readonly override?: SupabaseClient,
    @Optional()
    private readonly monetization?: MonetizationService,
  ) {}
  private get client() {
    if (this.override) return this.override;
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      throw new ServiceUnavailableException("CV storage is unavailable");
    return (this.cached ??= createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    ));
  }
  private async ownerKey(authId: string): Promise<string> {
    // Legacy mobile installs use text Clerk subjects; fresh CV migrations use
    // UUID foreign keys to profiles.id. Detect the column through a read only
    // query and resolve UUID keys from an authenticated user's profile row.
    const probe = await this.client
      .from("user_cvs")
      .select("id")
      .eq("user_id", authId)
      .limit(1);
    if (!probe.error) return authId;
    if (probe.error.code !== "22P02")
      throw new ServiceUnavailableException("Could not resolve CV ownership");
    const derived = toDatabaseUserId(authId);
    let result = await this.client
      .from("profiles")
      .select("*")
      .in("user_id", [authId, derived]);
    if (result.error?.code === "22P02")
      result = await this.client
        .from("profiles")
        .select("*")
        .eq("user_id", derived);
    if (result.error)
      throw new ServiceUnavailableException("Could not resolve CV profile");
    const profile =
      (result.data || []).find((row) => row.user_id === authId) ??
      (result.data || []).find((row) => row.user_id === derived);
    if (!profile || !isUuid(profile.id ?? profile.user_id))
      throw new ServiceUnavailableException(
        "An owned profile is required for CV storage",
      );
    return profile.id ?? profile.user_id;
  }

  private async dto(row: Record<string, unknown>): Promise<EditorCv> {
    if (
      !row.cv_templates &&
      typeof row.template_id === "string" &&
      isUuid(row.template_id)
    ) {
      const template = await this.client
        .from("cv_templates")
        .select("*")
        .eq("id", row.template_id)
        .maybeSingle();
      if (!template.error) row = { ...row, cv_templates: template.data };
    }
    return {
      id: String(row.id),
      name: String(row.name || "Untitled CV"),
      data: (row.data_json || {}) as Record<string, unknown>,
      templateId:
        typeof (row.data_json as any)?._edutuTemplateSlug === "string"
          ? (row.data_json as any)._edutuTemplateSlug
          : typeof (row.cv_templates as any)?.name === "string"
            ? this.templateSlug((row.cv_templates as any).name, row.template_id)
            : typeof row.template_id === "string"
              ? row.template_id
              : null,
      updatedAt: String(row.updated_at),
      source: "mobile",
    };
  }
  private templateSlug(name: string, fallback: unknown): string | null {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const known = [
      "minimal-ats",
      "modern-professional",
      "academic-research",
      "bold-impact",
      "creative-portfolio",
      "executive",
    ];
    const aliases: Record<string, string> = {
      professional: "minimal-ats",
      modern: "modern-professional",
      academic: "academic-research",
      "tech-executive": "executive",
      "investment-banking": "executive",
      "t-1": "modern-professional",
      "t-2": "academic-research",
      "t-3": "creative-portfolio",
    };
    return (
      aliases[slug] ??
      (known.includes(slug)
        ? slug
        : typeof fallback === "string"
          ? fallback
          : null)
    );
  }
  private async templateAccessKey(templateId?: string | null) {
    if (!templateId) return { key: null, premium: false };

    if (!isUuid(templateId)) {
      const key = this.templateSlug(templateId, templateId) ?? templateId;
      return { key, premium: PREMIUM_CV_TEMPLATE_SLUGS.has(key) };
    }

    const { data, error } = await this.client
      .from("cv_templates")
      .select("name,is_premium")
      .eq("id", templateId)
      .maybeSingle();
    if (error)
      throw new ServiceUnavailableException(
        "Could not verify CV template access",
      );
    const key = data?.name
      ? this.templateSlug(String(data.name), templateId) ?? templateId
      : templateId;
    return {
      key,
      premium:
        data?.is_premium === true || PREMIUM_CV_TEMPLATE_SLUGS.has(key),
    };
  }
  private async assertPremiumTemplateAccess(
    userId: string | undefined,
    input: EditorInput,
    existingTemplateId?: string | null,
  ) {
    const slugFromData = input.data._edutuTemplateSlug;
    const requestedTemplateId =
      input.templateId ??
      (typeof slugFromData === "string" ? slugFromData : null);
    const requested = await this.templateAccessKey(requestedTemplateId);
    if (!requested.premium) return;

    const existing = await this.templateAccessKey(existingTemplateId);
    // Let a user keep and edit a CV they already own in its current premium
    // design. A newly selected premium design always requires a current plan.
    if (existing.key && existing.key === requested.key) return;
    if (!userId) throw new UnauthorizedException("Sign in to use this design");
    if (!this.monetization)
      throw new ServiceUnavailableException("CV access could not be verified");

    const access = await this.monetization.getActionPolicy(userId);
    if (access.planTier === "none") {
      throw new HttpException(
        {
          code: "paid_plan_required",
          message: "A paid Edutu plan is required to use this CV design.",
        },
        402,
      );
    }
  }
  private persistence(value: EditorInput) {
    const isUuid =
      typeof value.templateId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value.templateId,
      );
    const { _edutuTemplateSlug: _oldSlug, ...data } = value.data;
    return {
      data_json: {
        ...data,
        ...(value.templateId && !isUuid
          ? { _edutuTemplateSlug: value.templateId }
          : {}),
      },
      template_id: isUuid ? value.templateId : null,
    };
  }
  private validate(input: unknown) {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    if (Buffer.byteLength(JSON.stringify(parsed.data.data)) > 200000)
      throw new BadRequestException("CV content is too large");
    return parsed.data;
  }
  async list(authId: string) {
    const owner = await this.ownerKey(authId);
    const { data, error } = await this.client
      .from("user_cvs")
      .select("*")
      .eq("user_id", owner)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new ServiceUnavailableException("Could not load CVs");
    return Promise.all((data || []).map((row) => this.dto(row)));
  }
  async get(authId: string, id: string) {
    const owner = await this.ownerKey(authId);
    const { data, error } = await this.client
      .from("user_cvs")
      .select("*")
      .eq("user_id", owner)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new ServiceUnavailableException("Could not load CV");
    if (!data) throw new NotFoundException("CV not found");
    return this.dto(data);
  }
  async create(authId: string, input: EditorInput, userId?: string) {
    const value = this.validate(input);
    const owner = await this.ownerKey(authId);
    await this.assertPremiumTemplateAccess(userId, value);
    const { data, error } = await this.client
      .from("user_cvs")
      .insert({
        user_id: owner,
        name: value.name,
        ...this.persistence(value),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw new ServiceUnavailableException("Could not save CV");
    return this.dto(data);
  }
  async update(
    authId: string,
    id: string,
    input: EditorInput,
    userId?: string,
  ) {
    const value = this.validate(input);
    const existing = await this.get(authId, id);
    await this.assertPremiumTemplateAccess(userId, value, existing.templateId);
    const owner = await this.ownerKey(authId);
    if (!value.expectedUpdatedAt)
      throw new BadRequestException("A saved revision is required");
    const { data, error } = await this.client
      .from("user_cvs")
      .update({
        name: value.name,
        ...this.persistence(value),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", owner)
      .eq("id", id)
      .eq("updated_at", value.expectedUpdatedAt)
      .select("*")
      .maybeSingle();
    if (error) throw new ServiceUnavailableException("Could not save CV");
    if (!data)
      throw new ConflictException({
        code: "revision_conflict",
        message:
          "This CV changed on another device. Your edits are preserved; reload the latest version before saving.",
      });
    return this.dto(data);
  }
  async remove(authId: string, id: string) {
    await this.get(authId, id);
    const owner = await this.ownerKey(authId);
    const { error } = await this.client
      .from("user_cvs")
      .delete()
      .eq("user_id", owner)
      .eq("id", id);
    if (error) throw new ServiceUnavailableException("Could not delete CV");
    return { ok: true };
  }
}
