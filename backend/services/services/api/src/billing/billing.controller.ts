import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Public, CurrentUser } from "../auth";
import { AdminGuard } from "../auth/admin.guard";
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

  // Admin monetization oversight: revenue, subscribers, credit purchases and
  // spend, top spenders, today's AI usage — powers the admin Monetization page.
  @Get("admin/overview")
  @UseGuards(AdminGuard)
  getAdminOverview() {
    return this.billingService.getAdminOverview();
  }

  @Get("admin/transactions")
  @UseGuards(AdminGuard)
  listAdminTransactions(
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ) {
    return this.billingService.listAdminTransactions(limit, offset);
  }

  @Public()
  @Post("webhooks/paystack")
  handlePaystackWebhook(
    @Headers("x-paystack-signature") signature: string | undefined,
    @Req() request: any,
  ) {
    // SECURITY: the signature must be verified against the exact raw bytes
    // Paystack sent. Re-serializing the parsed body is not equivalent and
    // could let a forged payload pass — reject if the raw body is missing.
    if (!request.rawBody) {
      throw new UnauthorizedException(
        "Raw request body unavailable; cannot verify webhook signature",
      );
    }
    return this.billingService.handlePaystackWebhook(
      request.rawBody,
      request.body,
      signature,
    );
  }
}
