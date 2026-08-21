import { BadRequestException } from "@nestjs/common";
import {
  decodeCatalogCursor,
  encodeCatalogCursor,
} from "./opportunity-catalog.service";

describe("opportunity catalogue cursors", () => {
  it("round-trips a newest cursor", () => {
    const encoded = encodeCatalogCursor({
      v: 1,
      sort: "newest",
      value: "2026-08-20T12:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    });

    expect(decodeCatalogCursor(encoded, "newest")).toEqual({
      v: 1,
      sort: "newest",
      value: "2026-08-20T12:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("supports null deadlines for rolling opportunities", () => {
    const encoded = encodeCatalogCursor({
      v: 1,
      sort: "deadline",
      value: null,
      id: "22222222-2222-4222-8222-222222222222",
    });

    expect(decodeCatalogCursor(encoded, "deadline")?.value).toBeNull();
  });

  it("rejects cursors produced for another sort", () => {
    const encoded = encodeCatalogCursor({
      v: 1,
      sort: "newest",
      value: "2026-08-20T12:00:00.000Z",
      id: "33333333-3333-4333-8333-333333333333",
    });

    expect(() => decodeCatalogCursor(encoded, "deadline")).toThrow(
      BadRequestException,
    );
  });

  it("rejects malformed cursor data", () => {
    expect(() => decodeCatalogCursor("not-a-cursor", "newest")).toThrow(
      "Invalid opportunity catalogue cursor",
    );
  });
});
