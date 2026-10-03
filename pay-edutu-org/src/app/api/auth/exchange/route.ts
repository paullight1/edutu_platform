import { NextRequest, NextResponse } from "next/server";
import {
  bachsCheckoutUrl,
  isTrustedPayShellOrigin,
  readBackendSession,
} from "@/lib/auth";
import { billingApiRequest } from "@/lib/billing-api";
import { config } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_TIME_CODE = /^[A-Za-z0-9._~-]{32,2048}$/;

export async function POST(req: NextRequest) {
  if (!isTrustedPayShellOrigin(req.headers.get("origin"))) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  let code: string;
  try {
    const body = await req.json();
    code = typeof body?.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!ONE_TIME_CODE.test(code))
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  let response: Response;
  try {
    response = await billingApiRequest("/billing/pay-shell/exchange", code, {
      method: "POST",
    });
  } catch {
    return NextResponse.json({ error: "payments_not_ready" }, { status: 503 });
  }
  if (!response.ok)
    return NextResponse.json(
      {
        error:
          response.status >= 500
            ? "payments_not_ready"
            : "authentication_failed",
      },
      { status: response.status >= 500 ? 503 : 401 },
    );

  let body: {
    session?: unknown;
    expiresAt?: unknown;
    destination?: unknown;
    checkoutUrl?: unknown;
  };
  try {
    body = await response.json();
  } catch {
    return NextResponse.json(
      { error: "authentication_failed" },
      { status: 401 },
    );
  }
  const session = readBackendSession(body.session as string | undefined);
  if (!session)
    return NextResponse.json(
      { error: "authentication_failed" },
      { status: 401 },
    );

  const expiresAt =
    typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : NaN;
  const maxAge = Math.min(900, Math.floor((expiresAt - Date.now()) / 1_000));
  const url =
    body.destination === "checkout"
      ? bachsCheckoutUrl(body.checkoutUrl)
      : body.destination === "account"
        ? "/account"
        : body.destination === "result"
          ? "/result"
          : null;
  if (!Number.isFinite(maxAge) || maxAge <= 0 || !url) {
    return NextResponse.json(
      { error: "authentication_failed" },
      { status: 401 },
    );
  }
  const result = NextResponse.json(
    { url },
    { headers: { "Cache-Control": "no-store" } },
  );
  result.cookies.set(config.sessionCookieName(), session, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return result;
}
