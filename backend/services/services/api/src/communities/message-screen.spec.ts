import { screenMessage } from "./message-screen";

describe("screenMessage", () => {
  it("allows ordinary group talk", () => {
    expect(screenMessage("Has anyone started the Chevening essay?")).toEqual({
      allowed: true,
    });
  });

  it("blocks a request for an up-front fee, the commonest scam here", () => {
    const result = screenMessage(
      "DM me a $50 processing fee to guarantee your slot",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("blocks contact-harvesting off-platform", () => {
    expect(
      screenMessage("send your bank details to my whatsapp +234...").allowed,
    ).toBe(false);
  });

  it("does not punish the word 'fee' when it is discussed, not demanded", () => {
    expect(
      screenMessage("Is there an application fee for this one?").allowed,
    ).toBe(true);
  });
});
