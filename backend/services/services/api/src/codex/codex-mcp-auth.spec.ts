import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { CodexMcpAuth } from "./codex-mcp-auth";

jest.mock("jose", () => ({
  ...jest.requireActual("jose"),
  createRemoteJWKSet: jest.fn(),
}));

const issuer = "https://clerk.edutu.org";
const audience = "https://backend.edutu.org/mcp";
const keyId = "test-key";

describe("CodexMcpAuth", () => {
  let auth: CodexMcpAuth;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

  beforeAll(async () => {
    const keys = await generateKeyPair("RS256");
    privateKey = keys.privateKey;
    const jwk = await exportJWK(keys.publicKey);
    const { createRemoteJWKSet } = jest.requireMock("jose");
    createRemoteJWKSet.mockReturnValue(
      createLocalJWKSet({
        keys: [{ ...jwk, kid: keyId }],
      }),
    );

    const env = process.env;
    process.env = {
      ...env,
      CLERK_ISSUER_URL: issuer,
      EDUTU_MCP_RESOURCE_URL: audience,
    };
    try {
      auth = new CodexMcpAuth();
    } finally {
      process.env = env;
    }
  });

  function sign(
    overrides: { typ?: string; aud?: string; iss?: string; exp?: string } = {},
  ) {
    return new SignJWT({ scp: ["opportunities:read"] })
      .setProtectedHeader({
        typ: overrides.typ ?? "at+jwt",
        alg: "RS256",
        kid: keyId,
      })
      .setIssuer(overrides.iss ?? issuer)
      .setAudience(overrides.aud ?? audience)
      .setSubject("user_123")
      .setExpirationTime(overrides.exp ?? "5 minutes")
      .sign(privateKey);
  }

  it("accepts a signed Clerk OAuth token for this resource", async () => {
    await expect(auth.authenticate(`Bearer ${await sign()}`)).resolves.toEqual({
      userId: "user_123",
      scopes: ["opportunities:read"],
    });
  });

  it.each([
    { typ: "JWT" },
    { aud: "https://backend.edutu.org/another-tool" },
    { iss: "https://other.clerk.accounts.dev" },
    { exp: "5 minutes ago" },
  ])("rejects signed tokens with %j", async (overrides) => {
    await expect(
      auth.authenticate(`Bearer ${await sign(overrides)}`),
    ).resolves.toBeNull();
  });
});
