import WebSocket from "ws";

// Node 20 does not expose a native WebSocket. Install the server transport
// before any module can construct a Supabase client (and therefore its
// RealtimeClient), otherwise application imports fail before Nest can start.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
