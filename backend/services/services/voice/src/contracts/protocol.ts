import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

const requestId = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const id = z.string().min(1).max(256);
const opaqueObject = z.record(z.string().max(128), z.unknown());

const base = z.object({ version: z.literal(PROTOCOL_VERSION), requestId });

const authenticate = base.extend({
  action: z.literal('authenticate'),
  data: z.object({ token: z.string().min(1).max(8192) }).strict(),
}).strict();

const capabilities = base.extend({
  action: z.literal('getRouterRtpCapabilities'),
  data: z.object({}).strict().default({}),
}).strict();

const createTransport = base.extend({
  action: z.literal('createTransport'),
  data: z.object({ direction: z.enum(['send', 'recv']) }).strict(),
}).strict();

const connectTransport = base.extend({
  action: z.literal('connectTransport'),
  data: z.object({ transportId: id, dtlsParameters: opaqueObject }).strict(),
}).strict();

const produceAudio = base.extend({
  action: z.literal('produceAudio'),
  data: z.object({ transportId: id, rtpParameters: opaqueObject }).strict(),
}).strict();

const producerAction = (action: 'pauseProducer' | 'resumeProducer' | 'closeProducer') =>
  base.extend({ action: z.literal(action), data: z.object({ producerId: id }).strict() }).strict();

const consume = base.extend({
  action: z.literal('consume'),
  data: z.object({
    transportId: id,
    producerId: id,
    rtpCapabilities: opaqueObject,
  }).strict(),
}).strict();

const resumeConsumer = base.extend({
  action: z.literal('resumeConsumer'),
  data: z.object({ consumerId: id }).strict(),
}).strict();

const leave = base.extend({ action: z.literal('leave'), data: z.object({}).strict().default({}) }).strict();

export const signalingRequestSchema = z.discriminatedUnion('action', [
  authenticate,
  capabilities,
  createTransport,
  connectTransport,
  produceAudio,
  producerAction('pauseProducer'),
  producerAction('resumeProducer'),
  producerAction('closeProducer'),
  consume,
  resumeConsumer,
  leave,
]);

export type SignalingRequest = z.infer<typeof signalingRequestSchema>;

export type SignalingResponse = {
  version: typeof PROTOCOL_VERSION;
  requestId: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
};

export type ServerEventName =
  | 'peerJoined'
  | 'peerLeft'
  | 'newProducer'
  | 'producerClosed'
  | 'participantMuted'
  | 'activeSpeakers'
  | 'callEnded'
  | 'membershipRevoked'
  | 'reconnectRequired';

export type ServerEvent = {
  version: typeof PROTOCOL_VERSION;
  event: ServerEventName;
  data: Readonly<Record<string, unknown>>;
};

export function successResponse(requestIdValue: string, data: unknown = {}): SignalingResponse {
  return { version: PROTOCOL_VERSION, requestId: requestIdValue, ok: true, data };
}

export function errorResponse(requestIdValue: string, code: string, message: string): SignalingResponse {
  return { version: PROTOCOL_VERSION, requestId: requestIdValue, ok: false, error: { code, message } };
}

export function serverEvent(event: ServerEventName, data: Readonly<Record<string, unknown>>): ServerEvent {
  return { version: PROTOCOL_VERSION, event, data };
}
