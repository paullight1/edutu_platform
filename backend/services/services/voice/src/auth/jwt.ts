import { jwtVerify, type JWTPayload } from 'jose';
import { z } from 'zod';
import { GatewayError } from '../shared/errors.js';

const baseClaimsSchema = z.object({
  sub: z.string().min(1).max(256),
  jti: z.string().min(8).max(256),
  exp: z.number().int().positive(),
});

const clientClaimsSchema = baseClaimsSchema.extend({
  callId: z.string().uuid(),
  groupId: z.string().uuid(),
  role: z.enum(['owner', 'mod', 'member']),
});

export type ClientClaims = z.infer<typeof clientClaimsSchema>;

export class ReplayGuard {
  private readonly seen = new Map<string, number>();

  public constructor(private readonly ttlSeconds: number, private readonly now = () => Date.now()) {}

  public consume(jti: string, expiresAtSeconds: number): boolean {
    this.prune();
    if (this.seen.has(jti)) return false;
    const ttlExpiry = this.now() + this.ttlSeconds * 1000;
    this.seen.set(jti, Math.min(expiresAtSeconds * 1000, ttlExpiry));
    return true;
  }

  private prune(): void {
    const now = this.now();
    for (const [jti, expiry] of this.seen) if (expiry <= now) this.seen.delete(jti);
  }
}

async function verify(
  token: string,
  secret: Uint8Array,
  audience: 'edutu-voice' | 'edutu-voice-internal',
): Promise<JWTPayload> {
  try {
    const result = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      audience,
      issuer: 'edutu-api',
      clockTolerance: 5,
      maxTokenAge: audience === 'edutu-voice' ? '2m' : '5m',
    });
    return result.payload;
  } catch {
    throw new GatewayError('AUTH_INVALID', 'Invalid or expired token', 401);
  }
}

export async function verifyClientToken(token: string, secret: Uint8Array): Promise<ClientClaims> {
  const parsed = clientClaimsSchema.safeParse(await verify(token, secret, 'edutu-voice'));
  if (!parsed.success) throw new GatewayError('AUTH_INVALID', 'Join token has invalid claims', 401);
  return parsed.data;
}

export async function verifyInternalToken(
  token: string,
  secret: Uint8Array,
  replayGuard: ReplayGuard,
): Promise<{ subject: string; jti: string }> {
  const parsed = baseClaimsSchema.safeParse(await verify(token, secret, 'edutu-voice-internal'));
  if (!parsed.success) throw new GatewayError('AUTH_INVALID', 'Service token has invalid claims', 401);
  if (!replayGuard.consume(parsed.data.jti, parsed.data.exp)) {
    throw new GatewayError('AUTH_REPLAY', 'Service token has already been used', 409);
  }
  return { subject: parsed.data.sub, jti: parsed.data.jti };
}

export function readBearerToken(header: string | undefined): string {
  if (!header?.startsWith('Bearer ')) throw new GatewayError('AUTH_REQUIRED', 'Bearer token required', 401);
  const token = header.slice(7);
  if (!token || token.length > 8192) throw new GatewayError('AUTH_INVALID', 'Invalid bearer token', 401);
  return token;
}
