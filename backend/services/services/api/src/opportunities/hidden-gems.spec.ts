import {
  HIDDEN_GEM_KIND,
  HIDDEN_GEM_REASON,
  annotateHiddenGems,
  resolveHiddenGemOptions,
  type HiddenGemItem,
  type HiddenGemOptions,
} from "./hidden-gems";

const OPTS: HiddenGemOptions = {
  enabled: true,
  minMatch: 60,
  maxEngagement: 5,
  boost: 3,
};

function item(
  id: string,
  match: number,
  reasons: string[] = [],
): HiddenGemItem {
  return { id, match, matchReasons: reasons };
}

describe("annotateHiddenGems", () => {
  it("flags a strong-fit, low-engagement item and boosts its match", () => {
    const [gem] = annotateHiddenGems(
      [item("a", 72, ["Matches preferred category: Tech."])],
      new Map([["a", 2]]),
      OPTS,
    );

    expect(gem.hidden_gem).toBe(true);
    expect(gem.matchReasons).toContain(HIDDEN_GEM_REASON);
    expect(gem.match).toBe(75); // 72 + boost 3
  });

  it("leaves a strong-fit but high-engagement item untouched", () => {
    const [crowded] = annotateHiddenGems(
      [item("a", 72)],
      new Map([["a", 40]]),
      OPTS,
    );

    expect(crowded.hidden_gem).toBeUndefined();
    expect(crowded.matchReasons).not.toContain(HIDDEN_GEM_REASON);
    expect(crowded.match).toBe(72);
  });

  it("leaves a weak-fit item untouched even with zero engagement", () => {
    const [weak] = annotateHiddenGems(
      [item("a", 45)],
      new Map([["a", 0]]),
      OPTS,
    );

    expect(weak.hidden_gem).toBeUndefined();
    expect(weak.match).toBe(45);
  });

  it("treats an id absent from the engagement map as engagement 0 (eligible)", () => {
    const [fresh] = annotateHiddenGems([item("new", 72)], new Map(), OPTS);

    expect(fresh.hidden_gem).toBe(true);
    expect(fresh.match).toBe(75);
  });

  it("never boosts match above 100", () => {
    const [capped] = annotateHiddenGems([item("a", 99)], new Map(), OPTS);

    expect(capped.match).toBe(100); // 99 + 3 capped
    expect(capped.hidden_gem).toBe(true);
  });

  it("returns every item unchanged when disabled", () => {
    const input = [item("a", 72), item("b", 90)];
    const out = annotateHiddenGems(input, new Map(), {
      ...OPTS,
      enabled: false,
    });

    expect(out).toHaveLength(2);
    expect(out.every((row) => row.hidden_gem === undefined)).toBe(true);
    expect(out.map((row) => row.match)).toEqual([72, 90]);
  });

  it("does not mutate the input array or its items", () => {
    const input = [item("a", 72, ["existing"])];
    const out = annotateHiddenGems(input, new Map(), OPTS);

    expect(input[0].hidden_gem).toBeUndefined();
    expect(input[0].match).toBe(72);
    expect(input[0].matchReasons).toEqual(["existing"]);
    expect(out[0]).not.toBe(input[0]);
  });

  it("does not duplicate the reason if it is already present", () => {
    const [gem] = annotateHiddenGems(
      [item("a", 72, [HIDDEN_GEM_REASON])],
      new Map(),
      OPTS,
    );

    expect(
      gem.matchReasons.filter((r) => r === HIDDEN_GEM_REASON),
    ).toHaveLength(1);
  });
});

describe("resolveHiddenGemOptions", () => {
  it("uses defaults when env is empty", () => {
    expect(resolveHiddenGemOptions({} as NodeJS.ProcessEnv)).toEqual({
      enabled: true,
      minMatch: 60,
      maxEngagement: 5,
      boost: 3,
    });
  });

  it("is disabled only when RECS_HIDDEN_GEMS is exactly false", () => {
    expect(
      resolveHiddenGemOptions({
        RECS_HIDDEN_GEMS: "false",
      } as NodeJS.ProcessEnv).enabled,
    ).toBe(false);
    expect(
      resolveHiddenGemOptions({ RECS_HIDDEN_GEMS: "0" } as NodeJS.ProcessEnv)
        .enabled,
    ).toBe(true);
  });

  it("reads the numeric knobs from env and ignores garbage", () => {
    const opts = resolveHiddenGemOptions({
      RECS_HIDDEN_GEM_MIN_MATCH: "70",
      RECS_HIDDEN_GEM_MAX_ENGAGEMENT: "10",
      RECS_HIDDEN_GEM_BOOST: "not-a-number",
    } as unknown as NodeJS.ProcessEnv);

    expect(opts.minMatch).toBe(70);
    expect(opts.maxEngagement).toBe(10);
    expect(opts.boost).toBe(3); // garbage → default
  });
});

it("exposes the hidden-gem reason kind constant", () => {
  expect(HIDDEN_GEM_KIND).toBe("hidden_gem");
});
