import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { Public, CurrentUser } from "../auth";
import { AdminGuard } from "../auth/admin.guard";
import { BillingCheckoutService } from "./billing-checkout.service";
import { BillingPayShellService } from "./billing-pay-shell.service";
import { isApiCreditProductKey } from "./types/billing-checkout.types";
import { BillingPortalService } from "./billing-portal.service";
import { BillingService } from "./billing.service";
import { BachsWebhookService } from "./bachs-webhook.service";
import { CreateBachsCheckoutDto } from "./dto/create-checkout.dto";
import type { CreateCheckoutDto } from "./dto/billing.dto";
import { BACHS_WEBHOOK_SERVICE } from "./types/billing-checkout.types";
import {
  REVENUECAT_WEBHOOK_SERVICES,
  type RevenueCatWebhookServices,
} from "./revenuecat-webhook.service";

@Controller("billing")
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly billingCheckoutService: BillingCheckoutService,
    private readonly billingPortalService: BillingPortalService,
    @Inject(BACHS_WEBHOOK_SERVICE)
    private readonly bachsWebhookService: BachsWebhookService | null,
    @Optional()
    @Inject(REVENUECAT_WEBHOOK_SERVICES)
    private readonly revenueCatWebhookServices?: RevenueCatWebhookServices,
    @Optional() private readonly payShell?: BillingPayShellService,
  ) {}

  @Get("status")
  getStatus(@CurrentUser("authId") userId: string) {
    return this.billingService.getStatus(userId);
  }

  @Get("user-catalog")
  async getUserCatalog() {
    const catalog = await this.billingCheckoutService.getUserCatalog();
    const checkoutEnabled = (await this.payShell?.isReady()) ?? false;
    return {
      ...catalog,
      checkoutEnabled,
      checkoutUnavailableReason: checkoutEnabled
        ? null
        : "Hosted payment completion is not ready yet",
    };
  }

  @Get("intents/:id")
  getCheckoutStatus(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
  ) {
    return this.billingCheckoutService.getOwnedCheckoutStatus(userId, id);
  }

  @Get("catalog")
  getCatalog(@CurrentUser("authId") userId: string) {
    return this.billingCheckoutService.getPublicApiCreditCatalog(userId);
  }

  @Post("consumer-checkout")
  @Header("Cache-Control", "no-store")
  async createConsumerCheckout(
    @CurrentUser("authId") rawAuthSubject: string,
    @CurrentUser("email") email: string | undefined,
    @CurrentUser("firstName") firstName: string | undefined,
    @CurrentUser("lastName") lastName: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: CreateBachsCheckoutDto,
  ) {
    await this.assertHostedCheckoutReady();
    if (isApiCreditProductKey(dto?.productKey)) {
      throw new BadRequestException(
        "API credit products require a developer checkout",
      );
    }
    return this.createBachsCheckout(
      rawAuthSubject,
      email,
      firstName,
      lastName,
      idempotencyKey,
      dto,
    );
  }

  private async assertHostedCheckoutReady(): Promise<void> {
    if (!this.payShell)
      throw new ServiceUnavailableException(
        "Hosted payment completion is not ready yet",
      );
    await this.payShell.assertReady();
  }

  @Post("checkout")
  @Header("Cache-Control", "no-store")
  async createBachsCheckout(
    @CurrentUser("authId") rawAuthSubject: string,
    @CurrentUser("email") email: string | undefined,
    @CurrentUser("firstName") firstName: string | undefined,
    @CurrentUser("lastName") lastName: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: CreateBachsCheckoutDto,
  ) {
    await this.assertHostedCheckoutReady();

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
    const handoff = await this.payShell!.issueHandoff(rawAuthSubject, {
      destination: "checkout",
      intentId: result.intentId,
      checkoutUrl: result.checkoutUrl,
    });
    return {
      checkoutUrl: handoff.url,
      intentId: result.intentId,
      expiresAt: result.expiresAt,
      handoffExpiresAt: handoff.expiresAt,
      renewalMode: result.renewalMode,
      validityDays: result.productSnapshot.validityDays,
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
    if (
      process.env.BACHS_CHECKOUT_ENABLED === "true" ||
      process.env.LEGACY_PAYSTACK_CHECKOUT_ENABLED !== "true"
    ) {
      throw new ServiceUnavailableException(
        "New Paystack checkout is disabled; use the Bachs checkout.",
      );
    }
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
  @HttpCode(HttpStatus.ACCEPTED)
  handleBachsWebhook(
    @Headers("x-bachs-timestamp") timestamp: string | undefined,
    @Headers("x-bachs-signature") signature: string | undefined,
    @Req() request: any,
  ) {
    if (!this.bachsWebhookService) {
      throw new ServiceUnavailableException("Bachs webhook is unavailable.");
    }
    if (!request.rawBody) {
      throw new UnauthorizedException(
        "Raw request body unavailable; cannot verify webhook signature",
      );
    }
    return this.bachsWebhookService.handle(
      request.rawBody,
      timestamp,
      signature,
    );
  }

  @Public()
  @Post("webhooks/revenuecat/:environment")
  @HttpCode(HttpStatus.ACCEPTED)
  async handleRevenueCatWebhook(
    @Param("environment") environment: string,
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-revenuecat-webhook-signature") signature: string | undefined,
    @Req() request: { rawBody?: Buffer },
  ) {
    if (environment !== "sandbox" && environment !== "production") {
      throw new BadRequestException(
        "RevenueCat webhook environment must be sandbox or production.",
      );
    }
    if (!Buffer.isBuffer(request.rawBody)) {
      throw new UnauthorizedException(
        "Raw request body unavailable; cannot verify webhook signature",
      );
    }
    const service = this.revenueCatWebhookServices?.[environment];
    if (!service) {
      throw new ServiceUnavailableException(
        "RevenueCat webhook is unavailable.",
      );
    }
    return service.handle(request.rawBody, authorization, signature);
  }
}
