import { describe, expect, it } from "vitest";
import { anchorFeedOrder } from "../../services/feedAnchor";

interface Item {
  id: string;
  score: number;
}

const item = (id: string, score = 0): Item => ({ id, score });
const getId = (value: Item) => value.id;
const ids = (values: Item[]) => values.map(getId);

describe("anchorFeedOrder", () => {
  it("keeps current relative order for items present in both lists", () => {
    const current = [item("a"), item("b"), item("c")];
    // Server reshuffled the same items.
    const incoming = [item("c", 90), item("a", 80), item("b", 70)];

    const result = anchorFeedOrder(current, incoming, getId);

    expect(ids(result)).toEqual(["a", "b", "c"]);
  });

  it("adopts incoming data for kept items", () => {
    const current = [item("a", 10), item("b", 20)];
    const incoming = [item("b", 99), item("a", 88)];

    const result = anchorFeedOrder(current, incoming, getId);

    expect(result.find((entry) => entry.id === "a")?.score).toBe(88);
    expect(result.find((entry) => entry.id === "b")?.score).toBe(99);
  });

  it("inserts new items at their incoming rank", () => {
    const current = [item("a"), item("b"), item("c")];
    const incoming = [item("new-top"), item("a"), item("b"), item("c")];

    const result = anchorFeedOrder(current, incoming, getId);

    expect(ids(result)).toEqual(["new-top", "a", "b", "c"]);
  });

  it("inserts mid-rank new items without disturbing kept order", () => {
    const current = [item("a"), item("b"), item("c")];
    const incoming = [item("a"), item("b"), item("mid"), item("c")];

    const result = anchorFeedOrder(current, incoming, getId);

    expect(ids(result)).toEqual(["a", "b", "mid", "c"]);
  });

  it("drops items absent from the incoming list", () => {
    const current = [item("a"), item("stale"), item("b")];
    const incoming = [item("b"), item("a")];

    const result = anchorFeedOrder(current, incoming, getId);

    expect(ids(result)).toEqual(["a", "b"]);
  });

  it("returns incoming order verbatim when current is empty", () => {
    const incoming = [item("x"), item("y")];

    expect(ids(anchorFeedOrder([], incoming, getId))).toEqual(["x", "y"]);
  });

  it("returns empty when incoming is empty", () => {
    expect(anchorFeedOrder([item("a")], [], getId)).toEqual([]);
  });

  it("clamps out-of-range incoming ranks to the end", () => {
    const current = [item("a")];
    const incoming = [item("a"), item("b"), item("c")];

    const result = anchorFeedOrder(current, incoming, getId);

    expect(ids(result)).toEqual(["a", "b", "c"]);
  });
});
