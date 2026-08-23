import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../auth";
import { HealthService } from "./health.service";
import type { LivenessStatus, ReadinessStatus } from "./health.service";

@Controller("health")
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): Promise<ReadinessStatus> {
    return this.ready();
  }

  @Get("live")
  live(): LivenessStatus {
    return this.healthService.getLiveness();
  }

  @Get("ready")
  async ready(): Promise<ReadinessStatus> {
    const status = await this.healthService.getReadiness();
    if (status.status === "not_ready") {
      throw new ServiceUnavailableException(status);
    }
    return status;
  }
}
