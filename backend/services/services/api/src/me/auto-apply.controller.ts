import {
  BadRequestException,
  Body,
  Put,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  PreconditionFailedException,
  Query,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { memoryStorage } from "multer";
import { extractText } from "../uploads/extract-text";
import { UploadsService } from "../uploads/uploads.service";
import { CvEditorService } from "../cv/cv-editor.service";
import { CurrentUser } from "../auth";
import { BillingService } from "../billing/billing.service";
import { toDatabaseUserId } from "../common/user-id";
import {
  AutoApplyWorker,
  autoApplyProviderConfig,
  autoApplyReceiptConfig,
  catalogFingerprint,
  maxSupportingPdfBytes,
  providerHandoffStepUrl,
  providerHttpsUrl,
  validProviderChoice,
  type SupportingDocument,
} from "./auto-apply-worker.service";
import { pool } from "../db";
import { autoApplyActivityActionSql } from "./auto-apply-activity-action";

import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

const answerSchema = z
  .object({
    answer: z.string().trim().min(1).max(4000),
    rememberPhone: z.literal(true).optional(),
    version: z.number().int().positive(),
  })
  .strict();

const attachmentSchema = z
  .object({
    uploadId: z.string().uuid(),
    version: z.number().int().positive(),
    fieldIndex: z.number().int().min(0).max(59).optional(),
  })
  .strict();

const cvSelectionSchema = z
  .object({ cvId: z.string().uuid(), version: z.number().int().positive() })
  .strict();

const cvPreviewSchema = z
  .object({
    version: z.number().int().positive(),
    fieldIndex: z.number().int().min(0).max(59),
  })
  .strict();
const maxCvPreviewBytes = 512 * 1024;

const controlSchema = z
  .object({
    action: z.enum(["cancel", "retry", "reset_documents"]),
    version: z.number().int().positive(),
  })
  .strict();

const reviewSchema = z
  .object({
    version: z.number().int().positive(),
    values: z.array(z.string().trim().max(16000)).min(1).max(60),
  })
  .strict();

const activitySchema = z
  .object({
    activityId: z.string().min(1).max(128),
    token: z.string().max(256),
    platform: z.enum(["ios", "android"]).default("ios"),
  })
  .strict()
  .refine(
    ({ token, platform }) =>
      platform === "ios"
        ? /^[a-f0-9]{64,256}$/i.test(token)
        : /^(?:ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/.test(token),
    "Invalid activity token",
  );

const applicationName = z.string().trim().max(200);
const applicationEmail = z
  .string()
  .trim()
  .max(254)
  .pipe(z.union([z.literal(""), z.email()]));
const applicationPhone = z
  .string()
  .trim()
  .max(40)
  .refine((value) => {
    const digits = value.replace(/\D/g, "").length;
    return (
      !value || (/^\+?[\d ().-]+$/.test(value) && digits >= 7 && digits <= 15)
    );
  });
const educationText = z.string().trim().max(160);
const educationSchema = z
  .object({
    school: educationText,
    degree: educationText,
    major: educationText,
    graduationYear: z
      .string()
      .trim()
      .regex(/^(?:[1-9]\d{3})?$/),
  })
  .strict();
const emptyEducation = {
  school: "",
  degree: "",
  major: "",
  graduationYear: "",
};

const profileSchema = z
  .object({
    background: z.string().trim().max(8000),
    statement: z.string().trim().max(16000),
    version: z.number().int().nonnegative(),
    contact: z
      .object({
        name: applicationName,
        email: applicationEmail,
        phone: applicationPhone.optional(),
      })
      .strict()
      .optional(),
    education: educationSchema.optional(),
  })
  .strict();

function canJoinAutoApplyPilot(owner: string) {
  const configured = process.env.AUTO_APPLY_PILOT_LEARNERS;
  return (
    configured === undefined ||
    configured.split(",").some((id) => id.trim() === owner)
  );
}

@Controller("me/auto-apply")
export class AutoApplyController {
  constructor(
    private readonly billing: BillingService,
    private readonly cvs: CvEditorService,
    private readonly worker: AutoApplyWorker,
    private readonly uploads: UploadsService,
  ) {}

  @Post("profile/statement-import")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  async importStatement(
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException("Choose a statement file");
    if (
      ![
        "text/plain",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(file.mimetype)
    ) {
      throw new BadRequestException(
        "Choose a PDF, DOCX or plain text statement",
      );
    }
    let statement: string;
    try {
      statement = await extractText(file.buffer, file.mimetype);
    } catch {
      throw new UnprocessableEntityException("The file could not be read");
    }
    if (!statement || statement.length > 16000) {
      throw new UnprocessableEntityException(
        "Choose a readable statement with up to 16,000 characters",
      );
    }
    return { statement };
  }

  @Get("profile")
  async profile(
    @CurrentUser("authId") owner: string,
    @Query("includeSavedDetails") includeSavedDetails?: string,
  ) {
    const { rows } = await pool.query<{
      background: string;
      statement: string;
      version: number;
      contact_name: string;
      contact_email: string;
      contact_phone: string;
      education: z.infer<typeof educationSchema> | null;
    }>(
      `select background, statement, version, contact_name, contact_email, contact_phone, education
       from private.auto_apply_profiles where user_id=$1`,
      [owner],
    );
    if (rows[0]) {
      const {
        contact_name,
        contact_email,
        contact_phone,
        education,
        ...profile
      } = rows[0];
      if (includeSavedDetails !== "true") return profile;
      const saved =
        education ??
        (
          await pool.query<{ education: Partial<typeof emptyEducation> }>(
            "select private.auto_apply_saved_education($1,$2) as education",
            [owner, toDatabaseUserId(owner)],
          )
        ).rows[0]?.education;
      return {
        ...profile,
        contact: {
          name: contact_name,
          email: contact_email,
          phone: contact_phone,
        },
        education: { ...emptyEducation, ...saved },
      };
    }
    const empty = { background: "", statement: "", version: 0 };
    if (includeSavedDetails !== "true") return empty;

    const { rows: learnerProfiles } = await pool.query<{
      school: string | null;
      major: string | null;
      degree: string | null;
      grad_year: number | null;
      skills: (string | null)[] | null;
      interests: (string | null)[] | null;
      full_name: string | null;
      email: string | null;
    }>(
      `select school, major, degree, grad_year, skills, interests, full_name, email
       from public.profiles where user_id in ($1, $2)
       order by (user_id = $1) desc limit 1`,
      [owner, toDatabaseUserId(owner)],
    );
    const learner = learnerProfiles[0];
    const name = applicationName.safeParse(learner?.full_name);
    const email = applicationEmail.safeParse(learner?.email);
    const list = (items: (string | null)[] | null) =>
      (items ?? [])
        .slice(0, 20)
        .map((item) => item?.trim())
        .filter(Boolean)
        .join(", ");
    const facts = learner
      ? [
          ["School", learner.school],
          ["Degree", learner.degree],
          ["Field of study", learner.major],
          ["Graduation year", learner.grad_year?.toString()],
          ["Skills", list(learner.skills)],
          ["Interests", list(learner.interests)],
        ].flatMap(([label, value]) =>
          value?.trim() ? [`${label}: ${value.trim()}`] : [],
        )
      : [];
    return {
      ...empty,
      suggestedBackground: facts.join("\n").slice(0, 8000),
      suggestedExperience: facts
        .filter((fact) => /^(Skills|Interests): /.test(fact))
        .join("\n")
        .slice(0, 8000),
      education: {
        school: learner?.school?.trim().slice(0, 160) ?? "",
        degree: learner?.degree?.trim().slice(0, 160) ?? "",
        major: learner?.major?.trim().slice(0, 160) ?? "",
        graduationYear:
          learner?.grad_year &&
          learner.grad_year >= 1000 &&
          learner.grad_year <= 9999
            ? String(learner.grad_year)
            : "",
      },
      contact: {
        name: name.success ? name.data : "",
        email: email.success ? email.data : "",
        phone: "",
      },
    };
  }

  @Put("profile")
  async saveProfile(
    @CurrentUser("authId") owner: string,
    @Body(new ZodValidationPipe(profileSchema))
    body: z.infer<typeof profileSchema>,
  ) {
    const query =
      body.version === 0
        ? `insert into private.auto_apply_profiles(user_id, background, statement, contact_name, contact_email, education, contact_phone)
         values ($1,$2,$3,coalesce($4,''),coalesce($5,''),$6::jsonb,coalesce($7,'')) on conflict do nothing returning version`
        : `update private.auto_apply_profiles set background=$2, statement=$3, version=version+1,
         contact_name=coalesce($4,contact_name), contact_email=coalesce($5,contact_email),
         education=coalesce($6::jsonb,education), contact_phone=coalesce($7,contact_phone)
         where user_id=$1 and version=$8 returning version`;
    const values: (string | number | null)[] = [
      owner,
      body.background,
      body.statement,
      body.contact?.name ?? null,
      body.contact?.email ?? null,
      body.education ? JSON.stringify(body.education) : null,
      body.contact?.phone ?? null,
    ];
    if (body.version) values.push(body.version);
    const { rows } = await pool.query(query, values);
    if (!rows.length)
      throw new ConflictException(
        "Your application profile changed on another device",
      );
    return rows[0];
  }

  @Get("allowance")
  async allowance(@CurrentUser("authId") owner: string) {
    const { planTier } = await this.billing.getStatus(owner);
    const { rows } = await pool.query(
      `with current_allowance as (
        select private.auto_apply_limit($1,$2) as monthly_limit,
          date_trunc('month', now() at time zone 'UTC') as month_start
      )
      select allowance.monthly_limit as "monthlyLimit",
        coalesce(usage.attempts, 0) as used,
        (allowance.month_start + interval '1 month') at time zone 'UTC' as "resetAt",
        coalesce((
          select jsonb_agg(jsonb_build_object('tier', plan.plan_tier, 'monthlyLimit', plan.monthly_limit)
            order by array_position(array['lite','pro','scholar'], plan.plan_tier))
          from private.auto_apply_plan_limits plan
          where plan.monthly_limit > greatest(allowance.monthly_limit, coalesce(usage.attempts, 0))
            and array_position(array['none','lite','pro','scholar'], plan.plan_tier) >
                array_position(array['none','lite','pro','scholar'], $2)
        ), '[]'::jsonb) as "upgradeOptions"
      from current_allowance allowance
      left join private.auto_apply_usage usage on usage.user_id = $1 and usage.month_start = allowance.month_start::date`,
      [owner, planTier],
    );
    return rows[0];
  }

  @Get("cvs")
  listCvs(@CurrentUser("authId") owner: string) {
    return this.cvs.listSummaries(owner);
  }

  @Get("opportunities/:id")
  async opportunity(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    const { rows } = await pool.query(
      `select private.auto_apply_block_reason(opportunity) as "blockReason", to_jsonb(current_attempt) as attempt,
         opportunity.application_url as "catalogUrl", opportunity.apply_url as "fallbackCatalogUrl"
       from public.opportunities opportunity
       left join lateral (
         select attempt.id, attempt.state, attempt.version
         from private.auto_apply_attempts attempt
         join public.opportunity_applications application on application.id = attempt.application_id
         where application.opportunity_id = opportunity.id and application.user_id in ($2,$3)
         order by attempt.created_at desc limit 1
       ) current_attempt on true
       where opportunity.id = $1`,
      [id, owner, toDatabaseUserId(owner)],
    );
    const config = autoApplyProviderConfig();
    const available =
      rows[0]?.blockReason === null &&
      Boolean(config?.pilotIds.includes(id)) &&
      canJoinAutoApplyPilot(owner);
    const attempt = rows[0]?.attempt ?? null;
    if (rows[0]?.blockReason === "applicant_only")
      return {
        available: false,
        attempt,
        applicantOnly: true,
        profileRequired: false,
        allowance: null,
      };
    if (!available || attempt)
      return { available, attempt, profileRequired: false, allowance: null };
    if (
      !config?.submitEndpoint ||
      !(await this.worker.supportsOpportunity(
        id,
        false,
        rows[0].catalogUrl,
        rows[0].fallbackCatalogUrl,
      ))
    ) {
      return {
        available: false,
        attempt,
        profileRequired: false,
        allowance: null,
        providerUnavailable: true,
      };
    }
    const [profile, allowance] = await Promise.all([
      pool.query<{ ready: boolean }>(
        "select private.auto_apply_has_profile($1) as ready",
        [owner],
      ),
      this.allowance(owner),
    ]);
    return {
      available,
      attempt,
      profileRequired: !profile.rows[0]?.ready,
      allowance,
    };
  }

  private pilotOpportunityIds() {
    return autoApplyProviderConfig()?.pilotIds ?? [];
  }

  @Get("attempts/:id")
  async attempt(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    const { rows } = await pool.query(
      `select attempt.id, attempt.state, attempt.version,
        application.id as "applicationId", application.opportunity_id as "opportunityId",
        ${autoApplyActivityActionSql} as "activityAction",
        case when attempt.state = 'needs_input' then attempt.question end as question,
        case when attempt.state = 'needs_input' then attempt.question_max_length end as "answerMaxLength",
        case when attempt.state = 'needs_input' then attempt.question_answer_hint end as "answerHint",
        (attempt.state = 'needs_input' and attempt.question_save_phone) as "savePhoneOffered",
        (attempt.state = 'needs_input' and attempt.question_statement) as "statementRequested",
        (attempt.state = 'needs_input' and attempt.question_statement and attempt.question_statement_retryable
          and not attempt.statement_retry_used) as "statementRetryAvailable",
        case when attempt.state = 'needs_input' then attempt.question_choices end as choices,
        case when attempt.state = 'needs_input' then attempt.question_selection_mode end as "selectionMode",
        attempt.question_attachment as "attachmentRequired",
        case when attempt.state = 'needs_input' and attempt.question_attachment then (
          select coalesce(sum((selected.value->>'bytes')::int), 0)::int
          from jsonb_each(coalesce(attempt.supporting_documents, '{}'::jsonb)) selected
          where selected.key <> attempt.question
        ) end as "earlierDocumentBytes",
        (attempt.supporting_documents is not null or attempt.supporting_document is not null) as "hasDocuments",
        attempt.question_cv as "cvRequested",
        case when attempt.state = 'needs_review' then attempt.review end as review,
        (application.status = 'draft' and attempt.previous_answers is not null
          and (attempt.state = 'needs_review' or (attempt.state = 'failed' and attempt.failure_reason = 'mapping_changed')))
          as "hasPreviousAnswers",
        attempt.provider_receipt as receipt, opportunity.title,
        (attempt.state = 'submitted' and attempt.provider_receipt is null) as "manuallySubmitted",
        attempt.handoff_required as "handoffRequired",
        attempt.handoff_step_url as "handoffStepUrl",
        attempt.handoff_catalog_fingerprint as "handoffCatalogFingerprint",
        opportunity.application_url as "providerUrl", opportunity.apply_url as "fallbackProviderUrl",
        attempt.destination_host as "destinationHost", attempt.failure_reason as "failureReason",
        private.auto_apply_block_reason(opportunity) as "blockReason",
        (attempt.mapping_revision is not null) as "hasMapping",
        (application.status = 'draft') as "applicationIsDraft",
        (attempt.lease_until is null) as "submissionNotClaimed"
       from private.auto_apply_attempts attempt
       join public.opportunity_applications application on application.id = attempt.application_id
       left join public.opportunities opportunity on opportunity.id = application.opportunity_id
       where attempt.id = $1 and application.user_id in ($2,$3)`,
      [id, owner, toDatabaseUserId(owner)],
    );
    if (!rows.length) throw new NotFoundException("Attempt not found");
    const {
      applicationIsDraft,
      submissionNotClaimed,
      hasMapping,
      providerUrl,
      fallbackProviderUrl,
      handoffStepUrl,
      handoffCatalogFingerprint,
      earlierDocumentBytes,
      hasDocuments,
      blockReason,
      ...attempt
    } = rows[0];
    const config = autoApplyProviderConfig();
    const applicantOnly = blockReason === "applicant_only";
    const awaitingReceipt = attempt.state === "unconfirmed";
    const needsProvider =
      attempt.state === "needs_input" && attempt.handoffRequired;
    const changedForm =
      blockReason === null &&
      applicationIsDraft &&
      attempt.state === "failed" &&
      attempt.failureReason === "mapping_changed";
    const listing =
      awaitingReceipt || needsProvider || applicantOnly || changedForm
        ? (providerHttpsUrl(providerUrl) ??
          providerHttpsUrl(fallbackProviderUrl))
        : null;
    const step =
      listing && needsProvider && !applicantOnly
        ? providerHandoffStepUrl(handoffStepUrl)
        : null;
    const exactStep =
      listing &&
      step &&
      (handoffCatalogFingerprint
        ? handoffCatalogFingerprint ===
          catalogFingerprint(providerUrl, fallbackProviderUrl)
        : step.origin === listing.origin) &&
      step.href !== listing.href
        ? step
        : null;
    const readyReview =
      applicationIsDraft &&
      blockReason === null &&
      hasMapping &&
      attempt.state === "needs_review";
    const submissionConfigured = Boolean(
      config?.submitEndpoint && config.pilotIds.includes(attempt.opportunityId),
    );
    return {
      ...attempt,
      ...(attempt.state === "needs_input" && attempt.attachmentRequired
        ? {
            attachmentBytesRemaining: Math.max(
              0,
              maxSupportingPdfBytes - (earlierDocumentBytes ?? 0),
            ),
            canResetDocuments:
              applicationIsDraft &&
              blockReason === null &&
              Boolean(hasDocuments),
          }
        : {}),
      statementRetryAvailable: Boolean(
        attempt.statementRetryAvailable &&
        applicationIsDraft &&
        blockReason === null &&
        config?.pilotIds.includes(attempt.opportunityId),
      ),
      listingClosed: blockReason === "opportunity_closed",
      applicantOnly,
      handoffUrl: exactStep?.href ?? listing?.href ?? null,
      exactHandoff: Boolean(exactStep),
      canPreviewCv:
        applicationIsDraft &&
        blockReason === null &&
        hasMapping &&
        attempt.state === "needs_review" &&
        Boolean(
          config?.cvPreviewEndpoint &&
          config.pilotIds.includes(attempt.opportunityId),
        ),
      canCheckReceipt: awaitingReceipt && Boolean(autoApplyReceiptConfig()),
      canRecordManualSubmission:
        applicationIsDraft &&
        (awaitingReceipt ||
          needsProvider ||
          (attempt.state === "failed" &&
            (attempt.failureReason === "mapping_changed" || applicantOnly))),
      canCancel:
        applicationIsDraft &&
        (["queued", "running", "needs_input", "needs_review"].includes(
          attempt.state,
        ) ||
          (attempt.state === "submitting" && submissionNotClaimed)),
      canRetry:
        applicationIsDraft &&
        blockReason === null &&
        (["failed", "cancelled"].includes(attempt.state) || needsProvider) &&
        Boolean(config?.pilotIds.includes(attempt.opportunityId)),
      canSubmit:
        readyReview &&
        submissionConfigured &&
        !attempt.review?.some(
          (field: { validationHint?: string }) => field.validationHint,
        ),
      submissionUnavailable: readyReview && !submissionConfigured,
    };
  }

  @Get("attempts/:id/previous-answers")
  @Header("Cache-Control", "no-store")
  async previousAnswers(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    const { rows } = await pool.query<{
      version: number;
      answers: { label: string; value: string }[];
    }>(
      `select attempt.version, coalesce((
         select jsonb_agg(saved.answer order by saved.position)
         from jsonb_array_elements(attempt.previous_answers) with ordinality as saved(answer, position)
         where not exists (
           select 1 from jsonb_array_elements(attempt.review) as active_field(answer)
           where attempt.state = 'needs_review'
             and active_field.answer ->> 'label' = saved.answer ->> 'label'
             and active_field.answer ->> 'value' = saved.answer ->> 'value'
         )
       ), '[]'::jsonb) as answers
       from private.auto_apply_attempts attempt
       join public.opportunity_applications application on application.id = attempt.application_id
       where attempt.id = $1 and application.user_id in ($2,$3) and application.status = 'draft'
         and attempt.previous_answers is not null
         and (attempt.state = 'needs_review' or (attempt.state = 'failed' and attempt.failure_reason = 'mapping_changed'))`,
      [id, owner, toDatabaseUserId(owner)],
    );
    if (!rows.length)
      throw new NotFoundException("Previous answers are unavailable");
    return rows[0];
  }

  @Post("attempts/:id/cv-preview")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async previewCv(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(cvPreviewSchema))
    body: z.infer<typeof cvPreviewSchema>,
  ) {
    const attempt = await this.attempt(owner, id);
    if (attempt.state !== "needs_review" || attempt.version !== body.version)
      throw new ConflictException(
        "Refresh the application before opening the CV.",
      );
    const field = attempt.review?.[body.fieldIndex];
    if (
      field?.attachment?.type !== "pdf" ||
      field.attachment.uploadId ||
      typeof field.value !== "string" ||
      !field.value.trim()
    )
      throw new NotFoundException("Generated CV not found");
    const config = autoApplyProviderConfig();
    if (!attempt.canPreviewCv || !config?.cvPreviewEndpoint)
      throw new ServiceUnavailableException(
        "CV preview is temporarily unavailable.",
      );

    try {
      const response = await fetch(config.cvPreviewEndpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: field.value }),
        signal: AbortSignal.timeout(12_000),
      });
      if (
        !response.ok ||
        response.headers.get("content-type") !== "application/pdf" ||
        !response.body
      ) {
        await response.body?.cancel();
        throw new Error();
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > maxCvPreviewBytes) {
            await reader.cancel();
            throw new Error();
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      const pdf = Buffer.concat(chunks, size);
      if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error();
      return { pdf: pdf.toString("base64") };
    } catch {
      throw new ServiceUnavailableException(
        "CV preview is temporarily unavailable.",
      );
    }
  }

  @Post("attempts/:id/check-receipt")
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  async checkReceipt(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    const current = await this.attempt(owner, id);
    if (!current.canCheckReceipt) return current;
    await this.worker.reconcileReceipt(id, current.version);
    return this.attempt(owner, id);
  }

  @Post("attempts/:id/manual-submission")
  async recordManualSubmission(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ version: z.number().int().positive() }).strict(),
      ),
    )
    body: { version: number },
  ) {
    try {
      await pool.query(
        `with tracker as materialized (
           select application.id
           from public.opportunity_applications application
           join private.auto_apply_attempts attempt on attempt.application_id = application.id
           where attempt.id = $1 and application.user_id in ($2,$3) and application.status = 'draft'
           for update of application nowait
         ), eligible as materialized (
           select attempt.application_id
           from tracker
           join private.auto_apply_attempts attempt on attempt.application_id = tracker.id
           join public.opportunity_applications application on application.id = tracker.id
           join public.opportunities opportunity on opportunity.id = application.opportunity_id
           where attempt.version = $4 and (
             attempt.state = 'unconfirmed'
             or (attempt.state = 'needs_input' and attempt.handoff_required)
             or (attempt.state = 'failed' and (
               attempt.failure_reason = 'mapping_changed'
               or private.auto_apply_block_reason(opportunity) = 'applicant_only'
             ))
           )
           for update of attempt nowait
         )
         update public.opportunity_applications application
         set status = 'submitted', submitted_at = coalesce(application.submitted_at, now())
         from eligible where application.id = eligible.application_id`,
        [id, owner, toDatabaseUserId(owner), body.version],
      );
    } catch (error) {
      if (
        !(
          typeof error === "object" &&
          error &&
          "code" in error &&
          error.code === "55P03"
        )
      )
        throw error;
      throw new ConflictException(
        "Auto Apply is updating this application. Refresh its status before recording the submission.",
      );
    }
    const current = await this.attempt(owner, id);
    if (current.state === "submitted") return current;
    throw new ConflictException(
      "Refresh the application status before recording the submission.",
    );
  }

  @Post("attempts/:id/control")
  async controlAttempt(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(controlSchema))
    body: z.infer<typeof controlSchema>,
  ) {
    const resetDocuments = body.action === "reset_documents";
    const retry = body.action !== "cancel";
    const { rows } = await pool.query(
      `update private.auto_apply_attempts attempt
       set state = case when $5::boolean then 'queued' else 'cancelled' end,
         question = null, question_choices = null, question_selection_mode = null, question_save_phone = false, question_attachment = false, question_cv = false,
         handoff_required = false, handoff_step_url = null, handoff_catalog_fingerprint = null,
         review = case when $5::boolean and attempt.handoff_required then attempt.review end,
         mapping_revision = case when $5::boolean and attempt.handoff_required then attempt.mapping_revision end,
         supporting_document = case when not $7::boolean then attempt.supporting_document end,
         supporting_documents = case when not $7::boolean then attempt.supporting_documents end,
         destination_host = null, failure_reason = null,
         lease_until = null, version = attempt.version + 1, provider_busy_retries = 0, provider_retry_after = null
       from public.opportunity_applications application
       join public.opportunities opportunity on opportunity.id = application.opportunity_id
       where attempt.id = $1 and application.id = attempt.application_id
         and application.user_id in ($2,$3) and application.status = 'draft'
         and attempt.version = $4
         and (
           ($5::boolean and (
             (not $7::boolean and (attempt.state in ('failed','cancelled') or (attempt.state = 'needs_input' and attempt.handoff_required)))
             or ($7::boolean and attempt.state = 'needs_input' and attempt.question_attachment
               and (attempt.supporting_documents is not null or attempt.supporting_document is not null))
           )
             and application.opportunity_id::text = any($6::text[]) and private.auto_apply_block_reason(opportunity) is null)
           or (not $5::boolean and (
             attempt.state in ('queued','running','needs_input','needs_review')
             or (attempt.state = 'submitting' and attempt.lease_until is null)
           ))
         )
       returning attempt.id, attempt.state, attempt.version`,
      [
        id,
        owner,
        toDatabaseUserId(owner),
        body.version,
        retry,
        this.pilotOpportunityIds(),
        resetDocuments,
      ],
    );
    if (rows.length) return rows[0];
    await this.attempt(owner, id);
    throw new ConflictException(
      "The attempt changed. Refresh to see whether it can still be changed.",
    );
  }

  @Put("attempts/:id/activity")
  async registerActivity(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(activitySchema))
    body: z.infer<typeof activitySchema>,
  ) {
    const legacy = toDatabaseUserId(owner);
    if (body.platform === "android") {
      const result = await pool.query(
        `insert into private.auto_apply_android_activities (attempt_id, token)
         select attempt.id, $4 from private.auto_apply_attempts attempt
         join public.opportunity_applications application on application.id = attempt.application_id
         join public.notification_push_tokens push on push.token = $4 and push.provider = 'expo'
           and push.user_id::text = $3 and push.device->>'platform' = 'android'
         where attempt.id = $1 and application.user_id in ($2,$3)
           and attempt.state not in ('submitted','failed','cancelled','unconfirmed')
         on conflict (attempt_id, token) do update
           set expires_at = greatest(auto_apply_android_activities.expires_at, excluded.expires_at)`,
        [id, owner, legacy, body.token],
      );
      return this.activityRegistrationResult(
        id,
        owner,
        legacy,
        Boolean(result.rowCount),
      );
    }
    const result = await pool.query(
      `insert into private.auto_apply_live_activities (attempt_id, activity_id, token)
       select attempt.id, $4, $5 from private.auto_apply_attempts attempt
       join public.opportunity_applications application on application.id = attempt.application_id
       where attempt.id = $1 and application.user_id in ($2,$3)
         and attempt.state not in ('submitted','failed','cancelled','unconfirmed')
       on conflict (attempt_id, activity_id) do update
         set token = excluded.token, delivered_version = 0, retry_after = now()
         where auto_apply_live_activities.token <> excluded.token`,
      [id, owner, legacy, body.activityId, body.token],
    );
    return this.activityRegistrationResult(
      id,
      owner,
      legacy,
      Boolean(result.rowCount),
    );
  }

  private async activityRegistrationResult(
    id: string,
    owner: string,
    legacy: string,
    updated: boolean,
  ) {
    if (updated) return { updated };
    // A device can finish registering just after the attempt ends, before it has a push binding.
    const { rows } = await pool.query<{
      id: string;
      state: string;
      version: number;
    }>(
      `select attempt.id, attempt.state, attempt.version
       from private.auto_apply_attempts attempt
       join public.opportunity_applications application on application.id = attempt.application_id
       where attempt.id = $1 and application.user_id in ($2,$3)
         and attempt.state in ('submitted','failed','cancelled','unconfirmed')`,
      [id, owner, legacy],
    );
    return { updated, ...(rows[0] ? { progress: rows[0] } : {}) };
  }

  @Put("attempts/:id/review")
  async saveReview(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(reviewSchema))
    body: z.infer<typeof reviewSchema>,
  ) {
    const { rows } = await pool.query(
      `update private.auto_apply_attempts attempt
       set review = (
         select jsonb_agg(
           jsonb_set(case when (field.value -> 'value') is distinct from ($5::jsonb -> ((field.ordinality - 1)::integer))
               then field.value - 'validationHint' else field.value end,
             '{value}', $5::jsonb -> ((field.ordinality - 1)::integer))
           order by field.ordinality
         )
         from jsonb_array_elements(attempt.review) with ordinality as field(value, ordinality)
       ), version = attempt.version + 1
       from public.opportunity_applications application
       where attempt.id = $1 and application.id = attempt.application_id
         and application.user_id in ($2,$3) and application.status = 'draft'
         and attempt.state = 'needs_review' and attempt.version = $4
         and jsonb_array_length(attempt.review) = jsonb_array_length($5::jsonb)
         and not exists (
           select 1 from jsonb_array_elements(attempt.review) with ordinality as field(value, ordinality)
           where (field.value ? 'choices'
             and not private.auto_apply_choices_value_allowed(field.value -> 'choices',
               $5::jsonb ->> ((field.ordinality - 1)::integer), field.value ->> 'selectionMode'))
             or (not (field.value @> '{"optional":true}'::jsonb)
               and ($5::jsonb ->> ((field.ordinality - 1)::integer)) = '')
             or not private.auto_apply_review_value_fits(field.value, $5::jsonb ->> ((field.ordinality - 1)::integer))
             or ((field.value -> 'attachment') ? 'uploadId' and (field.value ->> 'value') is distinct from
               ($5::jsonb ->> ((field.ordinality - 1)::integer)))
         )
       returning attempt.id, attempt.version, attempt.review`,
      [
        id,
        owner,
        toDatabaseUserId(owner),
        body.version,
        JSON.stringify(body.values),
      ],
    );
    if (rows.length) return rows[0];
    const current = await this.attempt(owner, id);
    if (
      current.state === "needs_review" &&
      current.version === body.version &&
      current.review?.length === body.values.length &&
      current.review.some(
        (field: { optional?: boolean }, index: number) =>
          !field.optional && !body.values[index],
      )
    )
      throw new UnprocessableEntityException(
        "Fill in the required answers before saving the draft.",
      );
    if (
      current.state === "needs_review" &&
      current.version === body.version &&
      current.review?.length === body.values.length &&
      current.review.some(
        (field: { maxLength?: number }, index: number) =>
          field.maxLength !== undefined &&
          body.values[index].length > field.maxLength,
      )
    )
      throw new UnprocessableEntityException(
        "Shorten answers that exceed the provider's character limits.",
      );
    if (
      current.state === "needs_review" &&
      current.version === body.version &&
      current.review?.length === body.values.length &&
      current.review.some(
        (
          field: {
            choices?: string[];
            selectionMode?: "multiple_required" | "multiple_optional";
          },
          index: number,
        ) =>
          field.choices &&
          !validProviderChoice(
            field.choices,
            body.values[index],
            field.selectionMode,
          ),
      )
    ) {
      throw new UnprocessableEntityException(
        "Check your selections against the provider's available options.",
      );
    }
    throw new ConflictException(
      "This draft has changed. Refresh it before editing.",
    );
  }

  @Post("attempts/:id/approve")
  async approve(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ version: z.number().int().positive() }).strict(),
      ),
    )
    body: { version: number },
  ) {
    const config = autoApplyProviderConfig();
    if (!config?.submitEndpoint)
      throw new ConflictException("Provider submission is unavailable");
    const { rows } = await pool.query(
      `update private.auto_apply_attempts attempt
       set state = 'submitting', version = attempt.version + 1
       from public.opportunity_applications application
       join public.opportunities opportunity on opportunity.id = application.opportunity_id
       where attempt.id = $1 and application.id = attempt.application_id
         and application.user_id in ($2,$3) and application.status = 'draft'
         and application.opportunity_id::text = any($5::text[])
         and attempt.state = 'needs_review' and attempt.version = $4 and attempt.review is not null
         and attempt.mapping_revision is not null
         and not exists (
           select from jsonb_array_elements(attempt.review) field
           where field ? 'validationHint' or not private.auto_apply_review_value_fits(field, field->>'value')
             or (field ? 'choices' and not private.auto_apply_choices_value_allowed(
               field -> 'choices', field ->> 'value', field ->> 'selectionMode'))
         )
         and private.auto_apply_block_reason(opportunity) is null
       returning attempt.id`,
      [id, owner, toDatabaseUserId(owner), body.version, config.pilotIds],
    );
    if (rows.length) return rows[0];
    const current = await this.attempt(owner, id);
    if (current.state === "submitting" && current.version === body.version + 1)
      return { id };
    if (
      current.state === "needs_review" &&
      current.version === body.version &&
      current.review?.some(
        (field: { validationHint?: string }) => field.validationHint,
      )
    ) {
      throw new UnprocessableEntityException(
        "Correct the highlighted field before approving.",
      );
    }
    if (
      current.state === "needs_review" &&
      current.version === body.version &&
      current.review?.some(
        (field: { maxLength?: number; value: string }) =>
          field.maxLength !== undefined && field.value.length > field.maxLength,
      )
    )
      throw new UnprocessableEntityException(
        "Shorten answers that exceed the provider's character limits.",
      );
    if (current.listingClosed)
      throw new ConflictException("This opportunity has closed.");
    if (current.applicantOnly)
      throw new ConflictException(
        "Complete and submit your own application on the provider’s website.",
      );
    throw new ConflictException(
      "This draft has changed. Refresh it before approving.",
    );
  }

  @Post("attempts/:id/retry-statement")
  @HttpCode(200)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  async retryStatement(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ version: z.number().int().positive() }).strict(),
      ),
    )
    body: { version: number },
  ) {
    const { rows } = await pool.query<{ id: string }>(
      `update private.auto_apply_attempts attempt
       set state = 'queued', question = null, question_statement = false, question_max_length = null,
         question_statement_retryable = false, statement_retry_used = true, version = attempt.version + 1
       from public.opportunity_applications application
       join public.opportunities opportunity on opportunity.id = application.opportunity_id
       where attempt.id = $1 and application.id = attempt.application_id
         and application.user_id in ($2,$3) and application.status = 'draft'
         and application.opportunity_id::text = any($5::text[])
         and attempt.state = 'needs_input' and attempt.version = $4
         and attempt.question_statement and attempt.question_statement_retryable and not attempt.statement_retry_used
         and private.auto_apply_block_reason(opportunity) is null
       returning attempt.id`,
      [
        id,
        owner,
        toDatabaseUserId(owner),
        body.version,
        this.pilotOpportunityIds(),
      ],
    );
    if (rows[0]) return rows[0];
    await this.attempt(owner, id);
    throw new ConflictException(
      "This statement draft can no longer be retried. Refresh the application to continue.",
    );
  }

  @Post("attempts/:id/answer")
  async answer(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(answerSchema))
    body: z.infer<typeof answerSchema>,
  ) {
    const phone = body.rememberPhone
      ? body.answer.replace(/[ ().-]/g, "")
      : null;
    if (
      phone !== null &&
      (!applicationPhone.safeParse(body.answer).success ||
        !/^\+[1-9]\d{6,14}$/.test(phone))
    ) {
      throw new UnprocessableEntityException(
        "Use an international phone number beginning with + to save it.",
      );
    }
    const { rows } = await pool.query(
      `with answered as (
       update private.auto_apply_attempts attempt
       set answers = attempt.answers || jsonb_build_object(attempt.version::text,
         jsonb_build_object('question', attempt.question, 'answer', $4::text)),
         state = 'queued', question = null, question_choices = null, question_selection_mode = null, question_save_phone = false, question_cv = false,
         question_max_length = null, question_statement = false, question_statement_retryable = false, question_answer_hint = null, version = attempt.version + 1
       from public.opportunity_applications application
       join public.opportunities opportunity on opportunity.id = application.opportunity_id
       where attempt.id = $1 and application.id = attempt.application_id
         and application.user_id in ($2,$3) and application.status = 'draft'
         and attempt.state = 'needs_input' and attempt.version = $5 and not attempt.handoff_required and not attempt.question_attachment
         and (attempt.question_choices is null or private.auto_apply_choices_value_allowed(attempt.question_choices, $4::text, attempt.question_selection_mode))
         and (attempt.question_max_length is null or
           private.auto_apply_review_value_fits(jsonb_build_object('maxLength', attempt.question_max_length), $4::text))
         and ($6::text is null or attempt.question_save_phone)
         and private.auto_apply_block_reason(opportunity) is null
       returning attempt.id, attempt.owner_id
       ), saved_phone as (
         update private.auto_apply_profiles profile
         set contact_phone = $6::text, version = profile.version + 1
         from answered
         where profile.user_id = answered.owner_id and $6::text is not null
           and btrim(profile.contact_phone) = ''
         returning profile.user_id
       )
       select answered.id,
         case when $6::text is not null then exists (select 1 from saved_phone) end as "phoneSaved"
       from answered`,
      [id, owner, toDatabaseUserId(owner), body.answer, body.version, phone],
    );
    if (!rows.length) {
      const current = await this.attempt(owner, id);
      if (current.listingClosed)
        throw new ConflictException("This opportunity has closed.");
      if (current.applicantOnly)
        throw new ConflictException(
          "Complete and submit your own application on the provider’s website.",
        );
      if (
        current.state === "needs_input" &&
        current.version === body.version &&
        current.answerMaxLength &&
        body.answer.length > current.answerMaxLength
      ) {
        throw new UnprocessableEntityException(
          `Enter up to ${current.answerMaxLength} characters for this answer.`,
        );
      }
      if (
        current.state === "needs_input" &&
        current.version === body.version &&
        current.choices
      ) {
        throw new UnprocessableEntityException(
          "Check your selections against the provider's available options.",
        );
      }
      throw new ConflictException(
        "This question has changed. Refresh the attempt.",
      );
    }
    return phone === null ? { id: rows[0].id } : rows[0];
  }

  @Post("attempts/:id/cv")
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async selectAttemptCv(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(cvSelectionSchema))
    body: z.infer<typeof cvSelectionSchema>,
  ) {
    const current = await this.attempt(owner, id);
    if (
      current.state !== "needs_input" ||
      !current.cvRequested ||
      current.version !== body.version ||
      current.listingClosed ||
      current.applicantOnly
    ) {
      throw new ConflictException(
        "Refresh the application before choosing a CV.",
      );
    }
    const cv = await this.applicationCvSnapshot(owner, body.cvId);
    const { rows } = await pool.query(
      `update private.auto_apply_attempts attempt
       set cv_snapshot = $5::jsonb, state = 'queued', question = null, question_cv = false,
         version = attempt.version + 1
       from public.opportunity_applications application
       join public.opportunities opportunity on opportunity.id = application.opportunity_id
       where attempt.id = $1 and application.id = attempt.application_id
         and application.user_id in ($2,$3) and application.status = 'draft'
         and attempt.state = 'needs_input' and attempt.version = $4 and attempt.question_cv
         and private.auto_apply_block_reason(opportunity) is null
       returning attempt.id, attempt.state, attempt.version`,
      [id, owner, toDatabaseUserId(owner), body.version, cv],
    );
    if (!rows.length)
      throw new ConflictException(
        "Refresh the application before choosing a CV.",
      );
    return rows[0];
  }

  private async applicationCvSnapshot(owner: string, cvId: string) {
    const { id, name, data } = await this.cvs.get(owner, cvId);
    return JSON.stringify({ id, name, data });
  }

  @Post("attempts/:id/attachment")
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async attachPdf(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(attachmentSchema))
    body: z.infer<typeof attachmentSchema>,
  ) {
    const current = await this.attempt(owner, id);
    if (body.fieldIndex !== undefined) {
      const field = current.review?.[body.fieldIndex];
      if (
        current.state !== "needs_review" ||
        current.version !== body.version ||
        current.listingClosed ||
        current.applicantOnly ||
        field?.attachment?.type !== "pdf" ||
        !field.attachment.uploadId
      ) {
        throw new ConflictException(
          "Refresh the review before replacing a document.",
        );
      }
      return this.replaceReviewedPdf(
        owner,
        id,
        body.version,
        body.fieldIndex,
        field,
        body.uploadId,
      );
    }
    if (
      current.state !== "needs_input" ||
      !current.attachmentRequired ||
      current.version !== body.version ||
      current.listingClosed ||
      current.applicantOnly
    ) {
      throw new ConflictException(
        "Refresh the application before choosing a document.",
      );
    }
    const ownerId = toDatabaseUserId(owner);
    const { name, sha256, bytes } = await this.uploads.getApplicationPdf(
      ownerId,
      body.uploadId,
    );
    if (
      bytes.length > (current.attachmentBytesRemaining ?? maxSupportingPdfBytes)
    )
      throw new PayloadTooLargeException(
        "Supporting PDFs can total up to 10 MB. Choose a smaller PDF.",
      );
    const { rows } = await pool.query(
      `update private.auto_apply_attempts attempt
       set supporting_document = jsonb_build_object('uploadId', $5::text, 'name', $6::text,
         'sha256', $7::text, 'question', attempt.question, 'bytes', $8::int),
         supporting_documents = coalesce(attempt.supporting_documents,
           case when attempt.supporting_document->>'question' is not null then
             jsonb_build_object(attempt.supporting_document->>'question', attempt.supporting_document)
           else '{}'::jsonb end)
           || jsonb_build_object(attempt.question, jsonb_build_object(
             'uploadId', $5::text, 'name', $6::text, 'sha256', $7::text, 'question', attempt.question, 'bytes', $8::int)),
         state = 'queued', question = null, question_attachment = false, version = attempt.version + 1
       from public.opportunity_applications application
       join public.opportunities opportunity on opportunity.id = application.opportunity_id
       where attempt.id = $1 and attempt.application_id = application.id
         and application.user_id in ($2,$3) and application.status = 'draft'
         and attempt.state = 'needs_input' and attempt.version = $4 and attempt.question_attachment
         and private.auto_apply_block_reason(opportunity) is null
       returning attempt.id`,
      [
        id,
        owner,
        ownerId,
        body.version,
        body.uploadId,
        name,
        sha256,
        bytes.length,
      ],
    );
    if (!rows.length)
      throw new ConflictException("The application question has changed.");
    return rows[0];
  }

  private async replaceReviewedPdf(
    owner: string,
    id: string,
    version: number,
    index: number,
    field: {
      value: string;
      attachment: { uploadId: string; question?: string };
    },
    uploadId: string,
  ) {
    const ownerId = toDatabaseUserId(owner);
    const changed = new ConflictException(
      "This review changed. Refresh before replacing a document.",
    );
    const {
      rows: [selection],
    } = await pool.query<{
      document: SupportingDocument | null;
      documents: Record<string, SupportingDocument> | null;
    }>(
      `select attempt.supporting_document as document, attempt.supporting_documents as documents
       from private.auto_apply_attempts attempt
       join public.opportunity_applications application on application.id = attempt.application_id
       where attempt.id = $1 and application.user_id in ($2,$3) and application.status = 'draft'
         and attempt.version = $4 and attempt.state = 'needs_review'`,
      [id, owner, ownerId, version],
    );
    if (!selection) throw changed;
    const candidates = selection.documents
      ? Object.values(selection.documents)
      : selection.document
        ? [selection.document]
        : [];
    const matches = candidates.filter(
      (document) =>
        document.uploadId === field.attachment.uploadId &&
        document.name === field.value &&
        (!field.attachment.question ||
          document.question === field.attachment.question),
    );
    if (matches.length !== 1) throw changed;
    const [previous] = matches;

    const replacement = await this.uploads.getApplicationPdf(ownerId, uploadId);
    const documents = field.attachment.question
      ? { ...selection.documents }
      : {};
    let bytes = replacement.bytes.length;
    for (const document of Object.values(documents)) {
      if (document.question === previous.question) continue;
      bytes +=
        document.bytes ??
        (await this.uploads.getApplicationPdf(ownerId, document.uploadId)).bytes
          .length;
      if (bytes > maxSupportingPdfBytes)
        throw new PayloadTooLargeException(
          "Supporting PDFs can total up to 10 MB. Choose a smaller PDF.",
        );
    }
    const updated = {
      uploadId,
      question: previous.question,
      name: replacement.name,
      bytes: replacement.bytes.length,
      sha256: replacement.sha256,
    };
    documents[updated.question] = updated;
    const { rows } = await pool.query(
      `update private.auto_apply_attempts attempt
       set supporting_document = $6::jsonb, supporting_documents = $7::jsonb,
         review = jsonb_set(attempt.review, array[$5::text],
           (attempt.review -> $5::int) || jsonb_build_object('value', $8::text, 'attachment',
             (attempt.review -> $5::int -> 'attachment') || jsonb_build_object('uploadId', $9::text))),
         version = attempt.version + 1
       from public.opportunity_applications application
       join public.opportunities opportunity on opportunity.id = application.opportunity_id
       where attempt.id = $1 and application.id = attempt.application_id
         and application.user_id in ($2,$3) and application.status = 'draft'
         and attempt.state = 'needs_review' and attempt.version = $4
         and private.auto_apply_block_reason(opportunity) is null
       returning attempt.id, attempt.version`,
      [
        id,
        owner,
        ownerId,
        version,
        index,
        JSON.stringify(updated),
        JSON.stringify(documents),
        updated.name,
        uploadId,
      ],
    );
    if (!rows.length) throw changed;
    return rows[0];
  }

  @Post("applications/:id")
  async start(
    @CurrentUser("authId") owner: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ cvId: z.string().uuid().optional() }).strict().default({}),
      ),
    )
    body: { cvId?: string },
  ) {
    const config = autoApplyProviderConfig();
    const eligibleConfig = canJoinAutoApplyPilot(owner) ? config : null;
    const verifyForm = eligibleConfig?.verifyEndpoint !== undefined;
    if (
      eligibleConfig?.submitEndpoint &&
      (eligibleConfig.capabilitiesEndpoint || verifyForm)
    ) {
      const { rows } = await pool.query<{
        opportunityId: string;
        catalogUrl: string | null;
        fallbackCatalogUrl: string | null;
      }>(
        `select application.opportunity_id as "opportunityId",
           opportunity.application_url as "catalogUrl", opportunity.apply_url as "fallbackCatalogUrl"
         from public.opportunity_applications application
         join public.opportunities opportunity on opportunity.id = application.opportunity_id
         where application.id = $1 and application.user_id in ($2,$3) and application.status = 'draft'
           and application.opportunity_id::text = any($4::text[])
           and private.auto_apply_block_reason(opportunity) is null
           and not exists (select 1 from private.auto_apply_attempts attempt where attempt.application_id = application.id)`,
        [id, owner, toDatabaseUserId(owner), eligibleConfig.pilotIds],
      );
      if (
        rows[0] &&
        (!(await this.worker.supportsOpportunity(
          rows[0].opportunityId,
          true,
          rows[0].catalogUrl,
          rows[0].fallbackCatalogUrl,
        )) ||
          (verifyForm &&
            !(await this.worker.verifyOpportunityForm(
              rows[0].opportunityId,
              rows[0].catalogUrl,
              rows[0].fallbackCatalogUrl,
            ))))
      ) {
        throw new ServiceUnavailableException(
          "Auto Apply is temporarily unavailable for this opportunity",
        );
      }
    }
    const canStart = Boolean(eligibleConfig?.submitEndpoint);
    const cv =
      canStart && body.cvId
        ? await this.applicationCvSnapshot(owner, body.cvId)
        : null;
    const planTier = canStart
      ? (await this.billing.getStatus(owner)).planTier
      : "none";
    try {
      const { rows } = await pool.query<{ id: string }>(
        "select private.start_auto_apply($1,$2,$3,$4,$5,$6::jsonb) as id",
        [
          owner,
          id,
          planTier,
          toDatabaseUserId(owner),
          eligibleConfig?.submitEndpoint ? eligibleConfig.pilotIds : [],
          cv,
        ],
      );
      const snapshot = await pool.query(
        "select id, state, version from private.auto_apply_attempts where id = $1",
        [rows[0].id],
      );
      if (!snapshot.rows[0])
        throw new NotFoundException("Application not found");
      return snapshot.rows[0];
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      switch (error.message) {
        case "application_not_found":
          throw new NotFoundException("Application not found");
        case "auto_apply_unavailable":
          if (eligibleConfig && !canStart) {
            throw new ServiceUnavailableException(
              "Auto Apply is temporarily unavailable for this opportunity",
            );
          }
          throw new ConflictException(
            "Auto Apply is unavailable for this opportunity",
          );
        case "auto_apply_opportunity_closed":
          throw new ConflictException("This opportunity has closed.");
        case "auto_apply_applicant_only":
          throw new ConflictException(
            "This provider asks applicants to complete and submit their own applications.",
          );
        case "application_already_progressed":
          throw new ConflictException("Application is no longer a draft");
        case "auto_apply_profile_required":
          throw new PreconditionFailedException(
            "Complete your application profile to continue",
          );
        case "auto_apply_monthly_limit":
          throw new HttpException(
            "Monthly Auto Apply limit reached",
            HttpStatus.TOO_MANY_REQUESTS,
          );
        default:
          throw error;
      }
    }
  }
}
