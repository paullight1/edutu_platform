import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminApiError,
  adminApiJson,
  getAdminAuthHeaders,
} from "./apiClient";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAdminRuntimeConfig: vi.fn(),
  isLocalAdminBypassEnabled: vi.fn(),
  getLocalAdminEmail: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

vi.mock("./runtimeConfig", () => ({
  getAdminRuntimeConfig: mocks.getAdminRuntimeConfig,
}));

vi.mock("./localAdmin", () => ({
  isLocalAdminBypassEnabled: mocks.isLocalAdminBypassEnabled,
  getLocalAdminEmail: mocks.getLocalAdminEmail,
}));

function successfulSession() {
  mocks.getSession.mockResolvedValue({
    data: {
      session: {
        access_token: "test-access-token",
        user: { email: "admin@edutu.org" },
      },
    },
  });
}

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
}

describe("getAdminAuthHeaders", () => {
  beforeEach(() => {
    mocks.isLocalAdminBypassEnabled.mockReturnValue(false);
    mocks.getLocalAdminEmail.mockReturnValue("local-admin@edutu.org");
    successfulSession();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("adds the bearer token and admin email while preserving caller headers", async () => {
    await expect(
      getAdminAuthHeaders({ "Content-Type": "application/json" }),
    ).resolves.toEqual({
      authorization: "Bearer test-access-token",
      "content-type": "application/json",
      "x-edutu-admin-email": "admin@edutu.org",
    });
  });

  it("preserves the development-only local bypass contract", async () => {
    mocks.isLocalAdminBypassEnabled.mockReturnValue(true);

    await expect(getAdminAuthHeaders()).resolves.toEqual({
      "x-edutu-admin-email": "local-admin@edutu.org",
    });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});

describe("adminApiJson", () => {
  beforeEach(() => {
    mocks.getAdminRuntimeConfig.mockReturnValue({
      apiOrigin: "https://api.example.com",
      source: "VITE_BACKEND_URL",
      explicit: true,
      mode: "production",
    });
    mocks.isLocalAdminBypassEnabled.mockReturnValue(false);
    mocks.getLocalAdminEmail.mockReturnValue("local-admin@edutu.org");
    successfulSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("sends authenticated requests to the configured origin with a request ID", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await expect(
      adminApiJson<{ ok: boolean }>("/api/scraper/engine-status", {
        headers: { "X-Custom": "yes" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/scraper/engine-status");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-access-token");
    expect(headers.get("X-Edutu-Admin-Email")).toBe("admin@edutu.org");
    expect(headers.get("X-Custom")).toBe("yes");
    expect(headers.get("X-Request-Id")).toMatch(/\S+/u);
  });

  it.each([
    [401, "authentication"],
    [403, "authorization"],
    [503, "http"],
  ] as const)(
    "classifies HTTP %s failures as %s and preserves the server request ID",
    async (status, category) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(
          { message: "database password secret" },
          {
            status,
            headers: { "x-request-id": `server-${status}` },
          },
        ),
      );

      let captured: unknown;
      try {
        await adminApiJson("/api/scraper/engine-status");
      } catch (error) {
        captured = error;
      }

      expect(captured).toBeInstanceOf(AdminApiError);
      expect(captured).toMatchObject({
        category,
        status,
        requestId: `server-${status}`,
        targetOrigin: "https://api.example.com",
      });
      expect(String(captured)).not.toContain("database password secret");
      expect(String(captured)).not.toContain("test-access-token");
    },
  );

  it("classifies aborted requests caused by the client timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted", "AbortError"),
    );

    await expect(
      adminApiJson("/api/scraper/engine-status", { timeoutMs: 1 }),
    ).rejects.toMatchObject({
      category: "timeout",
      status: undefined,
    });
  });

  it("classifies transport failures as network errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    await expect(
      adminApiJson("/api/scraper/engine-status"),
    ).rejects.toMatchObject({ category: "network" });
  });

  it("rejects a successful response that is not valid JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 200 }),
    );

    await expect(
      adminApiJson("/api/scraper/engine-status"),
    ).rejects.toMatchObject({ category: "invalid-response", status: 200 });
  });

  it("classifies a missing admin session without leaking authentication details", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    await expect(
      adminApiJson("/api/scraper/engine-status"),
    ).rejects.toMatchObject({ category: "authentication" });
  });
});
