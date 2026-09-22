import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

/** Authenticates Cresciva's server-to-server engine requests. */
@Injectable()
export class CrescivaEngineGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configured = process.env.CRESCIVA_ENGINE_API_KEY?.trim();
    if (!configured) {
      throw new ServiceUnavailableException(
        "Cresciva engine integration is not configured",
      );
    }

    const request = context.switchToHttp().getRequest();
    const raw = request.headers["x-cresciva-engine-key"];
    const supplied = Array.isArray(raw) ? raw[0] : raw;
    if (
      typeof supplied !== "string" ||
      !safeEqual(configured, supplied.trim())
    ) {
      throw new UnauthorizedException("Invalid Cresciva engine key");
    }
    return true;
  }
}

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}
