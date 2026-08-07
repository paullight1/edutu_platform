import { describe, expect, it } from "vitest";
import {
  buildSignalingRequest,
  clientSignalingRequestSchema,
  consumeResponseSchema,
  emptyResponseSchema,
  eventMessageSchema,
  responseMessageSchema,
  rtpCapabilitiesSchema,
  serverEventSchema,
} from "../signaling";

const REQUEST_ID = "web-1722969000000-1";

describe("community voice signaling v1 contract", () => {
  it.each([
    ["authenticate", { token: "t".repeat(32) }],
    ["getRouterRtpCapabilities", {}],
    ["createTransport", { direction: "send" }],
    ["connectTransport", { transportId: "transport-1", dtlsParameters: {} }],
    ["produceAudio", { transportId: "transport-1", rtpParameters: {} }],
    ["pauseProducer", { producerId: "producer-1" }],
    ["resumeProducer", { producerId: "producer-1" }],
    ["closeProducer", { producerId: "producer-1" }],
    ["consume", { transportId: "recv-1", producerId: "producer-1", rtpCapabilities: {} }],
    ["resumeConsumer", { consumerId: "consumer-1" }],
    ["leave", {}],
  ] as const)("accepts the exact %s action payload", (action, data) => {
    const frame = {
      version: 1,
      requestId: REQUEST_ID,
      action,
      data,
    };
    expect(clientSignalingRequestSchema.safeParse(frame).success).toBe(true);
    expect(clientSignalingRequestSchema.safeParse({
      ...frame,
      data: { ...data, forbiddenContractField: true },
    }).success).toBe(false);
  });

  it("builds typeless action frames accepted by the gateway", () => {
    expect(buildSignalingRequest(REQUEST_ID, "createTransport", { direction: "recv" })).toEqual({
      version: 1,
      requestId: REQUEST_ID,
      action: "createTransport",
      data: { direction: "recv" },
    });
  });

  it("rejects fields forbidden by gateway strict schemas", () => {
    expect(clientSignalingRequestSchema.safeParse({
      version: 1,
      requestId: REQUEST_ID,
      action: "createTransport",
      data: { direction: "recv", rtpCapabilities: {} },
    }).success).toBe(false);
    expect(clientSignalingRequestSchema.safeParse({
      version: 1,
      requestId: REQUEST_ID,
      action: "produceAudio",
      data: { transportId: "send-1", rtpParameters: {} },
      type: "request",
    }).success).toBe(false);
    expect(clientSignalingRequestSchema.safeParse({
      version: 1,
      requestId: REQUEST_ID,
      action: "produceAudio",
      data: { transportId: "send-1", rtpParameters: {}, kind: "audio", appData: {} },
    }).success).toBe(false);
  });

  it("requires the receive transport when consuming", () => {
    expect(clientSignalingRequestSchema.safeParse({
      version: 1,
      requestId: REQUEST_ID,
      action: "consume",
      data: { producerId: "producer-1", rtpCapabilities: {} },
    }).success).toBe(false);
    expect(clientSignalingRequestSchema.safeParse({
      version: 1,
      requestId: REQUEST_ID,
      action: "consume",
      data: { transportId: "recv-1", producerId: "producer-1", rtpCapabilities: {} },
    }).success).toBe(true);
  });

  it("accepts typeless gateway responses and peer-based events", () => {
    expect(responseMessageSchema.safeParse({
      version: 1,
      requestId: REQUEST_ID,
      ok: true,
      data: {},
    }).success).toBe(true);
    expect(responseMessageSchema.safeParse({
      version: 1,
      requestId: REQUEST_ID,
      ok: true,
      data: {},
      type: "response",
    }).success).toBe(false);
    expect(eventMessageSchema.safeParse({
      version: 1,
      event: "activeSpeakers",
      data: { speakers: [{ peerId: "peer-1", volume: -38 }] },
    }).success).toBe(true);
    expect(eventMessageSchema.safeParse({
      version: 1,
      event: "activeSpeakers",
      data: { speakers: [] },
      type: "event",
    }).success).toBe(false);
    expect(serverEventSchema.safeParse({
      event: "activeSpeakers",
      data: { speakers: [{ peerId: "peer-1", volume: -38 }] },
    }).success).toBe(true);
    expect(serverEventSchema.safeParse({
      event: "activeSpeakers",
      data: { userIds: ["user-1"] },
    }).success).toBe(false);
  });

  it("validates direct capabilities, empty responses, and the complete consume response", () => {
    expect(rtpCapabilitiesSchema.safeParse({
      codecs: [{ kind: "audio", mimeType: "audio/opus", clockRate: 48000 }],
    }).success).toBe(true);
    expect(rtpCapabilitiesSchema.safeParse({
      rtpCapabilities: { codecs: [] },
    }).success).toBe(false);
    expect(emptyResponseSchema.safeParse({}).success).toBe(true);
    expect(emptyResponseSchema.safeParse({ resumed: true }).success).toBe(false);
    expect(consumeResponseSchema.safeParse({
      id: "consumer-1",
      producerId: "producer-1",
      peerId: "peer-1",
      kind: "audio",
      rtpParameters: {},
      type: "simple",
      producerPaused: true,
    }).success).toBe(true);
  });
});
