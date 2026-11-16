import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockIn = jest.fn().mockResolvedValue({ data: [], error: null });
const mockSelect = jest.fn(() => ({ in: mockIn }));
const mockFrom = jest.fn(() => ({
  select: mockSelect,
  upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
}));
const mockFetchHomeCategoryLayout = jest.fn();
const mockUpdateHomeCategoryLayout = jest.fn();

jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

jest.mock("@edutu/core/src/services/profile", () => ({
  fetchHomeCategoryLayout: (...args: unknown[]) =>
    mockFetchHomeCategoryLayout(...args),
  updateHomeCategoryLayout: (...args: unknown[]) =>
    mockUpdateHomeCategoryLayout(...args),
}));

const {
  __resetHomeCategoryMemoryForTests,
  useHomeCategories,
} = require("../lib/homeCategoriesStore") as typeof import("../lib/homeCategoriesStore");

const LEGACY_KEY = "edutu.homeCategories.v2";
const scopedKey = (userId: string) => `edutu.homeCategories.v3.${userId}`;

beforeEach(async () => {
  __resetHomeCategoryMemoryForTests();
  jest.clearAllMocks();
  mockIn.mockResolvedValue({ data: [], error: null });
  mockFetchHomeCategoryLayout.mockResolvedValue(null);
  mockUpdateHomeCategoryLayout.mockResolvedValue(null);
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

it("uses the newest version across local and remote layouts", async () => {
  await AsyncStorage.setItem(
    scopedKey("user-first"),
    JSON.stringify({
      tiles: [{ id: "programs", size: "card" }],
      updatedAt: "2026-08-01T10:00:00.000Z",
    }),
  );
  mockFetchHomeCategoryLayout.mockResolvedValue({
    tiles: [{ id: "internships", size: "icon" }],
    updatedAt: "2026-08-02T10:00:00.000Z",
  });
  const getToken = jest.fn().mockResolvedValue("token");

  const hook = renderHook(() =>
    useHomeCategories("user-first", getToken),
  );
  await waitFor(() =>
    expect(hook.result.current.tiles.map((tile) => tile.id)).toEqual(["internships"]),
  );

  expect(hook.result.current.tiles.map((tile) => tile.id)).toEqual([
    "internships",
  ]);
  expect(mockUpdateHomeCategoryLayout).not.toHaveBeenCalled();
  expect(JSON.parse((await AsyncStorage.getItem(scopedKey("user-first")))!))
    .toMatchObject({ updatedAt: "2026-08-02T10:00:00.000Z" });
});

it("pushes a newer local version without allowing an older server value to win", async () => {
  const local = {
    tiles: [{ id: "programs", size: "card" }],
    updatedAt: "2026-08-03T10:00:00.000Z",
  };
  await AsyncStorage.setItem(scopedKey("user-first"), JSON.stringify(local));
  mockFetchHomeCategoryLayout.mockResolvedValue({
    tiles: [{ id: "internships", size: "icon" }],
    updatedAt: "2026-08-02T10:00:00.000Z",
  });
  mockUpdateHomeCategoryLayout.mockResolvedValue(local);
  const getToken = jest.fn().mockResolvedValue("token");

  const hook = renderHook(() =>
    useHomeCategories("user-first", getToken),
  );
  await waitFor(() =>
    expect(mockUpdateHomeCategoryLayout).toHaveBeenCalledWith(getToken, local),
  );
  expect(hook.result.current.tiles.map((tile) => tile.id)).toEqual(["programs"]);
});

it("keeps the local layout usable when remote loading fails", async () => {
  const local = {
    tiles: [{ id: "internships", size: "long" }],
    updatedAt: "2026-08-08T10:00:00.000Z",
  };
  await AsyncStorage.setItem(scopedKey("user-first"), JSON.stringify(local));
  mockFetchHomeCategoryLayout.mockRejectedValueOnce(new Error("offline"));
  const getToken = jest.fn().mockResolvedValue("token");

  const hook = renderHook(() => useHomeCategories("user-first", getToken));

  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  expect(hook.result.current.tiles).toEqual(local.tiles);
});

it("reveals the saved local shape without waiting for remote sync", async () => {
  const local = {
    tiles: [
      { id: "programs", size: "long" },
      { id: "scholarships", size: "icon" },
      { id: "internships", size: "card" },
    ],
    updatedAt: "2026-08-08T10:00:00.000Z",
  };
  await AsyncStorage.setItem(scopedKey("user-first"), JSON.stringify(local));
  let resolveRemote: (value: null) => void = () => undefined;
  mockFetchHomeCategoryLayout.mockImplementationOnce(
    () => new Promise<null>((resolve) => { resolveRemote = resolve; }),
  );
  const getToken = jest.fn().mockResolvedValue("token");

  const hook = renderHook(() => useHomeCategories("user-first", getToken));

  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  expect(hook.result.current.tiles).toEqual(local.tiles);
  expect(mockFetchHomeCategoryLayout).toHaveBeenCalledTimes(1);

  await act(async () => resolveRemote(null));
});
