import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { EventsService } from "./events/events.service";
import { OpportunitiesService } from "./opportunities/opportunities.service";
import { BlogService } from "./blog/blog.service";
import type { Response } from "express";

describe("AppController", () => {
  let appController: AppController;
  let blogService: { listSitemapPosts: jest.Mock };

  beforeEach(async () => {
    blogService = { listSitemapPosts: jest.fn(() => []) };
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
        {
          provide: BlogService,
          useValue: blogService,
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

  describe("sitemap", () => {
    it("includes the blog hub and every published post", async () => {
      blogService.listSitemapPosts.mockResolvedValue([
        {
          slug: "scholarship-application-guide",
          publishedAt: new Date("2026-07-01T00:00:00.000Z"),
          updatedAt: new Date("2026-07-03T00:00:00.000Z"),
        },
      ]);
      const response = {
        setHeader: jest.fn(),
      } as unknown as Response;

      const xml = await appController.getSitemap(response);

      expect(xml).toContain("<loc>https://www.edutu.org/blog</loc>");
      expect(xml).toContain(
        "<loc>https://www.edutu.org/blog/scholarship-application-guide</loc>",
      );
      expect(xml).toContain("<lastmod>2026-07-03</lastmod>");
    });
  });
});
