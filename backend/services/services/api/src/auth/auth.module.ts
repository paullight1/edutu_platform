import { Module, Global, Provider } from '@nestjs/common';
import { ClerkClient, createClerkClient } from '@clerk/clerk-sdk-node';
import { APP_GUARD } from '@nestjs/core';
import { ClerkAuthGuard } from './clerk-auth.guard';

const ClerkClientProvider: Provider = {
  provide: 'ClerkClient',
  useFactory: () => {
    return createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });
  },
};

@Global()
@Module({
  providers: [
    ClerkClientProvider,
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
  ],
  exports: ['ClerkClient'],
})
export class AuthModule {}
