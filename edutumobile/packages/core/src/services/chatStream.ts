import { SendChatMessageResult } from '../types/chat';
import { ChatRateLimitError, SendChatMessageOptions } from './chat';

/**
 * SSE client for `POST /chat/messages/stream`.
 *
 * Lives beside `chat.ts` rather than inside it because the two paths have
 * genuinely different shapes: `sendChatMessage` is a request/response call with
 * a supabase chat-proxy fallback, while this one is a byte-stream reader with a
 * parser, an abort surface and an event contract. Keeping it separate also
 * keeps `expo/fetch` (a native-backed module) out of `chat.ts`, which is
 * imported by tests and non-streaming callers.
 *
 * Contract (authoritative comment: backend chat.controller.ts:55-82):
 *   turn.start → (tool.start/tool.result)* → token* → turn.final | turn.error
 *
 * DISCARD RULE: on `tool.start` the token buffer is cleared. Text streamed
 * before a tool call came from a round that went on to call tools, so it is by
 * construction NOT part of `turn.final` (typically a "let me check…" preamble).
 * `turn.final` is always authoritative and callers reconcile against it.
 */

// --- UTF-8 stream decoding ---------------------------------------------------
// A multi-byte character can straddle a chunk boundary, and Edutu ships Arabic,
// Chinese, Hindi and Swahili — a per-chunk decode would produce visible
// mojibake for exactly the users this feature exists for. So we hold back any
// trailing incomplete sequence and prepend it to the next chunk.

/** Bytes in the UTF-8 sequence a lead byte opens (1 for ASCII/invalid). */
function sequenceLength(byte: number): number {
  if (byte < 0x80) return 1;
  if ((byte & 0xe0) === 0xc0) return 2;
  if ((byte & 0xf0) === 0xe0) return 3;
  if ((byte & 0xf8) === 0xf0) return 4;
  return 1;
}

/**
 * Length of the longest prefix of `bytes` that ends on a complete UTF-8
 * sequence. Anything after it is a partial character to carry over.
 */
function completeByteLength(bytes: Uint8Array): number {
  // A sequence is at most 4 bytes, so only the last 4 can be incomplete.
  for (let back = 1; back <= 4 && back <= bytes.length; back += 1) {
    const byte = bytes[bytes.length - back];
    if ((byte & 0xc0) === 0x80) continue; // continuation byte — keep walking back
    const size = sequenceLength(byte);
    return size <= back ? bytes.length : bytes.length - back;
  }
  return bytes.length;
}

/** Decodes complete UTF-8 sequences to a JS string (surrogate pairs included). */
function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const lead = bytes[i];
    const size = sequenceLength(lead);
    if (i + size > bytes.length) {
      out += '�';
      break;
    }
    let codePoint: number;
    if (size === 1) {
      codePoint = lead < 0x80 ? lead : 0xfffd;
    } else {
      codePoint = lead & (0xff >> (size + 1));
      for (let k = 1; k < size; k += 1) {
        codePoint = (codePoint << 6) | (bytes[i + k] & 0x3f);
      }
    }
    i += size;
    if (codePoint > 0xffff) {
      const offset = codePoint - 0x10000;
      out += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
    } else {
      out += String.fromCharCode(codePoint);
    }
  }
  return out;
}

/** Incremental UTF-8 decoder that never emits half a character. */
export function createUtf8StreamDecoder() {
  let carry = new Uint8Array(0);

  return {
    decode(chunk: Uint8Array): string {
      let bytes: Uint8Array;
      if (carry.length === 0) {
        bytes = chunk;
      } else {
        bytes = new Uint8Array(carry.length + chunk.length);
        bytes.set(carry, 0);
        bytes.set(chunk, carry.length);
      }
      const usable = completeByteLength(bytes);
      carry = bytes.subarray(usable).slice();
      return usable === 0 ? '' : decodeUtf8(bytes.subarray(0, usable));
    },
    /** Flushes any trailing bytes (malformed input only) at end of stream. */
    flush(): string {
      if (carry.length === 0) return '';
      const rest = decodeUtf8(carry);
      carry = new Uint8Array(0);
      return rest;
    },
  };
}

// --- SSE frame parsing -------------------------------------------------------

export type SseFrame = { event: string; data: unknown };

/**
 * Byte-level SSE parser. Frames arrive as `event: <name>\ndata: <json>\n\n`,
 * but a chunk can hold several frames, split one mid-JSON, or split a
 * multi-byte character — all three are buffered until they are whole.
 *
 * Comment/keep-alive lines (`: ping`) and unknown fields are ignored; a frame
 * whose data is not valid JSON is dropped rather than throwing, so one bad
 * frame never kills a live answer.
 */
export function createSseParser(onFrame: (frame: SseFrame) => void) {
  const decoder = createUtf8StreamDecoder();
  let buffer = '';

  const emitBlock = (block: string) => {
    if (!block.trim()) return;
    let event = 'message';
    const dataLines: string[] = [];

    for (const rawLine of block.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      if (!line || line.startsWith(':')) continue; // blank or comment/keep-alive
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      // SSE strips exactly one leading space after the colon.
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') dataLines.push(value);
      // id/retry/unknown fields: ignored by design.
    }

    if (dataLines.length === 0) return;
    let data: unknown;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      return; // malformed frame — ignore, never throw
    }
    onFrame({ event, data });
  };

  const drain = () => {
    // Frames are separated by a blank line, which is \n\n or \r\n\r\n.
    let index = buffer.search(/\r?\n\r?\n/);
    while (index !== -1) {
      const block = buffer.slice(0, index);
      const separator = buffer.slice(index).match(/^\r?\n\r?\n/)![0];
      buffer = buffer.slice(index + separator.length);
      emitBlock(block);
      index = buffer.search(/\r?\n\r?\n/);
    }
  };

  return {
    push(chunk: Uint8Array) {
      buffer += decoder.decode(chunk);
      drain();
    },
    /** Flushes a final frame that arrived without its trailing blank line. */
    end() {
      buffer += decoder.flush();
      drain();
      if (buffer.trim()) {
        const block = buffer;
        buffer = '';
        emitBlock(block);
      }
    },
  };
}

// --- Streaming send ----------------------------------------------------------

/** The stream could not be established — the caller should fall back. */
export class ChatStreamUnavailableError extends Error {
  constructor(message = 'Chat stream unavailable') {
    super(message);
    this.name = 'ChatStreamUnavailableError';
  }
}

/** The stream established but died before `turn.final`. */
export class ChatStreamInterruptedError extends Error {
  /** Whatever the user already saw (post-discard-rule), so it is never lost. */
  readonly partialContent: string;

  constructor(partialContent: string, message = 'Chat stream ended early') {
    super(message);
    this.name = 'ChatStreamInterruptedError';
    this.partialContent = partialContent;
  }
}

/** The user pressed stop. Carries the text that had already arrived. */
export class ChatStreamAbortedError extends Error {
  readonly partialContent: string;

  constructor(partialContent: string) {
    super('Chat stream stopped by the user');
    this.name = 'ChatStreamAbortedError';
    this.partialContent = partialContent;
  }
}

export type ChatStreamHandlers = {
  /** Called with the FULL buffer so far on every delta and on every discard. */
  onContent?: (content: string) => void;
  /** Fired when the round called a tool and the token buffer was discarded. */
  onToolStart?: (tool: { id?: string; name?: string }) => void;
  /** The server flagged the answer as partial. */
  onTruncated?: () => void;
};

type StreamingFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  body: {
    getReader: () => {
      read: () => Promise<{ done: boolean; value?: Uint8Array }>;
      /** Optional: releases the socket so a pending `read()` cannot hang forever. */
      cancel?: () => Promise<unknown> | void;
    };
  } | null;
}>;

export type StreamChatMessageOptions = SendChatMessageOptions & {
  signal?: AbortSignal;
  handlers?: ChatStreamHandlers;
  /** Test seam. Production resolves `expo/fetch` lazily. */
  fetchImpl?: StreamingFetch;
};

function getApiBaseUrl() {
  return (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, '');
}

/**
 * Resolves the streaming-capable fetch. `expo/fetch` is required lazily and
 * defensively: on any runtime where it (or its ReadableStream body) is missing,
 * we return null and the caller falls back to the non-streaming send rather
 * than crashing the composer.
 */
export function resolveStreamingFetch(): StreamingFetch | null {
  try {
    const mod = require('expo/fetch') as { fetch?: StreamingFetch };
    return typeof mod?.fetch === 'function' ? mod.fetch : null;
  } catch {
    return null;
  }
}

function isAbortError(error: unknown) {
  const name = (error as { name?: string } | null)?.name;
  return name === 'AbortError' || name === 'ChatStreamAbortedError';
}

/**
 * Sends a chat message over SSE, streaming content to `handlers.onContent`.
 *
 * Throws:
 *  - `ChatRateLimitError`            — HTTP 429 or a 429 `turn.error`
 *  - `ChatStreamUnavailableError`    — could not establish (no token/base URL,
 *                                      no `expo/fetch`, non-2xx, no body,
 *                                      transport error before `turn.start`)
 *  - `ChatStreamAbortedError`        — the user pressed stop
 *  - `ChatStreamInterruptedError`    — established, then died before `turn.final`
 */
export async function streamChatMessage(
  options: StreamChatMessageOptions,
): Promise<SendChatMessageResult> {
  const apiBaseUrl = getApiBaseUrl();
  const token = options.authToken;
  if (!apiBaseUrl || !token) {
    throw new ChatStreamUnavailableError('Missing API base URL or auth token');
  }

  const streamingFetch = options.fetchImpl ?? resolveStreamingFetch();
  if (!streamingFetch) {
    throw new ChatStreamUnavailableError('expo/fetch streaming is unavailable');
  }

  let established = false;
  let content = '';
  let final: SendChatMessageResult | null = null;
  let failure: Error | null = null;
  let truncated = false;

  const emitContent = () => options.handlers?.onContent?.(content);

  const parser = createSseParser(({ event, data }) => {
    const payload = (data ?? {}) as Record<string, unknown>;
    switch (event) {
      case 'turn.start':
        established = true;
        break;
      case 'token': {
        const delta = payload.content;
        if (typeof delta === 'string' && delta.length > 0) {
          content += delta;
          emitContent();
        }
        break;
      }
      case 'tool.start':
        // THE DISCARD RULE — see the header comment.
        if (content !== '') {
          content = '';
          emitContent();
        }
        options.handlers?.onToolStart?.({
          id: typeof payload.id === 'string' ? payload.id : undefined,
          name: typeof payload.name === 'string' ? payload.name : undefined,
        });
        break;
      case 'turn.truncated':
        truncated = true;
        options.handlers?.onTruncated?.();
        break;
      case 'turn.final':
        final = data as SendChatMessageResult;
        break;
      case 'turn.error': {
        const status = typeof payload.status === 'number' ? payload.status : 500;
        const message = typeof payload.message === 'string' ? payload.message : 'Chat turn failed';
        failure = status === 429 ? new ChatRateLimitError() : new Error(message);
        break;
      }
      default:
        // Unknown events are ignored, exactly as the contract allows.
        break;
    }
  });

  let response: Awaited<ReturnType<StreamingFetch>>;
  try {
    response = await streamingFetch(`${apiBaseUrl}/chat/messages/stream`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        threadId: options.threadId,
        message: options.message,
        userId: options.userId,
        channel: options.channel,
        ...(options.context ? { context: options.context } : {}),
        ...(options.intent ? { intent: options.intent } : {}),
        ...(options.locale ? { locale: options.locale } : {}),
      }),
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      throw new ChatStreamAbortedError('');
    }
    throw new ChatStreamUnavailableError(
      error instanceof Error ? error.message : 'Chat stream request failed',
    );
  }

  if (response.status === 429) throw new ChatRateLimitError();
  if (!response.ok) {
    throw new ChatStreamUnavailableError(`Chat stream responded ${response.status}`);
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new ChatStreamUnavailableError('Chat stream response has no readable body');
  }

  const reader = response.body.getReader();
  // The `signal.aborted` check inside the loop only helps if another chunk
  // arrives to unblock the pending `read()` — which never happens on a dead
  // socket. Cancelling the reader is what actually rejects (or resolves) that
  // read, so `finally` runs, `isSending` clears and the composer is not stuck
  // on Stop forever while the socket keeps burning the user's data.
  const cancelReader = () => { void Promise.resolve(reader.cancel?.()).catch(() => {}); };
  options.signal?.addEventListener('abort', cancelReader);
  try {
    for (;;) {
      // Belt-and-braces: don't depend on the transport rejecting on abort, or a
      // stop press could leave the composer generating forever.
      if (options.signal?.aborted) throw new ChatStreamAbortedError(content);
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) parser.push(value);
      if (final || failure) break;
    }
    parser.end();
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      throw new ChatStreamAbortedError(content);
    }
    if (!final && !failure) {
      throw established
        ? new ChatStreamInterruptedError(content)
        : new ChatStreamUnavailableError(
          error instanceof Error ? error.message : 'Chat stream read failed',
        );
    }
  } finally {
    // Don't leak the listener onto a signal the caller may keep alive.
    options.signal?.removeEventListener('abort', cancelReader);
  }

  if (options.signal?.aborted && !final) {
    throw new ChatStreamAbortedError(content);
  }
  if (failure) throw failure;
  if (!final) {
    // Established but no authoritative turn.final: partial text (if any) is the
    // only thing the user has, so hand it back instead of dropping it.
    throw established
      ? new ChatStreamInterruptedError(content)
      : new ChatStreamUnavailableError('Chat stream closed before it started');
  }

  const result = final as SendChatMessageResult;
  if (truncated && result.assistantMessage) {
    result.assistantMessage = {
      ...result.assistantMessage,
      metadata: { ...(result.assistantMessage.metadata ?? {}), truncated: true },
    };
  }
  return result;
}
