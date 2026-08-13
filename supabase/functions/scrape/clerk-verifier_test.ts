import { createClerkAdminVerifier } from "./index.ts";

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
const ISSUER = "https://clerk.example";
const AUTHORIZED_PARTY = "https://admin.example";
const SUBJECT = "user_123";
const KEY_ID = "clerk-key-1";

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
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): Promise<string> {
  const encodedHeader = base64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid: KEY_ID, ...header })),
  );
  const encodedPayload = base64Url(
    new TextEncoder().encode(JSON.stringify({
      iss: ISSUER,
      sub: SUBJECT,
      exp: NOW_SECONDS + 60,
      nbf: NOW_SECONDS - 60,
      azp: AUTHORIZED_PARTY,
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

type ClerkUser = {
  public_metadata?: { role?: unknown };
  primary_email_address_id?: string;
  email_addresses?: Array<{ id?: string; email_address?: string }>;
};

function verifierFor(user: ClerkUser, overrides: Record<string, string> = {}) {
  const values = {
    CLERK_ISSUER_URL: ISSUER,
    CLERK_SECRET_KEY: "clerk-secret",
    CLERK_AUTHORIZED_PARTIES: AUTHORIZED_PARTY,
    ADMIN_EMAILS: "admin@example.com",
    ...overrides,
  };
  return createClerkAdminVerifier({
    env: (name) => values[name],
    now: () => NOW_SECONDS * 1000,
    fetchJwks: async () => [publicJwk],
    fetchUser: async (subject) => {
      assertEquals(subject, SUBJECT);
      return user;
    },
  });
}

function request(origin = AUTHORIZED_PARTY): Request {
  return new Request("https://edge.example/scrape", {
    headers: { origin },
  });
}

Deno.test("Clerk verifier accepts a valid RS256 token and admin server role", async () => {
  const verifier = verifierFor({ public_metadata: { role: "admin" } });
  const result = await verifier(await signedToken(), request());

  assert(result?.status === "admin");
  assertEquals(result.subject, SUBJECT);
});

Deno.test("Clerk verifier rejects wrong issuer and authorized party", async () => {
  const verifier = verifierFor({ public_metadata: { role: "admin" } });

  await assertRejects(async () => verifier(await signedToken({ iss: "https://wrong.example" }), request()));
  assertEquals(
    await verifier(await signedToken({ azp: "https://wrong.example" }), request()),
    null,
  );
});

Deno.test("Clerk verifier rejects expired and not-yet-valid tokens", async () => {
  const verifier = verifierFor({ public_metadata: { role: "admin" } });

  await assertRejects(async () => verifier(await signedToken({ exp: NOW_SECONDS - 11 }), request()));
  await assertRejects(async () => verifier(await signedToken({ nbf: NOW_SECONDS + 11 }), request()));
});

Deno.test("Clerk verifier rejects unknown key IDs and invalid signatures", async () => {
  const verifier = verifierFor({ public_metadata: { role: "admin" } });

  await assertRejects(async () => verifier(await signedToken({}, { kid: "unknown-key" }), request()));
  const token = await signedToken();
  const parts = token.split(".");
  await assertRejects(() => verifier(`${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}x`, request()));
});

Deno.test("Clerk verifier forbids non-admin server roles and emails", async () => {
  const roleVerifier = verifierFor({ public_metadata: { role: "member" } });
  assertEquals((await roleVerifier(await signedToken(), request()))?.status, "forbidden");

  const emailVerifier = verifierFor({
    primary_email_address_id: "email-1",
    email_addresses: [{ id: "email-1", email_address: "user@example.com" }],
  });
  assertEquals((await emailVerifier(await signedToken(), request()))?.status, "forbidden");
});
