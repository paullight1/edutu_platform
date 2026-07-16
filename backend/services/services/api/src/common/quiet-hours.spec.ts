import { deferForQuietHours, localMinutes } from "./quiet-hours";

// 2026-07-15T14:00:00Z — 15:00 in Lagos (UTC+1), 23:00 in Tokyo (UTC+9).
const AFTERNOON_UTC = new Date("2026-07-15T14:00:00Z");
// 2026-07-15T23:30:00Z — inside a 22:00–08:00 window for a UTC user.
const NIGHT_UTC = new Date("2026-07-15T23:30:00Z");

describe("localMinutes", () => {
  it("returns minutes past local midnight for an IANA timezone", () => {
    expect(localMinutes(AFTERNOON_UTC, "Africa/Lagos")).toBe(15 * 60);
    expect(localMinutes(AFTERNOON_UTC, "Asia/Tokyo")).toBe(23 * 60);
  });

  it("falls back to UTC for a missing or invalid timezone", () => {
    expect(localMinutes(AFTERNOON_UTC, null)).toBe(14 * 60);
    expect(localMinutes(AFTERNOON_UTC, "Not/AZone")).toBe(14 * 60);
  });
});

describe("deferForQuietHours", () => {
  it("treats a zero-length window as quiet hours being off", () => {
    // How the mobile settings screen encodes the switch being off.
    expect(
      deferForQuietHours({ start: "00:00", end: "00:00" }, "UTC", NIGHT_UTC),
    ).toBeUndefined();
  });

  it("delivers immediately outside the window", () => {
    expect(
      deferForQuietHours(
        { start: "22:00", end: "08:00" },
        "UTC",
        AFTERNOON_UTC,
      ),
    ).toBeUndefined();
  });

  it("defers to the end of a window that wraps midnight", () => {
    const at = deferForQuietHours(
      { start: "22:00", end: "08:00" },
      "UTC",
      NIGHT_UTC,
    );
    // 23:30 UTC → next 08:00 UTC.
    expect(at).toBe("2026-07-16T08:00:00.000Z");
  });

  it("defers to the end of a same-day window", () => {
    const at = deferForQuietHours(
      { start: "13:00", end: "17:00" },
      "UTC",
      AFTERNOON_UTC,
    );
    expect(at).toBe("2026-07-15T17:00:00.000Z");
  });

  it("evaluates the window in the user's timezone, not the server's", () => {
    // 14:00 UTC is 23:00 in Tokyo — inside 22:00–08:00 — but 15:00 in Lagos.
    expect(
      deferForQuietHours(
        { start: "22:00", end: "08:00" },
        "Asia/Tokyo",
        AFTERNOON_UTC,
      ),
    ).toBe("2026-07-15T23:00:00.000Z"); // 08:00 Tokyo next day == 23:00Z today
    expect(
      deferForQuietHours(
        { start: "22:00", end: "08:00" },
        "Africa/Lagos",
        AFTERNOON_UTC,
      ),
    ).toBeUndefined();
  });

  it("falls back to the default window when none is stored", () => {
    // Matches the notification_preferences.quiet_hours column default, so a
    // user who has never saved settings still isn't pushed at 23:30.
    expect(deferForQuietHours(null, "UTC", NIGHT_UTC)).toBe(
      "2026-07-16T08:00:00.000Z",
    );
    expect(deferForQuietHours(null, "UTC", AFTERNOON_UTC)).toBeUndefined();
  });

  it("ignores a malformed window rather than dropping the notification", () => {
    expect(
      deferForQuietHours({ start: "oops", end: "08:00" }, "UTC", NIGHT_UTC),
    ).toBeUndefined();
  });

  it("does not defer at the exact moment the window ends", () => {
    const eightAm = new Date("2026-07-16T08:00:00Z");
    expect(
      deferForQuietHours({ start: "22:00", end: "08:00" }, "UTC", eightAm),
    ).toBeUndefined();
  });
});
