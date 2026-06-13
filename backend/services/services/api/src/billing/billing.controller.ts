import { Body, Controller, Get, Headers, Post, Req } from "@nestjs/common";
import { Public, CurrentUser } from "../auth";
import { BillingService } from "./billing.service";
import type { CreateCheckoutDto } from "./dto/billing.dto";

@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("status")
  getStatus(@CurrentUser("id") userId: string) {
    return this.billingService.getStatus(userId);
  }

  @Post("checkout")
  createCheckout(
    @CurrentUser("id") userId: string,
    @CurrentUser("email") email: string | undefined,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(userId, email, dto);
  }

  @Public()
  @Post("webhooks/paystack")
  handlePaystackWebhook(
    @Headers("x-paystack-signature") signature: string | undefined,
    @Req() request: any,
  ) {
    return this.billingService.handlePaystackWebhook(
      request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})),
      request.body,
      signature,
    );
  }
}
