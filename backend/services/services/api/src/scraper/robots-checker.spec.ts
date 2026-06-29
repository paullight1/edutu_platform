import { RobotsChecker } from "./robots-checker";

describe("RobotsChecker", () => {
  const originalRespect = process.env.SCRAPER_RESPECT_ROBOTS_TXT;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalRespect === undefined) {
      delete process.env.SCRAPER_RESPECT_ROBOTS_TXT;
    } else {
      process.env.SCRAPER_RESPECT_ROBOTS_TXT = originalRespect;
    }
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("parse", () => {
    it("groups rules by user-agent and collects allow/disallow", () => {
      const groups = RobotsChecker.parse(
        [
          "User-agent: *",
          "Disallow: /private",
          "Allow: /private/public",
          "",
          "User-agent: EdutuBot",
          "Disallow: /",
        ].join("\n"),
      );
      expect(groups).toHaveLength(2);
      expect(groups[0].agents).toEqual(["*"]);
      expect(groups[0].disallow).toEqual(["/private"]);
      expect(groups[0].allow).toEqual(["/private/public"]);
      expect(groups[1].agents).toEqual(["edutubot"]);
      expect(groups[1].disallow).toEqual(["/"]);
    });

    it("ignores comments and blank lines", () => {
      const groups = RobotsChecker.parse(
        "# comment\n\nUser-agent: *\n# mid\nDisallow: /x",
      );
      expect(groups[0].disallow).toEqual(["/x"]);
    });
  });

  describe("isAllowed", () => {
    function mockRobots(body: string, status = 200) {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
      });
      global.fetch = fetchMock as unknown as typeof global.fetch;
      return fetchMock;
    }

    it("blocks a disallowed path and allows an unrelated path", async () => {
      mockRobots("User-agent: *\nDisallow: /private");
      const checker = new RobotsChecker();
      expect(await checker.isAllowed("https://ex.com/private/page")).toBe(
        false,
      );
      expect(await checker.isAllowed("https://ex.com/public")).toBe(true);
    });

    it("respects Allow overriding Disallow (longest match wins)", async () => {
      mockRobots("User-agent: *\nDisallow: /private\nAllow: /private/public");
      const checker = new RobotsChecker();
      expect(await checker.isAllowed("https://ex.com/private/public")).toBe(
        true,
      );
      expect(await checker.isAllowed("https://ex.com/private/secret")).toBe(
        false,
      );
    });

    it("treats missing robots.txt (404) as allow-all", async () => {
      mockRobots("", 404);
      const checker = new RobotsChecker();
      expect(await checker.isAllowed("https://ex.com/anything")).toBe(true);
    });

    it("caches robots.txt per origin", async () => {
      const fetchMock = mockRobots("User-agent: *\nDisallow: /private");
      const checker = new RobotsChecker();
      await checker.isAllowed("https://ex.com/private");
      await checker.isAllowed("https://ex.com/private/again");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("can be disabled via env", async () => {
      process.env.SCRAPER_RESPECT_ROBOTS_TXT = "false";
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof global.fetch;
      const checker = new RobotsChecker();
      expect(await checker.isAllowed("https://ex.com/private")).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("matches a specific bot group over the wildcard", async () => {
      mockRobots("User-agent: *\nAllow: /\nUser-agent: BadBot\nDisallow: /");
      const checker = new RobotsChecker();
      // Default UA is EdutuBot — not BadBot, so allowed by the * group.
      expect(await checker.isAllowed("https://ex.com/anywhere")).toBe(true);
    });
  });
});
