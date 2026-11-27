import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { createHash } from "node:crypto";
import { BillingService } from "../billing/billing.service";
import { toDatabaseUserId } from "../common/user-id";
import { CvEditorService } from "../cv/cv-editor.service";
import { pool } from "../db";
import { UploadsService } from "../uploads/uploads.service";
import { AutoApplyWorker } from "./auto-apply-worker.service";
import { AutoApplyController } from "./auto-apply.controller";

jest.mock("../db", () => ({ pool: { query: jest.fn() } }));

const controller = new AutoApplyController(
  {} as BillingService,
  {} as CvEditorService,
  {} as AutoApplyWorker,
  {} as UploadsService,
);

it("returns previous answers only through an owned draft attempt", async () => {
  const query = jest.mocked(pool.query);
  const attemptId = "d5aaba4e-d007-4428-9dd7-abc8fdca27f2";
  const previous = { version: 8, answers: [{ label: "Statement", value: "Earlier reviewed text" }] };
  query.mockResolvedValueOnce({ rows: [previous] } as never)
    .mockResolvedValueOnce({ rows: [] } as never);
  await expect(controller.previousAnswers("user_owner", attemptId)).resolves.toEqual(previous);
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining("application.user_id in ($2,$3) and application.status = 'draft'"),
    [attemptId, "user_owner", toDatabaseUserId("user_owner")],
  );
  await expect(controller.previousAnswers("user_other", attemptId)).rejects.toBeInstanceOf(NotFoundException);
});

it("replaces a legacy single supporting PDF on the same review", async () => {
  const uploadId = "d5aaba4e-d007-4428-9dd7-abc8fdca27f2";
  const getApplicationPdf = jest.fn().mockResolvedValue({
    name: "updated.pdf", sha256: "b".repeat(64), bytes: Buffer.from("%PDF-"),
  });
  const service = new AutoApplyController(
    {} as BillingService,
    {} as CvEditorService,
    {} as AutoApplyWorker,
    { getApplicationPdf } as unknown as UploadsService,
  );
  const query = jest.mocked(pool.query);
  query.mockResolvedValueOnce({ rows: [{
    state: "needs_review", version: 4, blockReason: null, applicationIsDraft: true,
    review: [{ label: "Transcript", value: "old.pdf", attachment: { type: "pdf", uploadId: "previous" } }],
  }] } as never).mockResolvedValueOnce({ rows: [{
    document: { uploadId: "previous", name: "old.pdf", sha256: "a".repeat(64), question: "Transcript" },
    documents: null,
  }] } as never).mockResolvedValueOnce({ rows: [{ id: "attempt", version: 5 }] } as never);
  const owner = "user_learner";

  await expect(service.attachPdf(owner, "attempt", { uploadId, version: 4, fieldIndex: 0 }))
    .resolves.toEqual({ id: "attempt", version: 5 });
  expect(getApplicationPdf).toHaveBeenCalledWith(toDatabaseUserId(owner), uploadId);
  const updated = { uploadId, question: "Transcript", name: "updated.pdf", bytes: 5, sha256: "b".repeat(64) };
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining("attempt.version = $4"),
    ["attempt", owner, toDatabaseUserId(owner), 4, 0, JSON.stringify(updated),
      JSON.stringify({ Transcript: updated }), "updated.pdf", uploadId]);
});

it("renders only a generated PDF from the owner's saved review version", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv, AUTO_APPLY_PROVIDER_PREPARE_URL: "https://provider.example/prepare",
    AUTO_APPLY_PROVIDER_CV_PREVIEW_URL: "https://provider.example/preview-cv",
    AUTO_APPLY_PROVIDER_CAPABILITIES_URL: "", AUTO_APPLY_PROVIDER_TOKEN: "fixture",
    AUTO_APPLY_PILOT_OPPORTUNITIES: "listing",
  };
  const pdf = "%PDF-1.4\n%%EOF";
  const fetchPreview = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(pdf, { headers: { "content-type": "application/pdf" } }),
  );
  const draft = {
    state: "needs_review", version: 4, applicationIsDraft: true, hasMapping: true, blockReason: null,
    opportunityId: "listing", review: [
      { label: "CV", value: "Verified academic work", attachment: { type: "pdf" } },
      { label: "Letter", value: "letter.pdf", attachment: { type: "pdf", uploadId: "document" } },
    ],
  };
  const query = jest.mocked(pool.query);
  query.mockResolvedValueOnce({ rows: [draft] } as never)
    .mockResolvedValueOnce({ rows: [draft] } as never)
    .mockResolvedValueOnce({ rows: [draft] } as never);
  try {
    await expect(controller.previewCv("user_learner", "attempt", { version: 3, fieldIndex: 0 }))
      .rejects.toThrow("Refresh the application");
    await expect(controller.previewCv("user_learner", "attempt", { version: 4, fieldIndex: 1 }))
      .rejects.toThrow("Generated CV not found");
    expect(fetchPreview).not.toHaveBeenCalled();
    await expect(controller.previewCv("user_learner", "attempt", { version: 4, fieldIndex: 0 }))
      .resolves.toEqual({ pdf: Buffer.from(pdf).toString("base64") });
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("application.user_id in ($2,$3)"),
      ["attempt", "user_learner", toDatabaseUserId("user_learner")]);
    expect(fetchPreview).toHaveBeenCalledWith("https://provider.example/preview-cv", expect.objectContaining({
      body: JSON.stringify({ value: "Verified academic work" }), redirect: "error",
    }));
  } finally {
    fetchPreview.mockRestore();
    process.env = originalEnv;
  }
});

it("snapshots an owned CV and queues the existing versioned attempt", async () => {
  const cv = { id: "cv", name: "Academic CV", data: { summary: "Engineering projects" } };
  const load = jest.fn().mockResolvedValue(cv);
  const service = new AutoApplyController(
    {} as BillingService, { get: load } as unknown as CvEditorService,
    {} as AutoApplyWorker, {} as UploadsService,
  );
  const query = jest.mocked(pool.query);
  query.mockResolvedValueOnce({ rows: [{ state: "needs_input", version: 4, cvRequested: true }] } as never)
    .mockResolvedValueOnce({ rows: [{ id: "attempt", state: "queued", version: 5 }] } as never);
  await expect(service.selectAttemptCv("user_owner", "attempt", { cvId: cv.id, version: 4 }))
    .resolves.toEqual({ id: "attempt", state: "queued", version: 5 });
  expect(load).toHaveBeenCalledWith("user_owner", cv.id);
  expect(query).toHaveBeenLastCalledWith(
    expect.stringContaining("attempt.version = $4 and attempt.question_cv"),
    ["attempt", "user_owner", toDatabaseUserId("user_owner"), 4, JSON.stringify(cv)],
  );
});

it("rejects a stale CV question before loading the CV", async () => {
  const load = jest.fn();
  const service = new AutoApplyController(
    {} as BillingService, { get: load } as unknown as CvEditorService,
    {} as AutoApplyWorker, {} as UploadsService,
  );
  jest.mocked(pool.query).mockResolvedValueOnce({
    rows: [{ state: "needs_input", version: 5, cvRequested: true }],
  } as never);
  await expect(service.selectAttemptCv("user_owner", "attempt", { cvId: "cv", version: 4 }))
    .rejects.toThrow("Refresh the application before choosing a CV.");
  expect(load).not.toHaveBeenCalled();
});

it("returns the stored state and version for an idempotent application start", async () => {
  const starter = new AutoApplyController(
    { getStatus: jest.fn().mockResolvedValue({ planTier: "none" }) } as unknown as BillingService,
    {} as CvEditorService, {} as AutoApplyWorker, {} as UploadsService,
  );
  const query = jest.mocked(pool.query);
  const stored = { id: "stored", state: "submitted", version: 9 };
  query.mockResolvedValueOnce({ rows: [{ id: stored.id }] } as never)
    .mockResolvedValueOnce({ rows: [stored] } as never);
  await expect(starter.start("user_learner", "application", {})).resolves.toEqual(stored);
  expect(query).toHaveBeenLastCalledWith(
    "select id, state, version from private.auto_apply_attempts where id = $1", ["stored"],
  );
});

it("suggests saved education and keeps contact details separate on first setup", async () => {
  const query = jest.mocked(pool.query);
  query.mockResolvedValueOnce({ rows: [] } as never).mockResolvedValueOnce({
    rows: [
      {
        school: "Example University",
        degree: "BSc",
        major: "Engineering",
        grad_year: 2027,
        skills: ["Research", null],
        interests: ["Community energy"],
        full_name: "Example Learner",
        email: "learner@example.test",
      },
    ],
  } as never);
  await expect(controller.profile("user_learner", "true")).resolves.toEqual({
    background: "",
    statement: "",
    version: 0,
    suggestedBackground:
      "School: Example University\nDegree: BSc\nField of study: Engineering\nGraduation year: 2027\nSkills: Research\nInterests: Community energy",
    suggestedExperience: "Skills: Research\nInterests: Community energy",
    contact: { name: "Example Learner", email: "learner@example.test", phone: "" },
    education: { school: "Example University", degree: "BSc", major: "Engineering", graduationYear: "2027" },
  });
  expect(query).toHaveBeenLastCalledWith(
    expect.stringContaining("from public.profiles"),
    ["user_learner", toDatabaseUserId("user_learner")],
  );
});

it("reuses the saved application profile without reading general profile data", async () => {
  const query = jest.mocked(pool.query);
  const before = query.mock.calls.length;
  const profile = { background: "", statement: "Saved statement", version: 3,
    education: { school: "Saved School", degree: "", major: "", graduationYear: "" } };
  query.mockResolvedValueOnce({
    rows: [
      {
        ...profile,
        contact_name: "Saved Learner",
        contact_email: "saved@example.test",
        contact_phone: "+1 202 555 0100",
      },
    ],
  } as never);
  await expect(controller.profile("user_learner", "true")).resolves.toEqual({
    ...profile,
    contact: { name: "Saved Learner", email: "saved@example.test", phone: "+1 202 555 0100" },
  });
  expect(query).toHaveBeenCalledTimes(before + 1);
});

it("keeps the empty profile response for older clients", async () => {
  const query = jest.mocked(pool.query);
  const before = query.mock.calls.length;
  query.mockResolvedValueOnce({ rows: [] } as never);
  await expect(controller.profile("user_learner")).resolves.toEqual({
    background: "",
    statement: "",
    version: 0,
  });
  expect(query).toHaveBeenCalledTimes(before + 1);
});

it("returns the older profile shape even after contact details are saved", async () => {
  const profile = { background: "Saved background", statement: "", version: 2 };
  jest.mocked(pool.query).mockResolvedValueOnce({
    rows: [
      {
        ...profile,
        contact_name: "Saved Learner",
        contact_email: "saved@example.test",
      },
    ],
  } as never);
  await expect(controller.profile("user_learner")).resolves.toEqual(profile);
});

const listing = "https://provider.example/apply?listing=2027";
it("blocks a non-enrolled learner's new start without closing an existing attempt", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    AUTO_APPLY_PROVIDER_PREPARE_URL: "https://provider.example/prepare",
    AUTO_APPLY_PROVIDER_SUBMIT_URL: "https://provider.example/submit",
    AUTO_APPLY_PROVIDER_CAPABILITIES_URL: "https://provider.example/capabilities",
    AUTO_APPLY_PROVIDER_VERIFY_URL: "https://provider.example/verify",
    AUTO_APPLY_PROVIDER_TOKEN: "fixture",
    AUTO_APPLY_PILOT_OPPORTUNITIES: "listing",
    AUTO_APPLY_PILOT_LEARNERS: "user_enrolled",
  };
  const query = jest.mocked(pool.query);
  const stored = { id: "existing", state: "needs_input", version: 4 };
  const getStatus = jest.fn();
  const supportsOpportunity = jest.fn().mockResolvedValue(true);
  const verifyOpportunityForm = jest.fn().mockResolvedValue(true);
  const service = new AutoApplyController(
    { getStatus } as unknown as BillingService, {} as CvEditorService,
    { supportsOpportunity, verifyOpportunityForm } as unknown as AutoApplyWorker, {} as UploadsService,
  );
  try {
    query.mockResolvedValueOnce({ rows: [{ blockReason: null, attempt: stored }] } as never);
    await expect(service.opportunity("user_other", "listing"))
      .resolves.toMatchObject({ available: false, attempt: stored });
    query.mockRejectedValueOnce(new Error("auto_apply_unavailable"));
    await expect(service.start("user_other", "new", {})).rejects.toThrow("unavailable");
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("private.start_auto_apply"),
      ["user_other", "new", "none", toDatabaseUserId("user_other"), [], null],
    );
    query.mockResolvedValueOnce({ rows: [{ id: stored.id }] } as never)
      .mockResolvedValueOnce({ rows: [stored] } as never);
    await expect(service.start("user_other", "existing", {})).resolves.toEqual(stored);
    expect(getStatus).not.toHaveBeenCalled();
    expect(supportsOpportunity).not.toHaveBeenCalled();
    jest.spyOn(service, "allowance").mockResolvedValue({ monthlyLimit: 3, used: 0 });
    query.mockResolvedValueOnce({ rows: [{ blockReason: null, attempt: null }] } as never)
      .mockResolvedValueOnce({ rows: [{ ready: true }] } as never);
    await expect(service.opportunity("user_enrolled", "listing"))
      .resolves.toMatchObject({ available: true, attempt: null, profileRequired: false });
    expect(supportsOpportunity).toHaveBeenCalledWith("listing", false, undefined, undefined);
    process.env.AUTO_APPLY_PILOT_LEARNERS = "";
    query.mockResolvedValueOnce({ rows: [{ blockReason: null, attempt: null }] } as never);
    await expect(service.opportunity("user_enrolled", "listing"))
      .resolves.toMatchObject({ available: false, attempt: null });
  } finally {
    process.env = originalEnv;
  }
});

it("hides Auto Apply when the read-only provider form check fails", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    AUTO_APPLY_PROVIDER_PREPARE_URL: "https://provider.example/prepare",
    AUTO_APPLY_PROVIDER_SUBMIT_URL: "https://provider.example/submit",
    AUTO_APPLY_PROVIDER_VERIFY_URL: "https://provider.example/verify",
    AUTO_APPLY_PROVIDER_TOKEN: "fixture",
    AUTO_APPLY_PILOT_OPPORTUNITIES: "listing",
  };
  const supportsOpportunity = jest.fn().mockResolvedValue(true);
  const verifyOpportunityForm = jest.fn().mockResolvedValue(false);
  const allowance = jest.spyOn(AutoApplyController.prototype, "allowance");
  const service = new AutoApplyController(
    { getStatus: jest.fn() } as unknown as BillingService,
    {} as CvEditorService,
    { supportsOpportunity, verifyOpportunityForm } as unknown as AutoApplyWorker,
    {} as UploadsService,
  );
  jest.mocked(pool.query).mockResolvedValueOnce({ rows: [{
    blockReason: null,
    attempt: null,
    catalogUrl: "https://catalog.example/application",
    fallbackCatalogUrl: null,
  }] } as never);
  try {
    await expect(service.opportunity("owner", "listing")).resolves.toMatchObject({
      available: false,
      providerUnavailable: true,
      allowance: null,
    });
    expect(supportsOpportunity).toHaveBeenCalledWith(
      "listing", false, "https://catalog.example/application", null,
    );
    expect(verifyOpportunityForm).toHaveBeenCalledWith(
      "listing", "https://catalog.example/application", null,
    );
    expect(allowance).not.toHaveBeenCalled();
  } finally {
    allowance.mockRestore();
    process.env = originalEnv;
  }
});

it("fails closed when a new provider has no verification endpoint", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    AUTO_APPLY_PROVIDER_PREPARE_URL: "https://provider.example/prepare",
    AUTO_APPLY_PROVIDER_SUBMIT_URL: "https://provider.example/submit",
    AUTO_APPLY_PROVIDER_CAPABILITIES_URL: "https://provider.example/capabilities",
    AUTO_APPLY_PROVIDER_TOKEN: "fixture",
    AUTO_APPLY_PILOT_OPPORTUNITIES: "listing",
  };
  delete process.env.AUTO_APPLY_PROVIDER_VERIFY_URL;
  const supportsOpportunity = jest.fn().mockResolvedValue(true);
  const verifyOpportunityForm = jest.fn();
  const service = new AutoApplyController(
    { getStatus: jest.fn() } as unknown as BillingService,
    {} as CvEditorService,
    { supportsOpportunity, verifyOpportunityForm } as unknown as AutoApplyWorker,
    {} as UploadsService,
  );
  jest.mocked(pool.query).mockResolvedValueOnce({ rows: [{
    blockReason: null,
    attempt: null,
    catalogUrl: "https://catalog.example/application",
    fallbackCatalogUrl: null,
  }] } as never);
  try {
    await expect(service.opportunity("owner", "listing")).resolves.toMatchObject({
      available: false,
      providerUnavailable: true,
      allowance: null,
    });
    expect(supportsOpportunity).toHaveBeenCalledTimes(1);
    expect(verifyOpportunityForm).not.toHaveBeenCalled();
  } finally {
    process.env = originalEnv;
  }
});

it("returns an existing attempt when the opportunity has closed", async () => {
  const attempt = { id: "attempt", state: "failed", version: 7 };
  jest.mocked(pool.query).mockResolvedValueOnce({
    rows: [{ blockReason: "opportunity_closed", attempt }],
  } as never);
  await expect(controller.opportunity("owner", "listing")).resolves.toEqual({
    available: false,
    attempt,
    profileRequired: false,
    allowance: null,
  });
});

it("reports an applicant-only portal without offering an Auto Apply attempt", async () => {
  jest.mocked(pool.query).mockResolvedValueOnce({
    rows: [{ blockReason: "applicant_only", attempt: null }],
  } as never);
  await expect(controller.opportunity("owner", "listing")).resolves.toEqual({
    available: false,
    applicantOnly: true,
    attempt: null,
    profileRequired: false,
    allowance: null,
  });
});

it.each([
  [
    "https://careers.chevron.com/job/lekki/nma-undergraduate-internship-jan-2027/38138/103152674816",
    "workday_sign_in",
  ],
  ["https://forms.office.com/e/QFZfqEZvWR", "itu_provider_form"],
])("returns manual guidance for the verified provider listing %s", async (catalogUrl, manualApplication) => {
  const query = jest.spyOn(pool, "query");
  const before = query.mock.calls.length;
  query.mockResolvedValueOnce({
    rows: [{ blockReason: null, attempt: null, catalogUrl }],
  } as never);
  await expect(controller.opportunity("owner", "manual-listing")).resolves.toMatchObject({
    available: false,
    attempt: null,
    allowance: null,
    manualApplication,
  });
  expect(query).toHaveBeenCalledTimes(before + 1);
});

it("does not show ITU guidance for a different Microsoft Forms listing", async () => {
  jest.spyOn(pool, "query").mockResolvedValueOnce({
    rows: [{ blockReason: null, attempt: null, catalogUrl: "https://forms.office.com/e/different" }],
  } as never);
  await expect(controller.opportunity("owner", "manual-listing")).resolves.not.toHaveProperty("manualApplication");
});

it.each([
  [
    "https://provider.example/documents#references",
    "https://provider.example/documents#references",
    true,
  ],
  ["https://other.example/documents#references", listing, false],
  ["https://provider.example/documents?session=fixture", listing, false],
  [null, listing, false],
])(
  "returns a same-origin provider step or falls back to the listing (%s)",
  async (handoffStepUrl, handoffUrl, exactHandoff) => {
    jest.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          providerUrl: listing,
          fallbackProviderUrl: "https://aggregator.example/published-listing",
          handoffStepUrl,
          handoffRequired: true,
          state: "needs_input",
        },
      ],
    } as never);
    const result = await controller.attempt("owner", "attempt");
    expect(result).toMatchObject({ handoffUrl, exactHandoff });
    expect(result).not.toHaveProperty("handoffStepUrl");
  },
);

it.each([true, false])("uses an approved cross-origin step only while its catalog link matches (%s)", async (matches) => {
  const step = "https://forms.example/documents#references";
  const current = matches ? listing + "#details" : listing + "?cycle=changed";
  jest.mocked(pool.query).mockResolvedValueOnce({ rows: [{
    state: "needs_input", handoffRequired: true, providerUrl: current,
    handoffStepUrl: step, handoffCatalogFingerprint: createHash("sha256").update(listing).digest("hex"),
  }] } as never);
  const result = await controller.attempt("owner", "attempt");
  expect(result).toMatchObject({ handoffUrl: matches ? step : current, exactHandoff: matches });
  expect(result).not.toHaveProperty("handoffCatalogFingerprint");
});

it.each([
  ["failed", null, listing],
  ["failed", "opportunity_closed", null],
  ["unconfirmed", null, listing],
  ["unconfirmed", "opportunity_closed", listing],
  ["submitted", null, null],
])("offers the listing for a changed open form or pending confirmation (%s, %s)", async (state, blockReason, handoffUrl) => {
  jest.mocked(pool.query).mockResolvedValueOnce({
    rows: [{
      state, blockReason, applicationIsDraft: true, hasMapping: true, failureReason: "mapping_changed",
      providerUrl: listing, handoffStepUrl: "https://provider.example/stale-step",
      handoffRequired: state === "unconfirmed",
    }],
  } as never);
  const result = await controller.attempt("owner", "attempt");
  expect(result).toMatchObject({ handoffUrl, exactHandoff: false });
  if (state === "unconfirmed") expect(result).toMatchObject({ canSubmit: false, canRetry: false });
});

it("returns imported text for the learner to review", async () => {
  await expect(
    controller.importStatement({
      buffer: Buffer.from("  I study engineering.  "),
      mimetype: "text/plain",
    }),
  ).resolves.toEqual({ statement: "I study engineering." });
});

it("rejects unsupported types and text exceeding the profile limit", async () => {
  await expect(
    controller.importStatement({
      buffer: Buffer.from("file"),
      mimetype: "image/png",
    }),
  ).rejects.toBeInstanceOf(BadRequestException);
  await expect(
    controller.importStatement({
      buffer: Buffer.from("a".repeat(16001)),
      mimetype: "text/plain",
    }),
  ).rejects.toBeInstanceOf(UnprocessableEntityException);
});

it("accepts a multipart statement and enforces the transport size limit", async () => {
  const module = await Test.createTestingModule({
    controllers: [AutoApplyController],
    providers: [
      { provide: BillingService, useValue: {} },
      { provide: CvEditorService, useValue: {} },
      { provide: AutoApplyWorker, useValue: {} },
      { provide: UploadsService, useValue: {} },
    ],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  try {
    const url = "/me/auto-apply/profile/statement-import";
    await request(app.getHttpServer())
      .post(url)
      .attach("file", Buffer.from("My statement"), {
        filename: "statement.txt",
        contentType: "text/plain",
      })
      .expect(201, { statement: "My statement" });
    await request(app.getHttpServer())
      .post(url)
      .attach("file", Buffer.alloc(2 * 1024 * 1024 + 1), {
        filename: "statement.txt",
        contentType: "text/plain",
      })
      .expect(413);
  } finally {
    await app.close();
  }
});
