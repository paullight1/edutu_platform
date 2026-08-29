import {
  collectReferencedStoragePaths,
  planStorageCleanup,
  type CleanupCandidate,
} from "./storage-cleanup-plan";

describe("storage cleanup planning", () => {
  it("extracts public, signed, and metadata paths without treating other buckets as references", () => {
    const records = [
      {
        image_url:
          "https://project.supabase.co/storage/v1/object/public/opportunities_images/img_keep.jpg",
        metadata: {
          share_card: {
            path: "active/card-keep.png",
            url: "https://project.supabase.co/storage/v1/object/public/opportunity-share-cards/active/card-keep.png",
          },
          unrelated:
            "https://project.supabase.co/storage/v1/object/public/blog-images/blog.png",
        },
      },
    ];

    expect(
      [...collectReferencedStoragePaths(records, "opportunities_images")],
    ).toEqual(["img_keep.jpg"]);
    expect(
      [...collectReferencedStoragePaths(records, "opportunity-share-cards")],
    ).toEqual(["active/card-keep.png"]);
  });

  it("only deletes unreferenced objects older than the grace period", () => {
    const objects: CleanupCandidate[] = [
      {
        path: "img_keep.jpg",
        size: 100,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        path: "img_old_orphan.jpg",
        size: 200,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        path: "img_recent_orphan.jpg",
        size: 300,
        updatedAt: "2026-08-28T00:00:00.000Z",
      },
    ];

    const plan = planStorageCleanup({
      objects,
      referencedPaths: new Set(["img_keep.jpg"]),
      minAgeDays: 14,
      now: new Date("2026-08-29T00:00:00.000Z"),
    });

    expect(plan.deletePaths).toEqual(["img_old_orphan.jpg"]);
    expect(plan.deleteBytes).toBe(200);
    expect(plan.keptReferenced).toBe(1);
    expect(plan.keptWithinGracePeriod).toBe(1);
  });

  it("keeps objects with missing or invalid timestamps", () => {
    const plan = planStorageCleanup({
      objects: [
        { path: "unknown-age.jpg", size: 10, updatedAt: null },
        { path: "invalid-age.jpg", size: 20, updatedAt: "not-a-date" },
      ],
      referencedPaths: new Set(),
      minAgeDays: 14,
      now: new Date("2026-08-29T00:00:00.000Z"),
    });

    expect(plan.deletePaths).toEqual([]);
    expect(plan.keptUnknownAge).toBe(2);
  });
});
