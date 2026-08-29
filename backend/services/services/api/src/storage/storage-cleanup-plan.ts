export interface CleanupCandidate {
  path: string;
  size: number;
  updatedAt: string | null;
}

export interface CleanupPlan {
  deletePaths: string[];
  deleteBytes: number;
  keptReferenced: number;
  keptWithinGracePeriod: number;
  keptUnknownAge: number;
}

export function collectReferencedStoragePaths(
  records: unknown[],
  bucket: string,
): Set<string> {
  const paths = new Set<string>();
  const encodedBucket = encodeURIComponent(bucket);
  const markers = ["public", "sign", "authenticated"].map(
    (visibility) => `/storage/v1/object/${visibility}/${encodedBucket}/`,
  );

  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      for (const marker of markers) {
        const markerIndex = value.indexOf(marker);
        if (markerIndex < 0) continue;
        const encodedPath = value
          .slice(markerIndex + marker.length)
          .split(/[?#]/, 1)[0];
        if (!encodedPath) continue;
        try {
          paths.add(decodeURIComponent(encodedPath));
        } catch {
          paths.add(encodedPath);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };

  records.forEach(visit);
  return paths;
}

export function planStorageCleanup(input: {
  objects: CleanupCandidate[];
  referencedPaths: ReadonlySet<string>;
  minAgeDays: number;
  now?: Date;
}): CleanupPlan {
  const now = input.now ?? new Date();
  const minimumAgeMs = Math.max(0, input.minAgeDays) * 24 * 60 * 60 * 1000;
  const plan: CleanupPlan = {
    deletePaths: [],
    deleteBytes: 0,
    keptReferenced: 0,
    keptWithinGracePeriod: 0,
    keptUnknownAge: 0,
  };

  for (const object of input.objects) {
    if (input.referencedPaths.has(object.path)) {
      plan.keptReferenced += 1;
      continue;
    }

    const updatedAtMs = object.updatedAt
      ? Date.parse(object.updatedAt)
      : Number.NaN;
    if (!Number.isFinite(updatedAtMs)) {
      plan.keptUnknownAge += 1;
      continue;
    }
    if (now.getTime() - updatedAtMs < minimumAgeMs) {
      plan.keptWithinGracePeriod += 1;
      continue;
    }

    plan.deletePaths.push(object.path);
    plan.deleteBytes +=
      Number.isFinite(object.size) && object.size > 0 ? object.size : 0;
  }

  plan.deletePaths.sort();
  return plan;
}
