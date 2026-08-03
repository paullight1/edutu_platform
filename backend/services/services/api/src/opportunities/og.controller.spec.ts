import { OgController } from "./og.controller";

/**
 * The OG controller must serve the FULL SPA shell with per-opportunity meta
 * injected (crawlers read the tags, real users boot the app) because the
 * Vercel deployment rewrites /opportunity/:id and /share/opportunity/:id here
 * unconditionally — UA-gated (`has`) rewrites are silently ignored by the
 * experimentalServices router, which is why the previous crawler-only plan
 * never unfurled images.
 */

const SPA_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Edutu | AI-powered global opportunities</title>
    <meta
      name="description"
      content="Generic description."
    />
    <link rel="canonical" href="https://www.edutu.org/" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://www.edutu.org/" />
    <meta
      property="og:title"
      content="Edutu | AI-powered global opportunities"
    />
    <meta
      property="og:description"
      content="Generic description."
    />
    <meta
      property="og:image"
      content="https://www.edutu.org/icons/icon-512x512.png"
    />
    <meta property="og:image:alt" content="Edutu logo" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta
      name="twitter:image"
      content="https://www.edutu.org/icons/icon-512x512.png"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index-abc.js"></script>
  </body>
</html>`;

const OPPORTUNITY = {
  id: "opp-1",
  title: "Mandela Rhodes Scholarship 2027",
  summary: "Fully funded postgraduate scholarship for young Africans.",
  image_url: "https://cdn.example.org/flyer.jpg",
  metadata: { source_image_url: "https://source.example.org/poster.png" },
  organization: "Mandela Rhodes Foundation",
  category: "Scholarship",
  deadline: "2027-04-30",
};

function makeRes() {
  const headers: Record<string, string> = {
    "content-security-policy": "default-src 'self'",
  };
  return {
    headers,
    setHeader: (key: string, value: string) => {
      headers[key.toLowerCase()] = value;
    },
    removeHeader: (key: string) => {
      delete headers[key.toLowerCase()];
    },
  } as any;
}

function makeController(opp: unknown) {
  const service = {
    findOne: jest.fn().mockResolvedValue(opp),
    getPublicAppBaseUrl: () => "https://www.edutu.org",
  } as any;
  return new OgController(service);
}

describe("OgController shell-injected Open Graph", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  function mockShellFetch(ok = true) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      text: () => Promise.resolve(ok ? SPA_SHELL : ""),
    }) as any;
  }

  it("serves the SPA shell preferring the hosted (Supabase) image copy", async () => {
    mockShellFetch();
    const controller = makeController(OPPORTUNITY);
    const res = makeRes();
    const html = await controller.opportunity("opp-1", res);

    // The page is the public site, not an API payload — helmet's CSP would
    // block the SPA's inline boot script for real users behind the rewrite.
    expect(res.headers["content-security-policy"]).toBeUndefined();

    // Still the real app shell…
    expect(html).toContain('<script type="module" src="/assets/index-abc.js">');
    // …but with the opportunity's own meta. The hosted copy (image_url, the
    // Supabase-proxied flyer) beats the original third-party source URL —
    // source sites can take images down or block hotlinking.
    expect(html).toContain("Mandela Rhodes Scholarship 2027 | Edutu");
    expect(html).toContain("https://cdn.example.org/flyer.jpg");
    expect(html).not.toContain("https://source.example.org/poster.png");
    expect(html).not.toContain('icons/icon-512x512.png"\n    />');
    expect(html).toMatch(
      /<meta property="og:url" content="https:\/\/www\.edutu\.org\/opportunity\/opp-1"/,
    );
  });

  it("serves /share/opportunity/:id with a matching canonical/og:url", async () => {
    mockShellFetch();
    const controller = makeController(OPPORTUNITY);
    const html = await controller.shareOpportunity("opp-1", makeRes());

    expect(html).toContain("https://www.edutu.org/share/opportunity/opp-1");
    expect(html).toContain("https://cdn.example.org/flyer.jpg");
  });

  it("falls back to the source flyer when there is no hosted image copy", async () => {
    mockShellFetch();
    const controller = makeController({
      ...OPPORTUNITY,
      image_url: null,
    });
    const html = await controller.opportunity("opp-1", makeRes());
    expect(html).toContain("https://source.example.org/poster.png");
  });

  it("does not let a generated share-card fallback in image_url outrank the source flyer", async () => {
    mockShellFetch();
    const controller = makeController({
      ...OPPORTUNITY,
      image_url:
        "https://x.supabase.co/storage/v1/object/public/opportunity-share-cards/opp-1.svg",
    });
    const html = await controller.opportunity("opp-1", makeRes());
    expect(html).toContain("https://source.example.org/poster.png");
  });

  it("falls back to the self-contained OG page when the shell fetch fails", async () => {
    mockShellFetch(false);
    const controller = makeController(OPPORTUNITY);
    const res = makeRes();
    const html = await controller.opportunity("opp-1", res);

    // No shell → the mini page still carries the real meta for crawlers.
    expect(html).toContain("https://cdn.example.org/flyer.jpg");
    expect(html).toContain("Mandela Rhodes Scholarship 2027 | Edutu");
    expect(html).not.toContain("/assets/index-abc.js");
  });

  it("serves the generic shell meta for an unknown opportunity", async () => {
    mockShellFetch();
    const controller = makeController(null);
    const html = await controller.opportunity("missing", makeRes());
    expect(html).toContain("Opportunity on Edutu");
  });
});
