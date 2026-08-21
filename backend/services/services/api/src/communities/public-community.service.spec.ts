import { NotFoundException } from "@nestjs/common";
import {
  PublicCommunityService,
  type PublicCommunityCandidate,
  type PublicCommunityStore,
} from "./public-community.service";

const now = new Date("2026-08-21T00:00:00.000Z");

function candidate(
  patch: Partial<PublicCommunityCandidate> = {},
): PublicCommunityCandidate {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "chevening-2027-abc123",
    name: "Chevening 2027",
    description: "Applicants preparing together.",
    coverEmoji: "🎓",
    memberCount: 24,
    messageCount: 91,
    opportunityId: null,
    visibility: "public",
    expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    archivedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...patch,
  };
}

class FakeStore implements PublicCommunityStore {
  rows: PublicCommunityCandidate[] = [];

  async listCandidates(): Promise<PublicCommunityCandidate[]> {
    return this.rows;
  }

  async findCandidateBySlug(slug: string): Promise<PublicCommunityCandidate | null> {
    return this.rows.find((row) => row.slug === slug) ?? null;
  }
}

describe("PublicCommunityService", () => {
  it("returns only active public groups and strips internal state fields", async () => {
    const store = new FakeStore();
    store.rows = [
      candidate(),
      candidate({ id: "22222222-2222-4222-8222-222222222222", slug: "private-room", visibility: "private" }),
      candidate({ id: "33333333-3333-4333-8333-333333333333", slug: "archived-room", archivedAt: new Date("2026-08-20T00:00:00Z") }),
      candidate({ id: "44444444-4444-4444-8444-444444444444", slug: "expired-room", expiresAt: new Date("2026-08-20T00:00:00Z") }),
    ];
    const service = new PublicCommunityService(store, () => now);

    await expect(service.list(50)).resolves.toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        slug: "chevening-2027-abc123",
        name: "Chevening 2027",
        description: "Applicants preparing together.",
        coverEmoji: "🎓",
        memberCount: 24,
        messageCount: 91,
        opportunityId: null,
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);
  });

  it("returns 404 for a private, archived, expired, or unknown slug", async () => {
    const store = new FakeStore();
    store.rows = [
      candidate({ slug: "private", visibility: "private" }),
      candidate({ slug: "archived", archivedAt: new Date("2026-08-20T00:00:00Z") }),
      candidate({ slug: "expired", expiresAt: new Date("2026-08-20T00:00:00Z") }),
    ];
    const service = new PublicCommunityService(store, () => now);

    for (const slug of ["private", "archived", "expired", "missing"]) {
      await expect(service.getBySlug(slug)).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it("caps anonymous list size at 50", async () => {
    const store = new FakeStore();
    store.rows = Array.from({ length: 80 }, (_, index) =>
      candidate({
        id: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
        slug: `group-${index}`,
      }),
    );
    const service = new PublicCommunityService(store, () => now);

    await expect(service.list(500)).resolves.toHaveLength(50);
  });
});
