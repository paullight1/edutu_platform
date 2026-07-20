import { createClient } from "@supabase/supabase-js";
import { ChatService } from "./chat.service";
import {
  DEFAULT_CRISIS_CONTACT,
  SELF_HARM_SUPPORT,
  SUPPORTED_LOCALES,
  selfHarmSupportText,
} from "./crisis-support";
import type { AiService } from "../ai";
import type { OpportunityRankingService } from "../opportunities/opportunity-ranking.service";
import type { CoachToolsService } from "./tools/coach-tools.service";
import type { SettingsService } from "../settings/settings.service";

// ChatService builds a Supabase client in its constructor; these tests stub
// every query the sendMessage path touches so no network call happens.
// Mirrors the createQuery() pattern in billing.service.spec.ts.
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

// Kept as a literal (not imported) because chat.service.ts does not export
// EDUTU_TOPIC_REDIRECT — this must stay byte-for-byte in sync with the
// constant defined there.
const EDUTU_TOPIC_REDIRECT =
  "I can help with scholarships, internships, fellowships, applications, CVs, deadlines, skills, and career planning. Tell me what kind of opportunity or next step you want help with.";

const THREAD_ID = "thread-1";

function createQuery(result: { data: unknown; error: unknown }): any {
  return {
    select: () => createQuery(result),
    eq: () => createQuery(result),
    order: () => createQuery(result),
    limit: () => createQuery(result),
    update: () => createQuery(result),
    delete: () => createQuery(result),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (
      resolve: (value: unknown) => unknown,
      reject: (reason?: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
}

function buildSupabaseStub() {
  return {
    from: (table: string) => {
      switch (table) {
        case "chat_threads":
          return {
            ...createQuery({ data: null, error: null }),
            insert: () => createQuery({ data: { id: THREAD_ID }, error: null }),
          };
        case "chat_messages":
          // Echoes back whatever sendMessage inserts so assertions can read
          // the real computed finalAnswer instead of a fixed fixture.
          return {
            ...createQuery({ data: [], error: null }),
            insert: (rows: Array<Record<string, unknown>>) =>
              createQuery({
                data: rows.map((row, index) => ({
                  id: `msg-${index}`,
                  created_at: new Date().toISOString(),
                  ...row,
                })),
                error: null,
              }),
          };
        case "profiles":
          return createQuery({ data: { user_id: "user-1" }, error: null });
        case "goals":
        case "opportunity_applications":
          return createQuery({ data: [], error: null });
        default:
          return createQuery({ data: [], error: null });
      }
    },
  };
}

describe("ChatService.sendMessage — relevance gate", () => {
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AI_AGENT_ENABLED: process.env.AI_AGENT_ENABLED,
  };

  const restoreEnv = (key: keyof typeof originalEnv) => {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    (createClient as jest.Mock).mockReturnValue(buildSupabaseStub());
  });

  afterEach(() => {
    restoreEnv("SUPABASE_URL");
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY");
    restoreEnv("AI_AGENT_ENABLED");
    jest.restoreAllMocks();
  });

  function makeService(settingsService?: Partial<SettingsService>) {
    const aiService = {
      generateText: jest.fn(),
      generateJson: jest.fn().mockResolvedValue({ memories: [] }),
    };
    const rankingService = {
      recordSignal: jest.fn().mockResolvedValue(undefined),
    };
    const coachTools = {
      loadMemories: jest.fn().mockResolvedValue([]),
      saveExtractedMemory: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ChatService(
      aiService as unknown as AiService,
      rankingService as unknown as OpportunityRankingService,
      coachTools as unknown as CoachToolsService,
      settingsService as unknown as SettingsService,
    );

    return { service, aiService, rankingService, coachTools };
  }

  it("does not topic-gate non-English messages on the agent path", async () => {
    delete process.env.AI_AGENT_ENABLED; // agent path enabled (default)
    const { service } = makeService();

    const fakeAgentTurn = {
      finalText:
        "Here are a few Canada scholarships that could fit — want the details?",
      opportunities: [],
      deviceActions: [],
      actionButtons: [],
      documents: [],
      images: [],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    const runAgentTurnSpy = jest
      .spyOn(service as any, "runAgentTurn")
      .mockResolvedValue(fakeAgentTurn);

    const result = await service.sendMessage("user-1", {
      message: "je cherche une bourse pour étudier au Canada",
    });

    expect(runAgentTurnSpy).toHaveBeenCalled();
    expect(result.assistantMessage?.content).not.toContain(
      EDUTU_TOPIC_REDIRECT,
    );
    expect(result.assistantMessage?.content).toBe(fakeAgentTurn.finalText);
  });

  // The keyword gate used to fire HERE — the degraded turn (agent disabled or
  // agent threw) that a user on a flaky connection actually gets. A French
  // on-topic message matched none of its English keywords, so the coach
  // refused it. The legacy prompt already tells the model to redirect
  // off-topic requests, so the pre-gate is gone from this path too.
  it("does not topic-gate a non-English message on the legacy path", async () => {
    process.env.AI_AGENT_ENABLED = "false"; // force the legacy pipeline
    const { service, aiService } = makeService();
    const runAgentTurnSpy = jest.spyOn(service as any, "runAgentTurn");
    aiService.generateText.mockResolvedValue({
      text: JSON.stringify({
        message: "Voici quelques bourses pour le Canada.",
      }),
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });

    const result = await service.sendMessage("user-1", {
      message: "je cherche une bourse pour étudier au Canada",
      locale: "fr",
    });

    expect(runAgentTurnSpy).not.toHaveBeenCalled();
    expect(aiService.generateText).toHaveBeenCalled();
    expect(result.assistantMessage?.content).not.toContain(
      EDUTU_TOPIC_REDIRECT,
    );
    expect(result.assistantMessage?.content).toBe(
      "Voici quelques bourses pour le Canada.",
    );
  });

  // Off-topic handling moved from a keyword gate to the prompt: the model is
  // now the one that redirects, so the turn reaches it.
  it("sends an off-topic English message to the model instead of a canned redirect", async () => {
    process.env.AI_AGENT_ENABLED = "false";
    const { service, aiService } = makeService();
    aiService.generateText.mockResolvedValue({
      text: JSON.stringify({
        message: "I can help with scholarships instead.",
      }),
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });

    const result = await service.sendMessage("user-1", {
      message: "Tell me a joke about cats please",
    });

    expect(aiService.generateText).toHaveBeenCalled();
    expect(result.assistantMessage?.content).not.toBe(EDUTU_TOPIC_REDIRECT);
  });

  // Moderation must keep running FIRST on the legacy path: removing the topic
  // gate must not let a flagged message reach the model.
  it("still moderates before the model on the legacy path", async () => {
    process.env.AI_AGENT_ENABLED = "false";
    const { service, aiService } = makeService();

    const result = await service.sendMessage("user-1", {
      message: "I want to kill myself",
    });

    expect(aiService.generateText).not.toHaveBeenCalled();
    expect(result.assistantMessage?.content).toBe(SELF_HARM_SUPPORT);
  });

  // SAFETY. Detection is locale-agnostic on purpose (a Swahili speaker with the
  // app in English must still be caught), so each case sends a crisis phrase in
  // one language and asserts the turn is intercepted before any model call and
  // answered in the language the CLIENT declared.
  describe("multilingual crisis interception", () => {
    const crisisPhrases: Record<(typeof SUPPORTED_LOCALES)[number], string> = {
      en: "I want to kill myself",
      fr: "je veux mourir, je ne vois plus de sens",
      ar: "اريد ان اموت لا استطيع الاستمرار",
      sw: "nataka kujiua sina msaada",
      ha: "ina son in kashe kaina",
      hi: "मैं आत्महत्या करना चाहता हूँ",
      es: "quiero morirme, no aguanto mas",
      zh: "我想自杀，撑不下去了",
      pt: "quero morrer, nao aguento mais",
    };

    for (const locale of SUPPORTED_LOCALES) {
      it(`intercepts a ${locale} crisis message and replies in ${locale}`, async () => {
        delete process.env.AI_AGENT_ENABLED;
        const { service, aiService } = makeService();
        const runAgentTurnSpy = jest.spyOn(service as any, "runAgentTurn");

        const result = await service.sendMessage("user-1", {
          message: crisisPhrases[locale],
          locale,
        });

        // Moderation runs FIRST: neither the agent nor the legacy model call
        // may happen for a flagged message.
        expect(runAgentTurnSpy).not.toHaveBeenCalled();
        expect(aiService.generateText).not.toHaveBeenCalled();
        expect(result.assistantMessage?.content).toBe(
          selfHarmSupportText(locale),
        );
      });
    }

    it("keeps the English crisis path byte-for-byte unchanged", async () => {
      delete process.env.AI_AGENT_ENABLED;
      const { service } = makeService();

      const result = await service.sendMessage("user-1", {
        message: "sometimes I think about self-harm",
      });

      expect(result.assistantMessage?.content).toBe(SELF_HARM_SUPPORT);
    });

    it("detects in one language while replying in the client's language", async () => {
      delete process.env.AI_AGENT_ENABLED;
      const { service } = makeService();

      // Code-switching user: Swahili crisis phrase, app set to English.
      const result = await service.sendMessage("user-1", {
        message: "nataka kujiua",
        locale: "en",
      });

      expect(result.assistantMessage?.content).toBe(SELF_HARM_SUPPORT);
    });

    it("falls back to English for an unknown or missing locale", async () => {
      delete process.env.AI_AGENT_ENABLED;
      const { service } = makeService();

      const result = await service.sendMessage("user-1", {
        message: "je veux mourir",
        locale: "de-DE",
      });

      expect(result.assistantMessage?.content).toBe(SELF_HARM_SUPPORT);
    });

    // SAFETY: the admin-configured contact number reaches the crisis message.
    it("interpolates the admin-configured crisis contact number", async () => {
      delete process.env.AI_AGENT_ENABLED;
      const getSettings = jest.fn().mockResolvedValue({
        settings: { safety: { crisisContactPhone: "+15550001234" } },
      });
      const { service, aiService } = makeService({ getSettings } as never);

      const result = await service.sendMessage("user-1", {
        message: "I want to kill myself",
      });

      expect(aiService.generateText).not.toHaveBeenCalled();
      expect(result.assistantMessage?.content).toContain("+15550001234");
      expect(result.assistantMessage?.content).toContain("findahelpline.com");
      // The whole message is still the English template, just with the new number.
      expect(result.assistantMessage?.content).toBe(
        selfHarmSupportText("en", "+15550001234"),
      );
    });

    // SAFETY (constraint #1): a settings read that throws must NEVER suppress or
    // block the crisis message — it degrades to the baked-in default number.
    it("still returns the crisis message with the default number when settings read throws", async () => {
      delete process.env.AI_AGENT_ENABLED;
      const getSettings = jest
        .fn()
        .mockRejectedValue(new Error("settings DB unreachable"));
      const { service, aiService } = makeService({ getSettings } as never);

      const result = await service.sendMessage("user-1", {
        message: "I want to kill myself",
      });

      expect(aiService.generateText).not.toHaveBeenCalled();
      expect(result.assistantMessage?.content).toContain(
        DEFAULT_CRISIS_CONTACT,
      );
      // Default number → byte-for-byte the baked-in English support string.
      expect(result.assistantMessage?.content).toBe(SELF_HARM_SUPPORT);
    });
  });

  // The app used to decide locally, with English regexes, whether to offer its
  // "Build roadmap" panel — so 8 of 9 locales never saw it. The server now says
  // so on the assistant message's metadata, and it says it the same way in
  // every language because the signal comes from the agent's tool calls.
  describe("metadata.roadmapIntent", () => {
    const baseTurn = {
      finalText: "Voici comment préparer ta candidature.",
      opportunities: [],
      deviceActions: [],
      actionButtons: [],
      documents: [],
      images: [],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };

    it("rides the assistant metadata for a non-English roadmap turn", async () => {
      delete process.env.AI_AGENT_ENABLED;
      const { service } = makeService();
      jest
        .spyOn(service as any, "runAgentTurn")
        .mockResolvedValue({ ...baseTurn, roadmapIntent: true });

      const result = await service.sendMessage("user-1", {
        message: "aide-moi à préparer ma candidature",
      });

      expect(
        (result.assistantMessage?.metadata as Record<string, unknown>)
          .roadmapIntent,
      ).toBe(true);
    });

    it("is absent (not false) when the turn had no roadmap tool call", async () => {
      delete process.env.AI_AGENT_ENABLED;
      const { service } = makeService();
      jest.spyOn(service as any, "runAgentTurn").mockResolvedValue(baseTurn);

      const result = await service.sendMessage("user-1", {
        message: "hi there",
      });

      const metadata = result.assistantMessage?.metadata as Record<
        string,
        unknown
      >;
      // Additive: the key simply is not there, so a client that never learned
      // it sees byte-identical metadata to what shipped before.
      expect("roadmapIntent" in metadata).toBe(false);
    });

    it("is never set by the legacy pipeline's English keyword heuristic", async () => {
      process.env.AI_AGENT_ENABLED = "false";
      const { service, aiService } = makeService();
      aiService.generateText.mockResolvedValue({
        text: JSON.stringify({ message: "Which opportunity?" }),
        usage: {},
      });

      const result = await service.sendMessage("user-1", {
        message: "build me a roadmap for that scholarship",
      });

      const metadata = result.assistantMessage?.metadata as Record<
        string,
        unknown
      >;
      expect("roadmapIntent" in metadata).toBe(false);
    });
  });
});
