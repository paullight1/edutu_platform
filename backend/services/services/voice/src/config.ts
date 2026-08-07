import { isIP } from 'node:net';
import { availableParallelism } from 'node:os';
import { z } from 'zod';

const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');
const integerFromEnv = (minimum: number, maximum: number) =>
  z.coerce.number().int().min(minimum).max(maximum);
const optionalUrlFromEnv = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: integerFromEnv(1, 65535).default(4000),
  NODE_ID: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/).default('voice-local-1'),
  VOICE_SIGNALING_URL: z.string().url(),
  COMMUNITY_CALL_TOKEN_SECRET: z.string().min(32),
  VOICE_API_CALLBACK_URL: optionalUrlFromEnv,
  VOICE_API_CALLBACK_TIMEOUT_MS: integerFromEnv(250, 5000).default(3000),
  VOICE_API_CALLBACK_MAX_ATTEMPTS: integerFromEnv(1, 5).default(3),
  VOICE_API_CALLBACK_MAX_CONCURRENCY: integerFromEnv(1, 32).default(4),
  VOICE_API_CALLBACK_QUEUE_CAPACITY: integerFromEnv(1, 10000).default(100),
  VOICE_LISTEN_IP: z.string().refine((value) => isIP(value) !== 0, 'Must be an IPv4 or IPv6 address').default('0.0.0.0'),
  VOICE_ANNOUNCED_ADDRESS: z.string().min(1).max(253),
  VOICE_RTC_PORT_BASE: integerFromEnv(1024, 65535).default(40000),
  VOICE_MAX_WORKERS: integerFromEnv(1, 256).default(1),
  VOICE_MAX_ROOMS: integerFromEnv(1, 10000).default(100),
  VOICE_MAX_PEERS_PER_ROOM: integerFromEnv(2, 10000).default(100),
  VOICE_MAX_TRANSPORTS_PER_PEER: integerFromEnv(2, 8).default(2),
  VOICE_MAX_CONSUMERS_PER_PEER: integerFromEnv(1, 10000).default(200),
  VOICE_HTTP_BODY_LIMIT_BYTES: integerFromEnv(1024, 65536).default(16384),
  VOICE_WS_MAX_PAYLOAD_BYTES: integerFromEnv(1024, 262144).default(65536),
  VOICE_AUTH_TIMEOUT_MS: integerFromEnv(1000, 30000).default(5000),
  VOICE_DISCONNECT_GRACE_MS: integerFromEnv(0, 120000).default(15000),
  VOICE_REQUESTS_PER_10S: integerFromEnv(5, 1000).default(100),
  VOICE_REPLAY_TTL_SECONDS: integerFromEnv(30, 600).default(120),
  VOICE_ENABLE_TCP: booleanFromEnv.default(true),
  VOICE_ENABLE_UDP: booleanFromEnv.default(true),
  VOICE_WORKER_LOG_LEVEL: z.enum(['debug', 'warn', 'error', 'none']).default('warn'),
});

export type VoiceConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  nodeId: string;
  signalingUrl: string;
  jwtSecret: Uint8Array;
  apiCallbackUrl: string | null;
  apiCallbackTimeoutMs: number;
  apiCallbackMaxAttempts: number;
  apiCallbackMaxConcurrency: number;
  apiCallbackQueueCapacity: number;
  listenIp: string;
  announcedAddress: string;
  rtcPortBase: number;
  workerCount: number;
  maxRooms: number;
  maxPeersPerRoom: number;
  maxTransportsPerPeer: number;
  maxConsumersPerPeer: number;
  httpBodyLimitBytes: number;
  wsMaxPayloadBytes: number;
  authTimeoutMs: number;
  disconnectGraceMs: number;
  requestsPer10Seconds: number;
  replayTtlSeconds: number;
  enableTcp: boolean;
  enableUdp: boolean;
  workerLogLevel: 'debug' | 'warn' | 'error' | 'none';
};

function validateAnnouncedAddress(value: string, production: boolean): void {
  if (/[:/\s]/.test(value) && isIP(value) === 0) {
    throw new Error('VOICE_ANNOUNCED_ADDRESS must be an IP address or hostname without scheme, path, or port');
  }
  const hostnamePattern = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
  if (isIP(value) === 0 && !hostnamePattern.test(value)) {
    throw new Error('VOICE_ANNOUNCED_ADDRESS must be a valid IP address or DNS hostname');
  }
  if (['0.0.0.0', '::'].includes(value)) throw new Error('VOICE_ANNOUNCED_ADDRESS cannot be a wildcard address');
  if (production && ['127.0.0.1', '::1', 'localhost'].includes(value.toLowerCase())) {
    throw new Error('VOICE_ANNOUNCED_ADDRESS cannot be loopback in production');
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): VoiceConfig {
  const env = envSchema.parse(source);
  const cpuCount = availableParallelism();
  if (env.VOICE_MAX_WORKERS > cpuCount) {
    throw new Error(`VOICE_MAX_WORKERS (${env.VOICE_MAX_WORKERS}) exceeds available CPU cores (${cpuCount})`);
  }
  if (env.VOICE_RTC_PORT_BASE + env.VOICE_MAX_WORKERS - 1 > 65535) {
    throw new Error('RTC worker port range exceeds 65535');
  }
  if (!env.VOICE_ENABLE_TCP && !env.VOICE_ENABLE_UDP) {
    throw new Error('At least one of VOICE_ENABLE_TCP or VOICE_ENABLE_UDP must be enabled');
  }
  if (env.VOICE_API_CALLBACK_URL) {
    const callbackUrl = new URL(env.VOICE_API_CALLBACK_URL);
    if (!['http:', 'https:'].includes(callbackUrl.protocol)) {
      throw new Error('VOICE_API_CALLBACK_URL must use http:// or https://');
    }
    if (callbackUrl.username || callbackUrl.password || callbackUrl.search || callbackUrl.hash) {
      throw new Error('VOICE_API_CALLBACK_URL must not include credentials, query parameters, or a fragment');
    }
    if (callbackUrl.pathname !== '/' && callbackUrl.pathname !== '') {
      throw new Error('VOICE_API_CALLBACK_URL must be an origin without a path');
    }
    if (env.VOICE_API_CALLBACK_QUEUE_CAPACITY < env.VOICE_MAX_ROOMS) {
      throw new Error('VOICE_API_CALLBACK_QUEUE_CAPACITY must be at least VOICE_MAX_ROOMS');
    }
  }
  validateAnnouncedAddress(env.VOICE_ANNOUNCED_ADDRESS, env.NODE_ENV === 'production');
  const signalingUrl = new URL(env.VOICE_SIGNALING_URL);
  if (!['ws:', 'wss:'].includes(signalingUrl.protocol)) throw new Error('VOICE_SIGNALING_URL must use ws:// or wss://');
  if (env.NODE_ENV === 'production' && signalingUrl.protocol !== 'wss:') {
    throw new Error('VOICE_SIGNALING_URL must use wss:// in production');
  }

  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    nodeId: env.NODE_ID,
    signalingUrl: env.VOICE_SIGNALING_URL,
    jwtSecret: new TextEncoder().encode(env.COMMUNITY_CALL_TOKEN_SECRET),
    apiCallbackUrl: env.VOICE_API_CALLBACK_URL ?? null,
    apiCallbackTimeoutMs: env.VOICE_API_CALLBACK_TIMEOUT_MS,
    apiCallbackMaxAttempts: env.VOICE_API_CALLBACK_MAX_ATTEMPTS,
    apiCallbackMaxConcurrency: env.VOICE_API_CALLBACK_MAX_CONCURRENCY,
    apiCallbackQueueCapacity: env.VOICE_API_CALLBACK_QUEUE_CAPACITY,
    listenIp: env.VOICE_LISTEN_IP,
    announcedAddress: env.VOICE_ANNOUNCED_ADDRESS,
    rtcPortBase: env.VOICE_RTC_PORT_BASE,
    workerCount: env.VOICE_MAX_WORKERS,
    maxRooms: env.VOICE_MAX_ROOMS,
    maxPeersPerRoom: env.VOICE_MAX_PEERS_PER_ROOM,
    maxTransportsPerPeer: env.VOICE_MAX_TRANSPORTS_PER_PEER,
    maxConsumersPerPeer: env.VOICE_MAX_CONSUMERS_PER_PEER,
    httpBodyLimitBytes: env.VOICE_HTTP_BODY_LIMIT_BYTES,
    wsMaxPayloadBytes: env.VOICE_WS_MAX_PAYLOAD_BYTES,
    authTimeoutMs: env.VOICE_AUTH_TIMEOUT_MS,
    disconnectGraceMs: env.VOICE_DISCONNECT_GRACE_MS,
    requestsPer10Seconds: env.VOICE_REQUESTS_PER_10S,
    replayTtlSeconds: env.VOICE_REPLAY_TTL_SECONDS,
    enableTcp: env.VOICE_ENABLE_TCP,
    enableUdp: env.VOICE_ENABLE_UDP,
    workerLogLevel: env.VOICE_WORKER_LOG_LEVEL,
  };
}
