import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const LOCKFILES = [
  {
    name: "backend",
    path: "backend/services/services/api/package-lock.json",
    requirements: {
      browserslist: "4.28.7",
      "fast-uri": "3.1.6",
    },
  },
  {
    name: "web",
    path: "edutu-web-app/package-lock.json",
    requirements: {
      browserslist: "4.28.7",
      "fast-uri": "3.1.6",
    },
  },
  {
    name: "mobile",
    path: "edutumobile/package-lock.json",
    requirements: {
      browserslist: "4.28.7",
    },
  },
];

function parseVersion(value) {
  const match = String(value ?? "").match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u);
  assert.ok(match, `Expected a semantic version, received ${String(value)}`);
  return match.slice(1, 4).map(Number);
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function packageVersions(lockfile, packageName) {
  const suffix = `/node_modules/${packageName}`;
  return Object.entries(lockfile.packages ?? {})
    .filter(([path]) => path === `node_modules/${packageName}` || path.endsWith(suffix))
    .map(([path, metadata]) => ({ path, version: metadata?.version }));
}

for (const lockfileDefinition of LOCKFILES) {
  test(`${lockfileDefinition.name} lockfile contains patched security transitive versions`, async () => {
    const raw = await readFile(
      new URL(`../${lockfileDefinition.path}`, import.meta.url),
      "utf8",
    );
    const lockfile = JSON.parse(raw);

    for (const [packageName, minimumVersion] of Object.entries(
      lockfileDefinition.requirements,
    )) {
      const versions = packageVersions(lockfile, packageName);
      assert.ok(
        versions.length > 0,
        `${lockfileDefinition.name} must contain ${packageName} so its security floor can be verified`,
      );

      for (const { path, version } of versions) {
        assert.ok(
          compareVersions(version, minimumVersion) >= 0,
          `${lockfileDefinition.name} ${path} must be >= ${minimumVersion}; found ${version}`,
        );
      }
    }
  });
}
