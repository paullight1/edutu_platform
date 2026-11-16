import { verifyClerkRequest } from "./clerk-auth.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message ?? `Expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function assertRejects(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error("Expected operation to reject");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const NOW_SECONDS = 1_700_000_000;
const PRODUCTION_ISSUER = "https://clerk.edutu.org";
const DEVELOPMENT_ISSUER = "https://calm-gecko-44.clerk.accounts.dev";
const SUBJECT = "user_123";
const KEY_ID = "clerk-test-key";

const keyPair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const publicJwk = {
  ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)),
  alg: "RS256",
  kid: KEY_ID,
  kty: "RSA",
};

async function signedToken(
  issuer: string,
  claims: Record<string, unknown> = {},
): Promise<string> {
  const encodedHeader = base64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid: KEY_ID })),
  );
  const encodedPayload = base64Url(
    new TextEncoder().encode(JSON.stringify({
      iss: issuer,
      sub: SUBJECT,
      exp: NOW_SECONDS + 60,
      ...claims,
    })),
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

function request(token: string): Request {
  return new Request("https://edge.example/protected", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function env(values: Record<string, string | undefined>) {
  return (name: string): string | undefined => values[name];
}

function verifierOptions(
  values: Record<string, string | undefined> = {
    CLERK_ISSUER_URL: PRODUCTION_ISSUER,
  },
  deploymentMode?: string,
) {
  const options = {
    env: env(values),
    now: () => NOW_SECONDS * 1000,
    fetchImpl: async (input: RequestInfo | URL) => {
      assert(
        String(input) === `${PRODUCTION_ISSUER}/.well-known/jwks.json` ||
          String(input) === `${DEVELOPMENT_ISSUER}/.well-known/jwks.json`,
        `Unexpected JWKS URL: ${String(input)}`,
      );
      return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });
    },
  };
  return deploymentMode === undefined
    ? options
    : { ...options, deploymentMode };
}

Deno.test("accepts a valid token from the configured production issuer", async () => {
  const token = await signedToken(PRODUCTION_ISSUER);
  const claims = await verifyClerkRequest(
    request(token),
    verifierOptions({ CLERK_ISSUER_URL: PRODUCTION_ISSUER }, "production"),
  );

  assertEquals(claims.sub, SUBJECT);
  assertEquals(claims.iss, PRODUCTION_ISSUER);
});

Deno.test("rejects the known development issuer in production", async () => {
  const token = await signedToken(DEVELOPMENT_ISSUER);

  await assertRejects(() =>
    verifyClerkRequest(
      request(token),
      verifierOptions({ CLERK_ISSUER_URL: DEVELOPMENT_ISSUER }, "production"),
    )
  );
});

Deno.test("rejects a token with an unknown issuer before JWKS verification", async () => {
  const token = await signedToken("https://unknown.example");

  await assertRejects(() =>
    verifyClerkRequest(request(token), verifierOptions(undefined, "production"))
  );
});

Deno.test("rejects an expired token", async () => {
  const token = await signedToken(PRODUCTION_ISSUER, { exp: NOW_SECONDS - 1 });

  await assertRejects(() =>
    verifyClerkRequest(request(token), verifierOptions(undefined, "production"))
  );
});

Deno.test("rejects missing and malformed production issuer configuration", async () => {
  const token = await signedToken(PRODUCTION_ISSUER);

  await assertRejects(() =>
    verifyClerkRequest(
      request(token),
      verifierOptions({}, "production"),
    )
  );
  await assertRejects(() =>
    verifyClerkRequest(
      request(token),
      verifierOptions({ CLERK_ISSUER_URL: "http://clerk.edutu.org" }),
    )
  );
});

Deno.test("allows the development issuer fallback only in explicit development mode", async () => {
  const token = await signedToken(DEVELOPMENT_ISSUER);

  const claims = await verifyClerkRequest(
    request(token),
    verifierOptions({}, "development"),
  );

  assertEquals(claims.iss, DEVELOPMENT_ISSUER);
});

Deno.test("fails closed when NODE_ENV is production and DEPLOYMENT_MODE is development", async () => {
  const token = await signedToken(DEVELOPMENT_ISSUER);

  await assertRejects(() =>
    verifyClerkRequest(
      request(token),
      verifierOptions({
        NODE_ENV: "production",
        DEPLOYMENT_MODE: "development",
        CLERK_ISSUER_URL: DEVELOPMENT_ISSUER,
      }),
    )
  );
});

Deno.test("fails closed when NODE_ENV is development and DEPLOYMENT_MODE is production", async () => {
  const token = await signedToken(DEVELOPMENT_ISSUER);

  await assertRejects(() =>
    verifyClerkRequest(
      request(token),
      verifierOptions({
        NODE_ENV: "development",
        DEPLOYMENT_MODE: "production",
        CLERK_ISSUER_URL: DEVELOPMENT_ISSUER,
      }),
    )
  );
});

Deno.test("fails closed for an unknown deployment mode", async () => {
  const token = await signedToken(DEVELOPMENT_ISSUER);

  await assertRejects(() =>
    verifyClerkRequest(
      request(token),
      verifierOptions({
        NODE_ENV: "staging",
        CLERK_ISSUER_URL: DEVELOPMENT_ISSUER,
      }),
    )
  );
});
