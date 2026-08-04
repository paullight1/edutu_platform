import {
  SIGNAL_CATEGORIES,
  SIGNAL_THRESHOLD,
  screenMessage,
} from "./message-screen";

/**
 * One string per literal alternative in the four patterns. Each expresses
 * exactly ONE concept, so a well-formed category set matches each of them
 * exactly once. Paste a term into a second category and this list convicts it.
 */
const SINGLE_CONCEPT_PROBES: ReadonlyArray<[string, string]> = [
  // money_demand
  ["processing fee", "money_demand"],
  ["registration fee", "money_demand"],
  ["application fee", "money_demand"],
  ["admin fee", "money_demand"],
  ["pay me", "money_demand"],
  ["pay us", "money_demand"],
  ["payment first", "money_demand"],
  ["pay now", "money_demand"],
  ["$50", "money_demand"],
  ["N5000", "money_demand"],
  ["₦5,000", "money_demand"],
  ["5000 naira", "money_demand"],
  ["2500 NGN", "money_demand"],
  ["5k", "money_demand"],
  // urgency
  ["guarantee", "urgency"],
  ["guaranteed", "urgency"],
  ["slot", "urgency"],
  ["limited", "urgency"],
  ["act now", "urgency"],
  ["only today", "urgency"],
  ["hurry", "urgency"],
  // off_platform
  ["whatsapp", "off_platform"],
  ["whats app", "off_platform"],
  ["telegram", "off_platform"],
  ["dm me", "off_platform"],
  ["+2348012345678", "off_platform"],
  // credentials
  ["password", "credentials"],
  ["otp", "credentials"],
  ["pin", "credentials"],
  ["bank details", "credentials"],
  ["bank account", "credentials"],
  ["bvn", "credentials"],
];

describe("signal categories", () => {
  it("keeps the two-signal threshold at 2", () => {
    // If a case below fails, a pattern is wrong. Never lower this.
    expect(SIGNAL_THRESHOLD).toBe(2);
  });

  it.each(SINGLE_CONCEPT_PROBES)(
    "counts %p as exactly one signal, owned by %s",
    (probe, owner) => {
      const matched = SIGNAL_CATEGORIES.filter((c) =>
        c.pattern.test(probe),
      ).map((c) => c.name);
      expect(matched).toEqual([owner]);
    },
  );

  it("never blocks on a single concept alone", () => {
    for (const [probe] of SINGLE_CONCEPT_PROBES) {
      expect(screenMessage(probe)).toEqual({ allowed: true });
    }
  });
});

describe("screenMessage", () => {
  it("allows ordinary group talk", () => {
    expect(screenMessage("Has anyone started the Chevening essay?")).toEqual({
      allowed: true,
    });
  });

  it("rejects an empty body with a machine token", () => {
    expect(screenMessage("   ")).toEqual({ allowed: false, reason: "empty" });
  });

  it("blocks a request for an up-front fee, the commonest scam here", () => {
    const result = screenMessage(
      "DM me a $50 processing fee to guarantee your slot",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("blocks contact-harvesting off-platform on two DIFFERENT categories", () => {
    // credentials ("bank details") + off_platform ("whatsapp"). Delete either
    // category and this message goes back to one signal and is allowed, which
    // is what makes the assertion diagnostic.
    const message = "send your bank details to my whatsapp";
    expect(screenMessage(message).allowed).toBe(false);

    const matched = SIGNAL_CATEGORIES.filter((c) =>
      c.pattern.test(message),
    ).map((c) => c.name);
    expect(matched.sort()).toEqual(["credentials", "off_platform"]);
  });

  it("does not punish the word 'fee' when it is discussed, not demanded", () => {
    expect(
      screenMessage("Is there an application fee for this one?").allowed,
    ).toBe(true);
  });

  describe("regression: one concept must never score twice", () => {
    it("allows an honest question about a stipend's KYC step", () => {
      expect(
        screenMessage(
          "For the stipend, will they ask for my bank details on the application portal?",
        ),
      ).toEqual({ allowed: true });
    });

    it("allows a bare mention of BVN", () => {
      expect(screenMessage("what is your bvn")).toEqual({ allowed: true });
    });
  });

  describe("local money phrasings", () => {
    it("allows a price quoted in naira with no second signal", () => {
      expect(screenMessage("The visa application costs 5000 naira")).toEqual({
        allowed: true,
      });
      expect(screenMessage("Flights are around ₦5,000 cheaper in May")).toEqual(
        { allowed: true },
      );
      expect(screenMessage("The exam is about 5k")).toEqual({ allowed: true });
    });

    it("blocks ₦5,000 alongside an urgency signal", () => {
      expect(
        screenMessage("Just ₦5,000 and your slot is confirmed").allowed,
      ).toBe(false);
    });

    it("blocks 5000 naira alongside an off-platform signal", () => {
      expect(
        screenMessage("Send 5000 naira to my whatsapp and I will register you")
          .allowed,
      ).toBe(false);
    });

    it("blocks 5k alongside an urgency signal", () => {
      expect(screenMessage("Only today: 5k guarantees admission").allowed).toBe(
        false,
      );
    });
  });
});
