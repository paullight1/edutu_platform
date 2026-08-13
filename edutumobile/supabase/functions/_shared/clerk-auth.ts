type ClerkClaims = {
  sub: string;
  exp?: number;
  nbf?: number;
  iss?: string;
  [key: string]: unknown;
};

type ClerkJwk = JsonWebKey & {
  alg?: string;
  kid?: string;
};

type JsonWebKeySet = {
  keys: ClerkJwk[];
};

export type ClerkVerifierOptions = {
  issuer?: string;
  deploymentMode?: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
  env?: (name: string) => string | undefined;
};

const KNOWN_DEVELOPMENT_ISSUER = 'https://calm-gecko-44.clerk.accounts.dev';

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - normalized.length % 4) % 4),
    '=',
  );
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

function isProductionMode(mode: string): boolean {
  return mode === 'production' || mode === 'prod';
}

function resolveIssuer(options: ClerkVerifierOptions): string {
  const readEnv = options.env ?? ((name) => Deno.env.get(name));
  const configuredIssuer = options.issuer?.trim() ||
    readEnv('CLERK_ISSUER_URL')?.trim();
  const mode = (options.deploymentMode ?? readEnv('DEPLOYMENT_MODE') ??
    readEnv('NODE_ENV') ?? '').trim().toLowerCase();
  const explicitNonProduction = mode.length > 0 && !isProductionMode(mode);

  if (!configuredIssuer && !explicitNonProduction) {
    throw new Error(
      'CLERK_ISSUER_URL is required unless deployment mode is explicitly non-production',
    );
  }

  const issuerValue = configuredIssuer ?? KNOWN_DEVELOPMENT_ISSUER;
  let issuerUrl: URL;
  try {
    issuerUrl = new URL(issuerValue);
  } catch {
    throw new Error('CLERK_ISSUER_URL is malformed');
  }

  if (
    issuerUrl.protocol !== 'https:' ||
    issuerUrl.username ||
    issuerUrl.password ||
    issuerUrl.pathname !== '/' ||
    issuerUrl.search ||
    issuerUrl.hash ||
    issuerUrl.origin !== issuerValue.replace(/\/$/, '')
  ) {
    throw new Error('CLERK_ISSUER_URL is malformed');
  }

  const issuer = issuerUrl.origin;
  if (!explicitNonProduction && issuer === KNOWN_DEVELOPMENT_ISSUER) {
    throw new Error('Development Clerk issuer is not allowed in production');
  }
  return issuer;
}

async function getSigningKey(
  kid: string,
  alg: string,
  issuer: string,
  fetchImpl: typeof fetch,
): Promise<CryptoKey> {
  const response = await fetchImpl(`${issuer}/.well-known/jwks.json`);
  if (!response.ok) throw new Error('Clerk JWKS unavailable');
  const jwks = await response.json() as JsonWebKeySet;
  const jwk = jwks.keys.find((key) =>
    key.kid === kid && (!key.alg || key.alg === alg)
  );
  if (!jwk) throw new Error('No matching Clerk signing key found');

  const algorithm = alg === 'RS256'
    ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
    : { name: 'ECDSA', namedCurve: 'P-256' };

  return crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
}

export async function verifyClerkRequest(
  req: Request,
  options: ClerkVerifierOptions = {},
): Promise<ClerkClaims> {
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

  const claims = decodeJson<ClerkClaims>(encodedPayload);
  const issuer = resolveIssuer(options);
  if (claims.iss !== issuer) {
    throw new Error('Invalid token issuer');
  }

  const now = Math.floor((options.now ?? Date.now)() / 1000);
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now) {
    throw new Error('Expired bearer token');
  }
  if (typeof claims.nbf === 'number' && claims.nbf > now) {
    throw new Error('Bearer token is not yet valid');
  }
  if (!claims.sub) {
    throw new Error('Token is missing subject');
  }

  const key = await getSigningKey(
    header.kid,
    header.alg,
    issuer,
    options.fetchImpl ?? fetch,
  );
  const data = Uint8Array.from(
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  const signature = Uint8Array.from(base64UrlDecode(encodedSignature));
  const algorithm = header.alg === 'RS256'
    ? { name: 'RSASSA-PKCS1-v1_5' }
    : { name: 'ECDSA', hash: 'SHA-256' };

  const valid = await crypto.subtle.verify(algorithm, key, signature, data);
  if (!valid) {
    throw new Error('Invalid bearer token signature');
  }

  return claims;
}
