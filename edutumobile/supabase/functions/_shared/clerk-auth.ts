type ClerkClaims = {
  sub: string;
  exp?: number;
  iss?: string;
  [key: string]: unknown;
};

type JsonWebKeySet = {
  keys: JsonWebKey[];
};

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeJson<T>(input: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(input))) as T;
}

// Known Clerk instances for this project. The app moved from the pk_test
// dev instance (calm-gecko-44) to the pk_live production instance
// (clerk.edutu.org); tokens from either must verify, so the signing key is
// looked up across every candidate JWKS instead of hard-failing on the first
// miss (which silently 401'd all live users while the default pointed at the
// dev instance). CLERK_JWKS_URL / CLERK_ISSUER_URL edge secrets still take
// priority when set.
const KNOWN_CLERK_ISSUERS = [
  'https://clerk.edutu.org',
  'https://calm-gecko-44.clerk.accounts.dev',
];

function getJwksUrls() {
  const urls: string[] = [];
  const explicit = Deno.env.get('CLERK_JWKS_URL');
  if (explicit) urls.push(explicit);

  const issuer = Deno.env.get('CLERK_ISSUER_URL');
  if (issuer) urls.push(`${issuer.replace(/\/$/, '')}/.well-known/jwks.json`);

  for (const known of KNOWN_CLERK_ISSUERS) {
    const url = `${known}/.well-known/jwks.json`;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

async function getSigningKey(kid: string, alg: string) {
  let jwk: JsonWebKey | undefined;
  for (const jwksUrl of getJwksUrls()) {
    try {
      const response = await fetch(jwksUrl);
      if (!response.ok) continue;
      const jwks = await response.json() as JsonWebKeySet;
      jwk = jwks.keys.find((key) => key.kid === kid);
      if (jwk) break;
    } catch {
      // Try the next candidate instance.
    }
  }
  if (!jwk) {
    throw new Error('No matching Clerk signing key found');
  }

  const algorithm = alg === 'RS256'
    ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
    : { name: 'ECDSA', namedCurve: 'P-256' };

  return crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
}

export async function verifyClerkRequest(req: Request): Promise<ClerkClaims> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    throw new Error('Missing bearer token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid bearer token');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson<{ alg: string; kid: string }>(encodedHeader);
  if (!['RS256', 'ES256'].includes(header.alg) || !header.kid) {
    throw new Error('Unsupported token signature');
  }

  const key = await getSigningKey(header.kid, header.alg);
  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = base64UrlDecode(encodedSignature);
  const algorithm = header.alg === 'RS256'
    ? { name: 'RSASSA-PKCS1-v1_5' }
    : { name: 'ECDSA', hash: 'SHA-256' };

  const valid = await crypto.subtle.verify(algorithm, key, signature, data);
  if (!valid) {
    throw new Error('Invalid bearer token signature');
  }

  const claims = decodeJson<ClerkClaims>(encodedPayload);
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && claims.exp <= now) {
    throw new Error('Expired bearer token');
  }

  const expectedIssuer = Deno.env.get('CLERK_ISSUER_URL');
  if (expectedIssuer && claims.iss !== expectedIssuer.replace(/\/$/, '')) {
    throw new Error('Invalid token issuer');
  }

  if (!claims.sub) {
    throw new Error('Token is missing subject');
  }

  return claims;
}
