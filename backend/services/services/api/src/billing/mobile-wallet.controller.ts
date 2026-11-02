import { Body, Controller, Get, Header, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { MobileWalletService } from "./mobile-wallet.service";

@Controller("billing/wallet")
export class MobileWalletController {
  constructor(private readonly walletService: MobileWalletService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  wallet(@CurrentUser("authId") userId: string) {
    return this.walletService.wallet(userId);
  }
  @Post("daily-claim")
  @Header("Cache-Control", "no-store")
  daily(@CurrentUser("authId") userId: string) {
    return this.walletService.claim(userId, "DAILY_LOGIN");
  }
  @Post("engagement-claim")
  @Header("Cache-Control", "no-store")
  engagement(
    @CurrentUser("authId") userId: string,
    @Body() body: { reason?: string },
  ) {
    return this.walletService.claim(userId, body?.reason ?? "");
  }
}
