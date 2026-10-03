import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
} from "@nestjs/common";
import { IsIn, IsOptional, IsUUID } from "class-validator";
import { Public, CurrentUser } from "../auth";
import { randomUUID } from "crypto";
import { BillingPayShellService } from "./billing-pay-shell.service";
import { BillingPortalService } from "./billing-portal.service";

class PayShellHandoffDto {
  @IsIn(["result", "account"])
  destination!: "result" | "account";
  @IsOptional()
  @IsUUID()
  intentId?: string;
}

@Controller("billing")
export class BillingPayShellController {
  constructor(
    private readonly shell: BillingPayShellService,
    private readonly portal: BillingPortalService,
  ) {}

  @Post("pay-shell/handoff")
  @Header("Cache-Control", "no-store")
  handoff(
    @CurrentUser("authId") owner: string,
    @Body() dto: PayShellHandoffDto,
  ) {
    return this.shell.issueHandoff(owner, {
      destination: dto.destination,
      intentId: dto.intentId,
    });
  }

  @Public()
  @Post("pay-shell/exchange")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  exchange(
    @Headers("authorization") authorization?: string,
    @Headers("x-edutu-pay-shell-key") serverKey?: string,
  ) {
    this.shell.assertServerKey(serverKey);
    return this.shell.exchange(this.shell.bearer(authorization));
  }

  @Public()
  @Get("intent-status")
  @Header("Cache-Control", "no-store")
  status(
    @Headers("authorization") authorization?: string,
    @Headers("x-edutu-pay-shell-key") serverKey?: string,
  ) {
    this.shell.assertServerKey(serverKey);
    return this.shell.intentStatus(this.shell.bearer(authorization));
  }

  @Public()
  @Get("account")
  @Header("Cache-Control", "no-store")
  account(
    @Headers("authorization") authorization?: string,
    @Headers("x-edutu-pay-shell-key") serverKey?: string,
  ) {
    this.shell.assertServerKey(serverKey);
    return this.shell.account(this.shell.bearer(authorization));
  }

  @Public()
  @Post("pay-shell/portal-session")
  @Header("Cache-Control", "no-store")
  async portalSession(
    @Headers("authorization") authorization?: string,
    @Headers("x-edutu-pay-shell-key") serverKey?: string,
  ) {
    this.shell.assertServerKey(serverKey);
    const record = await this.shell.authenticate(
      this.shell.bearer(authorization),
    );
    return this.portal.createPortalSession(record.userId, randomUUID());
  }
}
