/* eslint-disable import/first -- the mocked router must be installed before
   importing the hook that reads it. */
import { act, renderHook } from "@testing-library/react-native";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

import { useGroupContentSwipe } from "../components/community/GroupContentTabs";

describe("community content tab swipe", () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it("captures a horizontal swipe before the vertical content list", () => {
    const { result } = renderHook(() =>
      useGroupContentSwipe("group-1", "posts"),
    );

    expect(result.current.onMoveShouldSetResponderCapture).toEqual(
      expect.any(Function),
    );

    const swipeEvent = {
      touchHistory: {
        mostRecentTimeStamp: 2,
        numberActiveTouches: 1,
        indexOfSingleActiveTouch: 0,
        touchBank: [
          {
            touchActive: true,
            currentTimeStamp: 2,
            previousPageX: 0,
            currentPageX: -72,
            previousPageY: 0,
            currentPageY: 4,
          },
        ],
      },
    };
    expect(
      result.current.onMoveShouldSetResponderCapture?.(swipeEvent as never),
    ).toBe(true);

    act(() => {
      result.current.onResponderRelease?.({} as never);
    });

    expect(mockReplace).toHaveBeenCalledWith(
      "/discussions/group-1?tab=resources",
    );
  });
});
