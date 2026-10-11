import { aiFetch } from "./ai-http";
import { OpenAiAdapter } from "./openai.adapter";

jest.mock("./ai-http", () => ({ aiFetch: jest.fn() }));

const mockedAiFetch = aiFetch as jest.MockedFunction<typeof aiFetch>;

beforeEach(() => mockedAiFetch.mockClear());

describe("OpenAiAdapter", () => {
  it("normalizes nested objects for OpenAI strict JSON schema output", async () => {
    mockedAiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: '{"eligibility":null,"deadline":null}' } },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
      }),
    } as Response);
    const adapter = new OpenAiAdapter();

    await adapter.generateText(
      {
        feature: "opportunities.extract",
        provider: "openai",
        model: "gpt-4.1-mini",
        apiKey: "test-key",
        isEnabled: true,
      },
      {
        feature: "opportunities.extract",
        prompt: "Extract opportunity details as JSON.",
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            eligibility: {
              type: ["object", "null"],
              properties: {
                countries: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
                age_min: { type: ["integer", "null"] },
              },
            },
            deadline: { type: ["string", "null"] },
          },
        },
      },
    );

    const [, init] = mockedAiFetch.mock.calls.at(-1)!;
    const body = JSON.parse(String(init.body));
    expect(body.response_format.json_schema.schema).toEqual({
      type: "object",
      properties: {
        eligibility: {
          type: ["object", "null"],
          properties: {
            countries: { type: ["array", "null"], items: { type: "string" } },
            age_min: { type: ["integer", "null"] },
          },
          required: ["countries", "age_min"],
          additionalProperties: false,
        },
        deadline: { type: ["string", "null"] },
      },
      required: ["eligibility", "deadline"],
      additionalProperties: false,
    });
  });

  it("uses structured output for a JSON-schema generation", async () => {
    mockedAiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 5,
          total_tokens: 17,
        },
      }),
    } as Response);
    const adapter = new OpenAiAdapter();
    const schema = {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
      additionalProperties: false,
    };

    await expect(
      adapter.generateText(
        {
          feature: "opportunities.enhance",
          provider: "openai",
          model: "gpt-4.1-mini",
          apiKey: "test-key",
          isEnabled: true,
        },
        {
          feature: "opportunities.enhance",
          prompt: "Complete this opportunity as JSON.",
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          maxOutputTokens: 900,
        },
      ),
    ).resolves.toMatchObject({
      text: '{"ok":true}',
      provider: "openai",
      model: "gpt-4.1-mini",
      usage: {
        promptTokens: 12,
        completionTokens: 5,
        totalTokens: 17,
      },
    });

    const [, init] = mockedAiFetch.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "gpt-4.1-mini",
      max_tokens: 900,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "edutu_response",
          strict: true,
          schema,
        },
      },
    });
  });
});
