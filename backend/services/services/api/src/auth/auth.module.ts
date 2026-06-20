import { Module, Global, Provider } from "@nestjs/common";
import { ClerkClient, createClerkClient } from "@clerk/clerk-sdk-node";
import { APP_GUARD } from "@nestjs/core";
import { AdminGuard } from "./admin.guard";
import { AuthController } from "./auth.controller";
import { ClerkAuthGuard } from "./clerk-auth.guard";

const ClerkClientProvider: Provider = {
  provide: "ClerkClient",
  useFactory: () => {
    return createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });
  },
};

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    ClerkClientProvider,
    AdminGuard,
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
  ],
  exports: ["ClerkClient"],
})
export class AuthModule {}
