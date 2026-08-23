import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { CreatorController } from "./creator.controller";
import { CreatorProofController } from "./creator-proof.controller";
import { CreatorProofService } from "./creator-proof.service";
import { CreatorService } from "./creator.service";
import { MarketplaceCatalogController } from "./marketplace-catalog.controller";
import { MarketplaceCatalogService } from "./marketplace-catalog.service";

@Module({
  imports: [NotificationsModule],
  controllers: [
    CreatorController,
    CreatorProofController,
    MarketplaceCatalogController,
  ],
  providers: [CreatorService, CreatorProofService, MarketplaceCatalogService],
  exports: [CreatorService, CreatorProofService, MarketplaceCatalogService],
})
export class CreatorModule {}
