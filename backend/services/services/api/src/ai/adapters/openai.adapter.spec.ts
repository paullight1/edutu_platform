import { aiFetch } from "./ai-http";
import { OpenAiAdapter } from "./openai.adapter";

jest.mock("./ai-http", () => ({ aiFetch: jest.fn() }));

const mockedAiFetch = aiFetch as jest.MockedFunction<typeof aiFetch>;

describe("OpenAiAdapter", () => {
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
