import { Controller, HttpException, Post, Req } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import {
  ScraperEgressRequestError,
  ScraperEgressService,
} from "./scraper-egress.service";

type RawBodyRequest = {
  rawBody?: Buffer;
  get?: (name: string) => string | undefined;
  socket?: { remoteAddress?: string };
};

@Public()
@Controller("internal/scraper-egress")
export class ScraperEgressController {
  constructor(private readonly scraperEgressService: ScraperEgressService) {}

  @Post()
  async fetch(@Req() request: RawBodyRequest) {
    try {
      return await this.scraperEgressService.fetchSigned({
        rawBody: request.rawBody as Buffer,
        timestamp: request.get?.("x-edutu-egress-timestamp"),
        signature: request.get?.("x-edutu-egress-signature"),
        ...(request.get?.("x-edutu-egress-principal")
          ? { principal: request.get("x-edutu-egress-principal") }
          : {}),
        ...(request.socket?.remoteAddress
          ? { clientIp: request.socket.remoteAddress }
          : {}),
      });
    } catch (error) {
      const status =
        error instanceof ScraperEgressRequestError ? error.status : 502;
      throw new HttpException(
        { error: "Request could not be processed" },
        status,
      );
    }
  }
}
