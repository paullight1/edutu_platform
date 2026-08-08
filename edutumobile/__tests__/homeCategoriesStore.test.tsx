import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderHook, waitFor } from "@testing-library/react-native";

const mockIn = jest.fn().mockResolvedValue({ data: [], error: null });
const mockSelect = jest.fn(() => ({ in: mockIn }));
const mockFrom = jest.fn(() => ({
  select: mockSelect,
  upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
}));

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const { useHomeCategories } = require("../lib/homeCategoriesStore") as typeof import("../lib/homeCategoriesStore");

const LEGACY_KEY = "edutu.homeCategories.v2";
const scopedKey = (userId: string) => `edutu.homeCategories.v3.${userId}`;

beforeEach(async () => {
  jest.clearAllMocks();
  mockIn.mockResolvedValue({ data: [], error: null });
  await AsyncStorage.clear();
});

it("migrates a device-wide layout once without leaking it to another account", async () => {
  const legacyLayout = [
    { id: "programs", size: "card" },
    { id: "internships", size: "icon" },
  ];
  await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(legacyLayout));

  const first = renderHook(() => useHomeCategories("user-first"));
  await waitFor(() => expect(first.result.current.loaded).toBe(true));

  expect(first.result.current.tiles.map((tile) => tile.id)).toEqual([
    "programs",
    "internships",
  ]);
  expect(await AsyncStorage.getItem(scopedKey("user-first"))).not.toBeNull();
  expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
  expect(
    await AsyncStorage.getItem("edutu.homeCategories.v3.legacyClaimed"),
  ).toBe("1");
  first.unmount();

  const second = renderHook(() => useHomeCategories("user-second"));
  await waitFor(() => expect(second.result.current.loaded).toBe(true));

  expect(second.result.current.tiles.map((tile) => tile.id)).not.toEqual([
    "programs",
    "internships",
  ]);
  expect(await AsyncStorage.getItem(scopedKey("user-second"))).toBeNull();
});

it("waits for an authenticated identity before claiming a legacy layout", async () => {
  const legacyLayout = [
    { id: "programs", size: "card" },
    { id: "internships", size: "icon" },
  ];
  await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(legacyLayout));

  const hook = renderHook(
    ({ userId }: { userId: string | null }) => useHomeCategories(userId),
    { initialProps: { userId: null } },
  );
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));

  expect(await AsyncStorage.getItem(LEGACY_KEY)).not.toBeNull();
  expect(await AsyncStorage.getItem(scopedKey("guest"))).toBeNull();

  hook.rerender({ userId: "user-first" });
  await waitFor(() =>
    expect(hook.result.current.tiles.map((tile) => tile.id)).toEqual([
      "programs",
      "internships",
    ]),
  );
  expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
});

it("clears the previous account's in-memory layout when identity changes", async () => {
  const firstLayout = [
    { id: "programs", size: "card" },
    { id: "internships", size: "icon" },
  ];
  await AsyncStorage.setItem(scopedKey("user-first"), JSON.stringify(firstLayout));

  const hook = renderHook(
    ({ userId }: { userId: string }) => useHomeCategories(userId),
    { initialProps: { userId: "user-first" } },
  );
  await waitFor(() =>
    expect(hook.result.current.tiles.map((tile) => tile.id)).toEqual([
      "programs",
      "internships",
    ]),
  );

  hook.rerender({ userId: "user-second" });
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));

  expect(hook.result.current.tiles.map((tile) => tile.id)).not.toEqual([
    "programs",
    "internships",
  ]);
});
