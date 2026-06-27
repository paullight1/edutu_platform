import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AiService } from "../ai";
import { toDatabaseUserId } from "../common/user-id";
import {
  CVDataDto,
  CVGoalContextDto,
  CVProfileContextDto,
  GenerateCVDraftDto,
  TailorCVDto,
} from "./dto/cv-ai.dto";
import type { SaveCVRecordDto } from "./dto/cv-record.dto";

type CVRecordRow = {
  id: string;
  user_id: string;
  title: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  text_content: string | null;
  stats: Record<string, unknown> | null;
  job_target: string | null;
  job_description: string | null;
  analysis: Record<string, unknown> | null;
  optimization: Record<string, unknown> | null;
  generated: boolean | null;
  storage_path: string | null;
  uploaded_at: string | Date | null;
  updated_at: string | Date | null;
};

type CVRecordInsert = {
  user_id: string;
  title: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  text_content: string;
  stats: Record<string, unknown>;
  job_target: string | null;
  job_description: string | null;
  analysis: Record<string, unknown> | null;
  optimization: Record<string, unknown> | null;
  generated: boolean;
  storage_path: string | null;
};

type PersistedCVRecordDto = {
  id: string;
  userId: string;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  textContent: string;
  content: CVDataDto | null;
  stats: Record<string, unknown>;
  jobTarget: string | null;
  jobDescription: string | null;
  analysis: Record<string, unknown> | null;
  optimization: Record<string, unknown> | null;
  generated: boolean;
  storagePath: string | null;
  uploadedAt: string;
  updatedAt: string;
};

const CV_RECORD_SELECT = [
  "id",
  "user_id",
  "title",
  "file_name",
  "file_size",
  "mime_type",
  "text_content",
  "stats",
  "job_target",
  "job_description",
  "analysis",
  "optimization",
  "generated",
  "storage_path",
  "uploaded_at",
  "updated_at",
].join(",");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CVDataSchema = z.object({
  header: z
    .object({
      full_name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      location: z.string().optional(),
      linkedin: z.string().optional(),
      portfolio: z.string().optional(),
      website: z.string().optional(),
    })
    .optional(),
  summary: z.string().optional(),
  experience: z
    .array(
      z.object({
        id: z.string().optional(),
        company: z.string().optional(),
        role: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        current: z.boolean().optional(),
        location: z.string().optional(),
        description: z.string().optional(),
        highlights: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  education: z
    .array(
      z.object({
        id: z.string().optional(),
        institution: z.string().optional(),
        degree: z.string().optional(),
        field: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        gpa: z.number().optional(),
        highlights: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  skills: z.array(z.string()).optional(),
  projects: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        url: z.string().optional(),
        technologies: z.array(z.string()).optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
      }),
    )
    .optional(),
  achievements: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        date: z.string().optional(),
        issuer: z.string().optional(),
      }),
    )
    .optional(),
});

const DraftResponseSchema = z.object({
  cv: CVDataSchema,
  suggestions: z.array(z.string()).default([]),
});

const TailorResponseSchema = z.object({
  tailored_cv: CVDataSchema,
  match_score: z.number().min(0).max(100),
  improvements: z.array(z.string()).default([]),
  matched_keywords: z.array(z.string()).default([]),
  missing_keywords: z.array(z.string()).default([]),
});

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);
  private readonly supabase: SupabaseClient | null = null;

  constructor(private readonly aiService: AiService) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
  }

  async listRecords(userId: string): Promise<PersistedCVRecordDto[]> {
    const dbUserId = this.requireUserId(userId);
    const { data, error } = await this.client
      .from("cv_records")
      .select(CV_RECORD_SELECT)
      .eq("user_id", dbUserId)
      .order("uploaded_at", { ascending: false });

    this.throwIfSupabaseError(error, "Could not load CV records");
    return ((data ?? []) as unknown as CVRecordRow[]).map((row) =>
      this.toRecordDto(row),
    );
  }

  async getRecord(userId: string, id: string): Promise<PersistedCVRecordDto> {
    this.assertUuid(id, "CV record id");
    const dbUserId = this.requireUserId(userId);
    const { data, error } = await this.client
      .from("cv_records")
      .select(CV_RECORD_SELECT)
      .eq("id", id)
      .eq("user_id", dbUserId)
      .maybeSingle();

    this.throwIfSupabaseError(error, "Could not load CV record");
    if (!data) throw new NotFoundException("CV record not found");

    return this.toRecordDto(data as unknown as CVRecordRow);
  }

  async createRecord(
    userId: string,
    dto: SaveCVRecordDto,
  ): Promise<PersistedCVRecordDto> {
    const dbUserId = this.requireUserId(userId);
    const payload = this.toInsertPayload(dbUserId, dto);
    const { data, error } = await this.client
      .from("cv_records")
      .insert(payload)
      .select(CV_RECORD_SELECT)
      .single();

    this.throwIfSupabaseError(error, "Could not save CV record");
    return this.toRecordDto(data as unknown as CVRecordRow);
  }

  async deleteRecord(userId: string, id: string) {
    this.assertUuid(id, "CV record id");
    const dbUserId = this.requireUserId(userId);
    const { data, error } = await this.client
      .from("cv_records")
      .delete()
      .eq("id", id)
      .eq("user_id", dbUserId)
      .select("id")
      .maybeSingle();

    this.throwIfSupabaseError(error, "Could not delete CV record");
    if (!data) throw new NotFoundException("CV record not found");
    return { success: true };
  }

  async generateDraft(userId: string, dto: GenerateCVDraftDto) {
    try {
      const parsed = await this.aiService.generateJson({
        feature: "cv.draft",
        prompt: this.buildDraftPrompt(userId, dto),
        responseMimeType: "application/json",
        temperature: 0.2,
        metadata: { userId },
      });

      if (parsed) {
        return DraftResponseSchema.parse(parsed);
      }
    } catch (error) {
      this.logger.warn(
        `CV draft generation fell back to heuristic mode: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const fallbackCv = this.buildFallbackDraft(
      dto.profile,
      dto.goals || [],
      dto.currentCV,
      dto.prompt,
      dto.linkedInUrl,
    );
    return {
      cv: fallbackCv,
      suggestions: [
        "Review the summary and make it more specific to your target opportunity.",
        "Add measurable achievements under experience and projects.",
        "Keep skills aligned to the opportunities you want to apply for.",
      ],
    };
  }

  async tailor(userId: string, dto: TailorCVDto) {
    try {
      const parsed = await this.aiService.generateJson({
        feature: "cv.tailor",
        prompt: this.buildTailorPrompt(userId, dto),
        responseMimeType: "application/json",
        temperature: 0.2,
        metadata: { userId, opportunityId: dto.opportunity?.id },
      });

      if (parsed) {
        return TailorResponseSchema.parse(parsed);
      }
    } catch (error) {
      this.logger.warn(
        `CV tailoring fell back to heuristic mode: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.buildFallbackTailor(dto);
  }

  private buildDraftPrompt(userId: string, dto: GenerateCVDraftDto) {
    return `You are an expert CV/resume writer for students and early-career professionals.

Build a strong, truthful CV draft in JSON only.

Return exactly:
{
  "cv": {
    "header": {
      "full_name": "",
      "email": "",
      "phone": "",
      "location": "",
      "linkedin": "",
      "portfolio": "",
      "website": ""
    },
    "summary": "",
    "experience": [],
    "education": [],
    "skills": [],
    "projects": [],
    "achievements": []
  },
  "suggestions": ["", ""]
}

Rules:
- Do not invent fake employers, schools, dates, or achievements.
- If information is missing, keep fields empty or use concise generic phrasing.
- Optimize the summary and section emphasis toward scholarships, internships, jobs, and academic opportunities.
- Keep skills specific and deduplicated.

User id:
${userId}

Profile:
${JSON.stringify(dto.profile || {}, null, 2)}

Goals:
${JSON.stringify(dto.goals || [], null, 2)}

Current CV:
${JSON.stringify(dto.currentCV || {}, null, 2)}

Prompt:
${dto.prompt || ""}

LinkedIn URL:
${dto.linkedInUrl || ""}`;
  }

  private buildTailorPrompt(userId: string, dto: TailorCVDto) {
    return `You are an expert CV tailoring assistant.

Tailor the CV toward the target opportunity using only truthful reframing and prioritization.

Return exactly:
{
  "tailored_cv": {
    "header": {},
    "summary": "",
    "experience": [],
    "education": [],
    "skills": [],
    "projects": [],
    "achievements": []
  },
  "match_score": 0,
  "improvements": ["", ""],
  "matched_keywords": ["", ""],
  "missing_keywords": ["", ""]
}

Rules:
- Do not fabricate experience.
- Improve summary wording and ordering of relevant details.
- Keep the CV concise and targeted.
- Match score must be 0-100.

User id:
${userId}

Current CV:
${JSON.stringify(dto.currentCV, null, 2)}

Opportunity:
${JSON.stringify(dto.opportunity, null, 2)}

User notes:
${dto.userNotes || ""}`;
  }

  private buildFallbackDraft(
    profile?: CVProfileContextDto,
    goals: CVGoalContextDto[] = [],
    currentCV?: CVDataDto,
    prompt?: string,
    linkedInUrl?: string,
  ): CVDataDto {
    const goalTitles = goals
      .map((goal) => goal.title || goal.description || "")
      .filter(Boolean);
    const mergedSkills = this.unique([
      ...(currentCV?.skills || []),
      ...(profile?.skills || []),
      ...(profile?.interests || []),
    ]);

    const summaryParts = [
      profile?.field_of_study ? `${profile.field_of_study} student` : "",
      profile?.education_level ? `${profile.education_level} level` : "",
      mergedSkills.length
        ? `with strengths in ${mergedSkills.slice(0, 5).join(", ")}`
        : "",
      prompt ? `targeting ${prompt}` : "",
    ].filter(Boolean);

    return {
      header: {
        full_name: currentCV?.header?.full_name || profile?.full_name || "",
        email: currentCV?.header?.email || profile?.email || "",
        phone: currentCV?.header?.phone || "",
        location:
          currentCV?.header?.location ||
          profile?.location ||
          profile?.country ||
          "",
        linkedin: currentCV?.header?.linkedin || linkedInUrl || "",
        portfolio: currentCV?.header?.portfolio || "",
        website: currentCV?.header?.website || "",
      },
      summary:
        currentCV?.summary ||
        (summaryParts.length
          ? `Motivated ${summaryParts.join(" ")}.`
          : "Motivated student building a strong academic and professional profile."),
      experience: currentCV?.experience?.length
        ? currentCV.experience
        : goalTitles.slice(0, 2).map((goal, index) => ({
            id: `exp-${index + 1}`,
            company: "Edutu Experience",
            role: goal || "Student Project",
            description: `Worked toward ${goal || "career growth"} with focus on learning, execution, and measurable progress.`,
            highlights: mergedSkills.slice(index * 2, index * 2 + 3),
          })),
      education: currentCV?.education?.length
        ? currentCV.education
        : [
            {
              id: "edu-1",
              institution: profile?.institution || "",
              degree: profile?.education_level || "Student",
              field: profile?.field_of_study || "",
            },
          ],
      skills: mergedSkills,
      projects: currentCV?.projects || [],
      achievements: currentCV?.achievements?.length
        ? currentCV.achievements
        : goalTitles.slice(0, 3).map((goal, index) => ({
            id: `ach-${index + 1}`,
            title: goal,
            description: `Pursued ${goal} through structured effort and skill development.`,
          })),
    };
  }

  private buildFallbackTailor(dto: TailorCVDto) {
    const opportunityKeywords = this.unique([
      ...(dto.opportunity.skills || []),
      ...(dto.opportunity.requirements || []),
      ...(dto.opportunity.tags || []),
      dto.opportunity.category,
      dto.opportunity.organization,
      dto.opportunity.title,
    ]);

    const currentSkills = this.unique(dto.currentCV.skills || []);
    const matchedKeywords = currentSkills.filter((skill) =>
      opportunityKeywords.some((keyword) =>
        keyword.toLowerCase().includes(skill.toLowerCase()),
      ),
    );
    const missingKeywords = opportunityKeywords.filter(
      (keyword) =>
        !currentSkills.some((skill) =>
          keyword.toLowerCase().includes(skill.toLowerCase()),
        ),
    );

    const tailoredSummary = [
      `Targeting ${dto.opportunity.title || "this opportunity"}${dto.opportunity.organization ? ` at ${dto.opportunity.organization}` : ""}.`,
      dto.currentCV.summary || "",
      matchedKeywords.length
        ? `Relevant strengths include ${matchedKeywords.slice(0, 4).join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    const matchScore = Math.min(
      100,
      Math.max(
        35,
        Math.round(
          (matchedKeywords.length / Math.max(opportunityKeywords.length, 1)) *
            100,
        ) + 35,
      ),
    );

    return {
      tailored_cv: {
        ...dto.currentCV,
        summary: tailoredSummary.trim(),
        skills: this.unique([
          ...(dto.currentCV.skills || []),
          ...matchedKeywords,
        ]),
      },
      match_score: matchScore,
      improvements: [
        `Tailored the summary toward ${dto.opportunity.title || "the target role"}.`,
        matchedKeywords.length
          ? `Emphasized matched skills: ${matchedKeywords.slice(0, 4).join(", ")}.`
          : "Add more directly relevant skills or project keywords.",
        missingKeywords.length
          ? `Review missing areas: ${missingKeywords.slice(0, 5).join(", ")}.`
          : "Good keyword coverage for this opportunity.",
      ],
      matched_keywords: matchedKeywords,
      missing_keywords: missingKeywords.slice(0, 10),
    };
  }

  private get client(): SupabaseClient {
    if (!this.supabase) {
      throw new ServiceUnavailableException(
        "Supabase service role is not configured",
      );
    }

    return this.supabase;
  }

  private requireUserId(userId: string) {
    const dbUserId = toDatabaseUserId(userId);
    if (!dbUserId) throw new BadRequestException("Missing user id");
    return dbUserId;
  }

  private toInsertPayload(
    userId: string,
    dto: SaveCVRecordDto,
  ): CVRecordInsert {
    const rawDto = dto as Record<string, unknown>;
    const stats = this.asRecord(dto.stats) ?? {};
    const content = this.parseCVContent(stats.cv);
    const textContent =
      this.trimmedString(dto.textContent) ||
      this.trimmedString(dto.text_content) ||
      (content ? this.renderCVText(content) : "");

    if (!textContent) {
      throw new BadRequestException(
        "CV record requires textContent or structured content",
      );
    }

    const title = this.trimmedString(dto.title) || "My CV";

    return {
      user_id: userId,
      title,
      file_name:
        this.trimmedString(dto.fileName) ||
        this.trimmedString(dto.file_name) ||
        this.defaultFileName(title),
      file_size: this.toFileSize(dto.fileSize ?? dto.file_size, textContent),
      mime_type:
        this.trimmedString(dto.mimeType) ||
        this.trimmedString(dto.mime_type) ||
        "text/plain",
      text_content: textContent,
      stats,
      job_target:
        this.nullableTrimmedString(dto.jobTarget) ||
        this.nullableTrimmedString(dto.job_target),
      job_description:
        this.nullableTrimmedString(dto.jobDescription) ||
        this.nullableTrimmedString(dto.job_description),
      analysis: this.asNullableRecord(dto.analysis),
      optimization: this.asNullableRecord(dto.optimization),
      generated: Boolean(dto.generated),
      storage_path:
        this.nullableTrimmedString(rawDto.storagePath) ||
        this.nullableTrimmedString(rawDto.storage_path),
    };
  }

  private toRecordDto(row: CVRecordRow): PersistedCVRecordDto {
    const stats = this.asRecord(row.stats) ?? {};

    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      fileName: row.file_name,
      fileSize: Number(row.file_size ?? 0),
      mimeType: row.mime_type || "application/octet-stream",
      textContent: row.text_content || "",
      content: this.parseCVContent(stats.cv),
      stats,
      jobTarget: row.job_target,
      jobDescription: row.job_description,
      analysis: this.asNullableRecord(row.analysis),
      optimization: this.asNullableRecord(row.optimization),
      generated: Boolean(row.generated),
      storagePath: row.storage_path,
      uploadedAt: this.toIsoString(row.uploaded_at),
      updatedAt: this.toIsoString(row.updated_at),
    };
  }

  private parseCVContent(value: unknown): CVDataDto | null {
    if (!value) return null;
    const parsed = CVDataSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("CV content is not valid");
    }
    return parsed.data;
  }

  private renderCVText(cv: CVDataDto) {
    const sections = [
      cv.header?.full_name,
      cv.header?.email,
      cv.header?.phone,
      cv.header?.location,
      cv.summary,
      ...(cv.skills?.length ? [`Skills: ${cv.skills.join(", ")}`] : []),
      ...(cv.experience || []).map((item) =>
        [item.role, item.company, item.description, ...(item.highlights || [])]
          .filter(Boolean)
          .join("\n"),
      ),
      ...(cv.education || []).map((item) =>
        [item.degree, item.field, item.institution, ...(item.highlights || [])]
          .filter(Boolean)
          .join("\n"),
      ),
      ...(cv.projects || []).map((item) =>
        [item.name, item.description, ...(item.technologies || [])]
          .filter(Boolean)
          .join("\n"),
      ),
      ...(cv.achievements || []).map((item) =>
        [item.title, item.description, item.issuer].filter(Boolean).join("\n"),
      ),
    ];

    return sections
      .map((section) => String(section || "").trim())
      .filter(Boolean)
      .join("\n\n");
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private asNullableRecord(value: unknown): Record<string, unknown> | null {
    return this.asRecord(value);
  }

  private assertUuid(value: string, label: string) {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(`${label} must be a UUID`);
    }
  }

  private throwIfSupabaseError(
    error: { message?: string } | null,
    fallback: string,
  ) {
    if (!error) return;
    throw new BadRequestException(error.message || fallback);
  }

  private defaultFileName(title: string) {
    const base =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "cv";
    return `${base}.txt`;
  }

  private toFileSize(fileSize: number | undefined, textContent: string) {
    if (Number.isFinite(fileSize) && Number(fileSize) >= 0) {
      return Math.round(Number(fileSize));
    }
    return Buffer.byteLength(textContent, "utf8");
  }

  private nullableTrimmedString(value: unknown): string | null {
    return this.trimmedString(value) || null;
  }

  private trimmedString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  private toIsoString(value: string | Date | null) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" && value) return value;
    return new Date(0).toISOString();
  }

  private unique(values: Array<string | null | undefined>) {
    return Array.from(
      new Set(
        values.map((value) => String(value || "").trim()).filter(Boolean),
      ),
    );
  }
}
