import { ExecutionContext } from "@nestjs/common";
import { verifyToken } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";
import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";
import { ClerkAuthGuard } from "./clerk-auth.guard";

jest.mock("@clerk/backend", () => ({
  verifyToken: jest.fn(),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

jest.mock("../db", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

const mockedVerifyToken = verifyToken as jest.MockedFunction<
  typeof verifyToken
>;
const mockedCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;
const mockedDb = db as unknown as {
  select: jest.Mock;
  insert: jest.Mock;
};

function createContext(
  headers: Record<string, string>,
  reflectorValue = false,
) {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers,
  };
  const context = {
    getHandler: () => function handler() {},
    getClass: () => function clazz() {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request, reflectorValue };
}

function createGuard(reflectorValue = false) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(reflectorValue),
  };
  const clerkClient = {
    users: {
      getUser: jest.fn().mockResolvedValue(null),
    },
  };
  const guard = new ClerkAuthGuard(reflector as any, clerkClient as any);
  jest.spyOn(guard as any, "touchLastSeen").mockImplementation(() => undefined);
  return { guard, reflector };
}

describe("ClerkAuthGuard", () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    EDUTU_LOCAL_ADMIN_BYPASS: process.env.EDUTU_LOCAL_ADMIN_BYPASS,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "test";
    delete process.env.EDUTU_LOCAL_ADMIN_BYPASS;
    process.env.CLERK_SECRET_KEY = "sk_test_clerk";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    mockedCreateClient.mockReset();
    mockedDb.select.mockReturnValue({
      from: () => ({
        where: () => ({
          execute: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockedDb.insert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: () => ({
          execute: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.EDUTU_LOCAL_ADMIN_BYPASS = originalEnv.EDUTU_LOCAL_ADMIN_BYPASS;
    process.env.CLERK_SECRET_KEY = originalEnv.CLERK_SECRET_KEY;
    process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = originalEnv.SUPABASE_ANON_KEY;
  });

  it("rejects a protected request without an Authorization header", async () => {
    const { guard } = createGuard();
    const { context } = createContext({});

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("populates canonical identity from a verified Clerk bearer token", async () => {
    mockedVerifyToken.mockResolvedValue({
      sub: "user_clerk_123",
      email: "clerk@example.com",
    } as any);
    const { guard } = createGuard();
    const { context, request } = createContext({
      authorization: "Bearer clerk-token",
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      id: toDatabaseUserId("user_clerk_123"),
      authId: "user_clerk_123",
      email: "clerk@example.com",
      authProvider: "clerk",
    });
  });

  it("does not allow an Edutu API key to authorize a Clerk-only route", async () => {
    mockedVerifyToken.mockRejectedValue(new Error("invalid token"));
    const { guard, reflector } = createGuard();
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === "clerkOnly" ? true : false,
    );
    const { context } = createContext({
      authorization: "Bearer edu_live_12345678_secret",
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("does not allow a Supabase bearer token to authorize a Clerk-only route", async () => {
    mockedVerifyToken.mockRejectedValue(new Error("not a Clerk token"));
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    mockedCreateClient.mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "supabase-user", email: "user@example.com" } },
          error: null,
        }),
      },
    } as any);
    const { guard, reflector } = createGuard();
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === "clerkOnly" ? true : false,
    );
    const { context } = createContext({
      authorization: "Bearer supabase-token",
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("does not allow the local admin bypass in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.EDUTU_LOCAL_ADMIN_BYPASS = "true";
    const { guard } = createGuard();
    const { context } = createContext({
      "x-edutu-admin-email": "admin@example.com",
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("allows the local admin bypass only in explicit development mode", async () => {
    process.env.NODE_ENV = "development";
    process.env.EDUTU_LOCAL_ADMIN_BYPASS = "true";
    const { guard } = createGuard();
    const { context } = createContext({
      "x-edutu-admin-email": "admin@example.com",
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each([undefined, "", "staging", "production-like"])(
    "does not allow the local admin bypass in NODE_ENV=%s",
    async (nodeEnv) => {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      process.env.EDUTU_LOCAL_ADMIN_BYPASS = "true";
      const { guard } = createGuard();
      const { context } = createContext({
        "x-edutu-admin-email": "admin@example.com",
      });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: 401,
      });
    },
  );
});
