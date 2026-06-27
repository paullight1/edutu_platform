import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { EventsService } from "./events/events.service";
import { OpportunitiesService } from "./opportunities/opportunities.service";

describe("AppController", () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: OpportunitiesService,
          useValue: {
            getPublicAppBaseUrl: jest.fn(() => "https://www.edutu.org"),
            listSitemapOpportunities: jest.fn(() => []),
          },
        },
        {
          provide: EventsService,
          useValue: {
            listSitemapEvents: jest.fn(() => []),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe("root", () => {
    it('should return "Edutu API"', () => {
      expect(appController.getHello()).toBe("Edutu API");
    });
  });
});
