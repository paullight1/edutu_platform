import { Injectable } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { resolveConfiguredClerkIssuer } from "../auth/clerk-production-config";
import { isOAuthAccessTokenType } from "../auth/oauth-access-token";

export const OPPORTUNITIES_SCOPE = "opportunities:read";

@Injectable()
export class CodexMcpAuth {
  readonly issuer = resolveConfiguredClerkIssuer();
  readonly resource =
    process.env.EDUTU_MCP_RESOURCE_URL?.trim() ||
    "https://backend.edutu.org/mcp";

  private readonly keys = this.issuer
    ? createRemoteJWKSet(new URL("/.well-known/jwks.json", this.issuer))
    : null;

  async authenticate(authorization: string | undefined) {
    const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || !this.issuer || !this.keys) return null;

    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        audience: this.resource,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "sub"],
      });
      if (
        !isOAuthAccessTokenType(protectedHeader.typ) ||
        typeof payload.sub !== "string" ||
        !payload.sub.startsWith("user_")
      ) {
        return null;
      }
      return {
        userId: payload.sub,
        scopes: Array.isArray(payload.scp)
          ? payload.scp.filter(
              (scope): scope is string => typeof scope === "string",
            )
          : typeof payload.scope === "string"
            ? payload.scope.split(/\s+/)
            : [],
      };
    } catch {
      return null;
    }
  }
}
