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

type DeploymentMode = 'production' | 'development' | 'test';

function resolveDeploymentMode(
  options: ClerkVerifierOptions,
  readEnv: (name: string) => string | undefined,
): DeploymentMode {
  const signals = [
    readEnv('NODE_ENV'),
    readEnv('DEPLOYMENT_MODE'),
    options.deploymentMode,
  ].filter((value): value is string => Boolean(value?.trim())).map((value) =>
    value.trim().toLowerCase()
  );
  const allowed = new Set<DeploymentMode>([
    'production',
    'development',
    'test',
  ]);
  for (const signal of signals) {
    if (!allowed.has(signal as DeploymentMode)) {
      throw new Error(`Unknown deployment mode: ${signal}`);
    }
  }

  const uniqueSignals = [...new Set(signals)];
  if (uniqueSignals.length === 0) {
    throw new Error('Deployment mode must be explicitly configured');
  }
  if (uniqueSignals.length > 1) {
    throw new Error('Conflicting deployment modes configured');
  }
  return uniqueSignals[0] as DeploymentMode;
}

function resolveIssuer(options: ClerkVerifierOptions): string {
  const readEnv = options.env ?? ((name) => Deno.env.get(name));
  const deploymentMode = resolveDeploymentMode(options, readEnv);
  const configuredIssuer = options.issuer?.trim() ||
    readEnv('CLERK_ISSUER_URL')?.trim();
  const explicitNonProduction = deploymentMode === 'development' ||
    deploymentMode === 'test';

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
