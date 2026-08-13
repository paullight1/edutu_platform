import express, { type Request } from "express";
import request from "supertest";
import {
  createScraperEgressBodyLimitMiddleware,
  SCRAPER_EGRESS_MAX_REQUEST_BYTES,
} from "./scraper-egress-body-limit.middleware";

type RawBodyRequest = Request & { rawBody?: Buffer };

function captureRawBody(
  req: express.Request,
  _res: express.Response,
  buffer: Buffer,
): void {
  (req as RawBodyRequest).rawBody = Buffer.from(buffer);
}

function createParserApp() {
  const app = express();
  let egressHandlerCalled = false;

  app.use(
    "/internal/scraper-egress",
    createScraperEgressBodyLimitMiddleware(),
  );
  app.use(express.json({ limit: "1mb", verify: captureRawBody }));
  app.post("/internal/scraper-egress", (_req, res) => {
    egressHandlerCalled = true;
    res.status(204).end();
  });
  app.post("/billing/webhooks/paystack", (req, res) => {
    const rawRequest = req as RawBodyRequest;
    res.json({
      rawLength: rawRequest.rawBody?.byteLength,
      event: req.body.event,
    });
  });

  return { app, wasEgressHandlerCalled: () => egressHandlerCalled };
}

describe("scraper egress request body limit", () => {
  it("rejects a Content-Length body over 16 KiB before the route handler", async () => {
    const { app, wasEgressHandlerCalled } = createParserApp();
    const body = Buffer.alloc(SCRAPER_EGRESS_MAX_REQUEST_BYTES + 1, 0x61);

    const response = await request(app)
      .post("/internal/scraper-egress")
      .set("content-type", "application/octet-stream")
      .set("content-length", String(body.byteLength))
      .send(body);

    expect(response.status).toBe(413);
    expect(wasEgressHandlerCalled()).toBe(false);
  });

  it("rejects a chunked body over 16 KiB before the route handler", async () => {
    const { app, wasEgressHandlerCalled } = createParserApp();
    const response = await new Promise<request.Response>((resolve, reject) => {
      const bodyRequest = request(app)
        .post("/internal/scraper-egress")
        .set("content-type", "application/json")
        .set("transfer-encoding", "chunked");

      bodyRequest.write(
        Buffer.alloc(SCRAPER_EGRESS_MAX_REQUEST_BYTES / 2, 0x61),
      );
      bodyRequest.write(
        Buffer.alloc(SCRAPER_EGRESS_MAX_REQUEST_BYTES / 2 + 1, 0x61),
      );
      bodyRequest.end((error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });

    expect(response.status).toBe(413);
    expect(wasEgressHandlerCalled()).toBe(false);
  });

  it("preserves the global raw-body parser for billing webhooks", async () => {
    const { app } = createParserApp();
    const body = {
      event: "charge.success",
      padding: "x".repeat(SCRAPER_EGRESS_MAX_REQUEST_BYTES),
    };
    const rawBody = Buffer.from(JSON.stringify(body), "utf8");

    const response = await request(app)
      .post("/billing/webhooks/paystack")
      .set("content-type", "application/json")
      .send(rawBody.toString("utf8"));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      rawLength: rawBody.byteLength,
      event: "charge.success",
    });
  });
});
