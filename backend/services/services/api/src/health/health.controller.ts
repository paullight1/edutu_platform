import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth";
import { HealthService } from "./health.service";
import type { HealthStatus } from "./health.service";

@Controller("health")
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthStatus {
    return this.healthService.getStatus();
  }
}
