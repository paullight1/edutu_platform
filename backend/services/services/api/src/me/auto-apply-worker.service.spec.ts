import type { AiService } from "../ai";
import { pool } from "../db";
import { UploadsService } from "../uploads/uploads.service";
import { AutoApplyWorker } from "./auto-apply-worker.service";
import { createHash } from "node:crypto";

jest.mock("../db", () => ({ pool: { query: jest.fn() } }));
const query = jest.mocked(pool.query);
const mappingRevision = "a".repeat(64);
const destinationHost = "provider.example";
const ai = { generateJson: jest.fn() };
const worker = () =>
  new AutoApplyWorker(ai as unknown as AiService, {} as UploadsService);

describe("AutoApplyWorker", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = {
      ...env,
      AUTO_APPLY_PILOT_OPPORTUNITIES: "pilot",
      AUTO_APPLY_PROVIDER_PREPARE_URL: "https://provider.example/prepare",
      AUTO_APPLY_PROVIDER_TOKEN: "test-token",
    };
    query.mockReset();
    ai.generateJson.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = env;
  });

  it("gives submission and preparation one sequential turn on each scheduler tick", async () => {
    const service = worker();
    let finishSubmission!: () => void;
    const submission = new Promise<void>(resolve => { finishSubmission = resolve; });
    const submit = jest.spyOn(service, "submitApproved").mockReturnValueOnce(submission).mockResolvedValue(undefined);
    const prepare = jest.spyOn(service, "process").mockResolvedValue(undefined);

    const active = service.runScheduledBatch();
    await service.runScheduledBatch();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
    finishSubmission();
    await active;
    expect(prepare).toHaveBeenCalledTimes(1);

    submit.mockRejectedValueOnce(new Error("Synthetic submission query failure"));
    await service.runScheduledBatch();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("caches the provider capability for browsing and rechecks before starting", async () => {
    process.env.AUTO_APPLY_PROVIDER_CAPABILITIES_URL =
      "https://provider.example/capabilities/";
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        Response.json({ status: "ready", opportunityId: "pilot" }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const service = worker();
    await expect(service.supportsOpportunity("pilot")).resolves.toBe(true);
    await expect(service.supportsOpportunity("pilot")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(service.supportsOpportunity("pilot", true)).resolves.toBe(
      false,
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://provider.example/capabilities/pilot",
      expect.objectContaining({
        redirect: "error",
        headers: { Authorization: "Bearer test-token" },
      }),
    );
  });

  it("compares each catalog link even when the provider capability is cached", async () => {
    process.env.AUTO_APPLY_PROVIDER_CAPABILITIES_URL = "https://provider.example/capabilities";
    const approved = "https://catalog.example/application?cycle=2027";
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(Response.json({
      status: "ready", opportunityId: "pilot",
      catalogFingerprint: createHash("sha256").update(approved).digest("hex"),
    }));
    const service = worker();
    await expect(service.supportsOpportunity("pilot", false, approved + "#details")).resolves.toBe(true);
    await expect(service.supportsOpportunity("pilot", false, "https://catalog.example/application?cycle=2028")).resolves.toBe(false);
    await expect(service.supportsOpportunity("pilot", false, undefined, approved)).resolves.toBe(true);
    await expect(service.supportsOpportunity("pilot")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a verified form or a bound learner handoff and rejects stale preflight results", async () => {
    process.env.AUTO_APPLY_PROVIDER_VERIFY_URL = "https://provider.example/verify/";
    const catalogUrl = "https://catalog.example/apply";
    const catalogFingerprint = createHash("sha256").update(catalogUrl).digest("hex");
    const fetchMock = jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(Response.json({ status: "verified", opportunityId: "pilot", mappingRevision, catalogFingerprint }))
      .mockResolvedValueOnce(Response.json({ code: "provider_handoff", opportunityId: "pilot", catalogFingerprint }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ code: "provider_handoff", opportunityId: "pilot", catalogFingerprint }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ code: "mapping_changed" }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ code: "provider_busy" }, { status: 503 }));
    const service = worker();

    await expect(service.verifyOpportunityForm("pilot", catalogUrl, null, true)).resolves.toBe(true);
    await expect(service.verifyOpportunityForm("pilot", catalogUrl, null, true)).resolves.toBe(true);
    await expect(service.verifyOpportunityForm("pilot", catalogUrl + "?changed=1", null)).resolves.toBe(false);
    await expect(service.verifyOpportunityForm("pilot", catalogUrl, null, true)).resolves.toBe(false);
    await expect(service.verifyOpportunityForm("pilot", catalogUrl, null, true)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("https://provider.example/verify/pilot", expect.objectContaining({
      redirect: "error", headers: { Authorization: "Bearer test-token" },
    }));
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("body");
    process.env.AUTO_APPLY_PROVIDER_VERIFY_URL = "https://other.example/verify";
    await expect(service.verifyOpportunityForm("pilot", catalogUrl, null)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("fails closed without verification and requires a catalog binding before a fresh start", async () => {
    const service = worker();
    delete process.env.AUTO_APPLY_PROVIDER_VERIFY_URL;
    await expect(service.verifyOpportunityForm("pilot", "https://catalog.example/apply", null)).resolves.toBe(false);

    process.env.AUTO_APPLY_PROVIDER_VERIFY_URL = "https://provider.example/verify";
    jest.spyOn(global, "fetch").mockResolvedValue(Response.json({
      status: "verified", opportunityId: "pilot", mappingRevision,
    }));
    await expect(service.verifyOpportunityForm("pilot", "https://catalog.example/apply", null)).resolves.toBe(false);
    await expect(service.verifyOpportunityForm("pilot", "https://catalog.example/apply", null, true)).resolves.toBe(false);
  });

  it("shares an in-flight bound check between discovery and start without caching a provider outage", async () => {
    process.env.AUTO_APPLY_PROVIDER_VERIFY_URL = "https://provider.example/verify";
    const catalogUrl = "https://catalog.example/apply";
    const catalogFingerprint = createHash("sha256").update(catalogUrl).digest("hex");
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { finish = resolve; });
    const fetchMock = jest.spyOn(global, "fetch").mockReturnValueOnce(pending)
      .mockResolvedValueOnce(Response.json({ status: "verified", opportunityId: "pilot", mappingRevision, catalogFingerprint }));
    const service = worker();
    const discovery = service.verifyOpportunityForm("pilot", catalogUrl, null);
    const start = service.verifyOpportunityForm("pilot", catalogUrl, null, true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(Response.json({ code: "provider_busy" }, { status: 503 }));
    await expect(Promise.all([discovery, start])).resolves.toEqual([false, false]);
    await expect(service.verifyOpportunityForm("pilot", catalogUrl, null)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resumes with stored answers and saves the new review using the claimed version", async () => {
    const answers = { "2": { question: "Field of study?", answer: "Physics" } };
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "attempt",
          version: 4,
          answers,
          contactName: "Example Learner",
          contactEmail: "learner@example.test",
          contactPhone: "+234 800 555 0100",
        },
      ],
    } as never);
    query.mockResolvedValueOnce({ rows: [] } as never);
    const fields = [
      {
        label: "Field of study",
        providerLabel: "Current degree subject",
        value: "Physics",
        choices: ["Physics", "Engineering"],
      },
      {
        label: "CV attachment",
        value: "Example CV text",
        attachment: { type: "pdf", sourceName: "Academic CV" },
      },
    ];
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          state: "needs_review",
          fields,
          mappingRevision,
          destinationHost,
        }),
      ),
    );
    await worker().process();
    expect(
      JSON.parse(fetchMock.mock.calls[0]![1]!.body as string),
    ).toMatchObject({
      answers,
      contact: { name: "Example Learner", email: "learner@example.test", phone: "+234 800 555 0100" },
    });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("version = $2"),
      [
        "attempt",
        4,
        "needs_review",
        null,
        JSON.stringify(fields),
        mappingRevision,
        destinationHost,
        null,
        false,
        null,
        false,
        false,
        null,
        false,
        null,
        null,
        null,
        false,
        false,
      ],
    );
  });

  it("leaves the queue alone without a configured HTTPS endpoint", async () => {
    process.env.AUTO_APPLY_PROVIDER_PREPARE_URL =
      "http://provider.example/prepare";
    await worker().process();
    expect(query).not.toHaveBeenCalled();
  });
  it("defers preparation when the adapter reports capacity contention", async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: "attempt", version: 4 }],
    } as never);
    query.mockResolvedValueOnce({ rows: [] } as never);
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        Response.json({ code: "provider_busy" }, { status: 503 }),
      );

    await worker().process();

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("attempt.provider_retry_after <= now()"),
      [["pilot"]],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("provider_busy_retries < 4"),
      ["attempt", 4, "running", "provider_busy"],
    );
  });

  it.each([408, 429, 502, 503, 504, null])(
    "defers a temporary preparation failure (%s)",
    async (status) => {
      query.mockResolvedValueOnce({
        rows: [{ id: "attempt", version: 4 }],
      } as never);
      query.mockResolvedValueOnce({ rows: [] } as never);
      const request = jest.spyOn(global, "fetch");
      if (status) request.mockResolvedValue(Response.json({}, { status }));
      else
        request.mockRejectedValue(new TypeError("fixture connection failed"));

      await worker().process();

      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("provider_retry_after"),
        ["attempt", 4, "running", "provider_unavailable"],
      );
      expect(ai.generateJson).not.toHaveBeenCalled();
    },
  );

  it("ends preparation on an unavailable mapping without scheduling another attempt", async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: "attempt", version: 4 }],
    } as never);
    query.mockResolvedValueOnce({ rows: [] } as never);
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(Response.json({}, { status: 404 }));

    await worker().process();

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("set state = $3"),
      [
        "attempt",
        4,
        "failed",
        null,
        null,
        null,
        null,
        null,
        false,
        null,
        false,
        false,
        null,
        false,
        null,
        null,
        null,
        false,
        false,
      ],
    );
  });

  it("records a changed form during preparation so the learner can continue on the portal", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "attempt", version: 4 }] } as never);
    query.mockResolvedValueOnce({ rows: [] } as never);
    jest.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ code: "mapping_changed" }, { status: 409 }),
    );
    await worker().process();
    expect(query).toHaveBeenNthCalledWith(
      2, expect.stringContaining("failure_reason = 'mapping_changed'"),
      ["attempt", 4, "running"],
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("stores a CV request for the existing attempt", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "attempt", version: 4 }] } as never);
    query.mockResolvedValueOnce({ rows: [] } as never);
    jest.spyOn(global, "fetch").mockResolvedValue(Response.json({
      state: "needs_input", question: "Choose your CV.", cvRequested: true,
    }));
    await worker().process();
    expect(query).toHaveBeenNthCalledWith(
      2, expect.stringContaining("question_cv = $12"),
      ["attempt", 4, "needs_input", "Choose your CV.", null, null, null, null, false, null, false, true, null, false, null, null, null, false, false],
    );
  });

  it("stops before contacting the provider when a reviewed PDF has changed", async () => {
    process.env.AUTO_APPLY_PROVIDER_SUBMIT_URL =
      "https://provider.example/submit";
    const document = {
      uploadId: "id",
      name: "letter.pdf",
      sha256: "a".repeat(64),
    };
    const uploads = {
      getApplicationPdf: jest.fn(async () => ({
        ...document,
        sha256: "b".repeat(64),
      })),
    };
    query
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "attempt",
            version: 9,
            ownerId: "learner",
            document,
            fields: [
              {
                label: "Letter",
                value: "letter.pdf",
                attachment: { uploadId: "id" },
              },
            ],
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const request = jest.spyOn(global, "fetch");

    await new AutoApplyWorker(
      ai as unknown as AiService,
      uploads as unknown as UploadsService,
    ).submitApproved();

    expect(request).not.toHaveBeenCalled();
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("failure_reason = $3"),
      ["attempt", 9, "attachment_changed"],
    );
  });

  it("stops before contacting the provider when the approved PDFs exceed 10 MiB together", async () => {
    process.env.AUTO_APPLY_PROVIDER_SUBMIT_URL = "https://provider.example/submit";
    const bytes = Buffer.alloc(6 * 1024 * 1024);
    const sha256 = "a".repeat(64);
    const documents = {
      Letter: { uploadId: "letter", question: "Letter", name: "letter.pdf", sha256 },
      Transcript: { uploadId: "transcript", question: "Transcript", name: "transcript.pdf", sha256 },
    };
    const uploads = {
      getApplicationPdf: jest.fn(async (_owner: string, id: string) => ({ name: id + ".pdf", sha256, bytes })),
    };
    query
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{
        id: "attempt",
        version: 9,
        ownerId: "learner",
        documents,
        fields: Object.values(documents).map(({ uploadId, name, question }) => ({
          value: name,
          attachment: { uploadId, question },
        })),
      }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const request = jest.spyOn(global, "fetch");

    await new AutoApplyWorker(
      ai as unknown as AiService,
      uploads as unknown as UploadsService,
    ).submitApproved();

    expect(request).not.toHaveBeenCalled();
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("failure_reason = $3"),
      ["attempt", 9, "attachment_size_limit"],
    );
  });

  it.each([
    ["https://catalog.example/apply?year=2027#details", true],
    ["https://catalog.example/apply?year=2028", false],
  ])(
    "rechecks the catalog link after reading the approved PDF (%s)", async (liveUrl, matches) => {
      process.env.AUTO_APPLY_PROVIDER_SUBMIT_URL = "https://provider.example/submit";
      const approvedUrl = "https://catalog.example/apply?year=2027";
      const document = { uploadId: "id", name: "letter.pdf", sha256: "a".repeat(64), question: "Choose your letter." };
      const upload = { ...document, bytes: Buffer.from("%PDF-1.4") };
      const uploads = { getApplicationPdf: jest.fn(async () => upload) };
      query.mockResolvedValueOnce({ rows: [] } as never)
        .mockResolvedValueOnce({ rows: [{
          id: "attempt", version: 9, opportunityId: "pilot", ownerId: "learner", document,
          catalogUrl: approvedUrl, fallbackCatalogUrl: null, mappingRevision,
          fields: [{ label: "Letter", value: document.name, attachment: { uploadId: document.uploadId } }],
        }] } as never)
        .mockResolvedValueOnce({ rows: [{ catalogUrl: liveUrl, fallbackCatalogUrl: null }] } as never)
        .mockResolvedValueOnce({ rows: [] } as never);
      const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(Response.json({ receipt: "APPROVED" }));
      await new AutoApplyWorker(ai as unknown as AiService, uploads as unknown as UploadsService).submitApproved();
      expect(uploads.getApplicationPdf).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining("lease_until > now()"), ["attempt", 9]);
      if (matches) {
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const sent = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
        expect(sent.document.base64).toBe(upload.bytes.toString("base64"));
        expect(sent.catalogFingerprint).toBe(createHash("sha256").update(approvedUrl).digest("hex"));
      } else {
        expect(fetchMock).not.toHaveBeenCalled();
        expect(query).toHaveBeenNthCalledWith(
          4, expect.stringContaining("failure_reason = 'mapping_changed'"), ["attempt", 9, "submitting"],
        );
      }
    },
  );

  it.each(["provider_busy", "upstream_unavailable"])(
    "preserves the approved version only on a confirmed preflight rejection (%s)",
    async (code) => {
      process.env.AUTO_APPLY_PROVIDER_SUBMIT_URL =
        "https://provider.example/submit";
      query.mockResolvedValueOnce({ rows: [] } as never);
      query.mockResolvedValueOnce({
        rows: [{ id: "attempt", version: 9, fields: [] }],
      } as never);
      query.mockResolvedValueOnce({ rows: [{ catalogUrl: null, fallbackCatalogUrl: null }] } as never);
      query.mockResolvedValueOnce({ rows: [] } as never);
      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(Response.json({ code }, { status: 503 }));

      await worker().submitApproved();

      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("attempt.provider_retry_after <= now()"),
        [["pilot"]],
      );
      if (code === "provider_busy") {
        expect(query).toHaveBeenNthCalledWith(
          4,
          expect.stringContaining("then version + 1 else version end"),
          ["attempt", 9, "submitting", "provider_busy"],
        );
      } else {
        expect(query).toHaveBeenNthCalledWith(
          4,
          expect.stringContaining("provider_receipt = $3"),
          ["attempt", 9, null, "submitting"],
        );
      }
    },
  );
  it.each(["PROVIDER-001", null])(
    "records the receipt (%s) or leaves submission unconfirmed",
    async (receipt) => {
      process.env.AUTO_APPLY_PROVIDER_SUBMIT_URL =
        "https://provider.example/submit";
      const job = {
        id: "attempt",
        version: 9,
        opportunityId: "pilot",
        fields: [
          {
            label: "Field of study",
            value: "Physics",
            choices: ["Physics", "Engineering"],
          },
        ],
      };
      query.mockResolvedValueOnce({ rows: [] } as never);
      query.mockResolvedValueOnce({ rows: [job] } as never);
      query.mockResolvedValueOnce({ rows: [{ catalogUrl: null, fallbackCatalogUrl: null }] } as never);
      query.mockResolvedValueOnce({ rows: [] } as never);
      const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify(receipt ? { receipt } : {}), {
          status: receipt ? 200 : 504,
        }),
      );

      await worker().submitApproved();

      expect(fetchMock).toHaveBeenCalledWith(
        "https://provider.example/submit",
        expect.objectContaining({
          body: JSON.stringify({
            ...job,
            fields: [{ label: "Field of study", value: "Physics" }],
          }),
          headers: expect.objectContaining({ "Idempotency-Key": job.id }),
        }),
      );
      expect(query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("lease_until <= now()"),
      );
      expect(query).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining("provider_receipt = $3"),
        [job.id, job.version, receipt, "submitting"],
      );
    },
  );
  it("drafts a missing statement from saved facts and forwards it for review", async () => {
    const job = {
      id: "attempt",
      version: 4,
      opportunityId: "pilot",
      ownerId: "learner",
      opportunityTitle: "Research scholarship",
      opportunityOrganization: "Example Field Lab",
      opportunityDescription:
        "A field research placement focused on water quality.",
      background: "",
      education: { school: "Edutu School", degree: "BSc", major: "Physics", graduationYear: "2027" },
      statement: "",
      draftedStatement: null,
      contactEmail: "private-contact@example.test",
      cv: {
        id: "cv-id",
        name: "Academic CV",
        data: {
          header: { email: "private-cv@example.test", phone: "5551234" },
          education: [{ field: "Physics", institution: "Example University" }],
          projects: [
            {
              name: "Water sample analysis",
              url: "https://private.example/path",
            },
          ],
          references: [{ name: "Private reference" }],
        },
      },
      answers: {
        1: { question: "What topic interests you?", answer: "Older topic" },
        2: { question: "What topic interests you?", answer: "Student access to rural broadband" },
        3: { question: "What is your identification number?", answer: "ID-DO-NOT-INCLUDE" },
      },
    };
    query.mockResolvedValueOnce({ rows: [job] } as never);
    query.mockResolvedValueOnce({ rowCount: 1 } as never);
    query.mockResolvedValueOnce({ rows: [] } as never);
    const statement = "My studies in Physics motivated me to apply.";
    ai.generateJson.mockResolvedValueOnce({ statement });
    const fields = [{ label: "Statement of purpose", value: statement }];
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            state: "needs_input",
            question: "Tell us why you are applying.",
            draftStatement: true,
            statementMaxLength: 180,
            statementContextQuestions: ["What topic interests you?"],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            state: "needs_review",
            fields,
            mappingRevision,
            destinationHost,
          }),
        ),
      );

    await worker().process();

    expect(ai.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "docs.sop",
        userId: "learner",
        sensitiveContent: true,
        systemInstructionMode: "replace",
        systemInstruction: expect.stringContaining("180 characters"),
        prompt: expect.stringContaining(job.education.school),
      }),
    );
    const prompt = ai.generateJson.mock.calls[0]![0].prompt as string;
    expect(prompt).toContain(job.opportunityDescription);
    expect(prompt).toContain(job.opportunityOrganization);
    expect(prompt).toContain("Water sample analysis");
    expect(prompt).toContain("Student access to rural broadband");
    expect(prompt).not.toMatch(/Older topic|ID-DO-NOT-INCLUDE/);
    expect(prompt).not.toMatch(/private|5551234|cv-id/i);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("set answers = answers ||"),
      ["attempt", 4, JSON.stringify({ question: "Tell us why you are applying.", answer: statement, generatedByAi: true })],
    );
    const forwarded = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string);
    expect(forwarded.statement).toBe("");
    expect(forwarded.answers[4]).toEqual({ question: "Tell us why you are applying.", answer: statement, generatedByAi: true });
    expect(forwarded.education).toEqual(job.education);
    expect(forwarded).not.toHaveProperty("ownerId");
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("version = $2"),
      [
        "attempt",
        4,
        "needs_review",
        null,
        JSON.stringify(fields),
        mappingRevision,
        destinationHost,
        null,
        false,
        null,
        false,
        false,
        null,
        false,
        null,
        null,
        null,
        false,
        false,
      ],
    );
  });

  it.each([
    { statement: null },
    { statement: " " },
    { text: "Malformed draft" },
    { statement: "🙂".repeat(91) },
    new Error("AI provider unavailable"),
  ])(
    "preserves the manual statement question when the model has no usable draft",
    async (result) => {
      const question = "Tell us why you are applying.";
      query.mockResolvedValueOnce({
        rows: [
          {
            id: "attempt",
            version: 4,
            opportunityId: "pilot",
            ownerId: "learner",
            background: "",
            statement: "",
            draftedStatement: null,
            cv: { data: { summary: "I studied Physics." } },
            answers: {},
          },
        ],
      } as never);
      query.mockResolvedValueOnce({ rows: [] } as never);
      if (result instanceof Error)
        ai.generateJson.mockRejectedValueOnce(result);
      else ai.generateJson.mockResolvedValueOnce(result);
      const prepare = jest.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            state: "needs_input",
            question,
            draftStatement: true,
            statementMaxLength: 180,
          }),
        ),
      );

      await worker().process();

      expect(ai.generateJson).toHaveBeenCalledTimes(1);
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledTimes(2);
      expect(query).toHaveBeenLastCalledWith(
        expect.stringContaining("lease_until = null"),
        [
          "attempt",
          4,
          "needs_input",
          question,
          null,
          null,
          null,
          null,
          false,
          null,
          false,
          false,
          180,
          true,
          null,
          null,
          null,
          false,
          result instanceof Error,
        ],
      );
    },
  );
  it.each([true, false])(
    "only reads the existing provider receipt during reconciliation (%s)",
    async (found) => {
      delete process.env.AUTO_APPLY_PILOT_OPPORTUNITIES;
      process.env.AUTO_APPLY_PROVIDER_CAPABILITIES_URL = "https://other.example/capabilities";
      process.env.AUTO_APPLY_PROVIDER_RECEIPT_URL =
        "https://provider.example/receipt";
      query.mockResolvedValueOnce({
        rows: [{ application_id: "tracker" }],
      } as never);
      const fetchMock = jest
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify(found ? { receipt: "RECOVERED-1" } : {}),
            { status: found ? 200 : 404 },
          ),
        );
      await expect(worker().reconcileReceipt("attempt", 7)).resolves.toBe(
        found,
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://provider.example/receipt/attempt",
        expect.objectContaining({ method: "GET" }),
      );
      if (found)
        expect(query).toHaveBeenCalledWith(
          expect.stringContaining("receipt_check_after"),
          ["attempt", 7, "RECOVERED-1", "unconfirmed"],
        );
      else expect(query).not.toHaveBeenCalled();
    },
  );
  it("recovers expired dispatched work and checks due receipts after the pilot is disabled", async () => {
    delete process.env.AUTO_APPLY_PILOT_OPPORTUNITIES;
    process.env.AUTO_APPLY_PROVIDER_RECEIPT_URL = "https://provider.example/receipt";
    query.mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "attempt", version: 7 }] } as never)
      .mockResolvedValueOnce({ rows: [{ application_id: "tracker" }] } as never);
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(Response.json({ receipt: "RESTORED-1" }));
    await worker().reconcileUnconfirmed();
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("lease_until <= now()"));
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("receipt_check_after <= now()"));
    expect(fetchMock).toHaveBeenCalledWith("https://provider.example/receipt/attempt", expect.objectContaining({ method: "GET" }));
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining("provider_receipt = $3"),
      ["attempt", 7, "RESTORED-1", "unconfirmed"]);
  });
  it("requires a fresh review when the provider rejects the old mapping before submission", async () => {
    process.env.AUTO_APPLY_PROVIDER_SUBMIT_URL =
      "https://provider.example/submit";
    query.mockResolvedValueOnce({ rows: [] } as never);
    query.mockResolvedValueOnce({
      rows: [{ id: "attempt", version: 9, mappingRevision, fields: [] }],
    } as never);
    query.mockResolvedValueOnce({ rows: [{ catalogUrl: null, fallbackCatalogUrl: null }] } as never);
    query.mockResolvedValueOnce({ rows: [] } as never);
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "mapping_changed" }), {
        status: 409,
      }),
    );
    await worker().submitApproved();
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("failure_reason = 'mapping_changed'"),
      ["attempt", 9, "submitting"],
    );
    expect(query).toHaveBeenCalledTimes(4);
  });
  it.each([
    ["https://provider.example/check#identity", "https://provider.example/check#identity"],
    ["https://provider.example/check?session=private", null],
  ])("pauses an approved attempt for a verified pre-submit handoff (%s)", async (url, savedUrl) => {
    process.env.AUTO_APPLY_PROVIDER_SUBMIT_URL = "https://provider.example/submit";
    query.mockResolvedValueOnce({ rows: [] } as never);
    query.mockResolvedValueOnce({ rows: [{ id: "attempt", version: 9, mappingRevision, fields: [] }] } as never);
    query.mockResolvedValueOnce({ rows: [{ catalogUrl: null, fallbackCatalogUrl: null }] } as never);
    query.mockResolvedValueOnce({ rows: [] } as never);
    const question = "Complete the security check on the provider’s website.";
    jest.spyOn(global, "fetch").mockResolvedValueOnce(Response.json({
      code: "provider_handoff", question, handoffUrl: url,
    }, { status: 409 }));

    await worker().submitApproved();

    expect(query).toHaveBeenNthCalledWith(4, expect.stringContaining("handoff_required = true, handoff_step_url = $4"),
      ["attempt", 9, question, savedUrl, null]);
    expect(query).toHaveBeenCalledTimes(4);
  });
  it.each([true, false])("records a cross-origin handoff only for the matching catalog binding (%s)", async (matches) => {
    const catalogUrl = "https://listing.example/opportunity";
    const fingerprint = createHash("sha256").update(catalogUrl).digest("hex");
    const handoffUrl = "https://forms.example/verify#documents";
    query.mockResolvedValueOnce({ rows: [{ id: "attempt", version: 4, catalogUrl }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    jest.spyOn(global, "fetch").mockResolvedValueOnce(Response.json({
      state: "needs_input", handoffRequired: true, question: "Complete verification.", handoffUrl,
      handoffCatalogFingerprint: matches ? fingerprint : "a".repeat(64),
    }));
    await worker().process();
    const [, params] = query.mock.calls[1]!;
    expect(params?.[9]).toBe(matches ? handoffUrl : null);
    expect(params?.[14]).toBe(matches ? fingerprint : null);
  });
  it("leaves an incomplete handoff response unconfirmed", async () => {
    process.env.AUTO_APPLY_PROVIDER_SUBMIT_URL = "https://provider.example/submit";
    query.mockResolvedValueOnce({ rows: [] } as never);
    query.mockResolvedValueOnce({ rows: [{ id: "attempt", version: 9, fields: [] }] } as never);
    query.mockResolvedValueOnce({ rows: [{ catalogUrl: null, fallbackCatalogUrl: null }] } as never);
    query.mockResolvedValueOnce({ rows: [] } as never);
    jest.spyOn(global, "fetch").mockResolvedValueOnce(Response.json({ code: "provider_handoff" }, { status: 409 }));

    await worker().submitApproved();

    expect(query).toHaveBeenNthCalledWith(4, expect.stringContaining("provider_receipt = $3"),
      ["attempt", 9, null, "submitting"]);
  });
  it("persists allowed provider choices with the pending question", async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: "attempt", version: 4, background: "Physics" }],
    } as never);
    query.mockResolvedValueOnce({ rows: [] } as never);
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          state: "needs_input",
          question: "Field of study?",
          choices: ["Physics", "Engineering"],
        }),
      ),
    );
    await worker().process();
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("question_choices"),
      [
        "attempt",
        4,
        "needs_input",
        "Field of study?",
        null,
        null,
        null,
        '["Physics","Engineering"]',
        false,
        null,
        false,
        false,
        null,
        false,
        null,
        null,
        null,
        false,
        false,
      ],
    );
  });
  it.each([
    [
      "https://provider.example/docs#references",
      "https://provider.example/docs#references",
    ],
    ["https://provider.example/docs?session=test", null],
    ["https://user:password@provider.example/docs", null],
  ])(
    "pauses for a provider handoff without drafting an answer (%s)",
    async (handoffUrl, savedUrl) => {
      query.mockResolvedValueOnce({
        rows: [{ id: "attempt", version: 4, background: "Physics" }],
      } as never);
      query.mockResolvedValueOnce({ rows: [] } as never);
      jest.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            state: "needs_input",
            question: "Continue on the provider website.",
            handoffRequired: true,
            handoffUrl,
          }),
        ),
      );
      await worker().process();
      expect(ai.generateJson).not.toHaveBeenCalled();
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("handoff_required"),
        [
          "attempt",
          4,
          "needs_input",
          "Continue on the provider website.",
          null,
          null,
          null,
          null,
          true,
          savedUrl,
          false,
          false,
          null,
          false,
          null,
          null,
          null,
          false,
          false,
        ],
      );
    },
  );
});
