import { Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import { OpportunityJourneysModule } from "./opportunity-journeys.module";
import { OpportunityJourneysController } from "./opportunity-journeys.controller";
import { OpportunityJourneysService } from "./opportunity-journeys.service";

@Module({
  providers: [{ provide: OpportunitiesService, useValue: {} }],
  exports: [OpportunitiesService],
})
class CatalogTestModule {}

it("resolves the production journey module including its compatibility and intent providers", async () => {
  const module = await Test.createTestingModule({
    imports: [OpportunityJourneysModule],
  })
    .overrideModule(OpportunitiesModule)
    .useModule(CatalogTestModule)
    .compile();
  try {
    expect(module.get(OpportunityJourneysController)).toBeInstanceOf(
      OpportunityJourneysController,
    );
    expect(module.get(OpportunityJourneysService)).toBeInstanceOf(
      OpportunityJourneysService,
    );
  } finally {
    await module.close();
  }
});
