import {
  apiKeyMatches,
  hashApiKey,
  legacyHashApiKey,
  safeEqualHash,
} from "./api-key-hash";

const RAW_KEY = "edu_live_ab12cd34_someverysecretvalue123456";

describe("api-key-hash", () => {
  const originalPepper = process.env.API_KEY_PEPPER;

  afterEach(() => {
    if (originalPepper === undefined) {
      delete process.env.API_KEY_PEPPER;
    } else {
      process.env.API_KEY_PEPPER = originalPepper;
    }
  });

  describe("without a pepper configured", () => {
    beforeEach(() => {
      delete process.env.API_KEY_PEPPER;
    });

    it("hashes with plain SHA-256", () => {
      expect(hashApiKey(RAW_KEY)).toBe(legacyHashApiKey(RAW_KEY));
      expect(hashApiKey(RAW_KEY)).toHaveLength(64);
    });

    it("matches a stored hash", () => {
      const stored = hashApiKey(RAW_KEY);
      expect(apiKeyMatches(RAW_KEY, stored)).toBe(true);
    });

    it("rejects a different key", () => {
      const stored = hashApiKey(RAW_KEY);
      expect(apiKeyMatches("edu_live_ab12cd34_wrongvalue", stored)).toBe(false);
    });
  });

  describe("with a pepper configured", () => {
    beforeEach(() => {
      process.env.API_KEY_PEPPER = "super-secret-pepper-value-32chars!!";
    });

    it("hashes with HMAC-SHA256 keyed by the pepper", () => {
      expect(hashApiKey(RAW_KEY)).not.toBe(legacyHashApiKey(RAW_KEY));
      expect(hashApiKey(RAW_KEY)).toHaveLength(64);
    });

    it("still accepts a legacy plain-SHA-256 hash for backward compatibility", () => {
      const legacyStored = legacyHashApiKey(RAW_KEY);
      expect(apiKeyMatches(RAW_KEY, legacyStored)).toBe(true);
    });

    it("accepts a freshly peppered hash", () => {
      const pepperedStored = hashApiKey(RAW_KEY);
      expect(apiKeyMatches(RAW_KEY, pepperedStored)).toBe(true);
    });

    it("rejects an unrelated hash", () => {
      expect(apiKeyMatches(RAW_KEY, "0".repeat(64))).toBe(false);
    });
  });

  describe("safeEqualHash", () => {
    it("returns true for equal strings and false otherwise", () => {
      expect(safeEqualHash("abc", "abc")).toBe(true);
      expect(safeEqualHash("abc", "abd")).toBe(false);
      expect(safeEqualHash("abc", "ab")).toBe(false);
    });
  });

  describe("pepper minimum length", () => {
    it("ignores a too-short pepper and falls back to plain hashing", () => {
      process.env.API_KEY_PEPPER = "short";
      expect(hashApiKey(RAW_KEY)).toBe(legacyHashApiKey(RAW_KEY));
    });
  });
});
