import { describe, expect, it } from "vitest";
import {
  formatSeasonWindowLabel,
  getCurrentSeasonWindow,
  shiftSeasonWindow,
  type SeasonWindow,
} from "./seasonal-navigation";

describe("getCurrentSeasonWindow", () => {
  it("returns winter for January", () => {
    const result = getCurrentSeasonWindow(new Date("2025-01-15"));
    expect(result).toEqual({ season: "winter", year: 2025 });
  });

  it("returns winter for February", () => {
    const result = getCurrentSeasonWindow(new Date("2025-02-20"));
    expect(result).toEqual({ season: "winter", year: 2025 });
  });

  it("returns spring for April", () => {
    const result = getCurrentSeasonWindow(new Date("2025-04-10"));
    expect(result).toEqual({ season: "spring", year: 2025 });
  });

  it("returns summer for July", () => {
    const result = getCurrentSeasonWindow(new Date("2025-07-01"));
    expect(result).toEqual({ season: "summer", year: 2025 });
  });

  it("returns fall for October", () => {
    const result = getCurrentSeasonWindow(new Date("2025-10-05"));
    expect(result).toEqual({ season: "fall", year: 2025 });
  });

  it("returns winter + next year for December", () => {
    const result = getCurrentSeasonWindow(new Date("2025-12-25"));
    expect(result).toEqual({ season: "winter", year: 2026 });
  });

  it("returns spring for March", () => {
    const result = getCurrentSeasonWindow(new Date("2025-03-15"));
    expect(result).toEqual({ season: "spring", year: 2025 });
  });

  it("returns summer for August", () => {
    const result = getCurrentSeasonWindow(new Date("2025-08-20"));
    expect(result).toEqual({ season: "summer", year: 2025 });
  });

  it("returns fall for November", () => {
    const result = getCurrentSeasonWindow(new Date("2025-11-01"));
    expect(result).toEqual({ season: "fall", year: 2025 });
  });
});

describe("shiftSeasonWindow", () => {
  it("returns same window for delta 0", () => {
    const window: SeasonWindow = { season: "spring", year: 2025 };
    expect(shiftSeasonWindow(window, 0)).toEqual({ season: "spring", year: 2025 });
  });

  it("shifts forward by 1 season", () => {
    const window: SeasonWindow = { season: "winter", year: 2025 };
    expect(shiftSeasonWindow(window, 1)).toEqual({ season: "spring", year: 2025 });
  });

  it("shifts forward wrapping year: fall +1 → winter next year", () => {
    const window: SeasonWindow = { season: "fall", year: 2025 };
    expect(shiftSeasonWindow(window, 1)).toEqual({ season: "winter", year: 2026 });
  });

  it("shifts forward by 4 (full year)", () => {
    const window: SeasonWindow = { season: "spring", year: 2025 };
    expect(shiftSeasonWindow(window, 4)).toEqual({ season: "spring", year: 2026 });
  });

  it("shifts backward by 1 season", () => {
    const window: SeasonWindow = { season: "spring", year: 2025 };
    expect(shiftSeasonWindow(window, -1)).toEqual({ season: "winter", year: 2025 });
  });

  it("shifts backward wrapping year: winter -1 → fall previous year", () => {
    const window: SeasonWindow = { season: "winter", year: 2026 };
    expect(shiftSeasonWindow(window, -1)).toEqual({ season: "fall", year: 2025 });
  });

  it("shifts backward by 4 (full year back)", () => {
    const window: SeasonWindow = { season: "summer", year: 2025 };
    expect(shiftSeasonWindow(window, -4)).toEqual({ season: "summer", year: 2024 });
  });

  it("shifts forward by 2 from summer → winter next year", () => {
    const window: SeasonWindow = { season: "summer", year: 2025 };
    expect(shiftSeasonWindow(window, 2)).toEqual({ season: "winter", year: 2026 });
  });

  it("shifts backward by 2 from spring → fall previous year", () => {
    const window: SeasonWindow = { season: "spring", year: 2025 };
    expect(shiftSeasonWindow(window, -2)).toEqual({ season: "fall", year: 2024 });
  });

  it("shifts backward by 3 from winter → spring previous year", () => {
    const window: SeasonWindow = { season: "winter", year: 2026 };
    expect(shiftSeasonWindow(window, -3)).toEqual({ season: "spring", year: 2025 });
  });

  it("shifts forward by multiple years", () => {
    const window: SeasonWindow = { season: "fall", year: 2025 };
    expect(shiftSeasonWindow(window, 9)).toEqual({ season: "winter", year: 2028 });
  });

  it("shifts backward by multiple years", () => {
    const window: SeasonWindow = { season: "winter", year: 2026 };
    expect(shiftSeasonWindow(window, -7)).toEqual({ season: "spring", year: 2024 });
  });
});

describe("formatSeasonWindowLabel", () => {
  it("formats winter season", () => {
    expect(formatSeasonWindowLabel({ season: "winter", year: 2026 })).toBe("Winter 2026");
  });

  it("formats spring season", () => {
    expect(formatSeasonWindowLabel({ season: "spring", year: 2025 })).toBe("Spring 2025");
  });

  it("formats summer season", () => {
    expect(formatSeasonWindowLabel({ season: "summer", year: 2024 })).toBe("Summer 2024");
  });

  it("formats fall season", () => {
    expect(formatSeasonWindowLabel({ season: "fall", year: 2023 })).toBe("Fall 2023");
  });
});

describe("round-trip: getCurrentSeasonWindow → shift → format", () => {
  it("shifting forward one season and back returns original label", () => {
    const current = getCurrentSeasonWindow(new Date("2025-06-15"));
    const forward = shiftSeasonWindow(current, 1);
    const back = shiftSeasonWindow(forward, -1);
    expect(formatSeasonWindowLabel(back)).toBe(formatSeasonWindowLabel(current));
  });
});
