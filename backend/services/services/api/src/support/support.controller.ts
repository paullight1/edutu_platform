import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createSupportRequestSchema,
  type CreateSupportRequestDto,
} from "./support.dto";
import { SupportService } from "./support.service";

@Controller("support")
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // Public so signed-out visitors can reach support. Tightly throttled to keep
  // the form from being abused as a spam relay.
  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async submit(
    @Body(new ZodValidationPipe(createSupportRequestSchema))
    body: CreateSupportRequestDto,
  ) {
    return this.supportService.submit(body);
  }
}
