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
import { randomUUID } from "crypto";
import { Public, CurrentUser } from "../auth";
import { AdminGuard } from "../auth/admin.guard";
import { BillingCheckoutService } from "./billing-checkout.service";
import { BillingPortalService } from "./billing-portal.service";
import { BillingService } from "./billing.service";
import { CreateBachsCheckoutDto } from "./dto/create-checkout.dto";
import type { CreateCheckoutDto } from "./dto/billing.dto";

@Controller("billing")
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly billingCheckoutService: BillingCheckoutService,
    private readonly billingPortalService: BillingPortalService,
  ) {}

  @Get("status")
  getStatus(@CurrentUser("id") userId: string) {
    return this.billingService.getStatus(userId);
  }

  @Post("checkout")
  async createBachsCheckout(
    @CurrentUser("authId") rawAuthSubject: string,
    @CurrentUser("email") email: string | undefined,
    @CurrentUser("firstName") firstName: string | undefined,
    @CurrentUser("lastName") lastName: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: CreateBachsCheckoutDto,
  ) {
    const result = await this.billingCheckoutService.createCheckout(
      rawAuthSubject,
      idempotencyKey ?? "",
      {
        productKey: dto.productKey,
        returnSurface:
          dto.returnSurface === "mobile_web" ? "pwa" : dto.returnSurface,
      },
      email
        ? {
            status: "resolved",
            email,
            ...(firstName || lastName
              ? { name: [firstName, lastName].filter(Boolean).join(" ") }
              : {}),
          }
        : undefined,
    );
    return {
      checkoutUrl: result.checkoutUrl,
      intentId: result.intentId,
      expiresAt: result.expiresAt,
    };
  }

  /**
   * Retains the old Paystack initializer for already-integrated callers while
   * all new web and PWA callers use POST /billing/checkout above.
   */
  @Post("checkout/paystack")
  createLegacyCheckout(
    @CurrentUser("id") userId: string,
    @CurrentUser("email") email: string | undefined,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(userId, email, dto);
  }

  @Post("portal-session")
  createBachsPortalSession(@CurrentUser("authId") rawAuthSubject: string) {
    return this.billingPortalService.createPortalSession(
      rawAuthSubject,
      randomUUID(),
    );
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

  @Public()
  @Post("webhooks/bachs")
  handleBachsWebhook(
    @Headers("x-bachs-timestamp") timestamp: string | undefined,
    @Headers("x-bachs-signature") signature: string | undefined,
    @Req() request: any,
  ) {
    if (!request.rawBody) {
      throw new UnauthorizedException(
        "Raw request body unavailable; cannot verify webhook signature",
      );
    }
    return this.billingService.handleBachsWebhook(
      request.rawBody,
      request.body,
      timestamp,
      signature,
    );
  }
}
