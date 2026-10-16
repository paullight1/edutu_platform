import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AdminGuard } from "../auth";
import { WebPaidToolsGuard } from "../monetization/web-paid-tools.guard";
import { OpportunitiesModule } from "./opportunities.module";
import { OpportunityCatalogController } from "./opportunity-catalog.controller";
import { OpportunityCatalogService } from "./opportunity-catalog.service";
import { OpportunitiesController } from "./opportunities.controller";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunityVerificationService } from "./opportunity-verification.service";
import { OpportunityEmbeddingService } from "./opportunity-embedding.service";
import { OpportunityImageGenerationService } from "./opportunity-image-generation.service";
import { OpportunitySourceImageService } from "./opportunity-source-image.service";

describe("opportunity catalogue route registration", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const controllers = Reflect.getMetadata(
      "controllers",
      OpportunitiesModule,
    ) as Array<new (...args: never[]) => unknown>;
    const builder = Test.createTestingModule({
      controllers,
      providers: [
        {
          provide: OpportunityCatalogService,
          useValue: {
            list: jest.fn().mockResolvedValue({
              items: [{ id: "catalog-result", title: "A real catalogue item" }],
              nextCursor: null,
              hasMore: false,
            }),
          },
        },
        {
          provide: OpportunitiesService,
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        { provide: OpportunityVerificationService, useValue: {} },
        { provide: OpportunityEmbeddingService, useValue: {} },
        { provide: OpportunityImageGenerationService, useValue: {} },
        { provide: OpportunitySourceImageService, useValue: {} },
      ],
    });
    builder
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: jest.fn(() => true) });
    builder
      .overrideGuard(WebPaidToolsGuard)
      .useValue({ canActivate: jest.fn(() => true) });
    const moduleRef = await builder.compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("registers the literal catalog route before the generic opportunity ID route", () => {
    const controllers = Reflect.getMetadata(
      "controllers",
      OpportunitiesModule,
    ) as unknown[];

    expect(
      controllers.indexOf(OpportunityCatalogController),
    ).toBeGreaterThanOrEqual(0);
    expect(controllers.indexOf(OpportunityCatalogController)).toBeLessThan(
      controllers.indexOf(OpportunitiesController),
    );
  });

  it("serves a catalogue page instead of interpreting `catalog` as an opportunity ID", async () => {
    const response = await request(app.getHttpServer())
      .get("/opportunities/catalog?limit=1")
      .expect(200);

    expect(response.body).toMatchObject({
      items: [{ id: "catalog-result", title: "A real catalogue item" }],
      nextCursor: null,
      hasMore: false,
    });
  });
});
